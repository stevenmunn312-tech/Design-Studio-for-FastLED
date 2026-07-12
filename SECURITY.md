# Security Policy

FastLED Studio is still in pre-release / public-beta preparation. Security
issues are still important, especially where imported graphs, generated code,
local file access, or the upload helper are involved.

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
- Generated sketches and helper-side vendored libraries may have their own
  upstream vulnerabilities; please include the exact dependency/version when
  relevant.
- This file is process guidance, not a warranty or legal promise.
