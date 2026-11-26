# Handoff: Windows long-paths release blocker

Written 2026-11-23. **Status, 2026-11-26:** fixed for ESP32 boards in 1.0.2
(fbuild 2.5.55 and the esptool copy, below). RP2040, Teensy and STM32 boards
still cannot build with long paths off
([per-family compile](#other-board-families-on-fbuild-2555-2026-11-26),
FastLED/fbuild#2187). Steve chose on 2026-11-26 to wait for the upstream
answer before deciding what 1.0.2 does about them. The release also waits for the smoke
test on the 1.0.2 package ([todo](../../todo.md)). Read this before touching
the release, the Store submission or the fbuild pin.

## The problem in one paragraph

On a Windows PC with long-path support off (`LongPathsEnabled = 0`, the Windows
default), the app cannot build any ESP32 sketch, so a new user cannot upload
anything. fbuild 2.5.52, the app's default build engine, refuses to install the
ESP32 toolchain and Arduino framework because some files inside those packages
end up too close to the 260-character Windows path limit. This affects the
Microsoft Store package and the portable ZIP alike. No fix has been chosen.

## What was seen

Test: Store package 1.0.1 (unpacked layout registered with
`Add-AppxPackage -Register`), a new standard account named
`storetest-longname`, `LongPathsEnabled = 0`, ESP32-S3 on COM3, first build.
Full log: `C:\Users\Public\Downloads\Uploading to COM3 (esp32esp32esp32s.txt`.

fbuild detects the setting and switches to its own short fallback folder:

```
WARNING: Windows long-path support is disabled. Using short-path fallback cache: C:\fb-77f661d5001e\prod\cache. ... Run fbuild --fix-win to enable Windows long paths.
```

It still fails, for both packages, after about 48 seconds:

```
toolchain: package error: Windows short-path fallback cannot safely use extracted path C:\fb-77f661d5001e\prod\cache\toolchains\toolchain-xtensa-esp-elf\164cda8d219cc6bd\xtensa-esp-elf-14.2.0_20260121-x86_64-w64-mingw32+esp32s3_staging\picolibc\xtensa-esp-elf\include\c++\14.2.0\ext\pb_ds\detail\binary_heap_\constructors_destructor_fn_imps.hpp
framework: package error: Windows short-path fallback cannot safely use extracted path C:\fb-77f661d5001e\prod\tmp\esp32-framework\fbuild_sdk_zmb8DD\esp32-arduino-libs\esp32s3\include\espressif__esp_matter\connectedhomeip\connectedhomeip\src\app\clusters\boolean-state-configuration-server\BooleanStateConfigurationTestEventTriggerHandler.h
```

Measured lengths: the toolchain path is 257 characters, the framework path 253.
Both are under 260, yet fbuild refuses them.

The rule, read from fbuild's source on 2026-11-23
(`crates/fbuild-packages-fetch/src/extractor.rs` and
`crates/fbuild-paths/src/long_paths.rs`): in fallback mode fbuild walks every
extracted file and folder and refuses the package when any full path plus its
terminating NUL is over 248 units, so the longest allowed path is 247
characters. The error names the first offending entry the walk meets, not the
longest one.

### A shorter cache folder cannot fix it (measured)

fbuild honours `FBUILD_CACHE_DIR`, and in fallback mode it accepts a
user-chosen root under 64 characters (scratch goes to `<root>\t`, builds to
`<root>\b`). That does not help, because the part of the path below the cache
root is already too long. Longest paths below the cache root, measured on
2026-11-23 in the installed cache at `C:\Users\User\.fbuild\prod\cache`:

| Package | Longest path below the cache root |
| --- | --- |
| `platforms\framework-arduinoespressif32` (core 3.3.11, `esp_matter` headers) | 290 |
| `toolchains\toolchain-riscv32-esp` (ESP32-C3, C6, H2) | 256 |
| `toolchains\toolchain-xtensa-esp-elf` (ESP32, S2, S3) | 245 |
| `platforms\arduino-ArduinoCore-mbed` | 248 |
| `platforms\earlephilhower-arduino-pico` | 232 |
| `toolchains\earlephilhower-pico-quick-toolchain` | 209 |
| `platforms\arduino-ArduinoCore-avr` | 199 |

With a limit of 247, the Xtensa toolchain would need a cache root of one
character, and the RISC-V toolchain and the ESP32 framework exceed the limit
before any root is added. No value of `FBUILD_CACHE_DIR` can make fbuild 2.5.52
install the ESP32 packages with long paths off. The framework's installed path
is also over the real 260 limit at any root. Only a change inside fbuild (a
shorter package layout in fallback mode) or turning long paths on can fix the
fbuild engine.

The same table suggests that RP2040 (earlephilhower) and AVR packages fit under
the limit with the automatic 29-character root. That is arithmetic, not a test.

## Why earlier tests passed

Every passing run, including the clean-account runs recorded in the
[clean-machine smoke test](clean-machine-smoke-test.md), ran on Steve's PC.
`LongPathsEnabled` is a machine-wide setting (HKLM), and it was `1` there, so
every "fresh" account inherited it. None of those runs covered the Windows
default. This is the gap that let 1.0.0 be submitted and 1.0.1 be called
verified.

## What v1.0.1 fixed and did not fix

v1.0.1 (commit `18aa325c`) moved the app's own build trees (sketches, the fbuild
project, fetched libraries) from the Store's redirected AppData folder to
`%USERPROFILE%\.design-studio-for-fastled` (`FLS_BUILD_DIR`, set in
`desktop/launcher.py`). That shortens our paths. It does nothing for fbuild's
package cache, which is where the failure happens.

## What is known and what is not

Known (checked):

- `fbuild --fix-win` exists in 2.5.52. Its help text: "Enable Windows long
  paths with administrator approval (UAC)". It changes the machine-wide
  setting and needs an administrator.
- fbuild 2.5.53 (released 2026-11-22) has no long-path change in its release
  notes.
- The Store's 1.0.1.0 version number was never uploaded to Partner Center, so a
  fixed build can still ship as 1.0.1 (moving the `v1.0.1` tag needs Steve's
  approval).

Not known (not tested):

- Whether the arduino-cli engine works for ESP32 boards other than the
  ESP32-S3 with long paths off. See "arduino-cli passes" below for what was
  tested. The RISC-V boards (C3, C6, H2) use a different toolchain and were
  not tried.
- Whether the compiler (GCC) could read headers at these paths even if fbuild
  extracted them some other way, for example with `\\?\` extended-length paths.
- What other boards fail. Only the ESP32-S3 was tried. Non-ESP32 boards
  (AVR, RP2040) have shorter package paths and may work, but that is untested.

## arduino-cli passes with long paths off

Steve's test, 2026-11-23: `LongPathsEnabled = 0`, the `storetest-longname`
standard account, the Store package layout, engine set to arduino-cli by hand,
ESP32-S3. The ESP32 core was installed fresh during that run, and the build
worked. So arduino-cli can both install and compile the ESP32 core where
fbuild 2.5.52 cannot.

Not covered by that test: any board other than the ESP32-S3, and the app
choosing arduino-cli by itself (today a new user still gets fbuild and the
failure above).

## Decision, 2026-11-23

Steve chose to wait for the fbuild fix (FastLED/fbuild#2156) before changing
the app. No automatic switch to arduino-cli is being built for now. When a
fixed fbuild is released, move the pin and run the retest below.

## Retest on fbuild 2.5.55

fbuild 2.5.55 (released 2026-11-25) carries FastLED/fbuild#2175, which closed
#2156: in fallback mode the ESP32 framework and toolchain install under short
hashed folders, and the scratch paths are shorter. The pin moved to 2.5.55 on
2026-11-26.

Run on 2026-11-26, Steve's PC with `LongPathsEnabled = 0`, Steve's own
account, fbuild 2.5.55 from a clean virtual environment (not the app),
`fbuild build tmp/fbuild-longpath-repro -e esp32s3`, no `FBUILD_CACHE_DIR`:

- fbuild chose the fallback cache `C:\fbuild-cache\8cffdc466966\p\c`.
- The first attempt stopped at 90% of the `esp32-core-3.3.12.tar.xz` download
  with `error decoding response body`, a network fault. The second attempt
  installed the toolchain and framework (esp32-arduino 3.3.12, ESP-IDF 5.5.5)
  and built `firmware.bin` in 74 s.
- Longest installed package path: 256 characters, under the 260 limit (an
  `esp_matter` header). fbuild's own compile cache below the same root holds
  272-character paths and worked.

Not covered: the app (the Store package or portable ZIP built with 2.5.55), a
standard account with a long username, any ESP32 board other than the S3 (the
RISC-V toolchain for C3, C6 and H2 was not installed), and upload. Those are
the clean-machine smoke test under Publish in `todo.md`.

### The packaged app could not run esptool (found and fixed 2026-11-26)

With 2.5.55 the packaged app got further: the ESP32 packages installed and the
sketch compiled with long paths off. Every build then stopped converting
`firmware.elf` to `firmware.bin`:

```
build error: build failed: selected esptool executable could not be launched — cannot convert firmware.elf to firmware.bin.
Error: failed to spawn ["...\tools\esptool.exe", "--chip", "esp32s3", "elf2image", ...]: Access is denied. (os error 5)
```

Seen on `storetest-longname` with the Store-identity layout and on Steve's
account with the local layout, so it is not one account's state. It failed
only when the real app (started from Start) launched fbuild. The same files
worked from a shell, from a shell with the app's exact environment and
launch flags, and inside the package through `Invoke-CommandInDesktopPackage`.
`esptool.exe` runs by hand on both accounts, and its permissions match
`fbuild.exe`. The Windows reason is not proven; fbuild assigns each tool it
starts to a job object, and a refused assignment is reported as this spawn
error, which fits but was not reproduced outside the app.

What fixed it: the same `esptool.exe` copied outside the install folder. A
frozen Windows helper now copies it into `<build root>\tools` at start-up and
hands that path to fbuild (`_stage_outside_install` in `backend/toolchain.py`).
Through the running app, a capacity check then converted `firmware.elf` with
the copy and reported 352,379 bytes of flash. Steve then uploaded from the
fixed app on his account (local identity, long paths off): build, deploy
through the copy (`[deploy] esptool ...\.design-studio-for-fastled\tools\esptool.exe`),
full flash to the ESP32-S3 on COM3 with every hash verified, "Upload
complete".

Store-identity retest, 2026-11-26: `storetest-longname` (standard account,
long paths off), the old package removed so settings reset, the
Store-identity layout built from `main` at `8df5772c` registered, engine left
on its default. Juggle built with fbuild 2.5.55 and uploaded to the ESP32-S3
on COM3 through the account's own copy
(`C:\Users\storetest-longname\.design-studio-for-fastled\tools\esptool.exe`),
every hash verified, "Upload complete". **Pass.**

Not covered by that pass:

- A first download: the account already held the ESP32 packages from the
  failed run earlier that day (`framework core cache: hit`).
- A truly new account: this one kept its 2.5.52 short-path marker, so fbuild
  used its old `C:\fb-77f661d5001e` root rather than `C:\fbuild-cache`, which
  Steve's account created first and owns. A second account on any PC takes
  that same separate-root path.
- The package that ships: this was a local build from `main`, not the
  release package, and `main` carries far more than v1.0.1.
- ESP32 boards other than the S3, and the portable ZIP.

### Other board families on fbuild 2.5.55 (2026-11-26)

The 2.5.55 fix shortens the ESP32 packages only. One sketch per board family
was compiled to see what else a default Windows PC can build.

Conditions: Steve's PC and account, `LongPathsEnabled = 0`, `main` at
`964dca3d`, fbuild 2.5.55 from `backend/.venv` run by
`scripts/compile-fixtures/compile-matrix.py --engine fbuild`, one build at a
time, no `FBUILD_CACHE_DIR`. fbuild used the fallback cache
`C:\fbuild-cache\8cffdc466966\p\c` (33 characters). Each build installed its
own packages except the ESP32-S3's, which were already there. Logs are in
`artifacts/compile-matrix/2026-11-26_0341`, `_0354` and `_0359`.

| Board (fbuild environment) | Fixture | Result |
| --- | --- | --- |
| Arduino Uno (`uno`) | `power-switch/gated-avr@avr` | Pass, 8,253 B flash |
| Nano Every (`nona4809`) | `ir/normal@megaavr` | Pass, 10,701 B |
| Feather M0 (`adafruit_feather_m0`) | `ir/normal@samd` | Pass, 37,847 B |
| nRF52840 DK (`pca10056`) | `boards/pattern@nrf52840-dk` | Pass, 73,912 B |
| UNO R4 WiFi (`unor4wifi`) | `ir/normal@renesas` | Pass, 43,438 B |
| ESP8266 D1 (`d1`) | `boards/pattern@d1` | Pass, 306,422 B |
| Classic ESP32 (`esp32`) | `power-switch/gated@esp32` | Pass on the second run, 330,721 B |
| ESP32-S2 (`lolin_s2_mini`) | `boards/pattern@lolin-s2-mini` | Pass, 365,548 B |
| ESP32-C3 (`lolin_c3_mini`) | `boards/pattern@lolin-c3-mini` | Pass, 389,980 B |
| ESP32-C6 (`XIAO_ESP32C6`) | `boards/pattern@xiao-c6` | Pass, 383,549 B |
| ESP32-H2 (`esp32h2`) | `led-drivers/h2-rmt@esp32h2` | Pass, 401,951 B |
| Pico W (`rpipicow`) | `boards/pattern@pico-w` | **Fail** at package install |
| Teensy 4.1 (`teensy41`) | `power-switch/mixed-teensy@teensy` | **Fail** at package install |
| Black Pill F411 (`blackpill_f411ce`) | `ir/normal@stm32` | **Fail** at package install |

The three failures are the fallback's own length check, the one that stopped
the ESP32 packages on 2.5.52:

```
build error: package error: Windows short-path fallback cannot safely use extracted path C:\fbuild-cache\8cffdc466966\p\c\platforms\earlephilhower-arduino-pico\3390eb851c5aa882\4.5.3_staging\rp2040-4.5.3\libraries\FreeRTOS\lib\FreeRTOS-Kernel\portable\GCC\RISC-V\chip_specific_extensions\Pulpino_Vega_RV32M1RM\freertos_risc_v_chip_specific_extensions.h. Run fbuild --fix-win or use a shorter package location.
```

| Package | Path fbuild named | Below the cache root |
| --- | --- | --- |
| `earlephilhower-arduino-pico` 4.5.3 | 263 | 230 |
| `dl-framework-arduinoteensy` 1.160.0 (a `FlexCAN_T4` example) | 262 | 229 |
| `stm32duino-Arduino_Core_STM32` 2.9.0 (an `STM32MP1xx` variant folder) | 252 | 219 |

fbuild names the first path its walk refuses, not the longest. A blank sketch
with only `platform`, `board` and `framework` set fails the same way for all
three (`tmp/fbuild-shortpath-repro`), so the sketch plays no part.

The cause, read from fbuild's source at `v2.5.55`: the check allows 259
characters for a file and 247 for a folder
(`crates/fbuild-packages-fetch/src/extractor.rs`, lines 11 to 47). #2175
added a short install layout, and only the ESP32 toolchain and framework opt
in to it (`with_compact_windows_install` in `compact_install.rs`). The
RP2040, Teensy and STM32 cores keep the old layout and are checked in their
staging folder, whose name is 8 characters longer than the installed one
(`_staging`).

Longest paths in the same package versions, measured in the cache installed
with long paths on (`C:\Users\User\.fbuild\prod\cache`), and what they come
to under the 32-character fallback root:

| Package | Longest file below the cache root | Longest folder | Installed | In staging |
| --- | --- | --- | --- | --- |
| arduino-pico 4.5.3 | 232 | 205 | file 265, over by 6 | file 273 |
| Teensy 1.160.0 | 221 | 158 | file 254, fits | file 262, over by 3 |
| STM32 core 2.9.0 | 231 | 211 | file 264, over by 5 | file 272, folder 252 |

So the Teensy framework is refused only because of the staging name, and the
other two are too long where they end up as well. By these numbers a
`FBUILD_CACHE_DIR` of 18 characters or fewer would pass the check for all
three; that was not tried. The app has no fallback for this, and
`fbuild --fix-win` needs an administrator.

The classic ESP32 failed once before it passed:
`error sending request for url (https://fbuild.sfo3.digitaloceanspaces.com/v1/espressif/esp32-arduino-libs/release/3.3.12/esp32/esp32-arduino-libs-3.3.12-esp32.tar.zst)`.
The address answered when checked a few minutes later and the next run
installed it. With the fault in the retest above, that is two failed first
downloads in one day.

Not covered: the packaged app (these ran from a shell), a standard account or
one that never ran fbuild, upload, any second board of a family, the SAMD51,
whether arduino-cli installs the three failing families with long paths off,
and whether 2.5.55 builds them with long paths on. Reported on 2026-11-26 as
FastLED/fbuild#2187, after Steve's review.

### Retest on fbuild `main` after #2188 (2026-11-26)

FastLED/fbuild#2187 was closed on 2026-11-26 by FastLED/fbuild#2188, which
puts the Pico, Teensy and STM32 cores on the short install layout the ESP32
packages already used. It is merged to `main` (`e2a8b3d93`) and is **not in a
release**: the latest release and the latest version on PyPI are still
2.5.55, so the app's pin cannot move yet.

fbuild was built from source at that commit (`cargo build --release` in
`tmp/fbuild-upstream`, reporting `fbuild 2.5.55+git.e2a8b3d9329d`) and the
blank sketch in `tmp/fbuild-shortpath-repro` was built for the three boards
that failed, one at a time, by `tmp/fbuild-shortpath-repro/run-main.ps1`.

Conditions: Steve's PC and account, `LongPathsEnabled = 0`, no
`FBUILD_CACHE_DIR`, the same fallback cache as the failing runs
(`C:\fbuild-cache\8cffdc466966\p\c`), its own daemon port. Each core was
downloaded and installed in this run.

| Board (fbuild environment) | Result on 2.5.55 | Result on `main` `e2a8b3d9` |
| --- | --- | --- |
| Pico W (`rpipicow`) | Fail at package install | Pass, 110,408 B flash |
| Teensy 4.1 (`teensy41`) | Fail at package install | Pass, 23,552 B |
| Black Pill F411 (`blackpill_f411ce`) | Fail at package install | Pass, 12,524 B |

Logs are `tmp/fbuild-shortpath-repro/<board>.main.log`.

Not covered: a released fbuild (there is none with the fix), a FastLED
pattern sketch (this is the blank sketch, which was enough to show the
failure), the app's own build path and the packaged app, a standard account
or one that never ran fbuild, upload, and any other board of these families.

When the release lands: move the pin, rerun `run-main.ps1`'s three builds
with the pinned binary, then build one pattern fixture per family through
`compile-matrix.py --engine fbuild`.

## Options

1. **Ask fbuild upstream for a fix.** Zach has fixed reports within hours
   before (FastLED/fbuild#1994 was fixed the same day). A report needs
   the log above, the setting, the two paths, and the table of longest paths
   above. The fix that the numbers allow: in fallback mode, install each
   package under a short id and drop the archive's own top folder. That removes
   about 100 characters from the toolchain paths and 86 from the framework
   path, which leaves the longest at about 204 below a short root. Posted on
   2026-11-23 as FastLED/fbuild#2156, after Steve's review. The earlier
   FastLED/fbuild#1673 (closed 2026-10-22) asked fbuild to document or detect
   the setting.
2. **Detect the setting in the app and offer to turn it on**, through
   `fbuild --fix-win` or an equivalent elevated step. This needs an
   administrator on the PC, changes a machine-wide setting, and needs the user's
   clear consent. A standard user without admin rights would still be stuck.
3. **Document long paths as a requirement** for ESP32 boards on Windows, with
   the steps to enable them. The weakest option for a Store app.

Whichever is chosen, the release is not ready until the
[clean-machine smoke test](clean-machine-smoke-test.md) passes with
`LongPathsEnabled = 0`, on a new standard account, using the actual Store
package, through first build and upload.

## How to reproduce

The step sheet is `C:\Users\Public\Downloads\STORE TEST 1.0.1 - STEPS.txt`.
In short: set `LongPathsEnabled` to `0` (admin PowerShell), create a new
standard account, register the package layout, open the app, upload Juggle to
an ESP32-S3.

## Current state

- Nothing is submitted or published. The Store holds only the certified,
  unpublished 1.0.0 dry run; leave it alone.
- Tags `v1.0.0` and `v1.0.1` exist on GitHub with private draft releases.
- `LongPathsEnabled` on Steve's PC: `0` through the tests of 2026-11-23, set
  back to `1` by Steve that evening for bench work, and `0` again on
  2026-11-26 for the 2.5.55 retest. To reproduce the blocker
  again, set it to `0` in an administrator PowerShell
  (`Set-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem LongPathsEnabled 0`)
  and use the `storetest-longname` account.
- The `storetest-longname` account still exists and can be kept for the retest.

## Rules that apply

- Do not run fbuild or arduino-cli compiles on GitHub.
- Package runs on GitHub only when Steve asks.
- Do not submit, publish or post anything, including upstream reports, without
  Steve's review.
- Do not call a build ready unless it passed under the conditions above, and
  name every condition a test did not cover.
