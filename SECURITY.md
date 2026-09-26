# Security Policy

Design Studio for FastLED is in public beta. Security issues are especially
important where imported graphs, generated code, local file access, or the
upload helper are involved.

## What to report

Please report vulnerabilities involving:

- Imported or shared graph trust boundaries.
- Formula or Code-node execution escaping the intended sandbox.
- Local file access, project import/export, or path traversal.
- Upload-helper command execution, serial-port ownership, or unsafe temp-file
  handling.
- Secrets, tokens, credentials, or unexpected network access.

## How to report

1. Prefer GitHub's private vulnerability reporting for this repository if it is
   enabled.
2. If private reporting is not available, open a minimal public issue that does
   **not** include exploit details or a proof of concept, and request a private
   contact path from the maintainer.
3. Include the affected commit or tag, platform, reproduction steps, impact,
   and any proposed mitigation.

## Response goals

- Triage acknowledgement target: within 7 days.
- Fix timing depends on severity, exploitability, and whether a safe workaround
  exists.
- Public disclosure should wait until a fix or mitigation is available.

## Scope notes

- The local upload helper is part of the attack surface when it is running.
  The trust boundary is described under [Upload helper](#upload-helper).
- Generated sketches and helper-side vendored libraries may have their own
  upstream vulnerabilities; please include the exact dependency/version when
  relevant.
- This file is process guidance, not a warranty or legal promise.

## Upload helper

The helper on port 8008 can compile and flash firmware, hold a serial port
open, and write files onto a mounted drive. It accepts a request only when
the caller is this machine:

- `Host` must be `localhost`, `127.0.0.1`, `[::1]`, or a `*.localhost` name,
  with an optional port. Any other host is rejected with 403. That is the
  DNS-rebinding boundary: a public name that resolves to 127.0.0.1 still
  arrives with the public name in `Host`, and the helper does not serve it.
- `POST`, `PUT`, `PATCH`, `DELETE`, and `GET /api/serial/monitor` also check
  the caller. A present `Origin` must be `http` or `https` on one of those
  same hosts. If `Origin` is absent, `Sec-Fetch-Site` must be absent,
  `same-origin`, or `none`. A cross-site page, including one that uses a
  form or an image URL, is rejected with 403 and does not run the route.
- `GET /api/health` stays available to a local host so the studio can see
  that the helper is up. It does not flash a board or write a drive.

This covers the desktop launcher, which serves the app and the helper from
one `localhost` process, and the Vite dev server. Those pages are
`http://127.0.0.1:5173`, `http://localhost:5173`, and the `*.localhost`
names used by `npm run dev:named` and `npm run preview:named`. CORS still
only decides whether page script may read the response. The check above
decides whether the helper performs the request.
