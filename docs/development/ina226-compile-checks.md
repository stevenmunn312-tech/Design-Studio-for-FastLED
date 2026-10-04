# INA226 compile checks

> **Status: complete.** Both fixtures passed on classic ESP32 on 1 October 2026.
> This is compile evidence only; the INA226 remains experimental in the
> [support matrix](../release/beta-support-matrix.md) until its recorded bench
> run exists.

The fixtures come from real Studio graphs. Each reads a `PowerMonitorInput`
whose watts dim an LED output through a Map Range. The INA226 is at 0x4A with
its overcurrent limit at 10 A. Fixture generation refuses any set that does not
contain exactly the expected driver helpers and one bus start, and any library
include: both chips are driven through their registers over `Wire`.

| Fixture | What it holds | Result |
| --- | --- | --- |
| `ina226` | one INA226 at 0x4A | **Pass** |
| `both` | an INA219 at 0x40 and an INA226 at 0x41 on one bus | **Pass** |

These compile fixtures cover the normal sketch generator. Slideshow and player
display support is also implemented and checked by
`src/codegen/__tests__/powerMonitorTemplateDisplays.test.ts`; those template
paths have no recorded Arduino compile results in this report.

## Reproduce

From the repository root:

```powershell
npm run gen:ina226-compile-fixtures
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/ina226-fixtures/ina226.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/ina226-fixtures/both.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
```

The runner uses the helper's real `_compile_upload` path and never flashes. It
writes a log and JSON report beside each generated sketch.
`backend/sketches/` is gitignored, so this page is the durable result. Run the
compiles one at a time: they share one arduino-cli workspace per label, and two
runs at once, or a run killed part-way, leave a truncated cached object that
fails the next link with `ld: final link failed: file truncated`.

## Results, 1 October 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5. Target:
`esp32:esp32:esp32` with the helper's `huge_app` partition setting.

Source hashes: `ina226` `ced516ca`, `both` `4665bcc8`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| ina226 | arduino-cli | pass | 418,043 / 3,145,728 (13%) | 29,060 / 327,680 (8%) |
| both | arduino-cli | pass | 418,239 / 3,145,728 (13%) | 29,060 / 327,680 (8%) |
