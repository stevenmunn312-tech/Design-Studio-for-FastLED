# Design Studio for FastLED — upload helper

A small local FastAPI service that lets the browser app compile and upload
sketches to a board over USB. A web page can't run a local program, so the
studio POSTs the generated `.ino` here and this helper drives a build engine,
streaming the build/upload logs back.

It's **optional** for authoring: graph editing, preview, project data cached in
the browser, View Code, and Export `.ino` still work without it. Compile/upload,
live serial streaming, Art-Net preview, native file dialogs, and disk-backed
Project/Pattern Library sync remain unavailable until the helper is online.

## Build engines

Two engines are supported; the helper picks one automatically (`arduino-cli`
when available, otherwise `fbuild`) and reports the active choice at
`/api/health` and `/api/engine`. A saved explicit choice wins while that engine
remains available.

- **`arduino-cli`** (recommended for ESP32) — the original engine. It needs the
  ESP32 core + FastLED library installed per board (via the Arduino IDE, or
  `arduino-cli core install esp32:esp32` / `arduino-cli lib install FastLED`).
  It is the default while fbuild 2.5.21's confirmed ESP32 no-op check can take
  roughly three minutes on an unchanged build.
- **`fbuild`** (explicit experimental choice for ESP32) — FastLED's own
  PlatformIO-compatible build tool.
  It manages its own toolchains/frameworks per board (downloaded on first use
  into `.fbuild-project/`, a persistent scaffold this helper generates), so
  there's no per-board core install step. FastLED and, for the music-sync
  Player, `ESP32-audioI2S` are vendored into `.fbuild-project/lib/` because the
  helper cannot rely on fbuild's registry dependency resolution to fetch them
  consistently (the workaround was introduced against fbuild 2.4.0 and is
  retained with the currently pinned 2.5.21). Generated source is written as
  `main.ino`; fbuild 2.5.16 fixed the include/prototype ordering defect that
  previously required a plain-CPP workaround. **Hardware-validated** on a real ESP32-S3
  (16×16 WS2812B matrix, GPIO6): fbuild compiled, flashed via `esptool`,
  and the uploaded pattern ran correctly. That validation does not resolve the
  no-op delay, so fbuild is no longer the recommended ESP32 workflow.

## Prerequisites

- Python 3.10+
- **Windows only — enable long path support**, or ESP32/ESP32-S3 builds with
  fbuild fail intermittently with `bits/c++config.h: No such file or
  directory` (different file each run) once the vendored toolchain/library
  paths get deep enough to cross the 260-character `MAX_PATH` limit. As
  administrator:
  ```powershell
  New-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
  ```
  A fresh shell (no reboot needed) picks this up.
- `pip install -r backend/requirements.txt` gets you `fbuild` and `esptool`
  (fbuild shells out to `esptool` to convert `firmware.elf` → `firmware.bin`
  for ESP32 targets).
- For the recommended ESP32 path, install [`arduino-cli`](https://arduino.github.io/arduino-cli/)
  on your `PATH` (or set `ARDUINO_CLI=/path/to/arduino-cli`) — installing the
  Arduino IDE also works, its bundled CLI and config are picked up
  automatically — plus the ESP32 core + FastLED library (see above).

## Run

```bash
python -m venv backend/.venv
# Windows:
backend/.venv/Scripts/activate
# macOS/Linux:
# source backend/.venv/bin/activate

pip install -r backend/requirements.txt
uvicorn app:app --reload --port 8008 --app-dir backend
```

Or, from the repo root: `npm run helper`.

The studio talks to `http://localhost:8008` by default; override with the
`VITE_BACKEND_URL` env var when starting the frontend.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/system-info` | Host OS information used by opt-in hardware-validation reports. |
| GET | `/api/health` | Liveness, active engine, and arduino-cli/fbuild availability. |
| GET / POST | `/api/engine` | Read or persist the active build engine. |
| GET | `/api/serial/ports` | Connected serial ports plus USB identity metadata used by automatic native-USB/UART routing. |
| GET | `/api/serial/monitor` | Read a bounded serial-monitor sample from a selected port. |
| POST | `/api/rtc/set` | Write the computer's local date/time to a DS3231 through the selected board's serial command channel. |
| POST | `/api/stream/start` | Open a serial port for live Adalight frame streaming. |
| POST | `/api/stream/frame` | Send one packed live-preview frame to the open stream. |
| POST | `/api/stream/stop` | Close the live-stream serial session. |
| GET | `/api/stream/status` | Report whether a serial stream is active. |
| POST | `/api/artnet/start` | Start the helper's Art-Net UDP receiver for one universe. |
| POST | `/api/artnet/stop` | Stop the Art-Net receiver. |
| GET | `/api/artnet/status` | Return receiver/liveness and packet-rate status. |
| GET | `/api/artnet/snapshot` | Return the latest cached 512-channel universe. |
| POST | `/api/arduino-cli/locate` | Point the helper at a user-supplied `arduino-cli` binary. |
| POST | `/api/arduino-cli/install` | Download the official `arduino-cli` into `backend/bin`. |
| GET | `/api/cores` | List board-manager cores (`arduino-cli` engine only). |
| POST | `/api/core/install` | Install a board-manager core. |
| POST | `/api/core/updates` | Check installed board cores for updates. |
| POST | `/api/core/upgrade` | Upgrade selected installed board cores. |
| POST | `/api/upload` | Compile a generated sketch and optionally upload it; streams logs. |
| POST | `/api/build/cancel` | Cancel the active compile/upload process tree before it continues. |
| POST | `/api/compile-check` | Compile without flashing and return flash/RAM capacity data. |
| POST | `/api/upload-show` | Provisioner upload → SD transfer → music-show player upload. |
| GET | `/api/removable-drives` | List candidate removable drives for direct SD-show copying. |
| POST | `/api/sd-copy` | Copy packaged music/show content to a selected removable drive. |
| GET / POST | `/api/patterns` | List or save helper-backed Pattern Library JSON files. |
| DELETE | `/api/patterns/{pattern_id}` | Delete one helper-backed pattern. |
| POST | `/api/patterns/reveal` | Reveal the native Pattern Library folder. |
| GET / POST | `/api/projects` | List or save helper-backed project JSON files. |
| POST | `/api/projects/dialog/open` | Open a native project-file picker. |
| POST | `/api/projects/dialog/save` | Open a native project-file save dialog. |
| DELETE | `/api/projects/{project_id}` | Delete one helper-backed project. |
