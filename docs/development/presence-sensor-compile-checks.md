# HLK-LD2410C firmware compile checks

> **Status: one of three sensor paths complete.** The normal classic-ESP32
> sketch passed on 24 September 2026. Compile the slideshow next, then the
> player, one at a time. This is compile evidence only; the HLK-LD2410C remains
> experimental in the [support matrix](../release/beta-support-matrix.md) until
> its recorded bench run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each sensor fixture reads an HLK-LD2410C on GPIO 18 through UART1 at 256000
baud, maps its 0–6 m distance to 0–1, and uses that value as LED brightness.
The slideshow and player carry the value through a `ControlMap`; the normal
sketch wires it directly to the LED output's exposed Brightness input. A
fourth no-sensor fixture proves that an unrelated sketch does not acquire the
parser or UART setup. Fixture generation refuses any set that does not contain
exactly one parser/setup pair per sensor sketch and none in the guard.

| Fixture | Generator | Result |
| --- | --- | --- |
| `normal` | `generateCpp` | **Pass** |
| `slideshow` | `generateShowSketch` | Not run; next leg |
| `player` | `buildShowPlayer` | Not run |
| `no-sensor` | `generateCpp` | Generation guard only; compile not required |

## Reproduce

From the repository root:

```powershell
npm run gen:presence-compile-fixtures
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/presence-sensor-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32
```

The runner uses the helper's real `_compile_upload` or
`_compile_upload_fbuild` path and never flashes. It writes a log and JSON report
beside the generated sketch. `backend/sketches/` is gitignored, so this page is
the durable result.

## Results, 24 September 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5. Target:
`esp32:esp32:esp32`. The normal fixture source SHA-256 is
`b4748504f50ec4c3f94262afab2501dbb961d913ccc9b4fbccf99c92fa1caaf4`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| normal | arduino-cli | pass | 405,851 / 1,310,720 (30%) | 27,748 / 327,680 (8%) |

No generator or firmware repair was needed for the normal path.
