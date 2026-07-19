# Desktop Distribution

Design Studio for FastLED can be shipped as a portable desktop bundle that requires no
separate Node.js or Python installation. The package deliberately keeps the
tested browser UI: one native launcher contains the Python runtime and upload
helper, serves the production Vite assets on localhost, and opens the user's
default browser.

## Why this shape

- It reuses the existing FastAPI upload, serial-streaming, and SD-provisioning
  code rather than maintaining a second Electron/Tauri backend.
- It avoids bundling a second browser engine; the installed default browser is
  the same environment already covered by Studio's browser policy.
- PyInstaller's one-folder mode is inspectable and easier to diagnose than a
  one-file executable. It also keeps the native `fbuild`, `fbuild-daemon`, and
  frozen `esptool` tools beside the launcher.
- The source launchers remain the developer path and are unchanged.

PyInstaller builds are host-specific, so Windows, macOS, and Linux packages
must each be built on their target operating system. Linux builds should use
the oldest distribution/glibc version included in the intended support range.

## Build

Use a clean Python 3.11 virtual environment on the target operating system:

```bash
python -m venv .venv-package
# Activate .venv-package (Scripts\\activate on Windows; source bin/activate on macOS/Linux)
python -m pip install -r backend/requirements-packaging.txt -c backend/constraints.txt
npm ci
npm run package:desktop
```

The command:

1. creates the production/PWA frontend build;
2. freezes the launcher and upload helper in PyInstaller one-folder mode;
3. freezes a standalone `esptool` and copies the native fbuild CLI/daemon;
4. includes the project and runtime dependency notices;
5. starts the frozen launcher with an isolated temporary data directory and
   checks the desktop-status endpoint plus rendered app shell; and
6. writes a platform archive under `release/desktop/`.

Useful development flags are `--skip-frontend`, `--skip-smoke`, and
`--no-archive`, passed after `npm run package:desktop --`.

## Runtime layout

The application directory is read-only in normal use. Mutable content is kept
under the operating system's per-user data location:

| Platform | Data root |
| --- | --- |
| Windows | `%LOCALAPPDATA%\\Design Studio for FastLED` |
| macOS | `~/Library/Application Support/Design Studio for FastLED` |
| Linux | `$XDG_DATA_HOME/design-studio-for-fastled` or `~/.local/share/design-studio-for-fastled` |

That root contains Projects, My Patterns, helper configuration, downloaded
Arduino CLI binaries, fbuild's project/toolchain cache, and compile output.

The launcher binds only to `127.0.0.1`. Port 8008 remains the application/API
contract; a second launch reopens an existing desktop instance, while an
unrelated process on that port produces an actionable startup error.

## Validation status

On 2026-07-17, a Windows x86-64 bundle was built and launch-smoked locally:

- packaged Design Studio for FastLED shell returned HTTP 200;
- `/api/desktop/status` identified the frozen launcher;
- bundled `fbuild 2.5.0` and `esptool 5.3.1` executed successfully;
- output was a 61 MB ZIP / 168 MB unpacked one-folder bundle.

This validates the packaging mechanism, not a public support promise. Before a
release artifact is promoted, repeat the smoke on a clean Windows account and
build/test the macOS and Linux bundles on those hosts.

## Signing and publishing

The current output is an unsigned portable beta archive. A public release still
needs:

- Authenticode signing for the Windows launcher and bundled executables;
- macOS application layout, code signing, hardened runtime, and notarization;
- checksums for every archive and an artifact provenance record;
- a clean-machine launch/upload smoke per published platform; and
- publication through the normal tagged-release process.

Do not describe an unsigned or unvalidated platform package as supported in the
beta support matrix.

## GitHub package workflow

`.github/workflows/desktop-packages.yml` runs the host-specific packager on
Windows, Linux, macOS Apple Silicon, and macOS Intel. It records a SHA-256 file
beside each archive and retains the outputs as Actions artifacts. Manual runs
default to artifact-only validation; tag runs, or an explicit manual opt-in,
assemble the passing artifacts into a draft pre-release.

The `fbuild 2.5.0` wheel currently carries unusable macOS executables (the ARM
binary is rejected by `dyld`, while the Intel host receives the wrong CPU
slice). The workflow therefore compiles `fbuild` and `fbuild-daemon` from the
exact `v2.5.0` source commit on each Mac runner, verifies that commit before the
build, and replaces only those two wheel-provided tools before packaging. The
result remains the same pinned upstream version and is launch-smoked as part of
the normal bundle test.
