# FastLED Studio — upload helper

A small local FastAPI service that lets the browser app compile and upload
sketches to a board over USB. A web page can't run a local program, so the
studio POSTs the generated `.ino` here and this helper drives `arduino-cli`,
streaming the build/upload logs back.

It's **optional**: if it isn't running, the Build & Upload panel falls back to
showing the copy-paste `arduino-cli` commands.

## Prerequisites

- Python 3.10+
- [`arduino-cli`](https://arduino.github.io/arduino-cli/) on your `PATH` (or set
  `ARDUINO_CLI=/path/to/arduino-cli`). Installing the Arduino IDE also works —
  its bundled CLI and config are picked up automatically.
- The ESP32 core + FastLED library installed (via the Arduino IDE, or
  `arduino-cli core install esp32:esp32` and `arduino-cli lib install FastLED`).

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

| Method | Path                | Purpose                                              |
| ------ | ------------------- | ---------------------------------------------------- |
| GET    | `/api/health`       | Liveness + whether `arduino-cli` is available.       |
| GET    | `/api/serial/ports` | Connected serial boards/ports.                       |
| POST   | `/api/upload`       | Compile a raw `.ino` and upload it (streams logs).   |
