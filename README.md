# FastLED-Studio
Node‑Based Visual Designer for FastLED LED Matrix Systems

## Features

- **Visual node graph** — drag, drop, and wire 100+ node types across audio, hardware, math, color, pattern, composite, and output categories
- **Starter-first onboarding** — launch from the empty-canvas start screen or the persistent **✦ Start** gallery with Rainbow, Audio Spectrum, Field Warp, Generative Show, Music-synced SD Show, and more
- **Live LED preview** — WebGL renderer with per-LED glow at 60 fps; falls back to Canvas 2D
- **Audio-reactive** — microphone FFT via Web Audio API drives bass/mids/treble/beat outputs in real time
- **Named projects + recovery** — autosaved projects, portable project files, recent-project switching, rolling recovery snapshots, Graph JSON import/export, and share links
- **C++ code generation** — export a ready-to-flash FastLED `.ino` sketch from any graph
- **Upload, stream, and show provisioning** — the local helper compiles and flashes over USB via `arduino-cli` or FastLED's own `fbuild`, can flash a standalone wiring test, flash the serial stream receiver, push live frames, and provision music-sync SD shows
- **Installable offline workspace** — the PWA caches the core Studio app, icons, and branding assets so authoring and preview reopen offline after the first successful load
- **Three theme variants** — Dark, Solarized Dark, Studio Light
- **Undo/redo** (100 steps), per-project autosave, Graph JSON interchange, and read-only code viewing

## Quick Start (no experience needed)

### Portable desktop bundle

When a release archive is available for your operating system, extract it and
launch **FastLED Studio** (`FastLED Studio.exe` on Windows). It includes the
Studio frontend, Python upload helper, fbuild, and esptool; Node.js and Python
do not need to be installed. Your normal browser opens automatically. Keep the
launcher window open while using the Studio.

The portable packaging architecture, build instructions, current validation,
and unsigned-beta caveat are documented in
[`docs/release/desktop-distribution.md`](docs/release/desktop-distribution.md).

### Source launcher

The source checkout remains the developer/fallback path:

