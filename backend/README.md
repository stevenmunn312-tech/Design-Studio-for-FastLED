# Design Studio for FastLED — upload helper

The local FastAPI service compiles generated sketches and uploads them over USB.
It also provides serial streaming, Art-Net preview, native file dialogs and
disk-backed Project/Pattern Library sync.

The helper is optional for browser authoring, preview, browser-cached projects,
View Code and Export `.ino`.

- [Install, choose an engine and start the helper](../docs/getting-started/upload-helper.md)
- [API endpoints and streaming contracts](../docs/reference/api/upload-helper.md)
- [Python dependencies and update procedure](../docs/development/backend-dependencies.md)
- [Build-helper implementation patterns](../docs/development/patterns/build-helper.md)
- [fbuild troubleshooting and workaround evidence](../docs/runbooks/fbuild-workarounds.md)
- [Supported hardware and validation scope](../docs/release/beta-support-matrix.md)

With dependencies installed and the intended Python environment active, run
`npm run helper` from the repository root. The service defaults to
`http://localhost:8008`.
