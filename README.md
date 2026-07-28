# Design Studio for FastLED

Design LED animations as a live node graph, watch them move on a virtual matrix, then send the same patch to FastLED hardware.

**Public beta · 150 nodes · 20 included audio-reactive patterns · Windows/macOS/Linux packaging · MIT core**

![Design Studio for FastLED overview](docs/images/readme/design-studio-overview.png)

Design Studio for FastLED is a visual authoring environment for LED strips, matrices, and tiled panels. Drag in generators, signals, palettes, effects, audio analysis, and hardware output; connect matching ports; and tune every control while the main preview and node previews run live.

> **Beta hardware testers wanted.** If you have an ESP32-family board, an Arduino, a Pico, an unusual LED chipset, tiled panels, or an audio setup, see [Help test the beta](#help-test-the-beta). Reports from real wiring are the fastest way to turn experimental combinations into supported ones.

## See it in action

**[Watch the demo video](https://youtu.be/Kjywc9C-aME)**

| Build and preview a patch | Browse reusable patterns |
|---|---|
| ![A patch driving the live LED preview](docs/images/readme/design-studio-patch.png) | ![Pattern Library with included audio-reactive patterns](docs/images/readme/design-studio-pattern-library.png) |

### Perform in Stage Mode

Press **Stage** or **F10** to turn the workspace into a focused performance view. The live matrix fills most of the screen while the spectrum analyzer, show transport, pattern status, frame rate, and memory telemetry stay visible. Select the spectrum name to cycle through the available visualizers; press **Esc** or **F10** to return to the editor.

The shot below is a generated show playing a lava-coloured pattern while its analyzed audio track drives the spectrum display.

![Stage Mode playing a generated show with the live spectrum analyzer](docs/images/readme/design-studio-stage.png)

## Your first five minutes

1. **Start with something alive.** On the empty canvas choose **Start with Rainbow**, **Audio-reactive demo**, or **Browse starter patches**. Every starter opens with an editable Comment node that explains what to change next; the audio first patch also starts the microphone. The **✦ Start** button reopens the gallery at any time.
2. **Read the graph left to right.** Source nodes create values or pixels; effects transform them; **Matrix Output** is the destination. Ports with the same color/type connect.
3. **Try one edit.** Change a speed, palette, particle style, or effect amount. The LED preview updates immediately.
4. **Add a module.** Click a card in the left Node Library or drag it onto the canvas. Drag a cable onto empty canvas to see only compatible next nodes.
5. **Open Help.** Press **?** for the Quick Start, shortcuts, upload guide, illustrated examples, and searchable reference for every node.

The fastest experiments are in **Quick recipes** in the sidebar: *Live spectrum*, *Beat colour jump*, and *Percussion trails* each place a complete working chain plus a short tutorial Comment on the canvas. The full node library is visible by default; switch to **Beginner** when you want a smaller curated rack.

## Two main workflows

### 1. Make a reusable pattern show

```text
Pattern patch → Group → Save to Library → Pattern Library
              → Pattern Collection → Show Engine → Matrix Output → Hardware
```

1. Build a patch that ends in a frame. Select the pattern-producing nodes—not the scene's **Mic Input** or **Matrix Output**—and press **Ctrl/Cmd + G** or choose **Make Group**.
2. Name the Group and enable **Save to library**, or right-click the completed Group and choose **Save to Library**.
3. The pattern appears under **Pattern Library → New & Unsorted**. Drag it onto **Standard**, **Audio Reactive**, or a shelf you created with **＋**. Removing a custom shelf safely returns its patterns to New & Unsorted.
4. Add a **Pattern Collection**. Drag Pattern Library cards directly onto it, or wire a Group's frame output to its `pattern` input. The collection absorbs each Group as a reusable show entry.
5. Wire `Pattern Collection.patternset` → `Show Engine.patternset`, then `Show Engine.frame` → `Matrix Output.frame`. A **Transitions** node and beat input are optional.
6. Configure the board and port in Matrix Output, run **Flash Wiring Test**, then choose **Upload**.

The beta includes 20 curated patterns in the built-in **Audio Reactive** shelf. They expose an audio input: add a **Microphone** node and connect it when auditioning one on the canvas. Included patterns are immutable examples; your own copies and saved patterns remain yours to rename, organize, share, or delete.

### 2. Send one patch straight to hardware

```text
Pattern → optional signals/palettes/effects → Matrix Output → Hardware
```

1. Wire any frame-producing pattern directly—or through effects—into **Matrix Output**.
2. Use **✦ Setup...** to choose the controller, dimensions, chipset, layout, color order, pins, brightness, and optional power limit. Open **↑ Upload...** to review the current board/port, the live controller-capacity meter, and the readiness checklist.
3. Use **🧪 Flash Wiring Test** first on new wiring. It checks colors, orientation, tiles, and physical pixel order without needing a finished patch.
4. Choose an output route:
   - **Upload** compiles and flashes a standalone FastLED sketch.
   - **↻ Re-upload last sketch** quickly re-sends the current project's last uploaded sketch without regenerating it.
   - **⚡ Flash Stream Receiver** once, then **📡 Live Stream** for rapid no-recompile preview.
   - **View Code** or **Export .ino** if you want to inspect or build the sketch yourself.
   - **Upload show to SD** provisions the separate music-synced SD-card workflow.

## Pattern Library

The old **My Patterns** rack is now the **Pattern Library**:

- **New & Unsorted** receives every newly saved or imported pattern.
- **Standard** and **Audio Reactive** are permanent built-in shelves.
- Create custom shelves with **＋** and remove them without deleting their patterns.
- Drag your patterns onto a shelf header to file them, or back to **New & Unsorted** to unfile them.
- Click a pattern to place it near the center of the canvas, drag it to position it, or drag it directly onto a Pattern Collection.
- The optional local helper mirrors user patterns as shareable JSON files in its per-user `My Patterns` data folder. Included beta patterns are bundled with the application and are not written over your files.

![Pattern Library shelves](docs/images/readme/design-studio-pattern-library.png)

## Install and run

### Portable desktop beta

When a release archive is available for your operating system, extract it and launch **Design Studio for FastLED** (`Design Studio for FastLED.exe` on Windows). The portable package includes the Studio, upload helper, fbuild, and esptool; users do not need to install Node.js or Python.

The browser opens automatically. Keep the launcher window open while using hardware, project-file, and Pattern Library disk features. Packaging details are in [Desktop distribution](docs/release/desktop-distribution.md).

### Run from source

1. Install [Node.js](https://nodejs.org) LTS. Install [Python 3](https://python.org) as well if you want local upload features.
2. Clone or download this repository.
3. Launch it:
   - **Windows:** double-click `Start Design Studio for FastLED.bat`
   - **macOS:** double-click `Start Design Studio for FastLED.command`; on first use, right-click it and choose **Open**
   - **Linux:** run `./start.sh`

For development:

```bash
npm install
npm run dev        # http://localhost:5173
```

The first source launch installs dependencies and can take a few minutes. Without Python, visual authoring, projects, code export, and preview still work; direct hardware actions stay unavailable.

## Security messages you may see

Design Studio for FastLED is in beta and the direct-download desktop packages are not yet code-signed or notarized.

- **Windows SmartScreen:** Windows may show **Windows protected your PC** or **Unknown publisher**. Only continue with **More info → Run anyway** when the archive came from this repository's official release page and you expected to run it. Do not disable SmartScreen system-wide.
- **macOS Gatekeeper:** macOS may say the application cannot be opened because the developer cannot be verified. For an official beta archive, right-click the application and choose **Open** to make the one-time exception. Do not remove Gatekeeper globally.
- **Imported projects and patterns:** files and share links are treated as untrusted. Formula and Code previews remain blocked until you review the source and choose **Trust and run**. Only trust content from people you know.
- **Microphone permission:** audio-reactive previews require browser microphone permission. Audio stays in the browser analysis pipeline; a denied permission simply leaves live audio nodes inactive.
- **Local helper and USB access:** upload, serial streaming, file dialogs, and disk-backed pattern/project sync use a service on your own machine. It listens on localhost and needs access to the selected serial device. Your firewall or operating system may ask for confirmation on first launch.
- **Wi-Fi credentials:** an SSID and password entered for Art-Net input or NTP time sync are stored only in this browser's local storage, never in project files, share links, or the helper's `Projects/` folder. They are embedded in plain text in generated firmware, so handle an exported network-enabled `.ino` accordingly.
- **Art-Net preview and the network:** the helper opens a UDP listener on your local network only while an Art-Net-mode **DMX / Art-Net** node is on the canvas, and closes it as soon as that node is removed or switched to DMX512.

Read the full [Security policy](SECURITY.md) and report vulnerabilities privately through the channel documented there.

## Help, examples, and node reference

Press **?** inside Studio. Help contains:

- a beginner Quick Start and canvas/wiring gestures;
- keyboard shortcuts;
- upload, wiring-test, live-stream, code-export, and SD-show instructions;
- searchable documentation for every node, including ports, controls, use cases, and live example diagrams.

The empty-canvas launcher and **✦ Start** gallery include Rainbow Sweep, Fire, Scrolling Text, Audio Spectrum, Field Warp, a generative show, and a music-synced SD show. The Pattern Library adds 20 richer audio-reactive examples for dismantling, remixing, and collecting.

## Complete node catalogue

Design Studio for FastLED currently ships **150 nodes**. The in-app **Help → Node Reference** is authoritative and explains each one in depth.

<details>
<summary><strong>Show all nodes by category</strong></summary>

- **Inputs:** Microphone, Button, Potentiometer, Encoder, DMX / Art-Net, RTC Clock, MIDI
- **Audio:** FFT Analyzer, Beat Detect, Percussion Detect, Audio Features, Audio → Hue
- **Signals:** Time, Interval, Counter, Random, Envelope, Sin, Cos, Wave, Complex Wave, BeatSin, Clock, Schedule Trigger, DMX Channel
- **Math & Logic:** Math, Clamp, Map Range, Lerp, Ease, Abs, Mod, Gate, Smooth, Sample & Hold, Switch, Not, Compare, Trigger, XY → Index
- **Color:** Hue Cycle, HSV → RGB, RGB → HSV, Color Temperature, Heat Color, Blend Colors, CHSV, Gradient Sampler, Palette Sampler, Palette Sweep, Palette Selector, Custom Palette, Palette from Image, Poline Palette, Blend Palettes
- **Patterns:** Solid Color, Text, Clock Display, Circle, Line, Shape, Path, Gradient Frame, Palette Gradient, Image, Noise, Plasma, Rainbow, Pride 2015, Pacifica, TwinkleFox, Scanner, Confetti, Juggle, Radial Burst, Spiral, Kaleidoscope, Fractal Noise, Gabor Noise, Blobs, Fire, Fire 2012, Particles, Flow Field, Starfield, Boids, Reaction Diffusion, Game of Life, Spectrum Bars, Spectrum Visualizer, Bass Pulse, Bass Rings, Midrange Waves, Midrange Bloom, Treble Sparks, Treble Prism, Audio Cascade, Beat Flash, Kick Shock, Vocal Aurora, Beat Kaleidoscope, Spectra Mosaic, Percussion Blobs, Ember Pulse, Turbulent Bloom, Gravity Well, Rain Ripples, Prism Storm, Audio Flow, Color Trails, AnimARTrix, Custom Formula, Code
- **Fields:** Field Formula, Field Noise, Wave Sim, Distance Field, Frame → Field, Field Math, Field Warp, Field Rotate, Field Tile, Field → Frame
- **Effects:** Blur 2D, Blend, Mask, Brightness, Fade to Black, Hue Shift, Gamma, Saturation, Color Boost, Transform, Array, Invert, Mirror, Trails, Frame Feedback, Frame Switch, Zones
- **Show:** Music Library, Pattern Collection, Transitions, Show Engine, Sequencer, Transition, Performance Generator, SD Card
- **Output:** Matrix Output
- **Notes:** Comment

</details>

## Music-synced SD shows

For offline playback locked to songs:

```text
Music Library → Performance Generator → SD Card → Matrix Output.sdcard
```

Drop MP3s into **Music Library**, analyze them, generate or hand-edit the show timeline, connect the SD path, then use **Upload show to SD**. A Pattern Collection can feed the Performance Generator so your saved groups become the song's visual vocabulary.

## External control: DMX and Art-Net

**Experimental — no hardware validation pass has been recorded yet.** The code paths below are covered by unit, codegen, and backend tests only; see the [Beta support matrix](docs/release/beta-support-matrix.md).

A lighting desk or Art-Net controller can drive a patch:

```text
DMX / Art-Net → DMX Channel → any float/bool input
```

**DMX / Art-Net** receives one universe as a single `dmx` wire; **DMX Channel** isolates one slot (1–512) as a normalized `Value (0–1)`, a raw `Byte (0–255)`, plus `Active` and `Changed` booleans. Use several DMX Channel nodes to read several slots.

Pick the transport on the source node:

- **Art-Net** (ESP32 or ESP8266) — the sketch joins your Wi-Fi and listens for Art-Net UDP on the configured port and universe. Set the hostname, DHCP or a static IP, and the universe on the node.
- **DMX512** (ESP32 only) — the sketch reads a real DMX line through an RS-485 transceiver (e.g. MAX485 or SN75176) on the selected UART. Wire the transceiver's driver-enable, TX, and RX to the node's configured pins, connect DMX data +/− and ground to the XLR line, and terminate the run as usual. The transceiver is required; a bare GPIO cannot read a DMX line.

For DMX512, `fbuild` vendors the `esp_dmx` library automatically on the first build. With `arduino-cli`, install `esp_dmx` yourself before compiling.

**Preview listens for Art-Net only, in both modes.** The local helper owns the UDP socket, and the node body reports `HELPER OFFLINE`, `LISTENER ERROR`, `NOT LISTENING`, `LISTENING`, or `ART-NET LIVE` with a packet rate and the first four channel values. There is no browser-side DMX512 path, so a node set to DMX512 says so and previews blank unless an Art-Net controller happens to be sending. Preview holds exactly one live universe at a time.

**Wi-Fi credentials are never saved into your work.** The SSID and password you enter for Art-Net (and for NTP time sync) live only in this browser's local storage, keyed by node — they are not written to project files, share links, or the helper's `Projects/` folder. Generated firmware still embeds the credential in plain text, because a sketch has no other way to join a network: treat an exported `.ino` for a network-enabled patch like a password, and do not paste one into an issue.

The same Wi-Fi connection is shared by every Art-Net input and every NTP clock in one sketch, so configure them identically; Graph Health warns when they disagree.

## Projects and saving

- **Project:** your normal named, autosaved workspace.
- **Project File:** a portable full workspace created by **Save Project File As**.
- **Graph JSON:** raw graph interchange.
- **Share Link:** a URL containing the workspace.
- **Recovery Snapshot:** a recent browser-local restore point.
- **Pattern:** a reusable saved Group in the Pattern Library.

## Help test the beta

**This is a beta: expect active iteration between releases.** Node types, project and pattern formats, and share links are still evolving. Saved projects, patterns, and share links should not be treated as permanent archival formats yet, so keep exported `.ino` sketches for anything critical and keep the original audio files for SD shows.

The current support promise is deliberately narrower than the feature list. Before testing, read the [Beta support matrix](docs/release/beta-support-matrix.md) and [Hardware validation guide](docs/release/beta-hardware-validation.md).

As of **July 26, 2026**, the recorded public-beta hardware rows cover two exact end-to-end setups: **ESP32-S3 + 16×16 WS2812B matrix** and **ESP8266 + 10×1 WS2812B strip**, including normal Upload, Wiring Test, and Live Stream on those combos. Everything else remains experimental until it appears in the matrix.

Useful reports include:

- operating system and Design Studio for FastLED version;
- exact board, LED chipset, matrix/strip dimensions, color order, pins, and power arrangement;
- layout type: strip, serpentine matrix, tiled panels, or custom XY map;
- build engine (`fbuild` or `arduino-cli`) and whether compile, wiring test, upload, live stream, mic audio, and SD playback succeeded;
- the opt-in Matrix Output hardware report plus relevant log tail, photos, or a short video;
- whether preview behavior matched the physical LEDs.

Open a [GitHub issue](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/issues) for reproducible bugs and validation results. Never include Wi-Fi credentials, private project data, serial numbers you consider sensitive, or unrelated log contents.

> LED installations can draw substantial current. Use an appropriately rated supply, fuse and inject power where required, connect grounds correctly, and do not power a large LED load through a microcontroller's regulator or USB connector.

## Browser, desktop, and hardware scope

- Tuned for desktop windows at `1440 × 900`; supported minimum `1280 × 720`.
- Modern Chromium, Firefox, and Safari can author and preview; exact beta coverage is recorded in the support matrix.
- The PWA can reopen core authoring and preview offline after its first successful load.
- Upload, live stream, device discovery, file dialogs, and disk-backed sync require the local helper on the same machine.

## Build and test

```bash
npm run build          # type-check + production build
npm run lint           # ESLint
npm test               # Vitest
npm run preview        # serve dist/
npm run package:desktop
```

## Contributing

The repository is public and `main` is kept releasable, so all changes land through a branch and pull request — never commit directly to `main`. Create a short-lived branch (`fix/…`, `feature/…`, `docs/…`), make sure `npm run lint`, `npm test`, and `npm run build` pass, and open a PR. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guidelines, including bug reporting and hardware validation.

## Credits and licensing

Design Studio for FastLED's core is MIT licensed. See [LICENSE](LICENSE), [third-party notices](THIRD_PARTY_NOTICES.md), and the [changelog](CHANGELOG.md).

Offline music analysis uses [Essentia](http://essentia.upf.edu). **Color Trails** is adapted from prototype work by [Stefan Petrick](https://github.com/StefanPetrick), creator of [AnimARTrix](https://github.com/StefanPetrick/animartrix). The separately licensed **AnimARTrix** integration preserves Stefan's credit and CC BY-NC-SA 4.0 terms in [its license](src/animartrix/LICENSE.md).

Design Studio for FastLED is an independent, community project. It generates code that targets the [FastLED](https://github.com/FastLED/FastLED) library but is not affiliated with, endorsed by, or sponsored by the FastLED project or its maintainers. "FastLED" is used here only to describe compatibility with that library.

Release references: [supported-platform policy](docs/release/supported-platform-policy.md) · [versioning and releases](docs/release/versioning-and-releases.md) · [desktop distribution](docs/release/desktop-distribution.md)
