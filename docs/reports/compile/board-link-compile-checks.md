# Board-link compile checks

> **Status: complete.** Both boards of each of the three D-13 bench runs passed
> on 24 October 2026. This is compile evidence only; board links stay
> experimental in the [support matrix](../../release/beta-support-matrix.md)
> until the bench row in the root todo, section 4, is recorded.

Each pair is one root graph cut by `boardPartition`, as the Upload tab cuts
it, so a fixture is the sketch that board would be flashed with. The pins are
the bench wiring. Board telemetry is on, so the link counters the bench reads
are compiled in. Both halves of each pair carry the same schema hash, and the
generator refuses a sketch with no link code.

| Run | Board | What crosses the link |
| --- | --- | --- |
| 1 | ESP32-S3 Music Player, 26x17 matrix, SD card, MAX98357A | sends the XC4630's Fixed Transport fields; receives the touch sheet's presses and volume |
| 1 | Classic ESP32 with the XC4630 parallel shield and its resistive touch | the other half of the above |
| 2 | ESP32-S3 Music Player, as run 1 | sends the OLED's Now Playing fields; receives the encoder's position (volume) and press (Next) |
| 2 | Classic ESP32 with an SSD1306 128x64 on I2C and a bare encoder | the other half of the above |
| 3 | Classic ESP32, 8x8 matrix behind a Brightness node | receives a Web Remote slider |
| 3 | ESP8266 (LOLIN D1 mini) serving the Web Remote | sends the slider |

## Reproduce

From the repository root:

```powershell
npm run gen:compile-fixtures -- board-links
python scripts/compile-fixtures/compile-matrix.py --only board-links/
```

The matrix runs the six legs one at a time through `compile-display-smoke.py`,
which uses the helper's real build path and never flashes. `artifacts/` is
gitignored, so this page is the durable result.

## Results, 24 October 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11, ESP8266 core 3.1.2 and
FastLED 3.10.8. The ESP32-S3 target is
`esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB`.

| Fixture | Target | Source | Result | Flash | RAM |
| --- | --- | --- | --- | --- | --- |
| `run1-board1-player` | ESP32-S3 | `3999fdf6` | **Pass** | 1,410,939 (44%) | 61,756 (18%) |
| `run1-board2-xc4630` | `esp32:esp32:esp32` | `04ffce7a` | **Pass** | 898,340 (28%) | 47,288 (14%) |
| `run2-board1-player` | ESP32-S3 | `853213b7` | **Pass** | 1,410,219 (44%) | 61,580 (18%) |
| `run2-board2-oled-encoder` | `esp32:esp32:esp32` | `73dae2c0` | **Pass** | 916,419 (29%) | 50,404 (15%) |
| `run3-board1-esp32` | `esp32:esp32:esp32` | `6fc51274` | **Pass** | 933,251 (29%) | 48,736 (14%) |
| `run3-board2-esp8266-remote` | `esp8266:esp8266:d1_mini` | `0863ecfd` | **Pass** | 305,920 (29%) | 29,300 (36%) |

RAM is static allocation. The Wi-Fi driver's heap cost on the render board is
a runtime figure, and the bench row measures it.
