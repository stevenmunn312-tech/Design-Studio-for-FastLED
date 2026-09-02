# fbuild workarounds in the upload helper

Every accommodation `backend/app.py` makes for the **fbuild** build engine, why it
exists, and what it costs. Written to be usable as an upstream bug report as well as
an internal record.

- **Current repository pin:** 2.5.21 (`backend/requirements.txt` and
  `backend/constraints.txt`)
- **Host:** Windows 11. Some issues below are Windows-specific and are marked as such.
- **How we drive fbuild:** a persistent scaffold at `backend/.fbuild-project/` with one
  `[env:X]` per supported board, built with `fbuild build -e <env> -v --no-timestamp`
  and flashed with `fbuild deploy -e <env> -p <port> --skip-build --no-timestamp`.
  The focused ESP32 experiment additionally passes `-b 115200` and binds the pinned
  interpreter-side `esptool` through the caller `PATH`; see the dated result below.
  See `_compile_upload_fbuild` in [`backend/app.py`](../../../backend/app.py).

> [!IMPORTANT]
> **Verify before sending upstream.** Items marked *confirmed against 2.4.0* were
> diagnosed on an older fbuild and have **not** been re-tested on 2.5.21. Several may
> already be fixed. Re-check each one before reporting it, so the list stays credible.
> The upgrade record below explains which workarounds were already removed.

---

## Summary

| # | Issue | Version confirmed | Our workaround | Still needed? |
|---|-------|-------------------|----------------|---------------|
| 1 | `lib_deps` registry resolution not implemented | 2.4.0 | Vendor libraries by `git clone` | Re-verify |
| 2 | `.ino` prototype insertion breaks FastLED-typed helpers | 2.4.0 | Write `main.cpp` instead | **No — fixed upstream in 2.5.16, workaround removed 2026-08-10** |
| 3 | Shared scaffold corrupts under concurrent builds | 2.4.0 | External process-wide lock | Likely (design-level) |
| 4 | No size line on a no-op incremental build | 2.4.0 | Read fbuild's own size cache | **No — our #1277, fixed in 2.5.16, workaround removed 2026-08-27** |
| 5 | No size summary on hard linker overflow | 2.4.0 | Parse `ld` + `Memory:` lines | Likely (by design) |
| 6 | ESP32 RAM percentage impossible (>100%) on success | 2.4.0 | Discard RAM figure over 100% | Fixed in 2.5.17; guard kept as a sanity check |
| 7 | `deploy` unimplemented for some compilable platforms | **2.5.4** | Fall back to arduino-cli | Yes |
| 8 | Dep scanner misses transitive `SPI` in a vendored lib | 2.4.0 | Stub out the offending file | **No — FastLED guarded it in #3815, workaround removed 2026-08-27** |
| 9 | A no-op build costs three minutes on ESP32 (0.4s on AVR) | **2.5.21** | None — measured, not worked around | Yes |

---

## 1. `lib_deps` registry resolution is not implemented

**Symptom.** Declaring a dependency in `platformio.ini`'s `lib_deps` fetches nothing.
`fbuild sync` marks the entry `unresolved`, and the build then fails with
`FastLED.h: No such file or directory`.

**Impact.** The single largest departure from "drop-in PlatformIO replacement" for us —
it means an existing `platformio.ini` with `lib_deps` does *not* build unmodified.

**Workaround.** Vendor every library into `lib/` by `git clone`, relying on
PlatformIO's local-library auto-discovery instead of the registry. Three libraries
are vendored this way:

| Library | Function | Fetched |
|---|---|---|
| FastLED | always | first fbuild compile (`_ensure_fbuild_project`) |
| ESP32-audioI2S | music-sync Player sketch only | lazily, first Player build (`_ensure_fbuild_audio_lib`) |
| esp_dmx | DMX512 firmware only | lazily, first DMX512 build (`_ensure_fbuild_esp_dmx_lib`) |

**Cost.** A first-run `git clone` inside the user's build log, no version pinning via
the manifest, and a hand-rolled cache-validity check per library.

