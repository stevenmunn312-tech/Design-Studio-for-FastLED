# Upload-helper API

Scope: the `Hardware` checkout. The helper defaults to `http://localhost:8008`.
[Setup](../../getting-started/upload-helper.md) covers starting it.

Routes and manually validated request fields are implemented in the helper's
router modules: [`toolchain.py`](../../../backend/toolchain.py) (engine choice and
arduino-cli setup), [`firmware.py`](../../../backend/firmware.py) (compile, upload
and serial), [`streaming.py`](../../../backend/streaming.py) (Adalight and
Art-Net), [`sd_card.py`](../../../backend/sd_card.py) and
[`storage.py`](../../../backend/storage.py) (patterns and projects).
[`app.py`](../../../backend/app.py) applies the local-only trust checks to all of
them. The browser client in
[`backendClient.ts`](../../../src/utils/backendClient.ts) records the matching
request and response handling. With the helper running, its
[OpenAPI document](http://localhost:8008/openapi.json) and
[interactive reference](http://localhost:8008/docs) expose declared parameters.
Several handlers accept a generic JSON dictionary, so OpenAPI does not enumerate
every manually read field; use the contracts below and the handler for details.

## Local request boundary

The helper accepts local Host values (`localhost`, loopback IPs and named
`*.localhost` hosts). State-changing requests and the serial-monitor GET also
check browser Origin/fetch metadata. The trust middleware rejects forbidden
requests with HTTP 403 and `{"ok": false, "error": "forbidden"}` before routing.
CORS allows matching local origins to read responses.

## Endpoint inventory

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
| POST | `/api/upload-show` | Flash the player once, then transfer SD content through its built-in receiver. |
| GET | `/api/removable-drives` | List candidate removable drives for direct SD-show copying. |
| POST | `/api/sd-copy` | Copy packaged music/show content to a selected removable drive. |
| GET / POST | `/api/patterns` | List or save helper-backed Pattern Library JSON files. |
| DELETE | `/api/patterns/{pattern_id}` | Delete one helper-backed pattern. |
| POST | `/api/patterns/reveal` | Reveal the native Pattern Library folder. |
| GET / POST | `/api/projects` | List or save helper-backed project JSON files. |
| POST | `/api/projects/dialog/open` | Open a native project-file picker. |
| POST | `/api/projects/dialog/save` | Open a native project-file save dialog. |
| DELETE | `/api/projects/{project_id}` | Delete one helper-backed project. |
| POST | `/api/compile-binary` | Compile without flashing; stream a firmware-download artifact marker. |
| GET | `/api/compile-binary/{artifact_id}` | Download a previously compiled firmware image. |

## Build and upload contracts

JSON examples below describe request shapes; invoking these endpoints performs
the named operation.

| Endpoint | Request | Result |
| --- | --- | --- |
| `GET /api/health` | No body. | JSON `ok`, `arduinoCli`, `version`, `engine`, `fbuild`, `fbuildVersion`. Engine presence and service liveness are separate facts. |
| `POST /api/engine` | `{"engine": "arduino-cli"}` or `{"engine": "fbuild"}`. | Saves the preference and returns the resolved active engine; invalid names return 400. |
| `POST /api/upload` | JSON `ino`, `fqbn`, optional `port`, `flashMb`, `usbCdcOnBoot`, `reuseCompiled`. | Streams compile/upload text. A nonempty port requests flashing after a successful compile; an empty port compiles only. |
| `POST /api/compile-check` | JSON `ino`, `fqbn`, optional `flashMb`, `usbCdcOnBoot`. | Compiles without flashing and returns JSON `ok`, `overflow`, `busy`, `engine`, `target`, `flash`, `ram`, `error`, `log`. |
| `POST /api/compile-binary` | JSON `ino`, `fqbn`, optional `flashMb`, `usbCdcOnBoot`, `name`. | Streams the build log, then a binary marker. Nothing is flashed. |
| `GET /api/compile-binary/{artifact_id}` | ID from a successful binary marker. | `application/octet-stream` file response; an invalid or missing artifact returns 404. |
| `POST /api/build/cancel` | No body. | JSON `ok` and `cancelled`; idempotent when no build is running. |

`ino` is sketch source; `fqbn` identifies the target and any Arduino menu options.
Send the selected board's actual flash and USB settings rather than guessing them
from a chip-family name. The compile-check and binary-export routes reject empty
sketches with HTTP 400. An unavailable build engine also produces a 400 JSON error.
An upload to the port held by Live Stream produces HTTP 409 until the stream stops.

`reuseCompiled: true` requests upload of a retained matching successful build.
Source and board settings must still match; the port may change. If no matching
build exists, the retry fails instead of silently compiling or using another image.

## Streaming and errors

Build/upload streams use `text/plain`, not server-sent events. An HTTP success
status alone does not mean compilation or flashing succeeded: failures after
the response starts are reported in the log. Consumers must retain partial lines
across network chunks and interpret the operation's completion/failure markers.

Ordinary upload outcomes include `Upload complete.`, `*** BUILD FAILED ...`,
`*** UPLOAD FAILED ...` and `*** DID NOT RUN ***` for a busy build workspace.
Cancellation is reported by the build runner. Compile-check instead returns one
JSON result; `busy: true` means no measurement was obtained, and must not be
reported as a design that exceeds the board's capacity.

Binary export ends with either:

```text
[binary] id=<id> name=<file> bytes=<n>
[binary] failed
```

On success, fetch the artifact using the separate GET route. A firmware file is
not embedded in the log. Artifact retention is bounded, so an old ID may expire.
See [build-helper patterns](../../development/patterns/build-helper.md) for the
shared emission, parser and log-view rules.

## Other request formats

- `POST /api/stream/frame` takes the raw bytes of an already framed Adalight
  packet, including its header, checksum and RGB data. It returns 409 if no
  stream is active. Packet construction lives in
  [`adalight.ts`](../../../src/utils/adalight.ts).
- `POST /api/upload-show` takes multipart fields `meta` (JSON text), `player`
  (sketch source), and `files` (uploads). `meta.paths[i]` names the SD destination
  for `files[i]`; target, port and optional board settings are also in `meta`.
  The legacy `provisioner` form field is accepted but ignored. The response is
  a text log stream covering the player build/flash and SD transfer.
- Project and pattern persistence, native dialogs, serial monitoring and Art-Net
  use the remaining routes above. Consult their handler and browser caller for
  field validation and operation-specific errors; they do not share a universal
  response schema.
