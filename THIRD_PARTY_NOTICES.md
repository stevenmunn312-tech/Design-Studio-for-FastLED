# Third-Party Notices

This file tracks the third-party software and asset obligations that matter for
shipping FastLED Studio's source tree, web bundle, and helper-backed release
artifacts.

The repository's own code and project-authored assets are licensed under
[`LICENSE`](LICENSE) unless a file says otherwise. Third-party components keep
their own licenses.

## Browser bundle dependencies

The production app bundle currently depends on these notable runtime packages:

| Package | Version in lockfile | License | Notes |
| --- | --- | --- | --- |
| `@xyflow/react` | 12.11.0 | MIT | Node-canvas/editor runtime |
| `react` | 19.2.7 | MIT | UI runtime |
| `react-dom` | 19.2.7 | MIT | UI runtime |
| `zustand` | 5.0.14 | MIT | State management |
| `zundo` | 2.3.0 | MIT | Undo/redo state history |
| `poline` | 0.13.1 | MIT | Palette generation |
| `gifuct-js` | 2.1.2 | MIT | GIF frame decoding |
| `lz-string` | 1.5.0 | MIT | Share-link compression |
| `essentia.js` | 0.1.3 | AGPL-3.0 | Offline music analysis; keep origin acknowledgement |

`package-lock.json` is the source of truth for the exact installed dependency
set. Refresh this file when the lockfile changes in a release-significant way.

## Essentia.js

- FastLED Studio's Music Library pipeline bundles `essentia.js` for offline
  music analysis.
- The package metadata in `node_modules/essentia.js/package.json` marks it as
  `AGPL-3.0`.
- The app already carries the required origin acknowledgement in `README.md`
  and `src/components/Canvas/MusicLibraryNodeBody.tsx`:
  `http://essentia.upf.edu`.
- Anyone redistributing a build that includes `essentia.js` must preserve its
  license notice and review the AGPL obligations that apply to their
  distribution and deployment model.

## Fonts

- `src/themes/tokens.css` bundles `Audiowide` for the restrained display role
  via `public/fonts/Audiowide-Regular.ttf`.
- Audiowide is Copyright (c) 2012, Brian J. Bonislawsky DBA Astigmatic
  (AOETI), with Reserved Font Names "Audiowide", and is licensed under the SIL
  Open Font License 1.1. The license text is included at
  `public/fonts/Audiowide-OFL.txt`.
- `src/themes/tokens.css` still names `Inter` for body text and `JetBrains
  Mono` for code text.
- The repo does **not** currently bundle Inter or JetBrains Mono font files, so
  those roles rely on the user's locally available fonts or the generic
  fallback families.
- If a future release embeds Inter or JetBrains Mono font files, add their SIL
  Open Font License 1.1 notices to the distributed artifact set at that time.

## Icons and branding assets

- `public/icon.svg` is the source for the shipped PNG install icons:
  `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, and
  `icon-maskable-512.png`.
- `public/fastled-studio-branding.svg`, `public/fastled-studio.svg`,
  `public/fastled-s.svg`, and `public/fastled-studio-pixel-brand.png` are
  currently treated as project-authored repository assets with no separate
  third-party attribution file in-tree.
- If any of those assets are replaced with external artwork, update this file
  before shipping the next release.

## FastLED and helper-vendored libraries

- Generated sketches target the upstream FastLED library.
- FastLED's upstream repository publishes the library under the MIT license.
- The source repo does not vendor FastLED by default, but the helper may clone
  FastLED into `backend/.fbuild-project/lib/FastLED/` at build time when using
  `fbuild`.
- If a packaged release ships that vendored copy or another bundled FastLED
  checkout, include FastLED's copyright and license text in the artifact.

## Stefan Petrick / AnimARTrix

- The Color Trails node is adapted from prototype code and visual work by
  Stefan Petrick, creator of [AnimARTrix](https://github.com/StefanPetrick/animartrix).
  That attribution is preserved in the node-library description, README, source,
  and generated firmware comments.
- The Color Trails implementation does not copy AnimARTrix source files. It adds
  Studio-specific preview/codegen parity, audio mappings, selectable line/border
  injection, selectable scrolling/morphing flow, and capped subpixel advection.
- AnimARTrix itself is published under CC BY-NC-SA 4.0 and asks commercial users
  to contact Stefan. Future direct ports or derivatives must retain attribution,
  comply with that license (including its non-commercial/share-alike terms), or
  be covered by separate permission; they must not be treated as MIT merely
  because they live in this repository.
- FastLED Studio's AnimARTrix node is kept in the isolated `src/animartrix/`
  module under CC BY-NC-SA 4.0. Its initial effect set is Water, Polar Waves,
  RGB Blobs, Spiralus, and Complex Kaleido. The adaptation adds normalized
  matrix coordinates, paired TypeScript/C++ renderers, smoothing, and structural
  bass/mids/treble/kick/snare/hi-hat/beat mappings. Generated firmware carries
  Stefan's name, the upstream URL, and the license identifier.

## Generated and packaged artifacts

- Generated `.ino` sketches are project/user output and do not embed FastLED's
  license text themselves, but they assume the target build environment has the
  upstream libraries installed.
- The shipped PNG app icons are derived from the repo's own `public/icon.svg`,
  so no extra third-party attribution is currently required for those
  generated files.
- Helper-produced `.fbuild-project/` contents and any future desktop packages
  may pull in additional upstream material at build time; if those artifacts
  are redistributed, include the corresponding upstream license texts alongside
  them.

## Helper-side dependencies

- The helper's direct Python dependencies are pinned in
  `backend/requirements.txt` and `backend/requirements-dev.txt`.
- The helper's transitive dependency graph is locked in
  `backend/constraints.txt`.
- Review those files when preparing a release that redistributes the helper as
  a prebuilt package rather than as source.

## Note

This file is an operational release checklist, not legal advice. When in doubt,
review the upstream license texts before redistributing a bundled artifact.
