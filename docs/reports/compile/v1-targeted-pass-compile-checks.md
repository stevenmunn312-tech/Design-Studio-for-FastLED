# v1 targeted compile pass

Compile evidence for [root todo](../../../todo.md), step 2: firmware that
landed between 2026-11-09 and 2026-11-11 and had only unit and host tests
behind it. Each section is one run. This is compile evidence only; nothing
here was flashed, and bench rows stay in the
[bench backlog](../../plans/bench-backlog.md).

## The six fixtures added on 12 November 2026

Twelve sketches from five generators, built on GitHub `windows-latest`
runners by the `Compile matrix` workflow with `every` on, so no leg was
pruned.

| Family | Sketches | What it compiles |
| --- | --- | --- |
| `control-graph` | `normal-ds3231`, `show-ds3231` | A Clock reading the DS3231 on the OLED's I2C bus (SDA 8, SCL 9), through the normal sketch's emitter and the control graph's |
| `uno-r4-wifi` | `ntp-zone`, `artnet-static` | WiFiS3 on an Arduino UNO R4 WiFi: NTP in Europe/Paris through `_rtcTzOffset`; Art-Net beside NTP on a named board at a static address (`setHostname`, DNS-second `config`) |
| `long-strings` | `string-720`, `string-4096` | Waveform's line style over an elementary Automaton on one LED string |
| `clock-sync` | `pattern-leader`, `pattern-follower`, `show-leader`, `show-follower` | Both boards of a two-board clock-sync project, cut by `boardPartition`, as one pattern and as the same collection show |
| `display` | `screens-normal`, `screens-show` | A design with two screens, a Go to screen button, a wired Screen input, a Text Entry feeding a Text and a Chart; a Spectrum on a microphone in the normal sketch, and Show Status on a second panel in the show |

A show analyses no live audio and refuses a Spectrum widget, so
`screens-show` leaves it out.

### Reproduce

```text
gh workflow run compile-matrix.yml -f every=true -f only="clock-sync/ uno-r4-wifi/ long-strings/ ds3231 display/screens"
```

Locally, one family at a time on Arduino CLI:

```text
python scripts/compile-fixtures/compile-matrix.py --every --only clock-sync/
```

### Result

Arduino CLI 1.5.1 with ESP32 core 3.3.12 and `arduino:renesas_uno` 1.6.0;
fbuild 2.5.51; FastLED 3.10.9. Sources are `main` at `2dbe01f4`
([run 43035986760](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/actions/runs/43035986760)).
The three fbuild ESP32-S3 legs marked † are from the rerun at `ff821bd0`
([run 43043729239](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/actions/runs/43043729239)),
at the same source hashes. `esp32` is `esp32:esp32:esp32`, `esp32s3` the
N16R8 FQBN the display runner uses, `unor4wifi`
`arduino:renesas_uno:unor4wifi`. Byte counts are comparable across engines
only loosely: fbuild counts RAM differently on the S3.

| Leg | Board | Source SHA-256 prefix | Arduino flash | Arduino RAM | fbuild flash | fbuild RAM |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `clock-sync/pattern-leader` | esp32 | `8c08c514d7e2` | 926,171 | 49,216 | 952,494 | 49,347 |
| `clock-sync/pattern-follower` | esp32 | `df33bb97c1e8` | 926,163 | 49,216 | 952,484 | 49,347 |
| `clock-sync/show-leader` | esp32 | `5c6df7ddfedd` | 929,679 | 50,208 | 955,802 | 50,371 |
| `clock-sync/show-follower` | esp32 | `c97280b53633` | 929,963 | 50,224 | 956,027 | 50,381 |
| `long-strings/string-720` | esp32 | `a3dc1d0aa6ab` | 396,663 | 33,640 | 398,756 | 33,782 |
| `long-strings/string-4096` | esp32 | `70fb9a56dc4d` | 396,595 | 64,024 | 398,715 | 64,164 |
| `control-graph/normal-ds3231` | esp32s3 | `64fa96885ce1` | 401,171 | 27,628 | 460,524 † | 85,412 † |
| `control-graph/show-ds3231` | esp32s3 | `20d432838899` | 563,887 | 38,444 | 619,919 | 95,662 |
| `display/screens-normal` | esp32s3 | `0587ef3f23f5` | 623,123 | 37,764 | 675,082 † | 91,648 † |
| `display/screens-show` | esp32s3 | `ac2b52319024` | 542,619 | 35,788 | 595,917 † | 89,416 † |
| `uno-r4-wifi/ntp-zone` | unor4wifi | `0cc5826dde10` | 66,496 | 9,824 | failed | — |
| `uno-r4-wifi/artnet-static` | unor4wifi | `3b9080ccb4d2` | 68,096 | 11,832 | failed | — |

All twelve pass on Arduino CLI. Ten pass on fbuild.

### What the run found

- **fbuild does not find `WiFiS3.h`.** Both `uno-r4-wifi` sketches stop at the
  include on fbuild 2.5.51. The app now builds an UNO R4 WiFi sketch that
  uses the network with arduino-cli, and the matrix keeps this family off
  fbuild ([runbook §16](../../runbooks/fbuild-workarounds.md#16-uno-r4-wifi-sketches-that-use-the-network-do-not-compile)).
  The names assumed from the Renesas core (`ARDUINO_UNOWIFIR4`, `WiFiS3.h`,
  `setHostname`, the DNS-second `config`) compile as written on core 1.6.0.
- **A runner ran short of disk.** On the first run the three † legs built
  nothing: fbuild's preflight wants 5 GB free beside its cache and the shard
  had 4.98 GB. The workflow now sets `FBUILD_MIN_DISK_BYTES` to 2 GB, and the
  rerun passed.
- **The 4096-LED string costs 30 KB more static RAM than the 720-LED one**
  on a classic ESP32 (64,024 against 33,640 bytes), and no more flash.

### Not established here

- Whether the boards keep time: the clock-sync bench row needs two boards on
  one network.
- Whether WiFiS3 joins, syncs or receives Art-Net on a real UNO R4 WiFi.
- A DS3231 answering on the bus, and a 4096-LED string lighting.