1. Install [Node.js](https://nodejs.org) (the LTS installer, default options).
   To upload patterns to a board, install [Python 3](https://python.org) too.
2. Download this project or `git clone` it.
3. Launch it:
   - **Windows** — double-click **`Start FastLED Studio.bat`**
   - **macOS** — double-click **`Start FastLED Studio.command`** (first time only:
     right-click it, choose **Open**, then confirm)
   - **Linux** — run **`./start.sh`**

The source launcher's first run installs dependencies and takes a few minutes;
after that it starts in seconds. Python is optional for source use: without it
the designer runs fine, while board upload stays disabled.

Once the app has loaded successfully once, you can also install it to your desktop/home
screen and reopen the cached Studio offline for node authoring, preview, and local
project work. Hardware features still need the local helper on the same machine:
upload, live stream, board discovery, and project-file dialogs do not work from the
offline cache alone.

When the studio opens, start from the empty-canvas launcher:

1. Click **Start with Rainbow** for the quickest animated result, or **Audio-reactive demo** if you want the microphone pipeline prewired.
2. Click **Browse starter patches** or the top-bar **✦ Start** button to open the full starter gallery.
3. Choose **Blank Canvas** if you want an empty workspace but still want the starter gallery one click away.

## Getting Started (developers)

```bash
npm install
npm run dev        # http://localhost:5173
```

Requires Node 18+. For upload/stream/provisioning features, also run the local helper (`npm run helper`) or use one of the platform launch scripts so it starts automatically.

The repo's npm scripts also pass `--disable-warning=DEP0040` to Node so the standard developer commands stay quiet around an upstream transitive `punycode` deprecation in current tooling. Direct `npx vite` / `npx vitest` invocations can still print that warning.

## Node Categories

| Category | Examples |
|----------|---------|
| Input | Mic Input, Button Input, Pot Input, Encoder Input |
| Audio | FFT Analyzer, Beat Detect, Percussion Detect, Audio Features, Audio → Hue |
| Signals | Time, Counter, Random, Wave, ComplexWave, BeatSin |
| Math & Logic | Math, Clamp, Lerp, Compare, Switch, XY Mapper |
| Color | HSV→RGB, CHSV, Palette Selector, Poline, Custom Palette |
| Patterns | Fire 2012, Plasma, Noise, Rainbow, Kaleidoscope, Particles (7 types), Starfield, Blobs, Code |
| Fields | Field Formula, Field Noise, Distance Field, Field Warp, Field Rotate/Tile |
| Effects | Blend (6 modes), Transition (16 variants), Blur 2D, Fade, Mask, Trails |
| Show | Music Library, Pattern Collection, Show Engine, Performance Generator, SD Card |
| Output | Matrix Output |

See the Design Tokens section of `CLAUDE.md` for the full category → accent-color mapping.

## Workflow

1. **Start fast** — use the empty-canvas launcher or **✦ Start** to load Rainbow, Audio Spectrum, Field Warp, or one of the show starters already wired and framed in view.
2. **Build the patch** — connect pattern/composite/audio nodes into **Matrix Output**. The main LED preview and node previews animate live from the same graph evaluation.
3. **Choose the right save format** — named **Projects** are your working home and autosave in place; **Save Project File As** writes a portable full-workspace file; **Export Graph JSON** is raw graph interchange; **Copy Share Link** packages the workspace into a URL; **Recover Snapshot** restores a recent recovery snapshot for this browser.
4. **Upload or inspect code** — in **Matrix Output**, use **Upload** for your normal sketch, **Flash Wiring Test** to verify color order/layout/brightness before wiring a creative graph, **Flash Stream Receiver** + **Live Stream** for rapid serial preview, **Upload show to SD** for an SD-backed music-sync player, or **View Code** / **Export .ino** if you want the generated sketch first.

Free-entry numeric fields on creative nodes also accept safe matrix-aware expressions. For example, BeatSin `high` can be `h - 2` and Random `max` can be `w / 2`. Available geometry values are `w`, `h`, `num_leds`, `max_x`, `max_y`, `center_x`, `center_y`, `min_dim`, `max_dim`, and `aspect`, with `pi` and `tau` for angle math. The live preview and generated firmware resolve them consistently when the Matrix Output size changes.

## Starter Walkthroughs

### Generative show

Use the **Generative Show** starter when you want the board to perform a rotating set of reusable patterns:

1. Save one or more grouped patterns into a **Pattern Collection**.
2. Feed that collection into **Show Engine**.
3. Wire **Show Engine** into **Matrix Output** and upload the generated controller sketch.

### Music-synced SD show

Use the **Music-synced SD Show** starter when you want offline playback from an SD card:

1. Drop songs into **Music Library** and let the analysis/generation pass finish.
2. Feed the generated `shows` output into **SD Card**, then into **Matrix Output.sdcard**.
3. Use **Upload show to SD** from **Matrix Output** to provision the card and flash the player.

## Project Vocabulary

- **Project** means the everyday working workspace inside Studio. It autosaves in place, remembers upload targets, and appears in **File** and **▤ Projects**.
- **Project File** means a portable full-workspace file opened with **Open Project File** or written with **Save Project File As**.
- **Graph JSON** means raw graph interchange from **Export Graph JSON** / **Import Graph JSON**. Use it for graph-only exchange outside the project system.
- **Share Link** means a URL fragment containing the full workspace. Opening one imports that workspace into the current browser session.
- **Recovery Snapshot** means one of the recent browser-local restore points opened from **Recover Snapshot**.

## Build

```bash
npm run build      # type-check + production build → dist/
npm run lint       # ESLint
npm run preview    # serve dist/ locally
```

## Browser Requirements

| Feature | Minimum |
|---------|---------|
| WebGL preview | Any modern browser |
| Microphone (FFT) | Any modern browser |
| Upload / Live Stream / SD provisioning | Local upload helper running (Python 3 + `arduino-cli` or `fbuild`) — any modern browser |

## Beta Support Matrix

The repo's current public-beta support promise is intentionally narrower than
the full feature catalogue. The exact supported vs. experimental combinations
of board, chipset, matrix layout, build engine, upload path, and recorded host
coverage live in
[`docs/release/beta-support-matrix.md`](docs/release/beta-support-matrix.md).
Community testers can use the opt-in Matrix Output hardware report; its privacy
boundary and evidence workflow are documented in
[`docs/release/beta-hardware-validation.md`](docs/release/beta-hardware-validation.md).

## Desktop Viewport

FastLED Studio is tuned for desktop windows, with a supported minimum viewport of
`1280 × 720`. Below that, the app degrades gracefully by letting the top bar and
status chips scroll horizontally, capping menu height with internal scrolling,
and relying on collapsible side panels or **Stage mode** when you need the
preview to take priority. The full contract lives in
[`docs/architecture/desktop-viewport-contract.md`](docs/architecture/desktop-viewport-contract.md).

## Credits

Offline music analysis in the Music Library pipeline uses Essentia.js / Essentia.
Please acknowledge its origin as [http://essentia.upf.edu](http://essentia.upf.edu).

The **Color Trails** node is adapted from prototype work by
[Stefan Petrick](https://github.com/StefanPetrick), creator of
[AnimARTrix](https://github.com/StefanPetrick/animartrix). Its fluid-advection
technique and visual direction are credited to Stefan; FastLED Studio adds the
node workflow, browser/firmware parity, selectable injection and flow modes,
audio modulation, and the one-pixel-per-frame continuity guard.

The separately licensed **AnimARTrix** node begins with Water, Polar Waves,
RGB Blobs, Spiralus, and Complex Kaleido. It preserves Stefan Petrick's credit
and CC BY-NC-SA 4.0 terms inside `src/animartrix/`, while adding matched browser
and firmware renderers plus Studio-specific musical mappings for bass, mids,
treble, kick, snare, hi-hat, and beat. See `src/animartrix/LICENSE.md`.

## Release Metadata

- License: [`LICENSE`](LICENSE)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- Third-party notices: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- Security reporting: [`SECURITY.md`](SECURITY.md)
- Supported-platform policy: [`docs/release/supported-platform-policy.md`](docs/release/supported-platform-policy.md)
- Versioning & tags: [`docs/release/versioning-and-releases.md`](docs/release/versioning-and-releases.md)

## Project Structure

```
src/
  audio/          AudioEngine (Web Audio API, FFT, beat detection)
  codegen/        C++ code generator (cppGenerator.ts) + show sketch generator (showGenerator.ts)
  components/
    Canvas/       ReactFlow canvas, StudioNode, GlowEdge, context menus
    Inspector/    Property inspector panel
    MenuBar/      Top bar with save/load/theme controls
    Preview/      LED preview (LEDPreview.tsx + WebGL renderer)
    Sidebar/      Node palette with search and pattern library
    StatusBar/    Status message bar
    Upload/       MatrixOutputUpload (inline in the Matrix Output node)
  state/
    graphStore.ts      Node/edge state + undo history + multi-graph groups
    uiStore.ts         UI panel state + theme
    audioStore.ts      Zustand bridge over AudioEngine
    nodeLibrary.ts     Static registry of all node definitions
    graphEvaluator.ts  Runtime graph evaluation → Frame[][]
    patternLibrary.ts  Saved pattern groups (localStorage)
    uploadStore.ts     Board/port selection + compile/upload status
    musicStore.ts      Music analysis queue and generated shows
  themes/         tokens.css (all CSS variables)
backend/          FastAPI upload helper (auto-spawned; optional)
```
