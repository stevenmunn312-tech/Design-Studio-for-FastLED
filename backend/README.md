# FastLED Studio — upload helper

A small local FastAPI service that lets the browser app compile and upload
sketches to a board over USB. A web page can't run a local program, so the
studio POSTs the generated `.ino` here and this helper drives a build engine,
streaming the build/upload logs back.

It's **optional**: if it isn't running, the Build & Upload panel falls back to
showing the copy-paste CLI commands.

## Build engines

Two engines are supported; the helper picks one automatically (`fbuild` when
available, else `arduino-cli`) and reports the active choice at `/api/health`
and `/api/engine`.

- **`fbuild`** (preferred) — FastLED's own PlatformIO-compatible build tool.
  It manages its own toolchains/frameworks per board (downloaded on first use
  into `.fbuild-project/`, a persistent scaffold this helper generates), so
  there's no per-board core install step. FastLED and, for the music-sync
  Player, `ESP32-audioI2S` are vendored into `.fbuild-project/lib/` — as of
  fbuild 2.4.0 its `lib_deps` registry resolution doesn't actually fetch
  anything (`fbuild sync` marks entries `unresolved`), so a local vendored
  copy is the working alternative. The generated source is also written as
  `main.cpp`, not `main.ino` (`_write_fbuild_main` in `app.py`) — fbuild's
  `.ino`→`.cpp` preprocessing auto-inserts function prototypes *before* any
  user `#include`s, which breaks on FastLED-typed helpers (e.g. `CRGB
  kelvinToRGB(...)`) since `CRGB` isn't declared yet at that point. Writing
  a plain `.cpp` (with `#include <Arduino.h>` prepended) skips that
  preprocessing entirely. **Hardware-validated** on a real ESP32-S3
  (16×16 WS2812B matrix, GPIO6): fbuild compiled, flashed via `esptool`,
  and the uploaded pattern ran correctly.
- **`arduino-cli`** (fallback) — the original engine. Needs the ESP32 core +
  FastLED library installed per board (via the Arduino IDE, or
  `arduino-cli core install esp32:esp32` / `arduino-cli lib install FastLED`).

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
- If you'd rather use the `arduino-cli` fallback: [`arduino-cli`](https://arduino.github.io/arduino-cli/)
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

| Method | Path                        | Purpose                                                                   |
| ------ | --------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/health`               | Liveness + active engine + arduino-cli/fbuild availability.                |
| GET    | `/api/engine`               | Which build engine is active.                                             |
| POST   | `/api/engine`               | Persist an engine preference (`{"engine": "fbuild" \| "arduino-cli"}`).   |
| GET    | `/api/serial/ports`         | Connected serial boards/ports (`board list`).                             |
| POST   | `/api/upload`               | Compile a raw `.ino` and upload it (streams logs).                        |
| POST   | `/api/upload-show`          | Music-sync upload: provisioner sketch → SD file transfer → player sketch. |
| GET    | `/api/cores`                | List installable board-manager cores (arduino-cli engine only).           |
| POST   | `/api/core/install`         | Install a board-manager core, e.g. `esp32:esp32` (arduino-cli engine only). |
| POST   | `/api/arduino-cli/locate`   | Point the helper at a user-supplied `arduino-cli` binary.                 |
| POST   | `/api/arduino-cli/install`  | Download and install the official `arduino-cli` into `backend/bin`.       |