---

## 2. `.ino` preprocessing inserts prototypes before user includes

**Symptom.** fbuild preprocesses `.ino` into `main.ino.cpp`, auto-inserting function
prototypes **above** the user's `#include` directives. Any helper with a
FastLED type in its signature then fails to compile, because the type is not yet
declared at the point the prototype is emitted:

```cpp
CRGB kelvinToRGB(uint16_t kelvin);   // <-- inserted here; CRGB unknown
#include <FastLED.h>                  // <-- declared here
```

**Impact.** Affects any generated sketch that declares a FastLED-typed helper. Ours
do routinely.

**Historical workaround.** `_write_fbuild_main` wrote a plain `main.cpp`
(prepending `#include <Arduino.h>` when absent) rather than `main.ino`, bypassing
Arduino sketch preprocessing entirely. It also unlinked any stale `main.ino`.

**Note.** Arduino IDE and arduino-cli place inserted prototypes *after* the includes,
so the same sketch compiles fine there. This looks like an ordering difference rather
than a deliberate design choice.

**Resolved 2026-08-10.** Reported upstream as FastLED/fbuild#1275; fixed in fbuild
2.5.16 by hoisting sketch `#include` directives into the prelude ahead of the
auto-generated prototypes. The repository pinned `fbuild==2.5.18` at the time, and
`_write_fbuild_main` writes plain `main.ino` again—the `.cpp` workaround is
gone. The reverted path was hardware-validated on a classic ESP32 during the
2026-08-16 bring-up recorded in the beta support matrix.

---

## 3. The project scaffold is shared, with no concurrency safety

**Symptom.** fbuild builds against a single project directory holding one
generated sketch source.
Two overlapping runs interleave a source write with an in-flight build and corrupt each
other's output.

**How it shows up.** A compile that reports success but produces no parseable size line,
or an unrelated build failure that a caller can easily misread as a genuine capacity
overflow.

**Why we hit it.** Studio runs a live controller-capacity meter that issues compile-only
checks while the user edits, so a real Upload racing a capacity check — or two rapid-fire
capacity checks — is routine rather than exotic.

**Workaround.** `_fbuild_build_lock`, a `threading.Lock` held for the *entire* duration of
every `_compile_upload_fbuild` run, serialising all fbuild compiles process-wide. Bounded
by `_FBUILD_LOCK_TIMEOUT_S = 180` so a genuinely wedged build fails visibly instead of
queueing every later request forever with no output.

**Upstream ask.** Either per-invocation isolation (a build directory keyed by env/source
hash) or a documented statement that concurrent invocations against one project are
unsupported. Right now it's silently unsafe.

---

## 4. A no-op incremental build prints no size report

**Symptom.** fbuild only prints `Flash:` / `RAM:` when it actually reruns the linker. An
incremental build that determines nothing changed reuses the prior binary and skips the
line entirely — even though the artifact is current and correct.

**Impact.** For us this is the *common* case: once the capacity meter's debounce settles,
a repeat check on an unchanged sketch returned no numbers at all.

**Workaround.** `_fbuild_cached_size(env)` falls back to fbuild's own persisted cache at
`.fbuild/build/<env>/release/.firmware_size_cache.json`, reading `size_info.total_flash` /
`max_flash` / `total_ram` / `max_ram`.

**Upstream ask.** Reprint the cached size summary on a no-op build, or provide a
`fbuild size -e <env>` query command. We were reading a dotfile that is presumably a
private implementation detail.

