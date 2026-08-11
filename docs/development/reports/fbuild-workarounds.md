# fbuild workarounds in the upload helper

Every accommodation `backend/app.py` makes for the **fbuild** build engine, why it
exists, and what it costs. Written to be usable as an upstream bug report as well as
an internal record.

- **Our fbuild version at time of writing:** 2.5.4 (`fbuild --version`)
- **Host:** Windows 11. Some issues below are Windows-specific and are marked as such.
- **How we drive fbuild:** a persistent scaffold at `backend/.fbuild-project/` with one
  `[env:X]` per supported board, built with `fbuild build -e <env> -v --no-timestamp`
  and flashed with `fbuild deploy -e <env> -p <port> --skip-build --no-timestamp`.
  See `_compile_upload_fbuild` in [`backend/app.py`](../../../backend/app.py).

> [!IMPORTANT]
> **Verify before sending upstream.** Items marked *confirmed against 2.4.0* were
> diagnosed on an older fbuild and have **not** been re-tested on 2.5.4. Several may
> already be fixed. Re-check each one before reporting it, so the list stays credible.
> See [Upstream fixes since 2.5.4](#upstream-fixes-since-254) — three of the eight
> already have plausible fixes in later releases.

---

## Summary

| # | Issue | Version confirmed | Our workaround | Still needed? |
|---|-------|-------------------|----------------|---------------|
| 1 | `lib_deps` registry resolution not implemented | 2.4.0 | Vendor libraries by `git clone` | Re-verify |
| 2 | `.ino` prototype insertion breaks FastLED-typed helpers | 2.4.0 | Write `main.cpp` instead | **No — fixed upstream in 2.5.16, workaround removed 2026-08-10** |
| 3 | Shared scaffold corrupts under concurrent builds | 2.4.0 | External process-wide lock | Likely (design-level) |
| 4 | No size line on a no-op incremental build | 2.4.0 | Read fbuild's own size cache | Re-verify |
| 5 | No size summary on hard linker overflow | 2.4.0 | Parse `ld` + `Memory:` lines | Likely (by design) |
| 6 | ESP32 RAM percentage impossible (>100%) on success | 2.4.0 | Discard RAM figure over 100% | Re-verify |
| 7 | `deploy` unimplemented for some compilable platforms | **2.5.4** | Fall back to arduino-cli | Yes |
| 8 | Dep scanner misses transitive `SPI` in a vendored lib | 2.4.0 | Stub out the offending file | Re-verify |

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

**Workaround.** `_write_fbuild_main` writes a plain `main.cpp` (prepending
`#include <Arduino.h>` when absent) rather than `main.ino`, which bypasses Arduino
sketch preprocessing entirely. It also unlinks any stale `main.ino`.

**Note.** Arduino IDE and arduino-cli place inserted prototypes *after* the includes,
so the same sketch compiles fine there. This looks like an ordering difference rather
than a deliberate design choice.

**Resolved 2026-08-10.** Reported upstream as FastLED/fbuild#1275; fixed in fbuild
2.5.16 by hoisting sketch `#include` directives into the prelude ahead of the
auto-generated prototypes. `backend/requirements.txt`/`backend/constraints.txt` now
pin `fbuild==2.5.16`, and `_write_fbuild_main` writes plain `main.ino` again — the
`.cpp` workaround is gone. Not yet re-validated on real hardware since the revert
(tracked in `todo.md`'s "Build engine maintenance" section).

---

## 3. The project scaffold is shared, with no concurrency safety

**Symptom.** fbuild builds against a single project directory holding one `src/main.cpp`.
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
`fbuild size -e <env>` query command. We are currently reading a dotfile that is
presumably a private implementation detail.

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

**Downstream consequence worth noting.** This guard is why our capacity meter always
reports flash *and* RAM together, including `n/a`. Showing whichever metric happened to
be available meant a design flipping from "SRAM 101%" to "flash 10%" read as *the RAM
problem is fixed* when RAM had merely stopped being measurable.

---

## 7. `deploy` is unimplemented for platforms fbuild can compile

**Confirmed on 2.5.4** — the only item here verified against our current version.

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

**Workaround.** `_patch_fastled_sd_stub` overwrites that one file in the vendored clone
with a comment. Studio never uses FastLED's SD/filesystem API (SD/audio goes through
ESP32-audioI2S), so this costs nothing, and it is applied to all boards rather than only
the one it was found on.

**Upstream asks.**
- *FastLED:* consider restoring an opt-out for the SD unity file — relying on linker
  tree-shaking assumes every toolchain resolves the include graph first, which is exactly
  what fails here.
- *fbuild:* honour `library.json` `srcFilter` / `dependencies` for local libraries, and
  resolve transitive framework libraries that use the legacy flat layout.

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

## Upstream fixes since 2.5.4

We pin **`fbuild==2.5.4`** in `backend/requirements.txt` and `backend/constraints.txt`,
so users get exactly what we test. As of 2026-08-07 the latest release is **2.5.14** —
ten patch releases ahead, under visibly active development.

Reading the 2.5.5 → 2.5.14 release notes against the list above:

| Our issue | Upstream change | Version | Confidence |
|---|---|---|---|
| §2 `.ino` prototypes | "Skipped auto-prototypes referencing sketch-defined types" (2.5.5); actually fixed by hoisting sketch `#include`s before the prototypes (FastLED/fbuild#1275) | 2.5.16 | **Confirmed fixed — workaround removed 2026-08-10** |
| §1 `lib_deps` | "Honored `lib_deps` on Teensy/STM32; warned on inert `lib_ldf_mode`" | 2.5.6 | Partial — platform-scoped, not the general registry path |
| §1 / §8 local libs | "Fixed resolution of named local dependencies" | 2.5.12 | Plausible — directly touches vendored-lib resolution |
| §1 / §8 local libs | "Resolved relative local dependency roots" | 2.5.13 | Plausible — same area |

**No upstream change found** for §4 (no size line on a no-op build), §5 (no size summary
on linker overflow), §7 (ESP8266 deploy), or the `srcFilter`/transitive-`SPI` half of §8.
Those are the items most likely to be genuinely unreported, and therefore the most
valuable half of anything sent upstream.

**Also relevant even though it isn't on our list:** 2.5.5–2.5.14 contains substantial
RP2040/RP2350 work — PICOBOOT/picotool as the primary deployment transport (2.5.5),
Pico 2 W UF2 hardening (2.5.6, 2.5.8), bundled Arduino-Pico library resolution
(2.5.8, 2.5.11), Arduino-Pico network defines (2.5.10), and picotool device binding
(2.5.14). Community members are already trying RP2040 boards; on 2.5.4 they may hit
problems that are fixed upstream. This is the strongest single argument for scheduling
the bump.

### Suggested upgrade procedure

Not a bare version bump — the point is to find out which workarounds can be *deleted*.

1. Bump `fbuild==2.5.14` in `backend/requirements.txt` **and** `backend/constraints.txt`.
   (`backend/DEPENDENCIES.md` has the refresh procedure; the `Backend Dependency
   Compatibility` workflow validates fresh installs on all three OSes.)
2. For each issue above, remove its workaround and confirm whether it still reproduces.
   Order by expected payoff: §2 (delete `_write_fbuild_main`'s `.cpp` trick) → §1
   (try `lib_deps` instead of vendoring) → §8 (drop `_patch_fastled_sd_stub`).
3. Re-run hardware validation on at least ESP32-S3 and ESP8266 before promoting —
   see `docs/release/beta-hardware-validation.md`. An RP2040 pass would be new coverage
   and directly answers the community question.
4. Whatever still reproduces on 2.5.14 is a clean, current bug report.

Do **not** bump casually alongside unrelated work. The build engine is the deploy path
for every user, and a regression here is invisible until someone tries to flash a board.

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
