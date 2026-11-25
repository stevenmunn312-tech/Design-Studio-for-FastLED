# Handoff: Windows long-paths release blocker

Written 2026-11-23. The v1.0.1 release is halted on this problem. Read this
before touching the release, the Store submission or the fbuild pin.

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
