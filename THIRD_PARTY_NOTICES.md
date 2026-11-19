# Third-Party Notices

This file tracks the third-party software and asset obligations that matter for
shipping Design Studio for FastLED's source tree, web bundle, and helper-backed release
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

`package-lock.json` is the source of truth for the exact installed dependency
set. Refresh this file when the lockfile changes in a release-significant way.

## Fonts

`src/themes/tokens.css` bundles three families under the SIL Open Font License 1.1.
Each license is shipped next to its files.

- Audiowide (display) is Copyright (c) 2012, Brian J. Bonislawsky DBA Astigmatic
  (AOETI), with Reserved Font Names "Audiowide". The file is
  `public/fonts/Audiowide-Regular.ttf`. The license is
  `public/fonts/Audiowide-OFL.txt`.
- Inter (body) is Copyright (c) 2016 The Inter Project Authors
  (https://github.com/rsms/inter). The bundled files are the Inter 4.001
  variable font, declared for weights 400–700, split into the latin,
  latin-ext, cyrillic, cyrillic-ext, greek, greek-ext, and vietnamese subsets
  at `public/fonts/Inter-*.woff2`. The license is `public/fonts/Inter-OFL.txt`.
- JetBrains Mono (code) is Copyright 2020 The JetBrains Mono Project Authors
  (https://github.com/JetBrains/JetBrainsMono). The bundled files are version
  2.211, declared for weights 400–500, split into the latin, latin-ext,
  cyrillic, cyrillic-ext, greek, and vietnamese subsets at
  `public/fonts/JetBrainsMono-*.woff2`. The license is
  `public/fonts/JetBrainsMono-OFL.txt`.
- Characters outside those subsets fall back to the generic family in the
  stack (`sans-serif` or `monospace`).
- The LED bitmap fonts Text and Clock Display draw with (3×5, 4×6, 5×8 and
  the bold 6×8, in `src/nodes/shared/font.ts` and `fontGlyphs.ts`) are
  project-authored and fall under [`LICENSE`](LICENSE). They are not the
  console fonts FastLED ships under `src/fl/font/`: those come from the
  `idispatch/raster-fonts` collection by way of WLED, which publishes no
  licence for them, so no glyph data was copied from there.

## Icons and branding assets

- `public/icon.svg` and the shipped PNG install icons (`icon-192.png`,
  `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`) are drawn
  by the repo's own `scripts/assets/make-brand-icons.py` from the brand tokens
  in `src/themes/tokens.css`.
- If any of those assets are replaced with external artwork, update this file
  before shipping the next release.

## Board and part renders

The board and part pictures in `public/boards/` and `public/parts/` are
modelled by the project in Blender, mostly from vendors' pinout guides,
published dimensions and photographs. Product names, logos and silkscreen
markings shown on them belong to their owners and imply no endorsement.

These part renders take geometry from vendor design files. A render made from
a CC BY-SA design file is shared under the same licence, not under
[`LICENSE`](LICENSE), with the attribution below.

| Render | Design file | Licence | What the render takes |
| --- | --- | --- | --- |
| `public/parts/adafruit-bh1750-light-sensor.webp` | [Adafruit BH1750 PCB](https://github.com/adafruit/Adafruit-BH1750-PCB), Limor Fried/Ladyada for Adafruit Industries | CC BY-SA 3.0 | Outline, holes, header, sockets and part placement |
| `public/parts/adafruit-bme280-environment-sensor.webp` | [Adafruit BME280 Breakout PCB](https://github.com/adafruit/Adafruit-BME280-Breakout-PCB), Ladyada for Adafruit Industries | CC BY-SA 3.0 | Outline, header, holes and part placement |
| `public/parts/adafruit-ina219-current-sensor.webp` | [Adafruit INA219 Current Sensor PCB](https://github.com/adafruit/Adafruit-INA219-Current-Sensor-PCB), Ladyada for Adafruit Industries | CC BY-SA (the README names it; the repository has no licence file giving a version) | Outline, pads, holes, part and silkscreen positions |
| `public/parts/adafruit-vl53l0x-distance-sensor.webp` | [Adafruit VL53L0X ToF Distance Sensor PCB](https://github.com/adafruit/Adafruit-VL53L0X-ToF-Distance-Sensor-PCB), Adafruit Industries | CC BY-SA 3.0 | Outline, pad row and labels, holes and part placement |
| `public/parts/adafruit-midi-featherwing.webp` | [Adafruit MIDI FeatherWing PCB](https://github.com/adafruit/Adafruit-MIDI-FeatherWing-PCB), Ladyada for Adafruit Industries; [Adafruit CAD Parts, 4740 MIDI FeatherWing](https://github.com/adafruit/Adafruit_CAD_Parts/tree/main/4740%20MIDI%20FeatherWing), Copyright (c) 2016 Adafruit Industries | Board: CC BY-SA 3.0. 3D models: MIT | Board outline, pads, placement, silkscreen and traces; the PCB, DIN-5 sockets and optocoupler as 3D bodies |
| `public/parts/seeed-grove-2ch-ssr.webp` | [Grove - 2-Channel Solid State Relay Eagle files](https://wiki.seeedstudio.com/Grove-2-Channel_Solid_State_Relay/), Seeed Technology | Not confirmed: the schematic frame points at CC BY-SA 4.0, and the board file carries no grant | Outline, holes, Grove socket, terminals and part positions |
| `public/parts/seeed-grove-touch-sensor.webp` | [Grove - Touch Sensor Eagle files](https://wiki.seeedstudio.com/Grove-Touch_Sensor/), Seeed Technology | Not confirmed: no licence text in the files or on the wiki page | Pin order, electrode and mounting tabs |
| `public/parts/wiz850io-ethernet-module.webp` | [WIZ850io Altium files](https://docs.wiznet.io/Product/ioModule/WIZ850io), WIZnet Co., Ltd. | Not confirmed: the download page states no licence | Outline, pads, tracks, vias and overlay; the MagJack as a 3D body from the board's embedded STEP model |

The three renders whose licence is not confirmed need the vendor's permission,
or a remodel from photographs and published dimensions, before a release
ships them.

## FastLED and helper-vendored libraries

- Generated sketches target the upstream FastLED library.
- FastLED's upstream repository publishes the library under the MIT license.
- The source repo does not vendor FastLED by default, but the helper may clone
  FastLED into `backend/.fbuild-project/lib/FastLED/` at build time when using
  `fbuild`.
- If a packaged release ships that vendored copy or another bundled FastLED
  checkout, include FastLED's copyright and license text in the artifact.
- HUB75 firmware uses `ESP32-HUB75-MatrixPanel-DMA` 3.0.14 from
  `mrcodetastic/ESP32-HUB75-MatrixPanel-DMA`. The helper clones it lazily into
  `backend/.fbuild-project/lib/ESP32-HUB75-MatrixPanel-DMA/` only when a HUB75
  sketch is built. The library is MIT-licensed, Copyright (c) 2018-2032
  Faptastic; preserve its bundled `LICENSE.txt` if redistributing that checkout.
- Custom Display firmware uses LVGL 9.5.0 from `lvgl/lvgl`. The helper installs
  that exact Arduino library release or clones the exact `v9.5.0` tag lazily for
  fbuild; it does not track the default branch. LVGL is MIT-licensed, Copyright
  (c) 2025 LVGL Kft; preserve the checkout's `LICENCE.txt` when redistributing
  the cached runtime. The ST7789V panel and XPT2046 touch drivers remain
  project-authored inline code and introduce no additional library dependency.

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
- Design Studio for FastLED's AnimARTrix node is kept in the isolated `src/animartrix/`
  module under CC BY-NC-SA 4.0. Its initial effect set is Water, Polar Waves,
  RGB Blobs, Spiralus, and Complex Kaleido. The adaptation adds normalized
  matrix coordinates, paired TypeScript/C++ renderers, smoothing, and structural
  bass/mids/treble/kick/snare/hi-hat/beat mappings. Generated firmware carries
  Stefan's name, the upstream URL, and the license identifier.

## Demo music

- `public/demo-music/Ethereal Pulse.mp3` was generated with ACE-Step v1.5
  (`acestep-v15-xl-turbo`) on acemusic.ai, operated by TimeDomain Inc. Its
  terms allow ACE-Step v1.5 output to be used for personal and commercial
  purposes on any plan, with attribution appreciated but not required. The
  ACE-Step project (MIT) asks that AI involvement be disclosed: this track is
  AI-generated. The file was re-encoded to a tag-free 160 kbps MP3 with 1.5 dB
  of headroom.

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
  `backend/requirements.txt`, `backend/requirements-dev.txt`, and
  `backend/requirements-packaging.txt`.
- The helper's transitive dependency graph is locked in
  `backend/constraints.txt`.
- Review those files when preparing a release that redistributes the helper as
  a prebuilt package rather than as source.
- Portable desktop bundles include the Python runtime plus FastAPI (MIT),
  Uvicorn (BSD-3-Clause), python-multipart (Apache-2.0), pyserial
  (BSD-3-Clause), fbuild (BSD-3-Clause), and esptool (GPL-2.0-or-later).
  The packager copies available upstream license files into
  `third-party-licenses/` and emits a version/license/source manifest there.
- The Windows bundle also includes pywebview (BSD-3-Clause), pythonnet (MIT),
  clr-loader (MIT), Bottle (MIT) and proxy_tools (MIT) for its native window,
  plus the Microsoft WebView2 SDK assemblies that pywebview ships, which are
  redistributable under the WebView2 SDK license. The WebView2 Runtime that
  draws the window is part of Windows and is not bundled.
- PyInstaller is the build tool. Its GPLv2-or-later bootloader exception permits
  distributing generated bundles under the application's license; the build
  also includes PyInstaller's supplied license file for transparency.

## Note

This file is an operational release checklist, not legal advice. When in doubt,
review the upstream license texts before redistributing a bundled artifact.