**Resolved 2026-08-27 — from our own report.** Filed as
[FastLED/fbuild#1277](https://github.com/FastLED/fbuild/issues/1277) (`2026-08-07`) and
fixed by [#1287](https://github.com/FastLED/fbuild/pull/1287) in 2.5.16. It has since
been factored into the shared `assemble_fast_path_result`, whose doc comment names our
issue, so every orchestrator with a fast path reprints rather than the seven the original
fix touched. Confirmed on an ESP32-S3 no-op build under 2.5.21:

```
No-op fingerprint matched; reusing existing ESP32 artifacts.
Flash: 710.52KB / 8.00MB (8.7%)
RAM:   74.72KB / 320.00KB (23.4%)
```

`_fbuild_cached_size` and its call-site fallback are removed. The `fbuild size --json`
query is still worth having, but nothing depends on it now.

---

## 5. A hard linker overflow produces no size summary at all

**Symptom.** A genuine overflow is a hard `ld` failure — no `.elf` is produced, so fbuild
never reaches the step that prints its size summary. Confirmed with a deliberately forced
ESP32-S3 DRAM overflow: no size line anywhere in the log, only

```
region `dram0_0_seg' overflowed by 39016 bytes
```

**Impact.** The exact moment a user most needs a number ("how far over am I?") is the one
case that yields none.

**Workaround.** `_fbuild_overflow_estimate` reconstructs a real percentage from two lines
fbuild/ld already emit: the `ld` overflow amount, plus fbuild's own up-front board budget
(`Memory: 8.00MB Flash, 320.00KB RAM`), which prints win or lose. Region names containing
`ram` attribute to RAM, everything else to flash. Repeated errors for one region keep the
largest byte count.

**Assessment.** Probably not a bug so much as an unfilled gap — but surfacing "you are at
112% of RAM" instead of "build failed" is a large UX difference, and fbuild already has
both numbers in hand.

---

## 6. Successful ESP32 builds report an impossible RAM percentage

**Symptom.** Successful ESP32-S3 builds report e.g. `RAM: 1.28MB / 320.00KB (409.2%)` —
the used figure appears to include sections that are not the board's usable internal
SRAM.

**Impact.** Presenting that as headroom would be actively misleading, and a linked build
by definition fits.

**Workaround.** Discard any RAM percentage over 100% from a *successful* build
(`_fbuild_size_report`, `_fbuild_size_bytes_report`, and the `allow_over_100=False` guard
in `_fbuild_cached_size`). A real over-capacity build is still caught by exit code and
the overflow markers.

**Fixed upstream 2026-08-27, guard retained deliberately.** The cause was Berkeley
`size` output lumping flash-resident `.flash.rodata` into the `data` column beside
RAM-resident `.dram0.data`; [#1297](https://github.com/FastLED/fbuild/pull/1297) switched
to SysV `size -A` and classifies by section, landing in 2.5.17. Not our report —
[#1261](https://github.com/FastLED/fbuild/issues/1261) was found independently on an
ESP32-C6. The same 2.5.21 no-op output above shows a sane `RAM: 23.4%` where this used to
read 409%. The over-100% discard stays anyway: it is a sanity check on a number shown to
users, not compensation for a missing feature, and it costs nothing while the bug is
absent.

**Downstream consequence worth noting.** This guard is why our capacity meter always
reports flash *and* RAM together, including `n/a`. Showing whichever metric happened to
be available meant a design flipping from "SRAM 101%" to "flash 10%" read as *the RAM
problem is fixed* when RAM had merely stopped being measurable.

---

## 7. `deploy` is unimplemented for platforms fbuild can compile

**Confirmed on 2.5.4** — a historical confirmation that still needs a focused
2.5.21 re-test before an upstream report.

**Symptom.** `fbuild deploy` fails with `not yet implemented` for Espressif8266, which
fbuild compiles successfully.

**Workaround.** Detect `not yet implemented` in the deploy output and emit a
`[engine-gap]` line telling the user to switch to the arduino-cli engine. The build
itself is fine; only flashing is missing.

**Context.** This matches the published validated-deploy list (esp32wroom, esp32c3,
esp32c6, esp32s3, esp32p4, NXP LPC845, RP2040, RP2350) — ESP8266 is compile-only. Not a
defect, but the error text could name the gap rather than reading like a crash.

---

## 8. Dependency scanner misses a transitive `SPI` in a vendored local library

The messiest one, and it has a **FastLED-side half as well as an fbuild-side half** —
relevant since both are yours.

**FastLED side.** FastLED unconditionally compiles `src/fl/build/fl.system.sd+.cpp` into
its library archive, relying on the linker to tree-shake it when unused (its own comment:
*"no user opt-in required"*; an earlier `FASTLED_USE_SDCARD` opt-in macro was deliberately
removed). That file needs `SPI` → `SD` → `SDFS` → `SdFat`.

**fbuild side.** On ESP8266's bundled framework, fbuild's dependency scanner never adds
`SPI`'s include path when it is referenced only transitively from a *vendored local
library's* own headers. `SPI` uses the legacy flat layout with no `src/` subfolder, unlike
every library that resolves correctly here — that looks like the discriminator. `SDFS`
additionally pulls in `SdFat`, which isn't bundled at all.

**What we tried, all ineffective.** `lib_deps`; a `library.json` `dependencies` entry; and
`library.json` `build.srcFilter` — confirmed that fbuild does not consult `srcFilter` for
a vendored local library at all, since every rewrite, positive or negative, compiled the
identical file set.

**Workaround, now removed.** `_patch_fastled_sd_stub` overwrote that one file in the
vendored clone with a comment. Studio never uses FastLED's SD/filesystem API (SD/audio
goes through ESP32-audioI2S), so it cost nothing, and it was applied to all boards rather
than only the one it was found on.

**Resolved 2026-08-27 — by the FastLED half, not the fbuild half.** FastLED
[#3815](https://github.com/FastLED/FastLED/pull/3815) (`2026-08-01`) added `SPI` to the
guard that admits the Arduino SD backend, so the block that needs it no longer compiles
on a platform where it is absent. Its comment describes this failure exactly. Re-verified
on `2.5.21` with the real file restored: `esp8266_esp8266_nodemcuv2` and
`esp32_esp32_esp32s3` both build, and the compiler's own `.d` file for that translation
unit shows `<SPI.h>` was never reached.

Two things worth keeping in view. The fbuild half is **not** demonstrated fixed — nothing
proves the include path would resolve today; what changed is that FastLED stopped needing
it. And FastLED [#4010](https://github.com/FastLED/FastLED/pull/4010) (`2026-08-23`) moved
the filesystem subsystem to `fl/fs/`, renaming the file to
`src/fl/build/fl.fs.sd+.cpp` — so on any clone vendored after that date the patch was
already a silent no-op, which is its own argument for deleting rather than repointing it.

**Upstream asks.**
- *FastLED:* satisfied by #3815. The general form still stands: relying on linker
  tree-shaking assumes every toolchain resolves the include graph first, which is
  exactly what failed here.
- *fbuild:* honour `library.json` `srcFilter` / `dependencies` for local libraries, and
  resolve transitive framework libraries that use the legacy flat layout.

---

## 9. A build with nothing to do still takes three minutes

**Symptom.** On an unchanged project, fbuild recognises there is no work and says so —
then spends three minutes reaching that conclusion. Its own timer reports it:

```text
$ fbuild build -e esp32_esp32_esp32s3_opi -v --no-timestamp
Board: Espressif ESP32-S3-DevKitC-1-N8 (8 MB QD, No PSRAM) / ESP32S3 @ 240MHz
No-op fingerprint matched; reusing existing ESP32 artifacts.
Flash: 732.27KB / 16.00MB (4.5%)
RAM:   79.40KB / 320.00KB (24.8%)
build succeeded in 181.5s (flash: 749848 bytes, ram: 81308 bytes)
```

Confirmed by the build tree: no object file, archive, `.elf` or `.bin` under
`.fbuild/build/esp32_esp32_esp32s3_opi/` was written by that run or the one before it.
Nothing was compiled, linked, or emitted. The 181.5s is entirely the decision.

**Impact.** It is the dominant cost of an fbuild upload, and it does not shrink with the
size of the change. Measured on 2026-09-02/03, same host, same sketch, same board
(ESP32-S3 N16R8, `PSRAM=opi`), through the helper's own phase timing:

| Engine | Second build | Re-upload (nothing changed) |
|---|---|---|
| arduino-cli | 26.7s | 26.8s |
| fbuild | 3m 31s | 3m 40s |

The fbuild re-upload breaks down as 3m 09s compile phase — 181.5s of it fbuild's own
no-op check — plus a 30.6s deploy, of which 24.0s is the firmware write at the pinned
115200 baud. Roughly 97% of a run that compiled nothing was spent deciding so.

For scale, the project fbuild is checking: 255 translation units in that environment,
and a `lib/` holding 5,497 files — 4,506 of them a full FastLED clone whose `ci/`,
`examples/`, `tests/`, `docs/` and `.git` directories PlatformIO never needs.

**Workaround.** None. This is not something the helper can accommodate; it is reported
here because it is the single largest remaining cost of choosing fbuild over
arduino-cli, and because the numbers above are the report.

**Not the cause.** Two candidates were eliminated first, both by the same build-tree
timestamps:

- *Our own file writes.* The helper used to rewrite the generated sketch on every run
  and re-patch the vendored FastLED headers on every helper start, both with bytes
  already on disk. Both now go through `_write_if_changed` (2026-09-02), and fbuild
  fingerprints content rather than mtimes in any case — the no-op above is what
  a correctly-cached project looks like.
- *The flash baud.* Real, but small: see the deploy experiment below. esptool compresses
  the image (696,608 bytes to 270,131), so 115200 costs about 21s against 921600 — an
  eighth of what the no-op check costs.

**What upstream's own benchmark says.** fbuild publishes a nightly Arduino Uno
benchmark (`bench/blink`, `arduino:avr:uno`, Linux x86_64, median of 3 trials,
[manifest](https://raw.githubusercontent.com/FastLED/fbuild/benchmark-stats/manifest.json),
[history](https://raw.githubusercontent.com/FastLED/fbuild/benchmark-stats/history.jsonl)).
Its *warm* case is defined as "a subsequent rebuild with no source changes immediately
following the cold build" — precisely the run measured above. On 2026-09-02, same fbuild
2.5.21 we pin:

| Project | Platform / host | No-change rebuild |
|---|---|---|
| `bench/blink`, upstream nightly | AVR Uno, Linux | **46.5 ms** |
| this helper's scaffold | ESP32-S3, Windows | **181,500 ms** |

So the no-op path is not slow in itself — it is ~3,900x slower here. The upstream
benchmark is structurally unable to show this, because a single-file Blink has nothing to
scale with.

**Isolated locally (2026-09-03).** Three candidates could explain that gap: Windows file
I/O, our 4,506-file vendored FastLED tree, and the size of the target. Timing a no-op for
a small environment in *this* scaffold separates them — same host, same `lib/`, same
fbuild 2.5.21, only the environment differs:

| Environment | Objects in the build tree | Populate | No-op |
|---|---|---|---|
| `arduino_avr_uno` | 56 | 26.2s | **0.4s** |
| `esp32_esp32_esp32s3_opi` | 255 | (full build ~6m) | **181.5s** |

Both print the same `No-op fingerprint matched; reusing existing … artifacts` line. That
eliminates the first two candidates outright: Windows and the FastLED tree are identical
across those two rows and the AVR no-op is sub-second.

It also rules out simple proportionality to translation-unit count. 4.6x the objects
costs 450x the time — 7 ms per object on AVR against 712 ms per object on ESP32-S3. The
cost tracks the *platform*, not the project. For scale, the ESP32 framework package tree
is 10,059 files, and fbuild's own store (`~/.fbuild/prod/`) holds roughly 287,000: 102,503
under `cache`, 49,612 under `zccache` — the fingerprint store, judging by the
`.project.zccache_fp.stamp_cache.json` written into each build directory — and 134,932
under `tmp`, which looks like leaked scratch rather than anything load-bearing.

Not yet separated: whether this is specific to the ESP32 platform or general to any
large-framework target. An ESP8266 or STM32 no-op in the same scaffold would tell.

**A separate upstream regression, visible in the same history.** fbuild's *cold* time on
that benchmark stepped up sharply and has stayed there, while warm was unaffected:

| Date | Commit | fbuild cold | fbuild warm |
|---|---|---|---|
| 2026-07-22 | `96a128ed` | 79.8 ms | 51.2 ms |
| 2026-07-23 | `d4b20d26` | 342.7 ms | 50.5 ms |
| 2026-07-24 | `4ae24016` | 372.2 ms | 51.7 ms |
| 2026-07-25 | `fb5224a4` | **2,515.9 ms** | 46.0 ms |
| 2026-09-02 | `cab2098e` | 2,627.0 ms | 46.5 ms |

Two steps, the second decisive: a 6.8x cold regression landed between `4ae24016` and
`fb5224a4` on 2026-07-25 and has held for the 40 nightly runs since, which is what turned
fbuild from the fastest cold builder on that chart (79.8 ms against arduino-cli's ~680 ms)
into the slowest. Warm improving slightly across the same boundary suggests work moved
out of the incremental path and into the cold one. Not our issue — we never see a cold
build in normal use — but it is bisectable to one commit pair from upstream's own data,
and worth naming alongside the ask below.

**Upstream ask.** Make the no-op path proportional to what changed. A fingerprint match
that takes three minutes to establish gives back none of what a fingerprint cache is
for; whatever it is doing per translation unit (255 of them here) or per vendored file
(5,497) is work the cache exists to avoid. Worth reporting with the log above, which is
self-contained: fbuild states both the no-op match and its own elapsed time.

---

## Not fbuild's fault

Recorded so nobody re-diagnoses them, and so the list above stays honest.

**`CORE_DEBUG_LEVEL` undefined.** arduino-cli and the Arduino IDE always define it from
the "Core Debug Level" board menu; PlatformIO's `espressif32` platform does not, so
anything referencing it (ESP32-audioI2S's `Audio.h`) fails to compile. We add
`-DCORE_DEBUG_LEVEL=0`. A known PlatformIO+esp32 gotcha, inherited rather than caused.

**Default ESP32 partition table too small for the Player.** The stock dual-OTA
`default.csv` caps each app slot at 1,310,720 bytes on a 4MB module. The music-sync Player
(ESP32-audioI2S codec support) exceeds 1.7MB — and esptool writes the oversized image
anyway, so the failure appears only as a bootloader `Image length ... doesn't fit in
partition length 1310720` boot loop with no build-time error. We set
`board_build.partitions = huge_app.csv`. *The silent-failure part is arguably worth
raising with esptool/Espressif rather than fbuild.*

**ESP32-audioI2S ≥ 3.1.0 buffer regression.** The library was rewritten so `AudioBuffer`
always allocates a fixed ~640KB+64KB input buffer with no PSRAM/DRAM distinction — an
allocation that can never succeed on a non-PSRAM ESP32's ~320KB internal RAM, so the
Player fails to buffer audio (`OOM: failed to allocate 720896 bytes`) despite compiling
and flashing cleanly. Pinned to **3.0.12**, the newest patch of the last line that falls
back to a small internal-RAM buffer. Re-pin deliberately; do not track the default branch.

**Windows serial port race after a flash.** esptool intermittently loses the race against
Windows releasing the port after a previous flash's hard reset —
`Could not open COM5 ... PermissionError(13, 'Access is denied.')`. Not a hardware fault;
it clears within seconds. We retry the deploy up to 3 times with a 2s backoff.

**Windows long paths.** ESP32 builds fail intermittently on a different vendored-toolchain
file each run once path depth crosses `MAX_PATH`. Requires `LongPathsEnabled=1` in the
registry. Worth a documentation note upstream, since the failure looks random.

---

## Upgrade record from 2.5.4

This repository now pins **`fbuild==2.5.21`**. The original audit was written
against 2.5.4 and compared the 2.5.5–2.5.14 release notes; subsequent upgrades
continued through 2.5.16, 2.5.18 and 2.5.21. Keep the historical confirmations in
the issue sections, but test every surviving workaround against 2.5.21 before
calling it current.

| Our issue | Upstream change | Version | Confidence |
|---|---|---|---|
| §2 `.ino` prototypes | "Skipped auto-prototypes referencing sketch-defined types" (2.5.5); actually fixed by hoisting sketch `#include`s before the prototypes (FastLED/fbuild#1275) | 2.5.16 | **Confirmed fixed — workaround removed 2026-08-10** |
| §1 `lib_deps` | "Honored `lib_deps` on Teensy/STM32; warned on inert `lib_ldf_mode`" | 2.5.6 | Partial — platform-scoped, not the general registry path |
| §1 / §8 local libs | "Fixed resolution of named local dependencies" | 2.5.12 | Plausible — directly touches vendored-lib resolution |
| §1 / §8 local libs | "Resolved relative local dependency roots" | 2.5.13 | Plausible — same area |
| §8 transitive `SPI` | LDF seeds from every compiled TU, and treats `__has_include` as undecidable ([#1375](https://github.com/FastLED/fbuild/pull/1375), [#1376](https://github.com/FastLED/fbuild/pull/1376), closing [#1337](https://github.com/FastLED/fbuild/issues/1337) / the [#1214](https://github.com/FastLED/fbuild/issues/1214) class) | 2.5.21 | Not the cause of our fix — see §8; FastLED's own guard is |

**No upstream change found** for §4 (no size line on a no-op build), §5 (no size summary
on linker overflow), §7 (ESP8266 deploy), or the `srcFilter`/transitive-`SPI` half of §8.
Those are the items most likely to be genuinely unreported, and therefore the most
valuable half of anything sent upstream.

The same is true of both open bench findings, re-checked against 2.5.21 on `2026-08-27`.
The first is now filed as
[FastLED/fbuild#1407](https://github.com/FastLED/fbuild/issues/1407).
A pinned `platform = espressif32@<version>` is still discarded by
`Platform::from_platform_str`, which lowercases the value and substring-matches it, so
everything after the `@` is dropped with no warning — and
`parse_platform_packages_entry` returns `None` for a bare registry version pin as well, so
both spellings of a version pin are silently inert. The URL forms
(`platform_packages = platform-espressif32@<URL>#<sha>` and
`framework-arduinoespressif32@<URL>#<sha>`, FastLED/fbuild#672) *are* honoured for ESP32
and are the supported way to pin a core. For the deploy/serial-port failure, nothing in
2.5.19–2.5.21 touches the path: the only commits reaching `fbuild-deploy/src/esp32`,
`fbuild-serial` or `cli/deploy.rs` are the platform-facade refactor. Two hypotheses to
eliminate before reporting it were fbuild's high per-board ESP32 deploy baud and its
bare-name `esptool` spawn. The focused experiment below now controls both.

### ESP32 deploy-path experiment (2026-09-02)

The helper's fbuild ESP32 upload path now adds `-b 115200` and prepends the directory
containing the helper interpreter's pinned `esptool` executable to the deploy process's
`PATH`. This keeps fbuild responsible for the board-specific flash layout; fbuild 2.5.21
forwards the requesting client's `PATH` to its long-lived daemon
([FastLED/fbuild#1234](https://github.com/FastLED/fbuild/issues/1234)),
so the daemon's bare `esptool` spawn resolves to that exact installation. The upload log
prints both controlled values before deploying. Non-ESP32 fbuild deploys are unchanged,
and selecting the `arduino-cli` engine remains the supported fallback.

Focused unit coverage proves that the ESP32 command contains `-b 115200`, that the first
`PATH` entry is the pinned executable's directory, and that a missing pinned executable
stops before deploy with the existing `arduino-cli` fallback guidance. The complete
backend suite result was `157 passed in 2.44s` (`python -m pytest backend/tests -q`).

Exact local observations on Windows 11 Home 10.0.26200:

```text
fbuild 2.5.21
Python: C:\Espressif\tools\python\python.exe
interpreter scripts: C:\Espressif\tools\python\Scripts
esptool executable: C:\Espressif\tools\python\Scripts\esptool.exe
esptool version reported through fbuild: esptool v5.3.1
pyserial enumeration: no ports found
arduino-cli board list: {"detected_ports": []}
```

With no device attached, a non-destructive control against the nonexistent `COM255`
proved that fbuild accepted the baud override and reached the pinned esptool 5.3.1 path:

```text
$ $env:PATH = 'C:\Espressif\tools\python\Scripts;' + $env:PATH
$ fbuild deploy -e esp32_esp32_esp32s3 -p COM255 -b 115200 --skip-build -v --no-timestamp
A fatal error occurred: Could not open COM255, the port is busy or doesn't exist.
(could not open port 'COM255': FileNotFoundError(2, 'The system cannot find the file specified.', None, 2))
Hint: Check if the port is correct and ESP connectedesptool v5.3.1
Serial port COM255:
esptool failed (exit code 2)
```

The attached-board run followed immediately on the same host and completed successfully:

```text
Target: esp32:esp32:esp32s3:PSRAM=opi
Port: COM3
fbuild: 2.5.21
esptool: C:\Espressif\tools\python\Scripts\esptool.exe (v5.3.1)
Deploy command: fbuild deploy -e esp32_esp32_esp32s3_opi -p COM3 --skip-build --no-timestamp -b 115200
Detected chip: ESP32-S3 QFN56 revision v0.2, embedded 8MB octal PSRAM
Compile: exit 0; 749848 bytes flash, 81308 bytes RAM; 414.8s
Bootloader: 18736 bytes (12222 compressed), written in 1.3s; hash verified
Partitions: 3072 bytes (146 compressed), written in 0.0s; hash verified
Firmware: 696608 bytes (270131 compressed), written in 24.0s; hash verified
Reset: hard reset via RTS
Deploy: succeeded (full flash), exit 0
```

The controlled path therefore **does not reproduce the original serial-port failure on
fbuild 2.5.21**. Because baud and executable binding were changed together, this proves
the combined path but does not assign the old failure to either variable individually.
The reliable 115200/pinned-esptool path remains in the helper, `arduino-cli` remains the
fallback, and—per the reporting gate—no upstream issue report was prepared.

**Also relevant even though it isn't on our list:** 2.5.5–2.5.14 added substantial
RP2040/RP2350 work — PICOBOOT/picotool as the primary deployment transport (2.5.5),
Pico 2 W UF2 hardening (2.5.6, 2.5.8), bundled Arduino-Pico library resolution
(2.5.8, 2.5.11), Arduino-Pico network defines (2.5.10), and picotool device binding
(2.5.14). Those changes are included in the current 2.5.21 pin, though real
RP2040/RP2350 hardware coverage is still required.

### Re-verification procedure

1. Remove one workaround at a time and test whether 2.5.21 still reproduces the
   original failure.
2. Run the focused helper tests and a clean dependency install on all three
   desktop OS families.
3. Re-run hardware validation on at least ESP32-S3 and ESP8266 before deleting
   a deploy-path workaround. An RP2040 pass would add new coverage.
4. Report only failures reproduced on 2.5.21 with the smallest remaining
   workaround.

---

## Things we would use immediately

Not bugs — capability we would adopt if it were exposed.

**`fbuild port scan`.** Our `/api/serial/ports` shells to arduino-cli `board list`, which
returns raw USB IDs. fbuild already translates those to board names. Machine-readable
output (`--json`) would let us show real board names in the port dropdown and
auto-select the right target.

**`fbuild bloat`.** Our capacity meter reports flash/RAM totals only. Per-symbol sizes
would let it answer *what* is consuming the budget — which for a node-graph editor maps
directly onto "this node costs you 4KB". Machine-readable output would make that a
first-class feature rather than log-scraping.

**A stable size query.** See §4 — `fbuild size -e <env> --json` would replace both the
private-cache read and the linker-message parsing in §5.
