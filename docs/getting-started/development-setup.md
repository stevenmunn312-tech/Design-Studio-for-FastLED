# Development setup

Scope: the active `Hardware` development line. For the frozen public beta,
use its published release and [release policy](../release/versioning-and-releases.md).

## Prerequisites

Use a Node.js version accepted by [package.json](../../package.json):
Node 20.19+ within the 20.x line, Node 22.13+ within the 22.x line, or Node 24+.
Node 21 and 23 are excluded. Git is needed to clone the repository.

Python is optional for browser authoring. Follow [upload-helper setup](upload-helper.md)
for compilation, USB upload, serial streaming, native file dialogs and disk-backed
project/pattern sync.

## Install and run

From a new checkout:

```sh
git clone --branch Hardware https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED.git
cd Design-Studio-for-FastLED
npm ci
npm run dev
```

Open [the local Studio](http://localhost:5173). The Vite server listens on
127.0.0.1 and tries to start the helper on port 8008; if the helper is already
running, it reuses it. Missing Python dependencies do not prevent browser
authoring. If using a Python virtual environment, activate it in the shell
that starts Vite so the child helper uses that interpreter.

For an existing checkout, inspect local changes before switching branches.
Follow [the contribution workflow](../../CONTRIBUTING.md#pull-requests);
never merge `main` and `Hardware`.

The included launchers are another way to start the app:
`Start Design Studio for FastLED.bat` on Windows,
`Start Design Studio for FastLED.command` on macOS, and `./start.sh` on Linux.
The explicit commands above make dependency or startup failures easier to inspect.

## Development commands

Run commands from the repository root.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run lint` | Check ESLint rules. |
| `npm test` | Run Vitest once. |
| `npm run test:watch` | Run tests while editing. |
| `npm run build` | Type-check and create the production/PWA build. |
| `npm run preview` | Serve the production build locally. |
| `npm run package:desktop` | Build a desktop package for the host platform. |

For backend tests and pinned Python dependencies, use
[backend dependency management](../development/backend-dependencies.md).
For packaging prerequisites and distribution limits, use
[desktop distribution](../release/desktop-distribution.md).

## Find the next document

- [First project](first-project.md): go from a starter to preview and upload.
- [Documentation index](../index.md): architecture, designs, plans and evidence.
- [Subsystem patterns](../development/patterns/): read the matching implementation
  rules before changing a subsystem.
- [Contributing](../../CONTRIBUTING.md): review and validation requirements.
