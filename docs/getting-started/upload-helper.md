# Upload-helper setup

The local FastAPI helper compiles generated sketches and uploads them over USB.
It also provides serial streaming, Art-Net preview, native file dialogs and
disk-backed Project/Pattern Library sync. Browser authoring, preview, browser-cached
projects, View Code and Export `.ino` remain available without it.

The [portable desktop bundle](../release/desktop-distribution.md) includes the
helper and its Python runtime. The instructions below are for a source checkout.

## Install Python dependencies

Use Python 3.10 or later. Run these commands from the repository root:

```sh
python -m venv backend/.venv
```

Activate the environment on Windows PowerShell:

```powershell
.\backend\.venv\Scripts\Activate.ps1
```

Or on macOS/Linux:

```sh
source backend/.venv/bin/activate
```

Then install the pinned dependency set:

```sh
python -m pip install -r backend/requirements.txt -c backend/constraints.txt
```

[requirements.txt](../../backend/requirements.txt) owns the direct pins,
including fbuild; [constraints.txt](../../backend/constraints.txt) owns the
tested transitive resolution. See [dependency management](../development/backend-dependencies.md)
for updates, tests and packaging dependencies.

## Choose a build engine

The helper uses a saved engine preference while that engine is available;
otherwise it prefers `arduino-cli`, falling back to `fbuild`. The Upload tab
shows the active engine.

- **Arduino CLI** is the recommended ESP32 path. Install it on `PATH`, set
  `ARDUINO_CLI` to its executable, or use the detected Arduino IDE installation.
  Install the matching board core and FastLED library. Custom-screen builds
  arrange the pinned LVGL library and generated `lv_conf.h` through the helper.
- **fbuild** is an experimental ESP32 choice installed with the Python
  requirements. It downloads toolchains on first use and builds in a persistent
  scaffold. The helper vendors required libraries and hides unused optional
  libraries for unrelated builds.

The old ESP32 no-op delay was fixed upstream and was re-measured on fbuild
2.5.26 in the [workaround record](../runbooks/fbuild-workarounds.md).
That historical issue is not the current reason to reject a build. Consult the
same record for remaining engine limitations and the
[support matrix](../release/beta-support-matrix.md) for exact validated rigs.

On Windows, fbuild toolchain paths can exceed the legacy path limit. The
existing workflow requires Windows long-path support; if it is disabled,
enable it from an administrator PowerShell and start a fresh shell:

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

## Start and verify

With the virtual environment active:

```sh
npm run helper
```

The equivalent command is:

```sh
python -m uvicorn app:app --reload --port 8008 --app-dir backend
```

Vite development and preview servers also try to start the helper automatically.
Start Vite from the activated environment, or start the helper separately first.

Open [health](http://localhost:8008/api/health) to inspect liveness and detected
engines. `ok: true` means the service is running; check `arduinoCli`, `fbuild`
and `engine` to determine whether a compiler is available.

The frontend defaults to `http://localhost:8008`. Set `VITE_BACKEND_URL` before
starting Vite if using a different local helper address.

## Where saved work lives

The helper keeps saved projects and the pattern library in `Projects` and
`My Patterns` under the same per-user data folder as the
[desktop bundle](../release/desktop-distribution.md), so a source checkout never
holds personal work. A checkout's old root `My Patterns` folder moves there the
first time the helper starts. Set `FLS_PROJECTS_DIR` or `FLS_PATTERNS_DIR` to use
another folder. Helper configuration and a self-installed `arduino-cli` stay in
`backend/`.

For endpoint behavior and streaming contracts, see the
[upload-helper API reference](../reference/api/upload-helper.md).
