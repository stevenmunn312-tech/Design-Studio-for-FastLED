# Desktop Distribution

Design Studio for FastLED can be shipped as a portable desktop bundle that requires no
separate Node.js or Python installation. The package deliberately keeps the
tested web UI: one native launcher contains the Python runtime and upload
helper and serves the production Vite assets on localhost. On Windows it shows
them in a native window drawn by the system WebView2 runtime; on macOS and
Linux it opens the user's default browser.

## Why this shape

- It reuses the existing FastAPI upload, serial-streaming, and SD-provisioning
  code rather than maintaining a second Electron/Tauri backend.
- It avoids bundling a second browser engine. Windows draws the window with
  the Edge WebView2 runtime that is part of the operating system, which is the
  same Chromium engine the browser policy already covers. macOS and Linux keep
  the default browser, because their system web views (WKWebView, WebKitGTK)
  lack Web MIDI and the File System Access pickers.
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

## Windows window

`desktop/launcher.py` builds a console-less (`--windowed`) launcher on Windows.
It starts the helper on a background thread, waits for it to answer, and opens
a pywebview window on the WebView2 runtime. Closing the window stops the
helper. Behaviour that differs from the pywebview defaults, all set in the
launcher:

- **Profile:** a persistent WebView2 profile under `<data root>\WebView2`
  keeps localStorage and granted microphone/MIDI permissions between launches.
  It is separate from any browser profile, so browser-held localStorage does
  not carry over; projects and patterns on disk do.
- **Links and popups:** external links and `window.open` targets go to the
  default browser. Blank and same-origin popups stay in WebView2, because the
  community share flow opens an empty named window and later posts a form
  into it. The main window never navigates away from the app.
- **Downloads** are allowed (firmware and file exports) and ask where to save.
- **Browser behaviour kept:** text selection, Ctrl+wheel/pinch zoom, native
  drag, and the default context menu.
- **Second launch** asks the running instance to raise its window
  (`POST /api/desktop/focus`) instead of opening a browser tab.
- **No console:** output goes to `<data root>\desktop.log`. Every helper
  subprocess passes `NO_CONSOLE_WINDOW` from `backend/subprocess_flags.py`;
  without it each arduino-cli, fbuild, esptool or PowerShell call would open a
  console window. Add the flag to any new spawn site.
- **Missing WebView2:** pywebview would fall back to the retired MSHTML
  engine, so the launcher checks the renderer and instead opens the default
  browser, showing a message box whose OK button stops the helper.
- `FLS_DESKTOP_DEBUG=1` enables DevTools. Setting
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` exposes
  the page to a CDP client for automated checks.

The pywebview overrides replace three of its WebView2 event handlers, so
`backend/constraints.txt` pins pywebview exactly; re-check them on every
upgrade (`backend/tests/test_desktop_launcher.py` asserts they still exist).

## Runtime layout

The application directory is read-only in normal use. Writable files go to two
per-user roots (`backend/user_data.py`):

| Platform | Content root (Projects, My Patterns) | Data root (everything rebuildable) |
| --- | --- | --- |
| Windows | `Documents\\Design Studio for FastLED` | `%LOCALAPPDATA%\\Design Studio for FastLED` |
| macOS | `~/Documents/Design Studio for FastLED` | `~/Library/Application Support/Design Studio for FastLED` |
| Linux | `~/Documents/Design Studio for FastLED` | `$XDG_DATA_HOME/design-studio-for-fastled` or `~/.local/share/design-studio-for-fastled` |

The data root holds helper configuration, downloaded Arduino CLI binaries,
fbuild's project/toolchain cache, compile output, the WebView2 profile and
`desktop.log`. Projects and patterns are kept apart in Documents because they
are the person's own work: an MSIX (Store) install redirects AppData into the
package and deletes it on uninstall, and Documents is where people look.
Windows resolves Documents through the shell, so a redirected (OneDrive)
Documents folder is followed.

Projects and patterns saved before 2026-11 sit in the data root. Helper startup
moves them into the content root file by file (copy, then remove the original),
gives a different file already holding a name a suffixed name instead of
overwriting it, and removes each old folder once empty. Setting
`FLS_CONTENT_DIR`, `FLS_PROJECTS_DIR` or `FLS_PATTERNS_DIR` moves content
elsewhere and turns this migration off. `FLS_DATA_DIR` moves only the data
root, so an isolated run (the packaging smoke test) sets both it and
`FLS_CONTENT_DIR`.

The launcher binds only to `127.0.0.1`. Port 8008 remains the application/API
contract; a second launch reopens an existing desktop instance, while an
unrelated process on that port produces an actionable startup error.

## Validation status

On 2026-07-17, a Windows x86-64 bundle was built and launch-smoked locally:

- packaged Design Studio for FastLED shell returned HTTP 200;
- `/api/desktop/status` identified the frozen launcher;
- bundled `fbuild 2.5.0` and `esptool 5.3.1` executed successfully in the
  original packaging smoke; the current dependency set pins `fbuild 2.5.37`
  and `esptool 5.3.1`, so release candidates must repeat this check;
- output was a 61 MB ZIP / 168 MB unpacked one-folder bundle.

This validates the packaging mechanism, not a public support promise. Before a
release artifact is promoted, repeat the smoke on a clean Windows account and
build/test the macOS and Linux bundles on those hosts.

On 2026-08-02, the v0.4.0 release candidate repeated the automated packaging
and launcher smoke on clean GitHub-hosted runners for Windows x86-64, Linux
x86-64, macOS ARM64, and macOS x86-64. Every target produced an archive, wrote
its SHA-256 checksum, and uploaded the pair as workflow artifacts. The run is
recorded at
[`30746475347`](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/actions/runs/30746475347).
This closes the cross-platform build/launch-smoke check, but it is not a
substitute for signing/notarization, a clean end-user account launch, default
browser behavior, physical serial-port discovery, or a hardware upload.

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

The Windows bundle can also be packed as an MSIX for the Microsoft Store, which
signs it; see [Microsoft Store](microsoft-store.md).

## GitHub package workflow

`.github/workflows/desktop-packages.yml` runs the host-specific packager on
Windows, Linux, macOS Apple Silicon, and macOS Intel. It records a SHA-256 file
beside each archive and retains the outputs as Actions artifacts. Manual runs
default to artifact-only validation; tag runs, or an explicit manual opt-in,
assemble the passing artifacts into a draft pre-release. The Windows job also
packs the [Microsoft Store](microsoft-store.md) MSIX into its own artifact,
which never goes into the release.

The launch smoke checks that the bundled fbuild is found. fbuild is also the
helper's default engine, but the smoke does not check the reported engine,
because a saved preference can change it. A failed smoke lists each check that
did not pass.

The original `fbuild 2.5.4` packaging investigation found unusable macOS
executables (the ARM binary was rejected by `dyld`, while the Intel host
received the wrong CPU slice). The current workflow still compiles `fbuild` and
`fbuild-daemon` from the exact `v2.5.4` source tag on each Mac runner, verifies
that source before the build, and replaces only those two wheel-provided tools
before packaging. This means the macOS bundle currently substitutes 2.5.4
tools even though the Python dependency set pins 2.5.37; reconcile and re-smoke
that exception before treating a new macOS package as a release candidate.
