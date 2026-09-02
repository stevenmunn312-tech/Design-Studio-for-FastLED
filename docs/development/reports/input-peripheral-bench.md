# Input Peripheral Bench Records

Hardware validation for the `input` category — sensors and controls that feed a
graph rather than driving pixels. The beta support matrix tracked LED output
combinations only; before the first record below, no input peripheral had any
hardware coverage at all.

Each record states the exact environment, what was measured, and what was
observed. A record covers the module and pin that were actually on the bench,
not the node type in general.

## Coverage today

| Node | Module bench-tested | Record |
| --- | --- | --- |
| `LightInput` | Photosensitive LDR module (KS6026 form) | Below |
| `ButtonInput` | — | None |
| `PotInput` | — | None |
| `EncoderInput` | — | None |
| `MotionInput` | — | None |

Everything without a record is covered by unit, codegen, and backend tests
only. `PotInput` shares `LightInput`'s ADC path and pin-capability rule, so the
GPIO2/ADC1 result below is suggestive for it, but a potentiometer has not been
on the bench and must not be promoted on that resemblance.

## LDR light sensor — 2026-09-02

### Environment

| Field | Value |
| --- | --- |
| Host OS | Windows 11 Home, build 10.0.26200 |
| Browser | Chrome 152.0.7977.76 (64-bit) |
| Board | Generic ESP32-S3 N16R8, 44-pin dual USB-C |
| Module | Photosensitive LDR analog light-sensor module, KS6026 form (`photosensitive-ldr-module`) |
| Sensor pin | GPIO2 (ADC1_CH1) |
| LED output | WS2812B, LED String 32x1, data on GPIO42 |
| Build engine | `fbuild` 2.5.21 |
| Upload method | USB flash via `esptool` through the helper's normal Upload path |
| Serial route | UART bridge — CH343 (VID `0x1A86`) on COM3, `usbCdcOnBoot: false` |

### Graph

`Light Sensor.Level` → `Map Range` (In Min 0, In Max 1, Out Min 1, Out Max 0)
→ `Smooth` (response 0.5) → `LED String.Brightness`.

The inversion is the Map Range alone: `LightInput` rises with light, and the
node has no invert property.

### Observed on hardware

| Condition | Strip |
| --- | --- |
| Sensor covered | Full brightness |
| Normal room light | Mid brightness |
| Direct phone torch | Off |

Passed with `Out Max 0`, so a torch takes the strip fully dark rather than to a
floor.

### Measured ADC

A standalone probe sketch read the pin with the identical expression
`cppGenerator.ts` emits, `analogRead(2) / 4095.0f`, so the numbers are directly
comparable to what generated firmware sees:

| Condition | raw | level |
| --- | --- | --- |
| Covered | 0–50 | 0.000–0.012 |
| Unlit room, late evening | 87–103 | 0.021–0.025 |
| Normal room light | not recorded | 0.60 |
| Direct torch | 2773–4095 | 0.68–1.00 |

The module reaches both rails, so the default `In 0 → 1` mapping uses close to
the full ADC range and needs no calibration on this bench.

### What this settles

- GPIO2 is usable as an analog input on the ESP32-S3, confirming the
  `ESP32_S3_ANALOG` range in `src/state/boardGpio.ts` on real silicon. The
  ADC2/Wi-Fi caveat attaches to GPIO11–20 and does not apply here.
- The KS6026 pin order recorded in the part catalogue (`S`, `VCC`, `GND`, left
  to right) matches the physical module.
- `LightInput` codegen, the Map Range and Smooth emitters, and the LED output's
  `brightness` port compose correctly end to end in a normal sketch.

### Failure signatures worth knowing

**A loose common ground reads exactly like a dead feature.** The first run of
this graph produced a strip stuck at full brightness with no response to light.
The cause was a ground leg not seated in the breadboard; the ADC sat near 0, so
`1 − level` sat near 1. Nothing in the graph, the generated sketch, or Graph
Health was wrong, and none of them could have said so.

The cheap discriminator, on any inverted mapping: a strip stuck at **full**
means the ADC is pinned low (missing ground, unpowered module, signal not
landing on the pin); a strip stuck **dark** means it is saturated (signal shorted
to VCC, or a 5 V-powered module overdriving a 3.3 V ADC). The direction of the
failure names the half of the circuit to look at.

**Do not calibrate from a single unattended capture.** An eight-second probe
capture taken in an unlit room put ambient at level 0.022 and suggested an
`In Max` of 0.03. The real figure under normal room lighting is 0.60 — a 30×
error that would have pegged the strip off in any lit room. Ambient light
varies far more than a short sample suggests; take readings in the conditions
the fixture will actually live in.

**Resolve the serial route from the port, never by assumption.** An ESP32-S3
exposes both a native USB-Serial/JTAG socket and a UART bridge, and `Serial`
reaches exactly one. This bench is on a CH343 bridge, so `usbCdcOnBoot` is
false. `inferSerialRoute` in `src/state/serialRouting.ts` derives this from the
port's USB VID; guessing it wrong yields a blank monitor with nothing actually
broken.

**Pin the browser version at the moment of observation.** The updater reported
`152.0.7977.65` staged while `152.0.7977.64` was running; the build that
actually landed was `152.0.7977.76`. A version read from the updater rather
than from the browser at test time would have been wrong in the record.
