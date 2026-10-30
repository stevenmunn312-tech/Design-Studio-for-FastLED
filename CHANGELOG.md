# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and the project uses pre-1.0 semantic
versioning (`0.y.z`) until the first stable release.

## [Unreleased]

### Added

- **Internet radio on the Music Player.** Set Music Source to Internet Radio
  and list stations on the node, by stream URL or from a search of the
  radio-browser.info directory. The board streams them over Wi-Fi through
  the I2S amplifier and reacts to them as to a card; Next and Previous change
  station, and a panel shows the station and what is on air. A station that
  does not start within 12 seconds, or keeps dropping, is skipped. A
  `stations.m3u` on the SD card replaces the list without a new build, and
  the optional Phone Station Page picks stations from a phone, and with an
  access code adds and removes them. The preview plays the stations too,
  through the upload helper, and its patterns react to them. Any ESP32 with
  Wi-Fi. Experimental.

- **Bluetooth music on the Music Player.** Set Music Source to Bluetooth and
  the board becomes a speaker a phone pairs with under Bluetooth Name: it
  plays the phone's music through the I2S amplifier, reacts to it as it does
  to a card, sends Play / Pause, Previous and Next back to the phone, and
  shows the phone's title and artist on a panel. No SD card needed. Classic
  ESP32 and arduino-cli only. Experimental: compiles for the classic ESP32,
  not yet run on a board.
- **Vibe, Song Structure and Pitch Detect read a show's song.** Song analysis
  bakes each detector's per-frame output beside the envelope, the show
  preview and pattern card play it back, and the SD player reads it from a
  new `ADET` trailer when a collected pattern uses one of the nodes, firing
  downbeat, drop and note-on once per frame on both sides. Waveform stays
  live-only. Analyse a song again to gain the tracks; older shows keep
  reading those nodes as inactive.
- **Several boards in one project.** The Hardware pane's board menu adds
  another controller; each bench part and LED output belongs to one board,
  and the Hardware pane, Build Diagram and Upload tab work on the board
  chosen in a selector strip, each with its own pins, wiring sheet, FQBN and
  port. Graph Health validates every board and names the board in its
  findings; a wire from one board's part into another board's pattern is an
  error. **Keep boards in time** makes the first board broadcast its clock
  and show state over the network so the others stay on the same frame and
  the same pattern. Experimental: generated, not yet compiled on hardware.
- **Library bundles.** Export a pattern, a palette or a whole collection
  (with its show profiles) as a file, copy it as a share link, or export the
  library; import by dropping files on the sidebar, pasting a link or JSON
  into its Import popup, or opening a link. Imported content is never
  trusted by the import itself: trust is asked for when it reaches the
  canvas, as for a dropped pattern, and an import never overwrites a library
  entry that has the same id but different content.
- **Arduino UNO R4 WiFi** can now sync NTP and receive Art-Net, sACN and DDP
  through its WiFiS3 library. Experimental until its first compile.
- **Dance Flash** stamps a 16×16 silhouette over a frame every two to five
  minutes and
  scales it to the largest square the matrix holds, centred: a DJ at the decks, a man dancing, a woman
  dancing, or the two together. Each flash picks one pose and may mirror it
  left to right. Place it after an audio-reactive pattern. A wired Beat input
  holds the flash for the next beat.
- The screen editor checks a design against the glass it is drawn for: each
  panel's measured size, resolution and touch surface set how large a control
  must be to hit, how far apart controls must be, and the smallest readable
  text, and Layout issues warn, in millimetres, where a design falls short.
- **Chart** and **Spectrum** screen widgets. A Chart plots a wired or bound
  number over time, one reading per interval, as a line or bars. A Spectrum
  draws live microphone or line-in audio as bars in a normal sketch. The
  preview and the device fold the spectrum into bars by the same rule, and
  only a design with one compiles LVGL's chart.
- **Web Remote** serves a phone control page over the board's Wi-Fi on ESP32
  and ESP8266: Buttons, Toggles, Sliders, Step Controls, Choice Strips,
  Colour Pickers and Text Entries, each an output of the node with its touch-screen widget's
  range, start value and output. Drag **Add control…** onto a property row to
  make the right control for it. The node is an operable remote in the
  preview, and **Phone preview** shows the page the board serves. Normal
  sketches support every control; shows and SD players read it through their
  control graph. A board without Wi-Fi is named in Graph Health.
- **Text Entry** screen widget: a one-line field that opens an on-screen
  keyboard when tapped and outputs the text once it is confirmed. Its text can
  feed any text input, and a wired Set replaces it while nobody is typing. In
  Run you type with your own keyboard. Only a design with a Text Entry
  compiles the LVGL keyboard, through a new `FLS-LVGL-WIDGETS` marker the
  helper reads.
- **Screen designs** can hold up to eight screens, drawn as tabs in the screen
  editor. A Button's **Go to screen** moves the glass to another screen when
  tapped, and a panel whose design has more than one screen gains a **Screen**
  input that picks one by number from the graph. The preview, the live touch
  screen, the normal sketch, the show and the SD player all follow the same
  rule. A design saved with one screen loads as a single **Main** screen and
  builds exactly as before.
- **Display Panel**'s **Show Status** and **Now Playing** layouts picture the
  LEDs live: the show or player streams its own LED canvas into the picture
  square ten times a second, so the picture moves and a collection of any size
  is pictured. This replaces Now Playing's baked artwork and its eight-pattern,
  144 KB flash limit, and nothing is baked at upload any more. A browsed
  pattern is named, not pictured. The preview and the device place and scale
  the picture by one rule. Experimental on glass until a bench row checks it,
  including beside an SD card on the same SPI bus.

- **Pattern Collection** entries gain a weight from 0 to 16 (default 1),
  calm / lively / peak tags, and a restart or resume entry. Weight 0 is
  skipped by automatic picks and can still be chosen by hand, from a timeline,
  or by a sequence step that names it. Restart clears the pattern as the
  transition that brings it in begins; Resume keeps what it was doing. The
  preview, the Pattern Slideshow, the Music Player and the Performance
  Generator share one pick rule. Equal weights over the whole collection keep
  the previous random order.
- **Sequence** order on the Pattern Slideshow and the Music Player loops the
  steps you edit: a pattern or a tag pick, a hold, and a transition. With Beat
  Transitions on, a Music Player hold counts beats. Previous and Next move
  between steps. Energy Pacing and Dwells & Bursts stay off during a sequence.
  An empty sequence holds the current pattern. A step follows its pattern when
  the collection is reordered, and picks by its tags while that pattern is
  out of the collection.
- The **Performance Generator** gains **Edit lanes**: pattern, transition,
  palette, speed, brightness, energy, flash, particles, and one lane per named
  float input, under the song's section bands, beat grid and energy envelope.
  Speed, brightness, energy and named inputs can ramp. An edit locks the
  section it falls in, and Regenerate keeps that span. Revert clears the locks
  and rebuilds the show. These show tools are experimental until a bench row
  compares the preview with the LEDs.
- The **Audio** node gains a **Noise gate** slider beside Gain for a
  microphone source, and both controls for a line input: the raw sample
  level (of 32767, default 500, FastLED's own) a sound must reach before
  analysis hears it. Raise it when room hiss moves the LEDs; 0 turns
  the gate off. Preview and firmware both apply it, and the preview now gates
  before gain as FastLED does, so a raised gain no longer lifts hiss through
  the gate.
- **Music Player** gains **Energy Pacing** (holds lean toward Min Time as the
  music grows more intense and toward Max Time as it calms) and **Dwells &
  Bursts** (an occasional hold of twice Max Time, and an occasional run
  of eight quick changes). Both are off by default; the preview and
  the SD player sketch both follow them.
- **Player Particles** gains a Frequency group: **Bursts in a Row** (1–8
  beats that each throw a burst), **Rest** (0–30 s before the next run;
  0 bursts on every beat) and **Min Energy** (beats quieter than this mean
  band energy do not burst). The preview and the SD player sketch both
  follow them; they replace the fixed three-burst, four-second cadence.
- The nodes the library audit found missing. Patterns: **Theater Chase**,
  **Color Wipe**, **Breathe** and a **Level Meter** bar for any 0–1 level.
  Effects: a **Glitter** overlay, a static **Frame Transform** (quarter
  turns, flips, a wrapping slide) and a **Mask** input on Blend that scales
  its opacity per pixel. Fields: **Gradient Field** (linear, radial,
  angular; offset and repeat), **Float → Field** and **Field Blur**. Audio:
  **Frequency Band** (one level from a Hz range), **Stereo Levels** (left,
  right, balance) and **Beat Phase** (a per-beat saw re-synced by Beat
  Detect, a bar phase and a count). Colour: **Palette Transform** (reverse,
  rotate, dim). **Text** takes a wired string and draws it at run time from
  one emitted font table. Inputs: a **DDP Input** frame source (xLights,
  LedFx, WLED) with a trust-held helper listener, **sACN (E1.31)** as a third
  DMX input mode (helper and firmware, with the universe's multicast group),
  and a **DIN (UART)** source on the MIDI node that deploys, drawn on the
  Build Diagram as the Adafruit MIDI FeatherWing. Outputs: a
  **Frame Stream** (DDP over the network or Adalight on the serial) and an
  **Analog RGB Strip** on three PWM pins. The Board gains a **frame rate**
  cap that paces every sketch and the preview alike.
- Four primitive nodes: **Color** (a picked swatch as a Color output),
  **Constant** (a number, accepting matrix-relative expressions such as
  `w/2`), **Logic** (and, or, xor, nand, nor over two booleans) and
  **Expression** (one number per frame from a formula over `a`, `b`, `t`, `W`
  and `H`, with the FastLED shims, the Code editor and the same trust gate and
  deploy validation as Custom Formula). Constant, Logic and Color also run in
  a show's control graph.

- **Frame performance tools** (experimental). Graph Health shows the frame
  rate a graph's LED wiring can reach on the chosen board, and the readiness
  strip shows it too. When the wire sets the pace, Graph Health offers fixes: a
  lower frame rate, a faster clock on APA102, HD108 and WS2801 outputs (their
  LED output gains a data-rate setting), **Split across pins**, or a parallel
  driver. **Split across pins** feeds one LED output from several data pins at
  once. The Board gains an **LED driver** choice where FastLED offers more than
  one, such as LCD_CAM on the ESP32-S3. Device telemetry reports render and
  send time separately, plus the three costliest nodes by name.

### Changed

- **Previous Pattern**, **Next Pattern** and an encoder now change the pattern
  on the LEDs straight away, with nothing to confirm. A single step while a
  pattern is holding gets the show's usual transition; a step during a
  transition cuts straight to the new pattern, so stepping fast lands on each
  pattern in turn. Panels name the new pattern the moment a step lands. The
  **Confirm** control is gone from Player Controls, the Slideshow, the Music
  Player and the **Pattern Deck** screen template, and saved wires into it are
  dropped on load. **Show Status** and the OLED **Pattern Browser** lose their
  browsing rows, and the **Highlighted pattern** and **Browsing** screen
  fields are removed. Show Status's picture moves down into the space the
  browsing rows left. The **Browse a Slideshow** starter steps the slideshow
  with its encoder.
- Sketches wait for a fixed deadline at the end of each frame and send it
  once. FastLED's `delay` re-sent every frame at least twice, so long strips
  now run up to twice as fast. Nodes whose pixels never change are drawn once.
  Plasma, Pride2015, Pacifica, TwinkleFox and TreblePrism draw with integer
  maths, which is 30 to 450 times faster on an ESP8266. They look the same,
  except that TwinkleFox gives each pixel a new twinkle schedule. Its preview
  and LEDs now agree; before, the float hash differed between the two.
- Every other pattern that cost 10 ms or more a frame on an ESP8266 now draws
  with integer maths too: the audio patterns from Prism Storm to Ember Pulse,
  the noise, field, polar and symmetry patterns, Kaleidoscope, Colour Trails,
  Array, Blend, Frame Feedback, Truchet, Wireframe 3D, Formula Field, Formula
  Points and Fourier Epicycles. Turing Field, Slice Tiling, Reaction
  Diffusion, Custom Formula and Animartrix stay float. The preview runs the
  same integer code, so it matches the LEDs. Field Noise and Turbulent Bloom
  now use FastLED's `inoise8` in the preview as on the LEDs, so their texture
  changes slightly. Midrange Waves uses the full colour range. Frame Feedback
  modes without an integer form fall back to Screen.
- The Music Library analyses songs without Essentia. Beats, tempo, key and
  mood now come from an analyzer built on FastLED's own audio detectors, with
  an offline beat tracker that reads the whole song. On a 41-song test library
  it matched the tagged tempo as often as Essentia did, and its beats landed on
  the kick drum in 33 songs where Essentia's did in 24. Analysis is about five
  times faster, the 2.5 MB WebAssembly download is gone, and the app no longer
  bundles AGPL-licensed code. Songs analysed before this change keep their saved
  analysis until they are analysed again.

- Regenerating a performance show writes one ramp where it used to write a
  short ladder: buildups, silence, and the five-second brightness fade at each
  end of the song. A saved show that does not use a ramp or a named input stays
  byte-identical on the card. A show saved with the old whole-show edit freeze,
  and no lock list, still stays frozen until Revert. New collection and show
  fields load as weight 1, no energy tags, restart, and no sequence.
- A new **Player Particles** node starts with Enabled on, so wiring it into
  a Music Player shows bursts at once. Saved nodes keep their own setting.

- The **Node Reference** in Help is rewritten for every node. Each page now has
  its own overview, set-up steps where hardware or assets are needed, copy for
  every port, and a hand-made Try it live example that features that node and
  is drawn exactly as it looks on the canvas. Input and hardware pages, which
  used a sketched box diagram and generic text, now use the same layout as
  the rest; the copy that described the old Touch Screen controls, Beat
  Detect's live diagnostics and MIDI velocity was corrected along the way.
- Overlapping nodes are merged: Sin, Cos and Abs are one **Function** node
  (sin, cos, abs, sqrt, square, floor, round); Mod is Math's `modulo` and
  Complex Wave's operations are Math's (`average` added); CHSV is HSV → RGB
  with a hue-units select (degrees or FastLED bytes); Blend Colors is Gradient
  Sampler; Circle is Shape's ellipse; Field Lerp is Field Math's `mix` with a
  wireable T; Fade to Black is Brightness; XY → Index is removed. Color
  Temperature's control is now named `warmth`. A saved pattern that holds one
  of the merged nodes shows it as an unknown type until it is replaced.
- A second round of merges: Fire 2012 is Fire's **fire2012** style; Fractal
  Noise and Gabor Noise are Noise's **fbm** and **gabor** types, with
  Octaves, Frequency and Orientation inputs and a field output they lacked;
  Counter and BeatSin are **Wave**, which gains a Hz or BPM rate, an Offset
  and a Unipolar switch (a unipolar sawtooth is the 0–1 ramp, a unipolar sine
  at a BPM is beatsin, now on the shared clock so Master Speed reaches it);
  Distance Field is Shape Field's **falloff** mode (0 on the shape, rising to
  1 at Range beyond it); Spectrum Bars is Spectrum Visualizer's **Three
  Band** style, whose unwired bands read the spectrum's thirds; the
  Particles **swarm** mode is gone, as Boids does it. Renamed: Formula Field
  is **Formula Shapes**, Fractal is **Fractal Field**, Touch is **Touch
  Screen**, Buck Converter is **DC-DC Converter** and Transitions is **Transition Pool**. Moved:
  Kaleidoscope to Effects, Image and SD Video to a **Media** shelf, and the
  Ethernet, DC-DC Converter, battery and PD trigger parts to a **Hardware**
  category of their own in the Help reference. The bundled patterns, live
  examples and node cards follow; pre-1.0, no save migration.
- Transform's Rate runs from −360 to 360, so it turns counter-clockwise,
  shrinks or slides back; Angle shows only for translate. Clock Display
  drops its Seconds Today, Valid, Day and Month inputs: DateTime from an RTC
  Clock is its one clock feed. Sunrise's Start and Duration are typed
  seconds since power-on.

- A generative show compiles as a controller sketch plus one header per
  pattern (`pattern_0.h`, `pattern_1.h`, …) in the helper's sketch folder, for
  uploads, capacity checks and binary exports. View Code and Export .ino show
  the same sketch as one file, with each pattern's header marked as a block.
- The LED Output pane now draws a ring, a corkscrew and a positioned string in
  their real shape, where the node's own preview already did, instead of as a
  straight row of LEDs.
- A ring, corkscrew or positioned string can now be driven by the Music Player
  and by the music-sync SD player. Those sketches compose into one canvas and
  copy it through the same LED map the normal sketch bakes, so the pattern on
  the bench matches the preview. Graph Health no longer refuses those forms in
  a show, and a serpentine, tiled or custom-mapped matrix now takes its wiring
  map in those builds too, where it was silently driven row-major before. The
  SD player also takes a string its length instead of the unused grid defaults.
- A pasted FastLED classic such as DemoReel100 now moves in the Code node's
  preview as it does on the board. The Global section runs once and keeps its
  variables across frames, so a `gHue` counter advances instead of resetting;
  `uint8_t` and the other 8- and 16-bit types wrap at their width; and
  `EVERY_N_MILLISECONDS`, `EVERY_N_MILLIS` and `EVERY_N_SECONDS` fire on the
  preview clock. `leds[i] += c` saturates and `leds[i] |= c` takes the
  per-channel maximum, as FastLED's operators do. The firmware is unchanged.
- An RTC Clock synced by NTP now keeps real time in generative-show and
  SD-player firmware, not only in the normal sketch. Those builds bring up the
  same Wi-Fi or wired Ethernet connection, with the same credentials and
  addressing, so an LED Clock Display, a screen or a Schedule Trigger in a show
  reads network time. Graph Health no longer refuses an NTP clock wired into
  those builds.
- Screen design widgets may now overlap. Later widgets draw over earlier ones,
  and the designer can bring a widget forward or send it back (Ctrl+] and
  Ctrl+[). Only controls take a touch, so text or an image over a button lets
  the press through; two controls over each other are reported. A new
  **Container** groups widgets: drop widgets inside it, or draw it round them,
  and they move, copy and delete with it and are clipped to its edge. On the
  panel it is an LVGL parent object, so the LVGL configuration is unchanged.
- Screen designs gain a **Marquee**: one line of text that keeps travelling
  across, entering on the right, at a speed you set. Unlike a scrolling Text,
  it moves even when the text fits, and new text carries on from where the old
  had reached. It runs in the designer preview and on the panel, and needs no
  change to the LVGL configuration.
- Screen designs gain a **Colour Picker** and an **Arc Gauge**. The Colour
  Picker is a hue strip: drag along it to output a colour at its own saturation
  and brightness, or wire a colour to its optional Set input to move it. The Arc
  Gauge shows a ranged number as a 270-degree arc with the formatted value in
  the middle. Both run in the designer preview, the live touch surface and all
  three firmware builds, and need no change to the LVGL configuration.
  Dragging the Touch node's Add control socket onto a colour input — Solid
  Colour, Text, Line, Blend, Gradient, Circle and Shape fills, and the other
  nodes that hold a colour of their own — makes a Colour Picker that starts at
  that colour.
- Screen designs gain two touch controls. **Choice Strip** shows two to six
  options from a comma-separated list and outputs the chosen one, counting the
  first as 0. **Step Control** has minus and plus keys that move a value one
  Step inside its range, repeating while held. Both have an optional Set input,
  and a new Step Control wired to a property takes that property's range. On
  the panel they are built from LVGL buttons and labels, so the LVGL
  configuration is unchanged.
- Lithium battery power planning now supports exact-cell series/parallel packs,
  combined or separate protection, balancing and charging boards, and
  catalogue-defined non-isolated 5 V converters. Build Diagram derives the
  protected source window, sizes uncapped full-white current, wire and fuse,
  checks fuse-class interrupt rating and converter limits, reports runtime,
  and draws a dedicated Battery Assembly sheet with B-/P- separation and a
  fused `+BATT` output. The feature adds no firmware and remains experimental
  pending three physical reference builds and independent electrical review.
- The YYNMOS-4 four-channel MOSFET board (the LR7843 revision) joins the
  Hardware shelf as a Power Switch for LED rails and heavier DC loads: four
  opto-isolated channels, 1 to 4, each switched from its own On and dimmed
  from its own Level at 500 Hz, 7-28 V, 5 A a channel and 10 A for the board.
  Its pins read PWM1 to PWM4, and the Build Diagram draws a ground on each of
  its GND1 to GND4, since every input is its own optocoupler. Its gate drive
  cannot work from a 5 V rail. It is modelled from a seller listing, and its
  terminal order follows the family's earlier boards, so it stays experimental
  until a bench run confirms both.
- Two VL53L0X or VL53L1X sensors can share one I2C bus. Give each its own SHDN or
  XSHUT pin and an address from 0x30 to 0x33. One sensor on its own still uses 0x29
  and leaves the shutdown pin unconnected. This stays experimental until a
  tape-measure check is recorded.
- Displays on the Hardware tab now show their live output on the module's own
  screen. OLED and colour TFT panels show the picture the evaluator draws,
  including a mounted screen design. Segment modules light the segments,
  colon and points the firmware would. A rotation set for an upside-down or
  sideways mounting shows that way on the bench, as it would on a real panel.
  The XC4630 shield is pictured from behind, so its screen is not shown.
  The ESP32-2432S028R shows its output on the board's own screen, which is
  also where the display is configured, instead of beside a second module.
- Indicator LEDs on the Hardware tab now light as they would on the real
  parts. Power LEDs on modules and ESP32 boards glow. Relay channel LEDs light
  while their channel is on, and Mosfetti channel LEDs dim with their
  channel. IR receiver indicators light while a key is held on the node. The
  ZY12PDN's LED shows the colour of its requested voltage.
- The Arduino Nano, Nano Every, Uno R3, Uno R4 Minima and R4 WiFi,
  nRF52840 DK and Nucleo-144 pictures no longer show TX, RX, user LEDs or the
  R4 WiFi matrix lit. An idle board lights only its power LED, which now glows
  on the Hardware tab. The Arduino power LEDs are green, and the Uno R3's L
  LED no longer sits on top of a resistor.
- New SD Video node plays a video from the SD card. Drop a video on the node and
  Studio shrinks it to the LED canvas and keeps it as raw frames; Write to card
  copies the clip to a card in a reader, and the sketch reads it back frame by
  frame with no decoder on the board. ESP32 boards only, in a normal sketch, and
  the deploy check needs an SD Card part on the bench. Clips stay in this
  browser, not in the saved project.
- An LED String can now be laid out by position. Choose Positions under String
  Layout and each LED sits at its own spot on a canvas you size, reading the
  picture under it smoothly: hang the string in a curve with the Catenary preset
  (sailboat masts), or type an x,y pair per LED. The LED Output node draws the
  string over its canvas. Music Player and SD player builds do not support a
  positioned string yet and say so before upload.
- The LED output gains a Render scale setting (Rendering group) for matrix
  panels: `1/2` renders the graph at half the panel's resolution and upscales it
  smoothly onto the LEDs, a quarter of the render cost and memory on a large
  panel with a softer picture. It cannot combine with Supersample, and the
  live preview shows the same upscale.
- The LED output gains a White point setting (Rendering group): pick the colour
  temperature the LEDs treat as white, such as Tungsten100W for a warmer white.
  It is emitted as `FastLED.setTemperature` in normal, show, player and stream
  sketches, and it lowers brightness because it scales the channels. The live
  preview is unchanged.
- Pride 2015 gains a Palette port: wire one and it becomes Kriegsman's
  colorwaves, the same sweep and breathing wave read through your palette. Left
  unwired it is the rainbow it always was. Fire gains a Fire Style: `smoke`
  drifts a second noise layer up through the flame and dims it. Particles gains
  a `luminova` mode: noise-steered emitters that spiral over the matrix and
  leave soft fading trails.
- New Fluid field node: stable-fluids smoke at LED resolution on a wrapping
  canvas. Dye comes out as the field, and the flow comes out as two velocity
  fields so Frame Warp can carry a picture along it. Inject dye anywhere, fire a
  puff on a trigger, or stir it with a Field Formula through the force inputs.
- New Gauge node: shows a 0 to 1 value as a bar, a ring, an arc or a dot, in
  any direction, with optional blocks, a held peak marker, and a base frame
  underneath. Ring and arc land on the pixels an LED ring reads. Put a Map
  Range in front of a sensor to scale it.
- New Fractal field node: Julia, Mandelbrot, Newton and Burning Ship sets, with
  c, zoom, centre and spin as ports (wire an LFO to morph a Julia set or fly
  into a Mandelbrot one) and a smooth colour option. Iterations run 8 to 64.
- New Automaton field node with four cellular automata: elementary rules that
  scroll down the canvas (rule 90 draws Sierpinski's triangle), cyclic spirals,
  Brian's Brain, and falling sand that piles up and clears. A rising Reset
  restarts it.
- New Digital Rain node: falling streams with bright heads and fading tails,
  with density, speed, tail length and flicker. Direction is down, up, left or
  right, so a string can run the rain along its length.
- Five classic light effects join Patterns: Candle (one flame or one per
  pixel), Lightning (random strikes of two to five flashes, or one per trigger),
  Heartbeat (a lub-dub pulse at a set BPM), Sunrise (night blue to warm white,
  timed or driven by a progress input) and TV Simulator (scene cuts between
  coloured blocks).
- New String Particles node: particles drawn along a row, a column, or the
  pixels an LED Ring reads. `drift` wanders and fades; `meteors` fires a streak
  with debris on each trigger, over a noise bed. Set Ring LEDs to the LED
  output's LED count and every particle lands on a ring pixel.
- Noise, Field Noise and Fractal Noise gain a Noise Shape: `ridged` gives sharp
  bright crests and `billow` gives rounded lumps with dark creases. Noise's
  Worley variant gains a Worley Mode (`f1`, `f2f1`, or `edges` for thin lines on
  the cell borders), and Flow Field gains a Flow Mode: `curl` steers particles
  along the noise's curl, so they swirl without piling up. Every default is the
  old look.
- Path gains a Custom shape: type x,y pairs from -1 to 1 into Custom Points
  and the point glides along a smooth closed curve through every one. It reads
  the same text as Fourier Epicycles, and anything that is not an outline draws
  the circle. The sketch bakes a 128-point table into flash (1 KB).
- Wave Sim gains Half Duplex, which shows only the positive half of the wave so
  crests read as raised water, and Wrap X, which is on as before; turn it off and
  the left and right edges reflect waves instead. A one-row canvas already gives a
  one-dimensional wave.
- Noise and Field Noise gain Wrap X, which joins the left and right edges
  without a seam for an LED ring or corkscrew canvas. It blends the field with a
  copy of itself shifted one canvas width, keeping contrast, at the cost of a
  second noise pass per pixel.
- Gradient Frame and Gradient Sampler gain a Mix Mode: `rgb` (the default, so
  every saved graph is unchanged), or `hsvShort` and `hsvLong`, which travel round
  the hue wheel the short or the long way like FastLED's `SHORTEST_HUES` and
  `LONGEST_HUES`. The sketch uses `blend` on `CHSV`, so it matches the preview
  to a count or two.
- Polar Gradient sweeps a palette around the canvas centre by angle, by radius,
  or a spiral of both, with spin and radial scroll over time. Repeat rounds to
  whole turns, so the angular sweep has no seam and reads as a wheel on an LED
  ring.
- Harmony Palette builds a 16-stop palette from a colour-wheel harmony
  (complementary, analogous, triadic, split complementary or tetradic) around a
  base hue. Hue, Saturation, Value and Spread take wires, and the sketch
  rebuilds the palette live with `CHSV`.
- Noise LFO is a signal node that drifts smoothly between Min and Max, the
  FastLED modulator idiom that Random's fresh draw every frame is not. Speed,
  Min and Max take wires; Octaves (1–3) and Seed shape it. The sketch reads
  `inoise16`, so the curve differs slightly from the preview's simplex noise.
- Waveform draws the raw audio waveform over a base frame as a line, filled,
  mirror or ring trace, in a palette, with gain, thickness and smoothing. The
  ring follows the inscribed circle, so an LED Ring shows it. The sketch
  publishes 128 peak-preserving samples and only when a Waveform node is
  present; without audio it draws a flat trace.

- Pitch Detect reads a single voice or instrument: Hz, MIDI note, a one-frame
  Note on pulse, Velocity, Confidence, and the musical key (root, minor,
  confidence). It listens from about 175 Hz to 1 kHz. FastLED's own pitch
  detector cannot voice with the 512-sample chunks its I2S input delivers, so
  the firmware runs the same autocorrelation over the chunk directly; key
  detection is FastLED's. The sketch includes the helper only when a Pitch
  Detect node is present.

- Song Structure reads FastLED's downbeat, buildup, drop, tempo and mood
  detectors: one-frame Downbeat and Drop pulses, Beat number, Measure phase,
  Building with its progress, Drop impact, Tempo stable, Valence and Arousal.
  The sketch registers the detectors only when a Song Structure node is
  present, and a baked show reads them as inactive.

- Vibe reads FastLED's MilkDrop-style detector: bass, mid and treble relative
  to the song's own average (1.0 means average), smoothed copies, and a spike
  flag per band. Effects driven by it look the same at any volume. The levels
  fade to zero when the music stops. The sketch registers the detector only
  when a Vibe node is present.

- Palette Bank eases from one palette to the next instead of cutting, with
  FastLED's `nblendPaletteTowardPalette` on a 10 ms clock in the sketch and a
  byte-for-byte copy of it in the preview. Blend sets the speed; 0 keeps the
  old instant switch.

- Three included patterns show off the new pattern nodes: Breathing Rosette
  breathes a Slice Tiling through a slow sine, Liquid Mirage swirls Worley
  noise through Frame Warp and Frame Feedback, and Truchet Beat Maze rerolls
  a 10 PRINT maze on every beat. The library now holds 73 patterns.

- Fourier Epicycles redraws an outline — heart, star, square, infinity, the
  Path curves, or up to 128 of your own points — with a chain of rotating
  circles taken from its Fourier series. A fractional Harmonics knob grows one
  circle into the full outline, and the pen leaves a fading trail that stays
  a continuous line at low frame rates. The coefficient table is baked into
  the sketch at 12 bytes of flash per circle, and the drawing matches the
  preview byte for byte.

- Turing Field grows McCabe's multi-scale Turing patterns, labyrinths inside
  labyrinths that keep reorganising, with two to five nested scales and a
  reset input. Reaction Diffusion gains a Field output carrying its V
  concentration, at no extra firmware RAM, and named Spots, Stripes, Worms,
  Coral and Mitosis presets tuned for its solver. Custom stays the default.

- Truchet Tiles draws deterministic, rerollable arc and line networks across
  square or hexagonal lattices. Cell count, glow width, scrolling, and rotation
  are wireable, with shared preview and firmware distance geometry.

- Field Symmetry and Symmetry repeat scalar fields or finished frames through
  nine square and hexagonal wallpaper groups. Cells, rotation, spin, and
  offsets are wireable, and one shared fold keeps preview and generated
  firmware aligned.

- Frame Warp adds Milkdrop-style per-pixel displacement to any frame. Two
  fields steer X/Y source reads while centred zoom and rotation shape the
  feedback motion; clamp, wrap and black edges and nearest or bilinear sampling
  match between the browser preview and generated firmware. The new shared
  sampler also replaces the private copy used by 3D transitions.

- Slice Tiling adds recursive solid/void polygon slices on hexagonal, square,
  and triangular lattices, with twelve morphable presets, custom hexadecimal
  patterns, tileable vertex warping, and matching preview/firmware geometry.
  Its Cell output holds one value per polygon: multiply it into the Field
  output with Field Math and each polygon's slices take their own palette
  colour, reshuffled by Seed. The node's help example is that graph.

- Field Levels, Field Lerp, and Shape Field begin the procedural-pattern
  expansion. Shapes now share signed-distance primitives between preview and
  generated firmware, and Shape Field can emit either coverage or a signed-
  distance ramp for smooth field morphs.

- The MonkMakes Mosfetti joins the Hardware shelf as a four-channel Power
  Switch for small DC loads. Each channel, A to D, has its own On and Level and
  dims at 1 kHz, and the Build Diagram lands each wire on its lettered pin. A
  Power Switch now takes its channel count from the board chosen, as a relay
  module does. Experimental until a bench run is recorded.

- Copy Graph Link warns when the link is past about 30 KB. The link is still
  copied, and the warning points at Save Project File, which keeps a project
  that size without relying on a URL.

### Changed

- The bundled audio patterns no longer carry a Beat Flash. Twenty-seven
  library patterns flashed white or a palette colour on every beat over the
  pattern underneath; the flash is gone and the pattern's own frame runs
  straight through, with the Beat Detect that only fed the flash removed too.
  The node remains in the library for patterns of your own.
- Opening a group tidies it: the nodes glide into columns and the view fits
  them, so a bundled pattern opens readable rather than wherever its seed
  left its nodes. The main graph is left as laid out.
- Player Particles now come in volleys: three beats in a row each spawn a
  burst, then the sparks rest four seconds, in the preview and on the SD
  player. Every beat spawned a burst, which at dance tempos never let the
  sparks clear.
- The Music Player fades a pattern that listens to audio to black when the
  track goes quiet and brings it back when the music returns, in the preview
  as the SD player already did on the device. A pattern with no audio node
  keeps playing; the fade crosses with a transition between the two kinds.
  The SD player now fades only those patterns, where before it faded them all.

### Fixed

- A Music Player's patterns in the preview animate at the preview's frame
  rate while a track or station plays. Their clock is the track position,
  which the preview took from the audio element's progress events, about four
  a second, so the patterns stepped four times a second whatever the FPS read.
- A project can no longer be replaced by an older browser copy. When the
  upload helper stopped answering and a large project no longer fit in the
  browser's storage, a reload showed an old or blank copy, and the next save
  after the helper returned wrote it over the project on disk. A save now
  names the version it was edited from, the helper refuses one edited from an
  older save than the file holds, and such a copy is kept beside the project
  as "(browser copy)". The status bar says when a save reached neither the
  helper nor the browser, and the dev server restarts a helper that has
  stopped answering.
- A Bluetooth Music Player with an OLED or segment display no longer fails to
  compile: the display's fault card named the SD player's card and track
  state, which a Bluetooth sketch does not have. Its panel now shows no fault
  card; an internet radio's names missing Wi-Fi or stations.
- A Performance Generator show no longer renders a pattern twice a frame when
  a transition leads into the pattern already playing, which made its trails
  fade and its simulations run at double speed for the transition, in the
  preview and on the device. Generated shows no longer contain such a
  transition: a new section avoids the pattern already playing, as a switch
  within a section always did, and keeps it when it is the section's only
  choice. A hand-edited one now renders the pattern once. A player whose shows
  never change pattern through a transition, such as one from a one-pattern
  collection, compiles no transition code. In the preview, Fire and Fire2012
  (and the three Noise built-ins) no longer share one state, and a transition
  blends into the pattern the show has set at that moment, as the device does.
- In a Performance Generator show, the pattern fading out of a transition now
  keeps its palette, speed and energy on the device until the transition ends,
  as the preview shows it. The SD player switched it to the next section's
  palette and speed as the crossfade began, at every section change: built-in
  patterns always showed this, and collection patterns did with Use group
  inputs on.
- Open Project File and Save Project File As now start in the app's Projects
  folder when the helper is running, using the helper's file dialog; a
  browser picker cannot be pointed at a folder. Without the helper they use
  the browser's picker as before.
- A Code node whose pasted loop runs slower than one preview frame now shows
  its frames instead of staying blank while the sandbox worker's queue grew
  without bound; one run is in flight at a time and later frames coalesce.
  A runaway loop in pasted code is now terminated while the preview is
  animating, where the per-frame calls used to keep resetting the timeout.
- Saving a pattern, or a project through the Save As dialog, writes a temporary
  file and replaces the target, so a crash mid-write keeps the last complete
  file. A pattern save no longer deletes the old file before the new one exists.
- A project or shared graph whose edge is missing a port handle now counts that
  edge as skipped on load instead of loading it as a wire that carries nothing.
- A single-LED corkscrew draws its LED at the top of the shape in the LED
  Output pane, where the firmware sample map reads it, instead of mid-height.
- The screen designer scrolls a Text title at the panel's own speed, 40 pixels
  per second with one loop held between 0.3 and 10 seconds, rather than a
  little faster than the panel and never speeding up for a long title.
- Battery Assembly, the connection list and the fuse recommendation now follow
  one path: pack positive lands on the cell pad, the main fuse leaves the
  protected positive, and a charger return joins that protected negative.
  Combined charge-and-protection boards are not wired back onto the cell pads.
  A separate balancer keeps its own end taps. The main fuse is sized for charge
  current as well as discharge. A third pack board fits on the sheet, and an
  integrated 5 V output is not drawn a second time in the converter zone.
- Wire tooltips now wrap long descriptions and anchor toward the inside of the
  browser viewport, so hovering near any edge does not cut off their text.
- Battery buck-converter wires now land on catalogue-defined terminal centres
  instead of positions inherited from the tall Mean Well converter. Output
  positive routes around output negative, P− is shown as the system ground
  net, and the left-edge `+BATT` and `P− / GND` captions stay inside the sheet.
- The Build Diagram now lists power-plan problems under **Fix before
  building**, where they are always visible, and Readiness names them. A
  converter fed outside its input range used to show only "waiting for
  exact-board confirmation", even with the board chosen. An unsupported part
  gives its own reason instead of LED chipset advice, and power-path parts
  (converters, the PD trigger) no longer get a controller ground row in the
  connection list.
- An Interval, Beat Detect or other computed signal wired into a Palette
  Bank's Next or Previous, a Control Map, Music Player or LED output action now
  presses it. Its one-frame pulse was dropped by the 30 ms button debounce, so
  a 5-second Interval never changed the palette. Only physical buttons are
  debounced now, in the preview and the sketch; an LED output's own actions
  now debounce a physical button in firmware as the preview always did.

- Formula nodes now declare their documented `W` and `H` variables in generated
  firmware as well as in the browser preview.

- Seeded Gabor Noise and Reaction Diffusion now start from the same hashed
  cells on the LEDs as in the preview. Gabor firmware previously used Seed as
  a time offset while the preview used it in a browser-only hash, and Reaction
  Diffusion used different seeded and unseeded starting patches on each side.

- Generative shows and music-sync collections now compile when a pattern in
  them uses Shape, Shape Field or Slice Tiling, or a Field Formula that uses
  PHI. The show kept each pattern's drawing code but left out the helper
  functions those nodes call, and Slice Tiling's pattern tables, so the build
  failed. Shape shows had worked until Shape moved onto the shared
  signed-distance helpers.

- Worley noise puts each cell's feature point in the same place on the LEDs as
  in the preview. The firmware hash kept different bits of the number the
  preview used, so every cell landed somewhere else on hardware; Gabor Noise
  and Prism Storm share the hash and had the same fault. The preview looks the
  same; the hardware now matches it.

- Field → Frame maps a field of 1 to the palette's last colour instead of
  wrapping it round to the first, in the preview and on the LEDs. Solid Slice
  Tiling slices, filled Shape Fields and Field Levels thresholds were coming
  out the same colour as the empty space around them. The Noise node's own
  frame output shares the mapping and gets the same fix.

- Every built-in palette on the LEDs now ends on its last colour. The 16-colour
  table each sketch declares had its first colour copied into the last slot,
  so the brightest values of any pattern using a built-in palette turned dark
  on hardware while the preview looked right. Palette Blend had the same
  fault in the preview and in firmware, and its firmware now blends the two
  palettes entry by entry, as the preview does.

- A pattern or project named `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, or
  `LPT1`–`LPT9` no longer tries to create that device file on Windows. The
  saved name gains a trailing underscore (`CON_`).

- The local upload helper refuses a request whose `Host` is not this machine,
  and refuses a cross-site call that would compile, flash, write a drive, or
  open the serial port. `GET /api/health` still answers a local host. The
  boundary is described in `SECURITY.md`.

- A malformed share link no longer sticks the app on an empty canvas. Nodes
  and wires that have no loadable shape are left out and counted in the status
  line; a link that is not a workspace at all is discarded, and the saved
  project still opens. Project files and Graph JSON imports use the same check.

- Launching from source now requires Node.js 20.19+, 22.13+, or 24+. The
  launchers used to accept Node 18, then Vitest 4 and jsdom 29 failed on first
  run without saying to upgrade. `package.json` records the same range, and
  Node 21 and 23 are not supported.

- Inter and JetBrains Mono ship with the app. A launch no longer asks Google
  Fonts for them, and an offline install keeps those faces instead of dropping
  back to the system font. Audiowide was already a local file; it is now in the
  offline precache as well.

- The ESP32-2432S028R ("CYD") offered pins it does not bring out. Its board
  package carries no pin-safety summary, so the profile arrived with none at
  all and every part added to it drew from the chip-level ESP32 table — whose
  first entry is GPIO1, this board's USB-serial TX. The board now states what
  it actually exposes: a pool of GPIO22 and GPIO27, since of its four GPIO pads
  GPIO21 drives the fitted panel's backlight and GPIO35 is input-only, and
  every pin the panel and digitiser are soldered to is reserved with the reason
  showing in the pinout view. Two pads is a small pool, so a graph can ask for
  one part too many — a DS3231 takes the board's own I²C bus, which is both of
  them — and the part that cannot be placed now earns a named error instead of
  a plausible-looking pin on hardware already using it.

- A board with no pin-safety data at all was not counted as missing any. The
  audit behind "every board with header pins has positive pin advice" asked
  whether a profile's list of known-good pins was empty, which a profile
  carrying no such list can never be, so the one board in the catalogue with no
  data read as complete while the allocator quietly fell back to chip-level
  rules behind it.

- A music-synced show is no longer packaged after its Pattern Collection has
  moved underneath it. A show schedules patterns by *position*, and the player
  compiles one pattern table from the first ready show, so reordering the
  collection — or deleting a pattern group, or wiring the collection up after
  generating — wrote a card that played the wrong patterns in perfect time with
  the music, and a second song generated against a different collection mapped
  its numbers onto the first one's patterns. Uploading now says which song is
  out of step and what to do about it. The common case fixes itself: shows
  regenerate when the collection changes, not only when the generator's own
  controls do.

- A retarget let an already-placed part claim its old pins as well as its new
  ones. Updates are applied at the end of the pass, so a part that had been
  answered for still held the pins it arrived with, and those went to the
  allocator beside the claim set — an SD card counting as its library default
  10/11/12/13 and as its board pins 5/18/19/23 at the same time. Roomy boards
  never noticed; a classic ESP32 carrying a card, an amplifier, three buttons,
  an LED output and a screen ran out of pool with pins still free, and a failed
  allocation leaves a part on library defaults that are usually the pins
  already taken — so it surfaced as an ordinary pin conflict rather than as
  anything to do with allocation.

- Parts on fixed pins were sorted by whether their plan carried a board lookup,
  not by whether that lookup answered. An SPI OLED carries one that returns
  null for its transport, so it allocated ahead of the SD card and the
  amplifier, which then took their board pins on top of it.

- Four board profiles curated a MAX98357 pinout onto their own I²C bus —
  DIN on GPIO 22, which is SCL on both 38-pin ESP32 DevKits. Fine alone, and
  refused by pin validation the moment any I²C part was present, an OLED or the
  DS3231 included. The board's bus is now claimed before the amplifier, which
  falls through to three plain digital lines from the pool.

- A Display Panel showing a screen design, with its own Controls output still
  wired, was advised to wire Music Player to its Display input and choose Now
  Playing — advice that would have dropped the design it was showing, since the
  two content inputs are exclusive. It now says the design owns the touch.

- Double-clicking an unconnected screen design opened an editor with no size
  behind it, bypassing the Edit button that was already disabled there.


- arduino-cli reuses its build cache between compiles. Each build got a fresh
  `tempfile.mkdtemp()` directory, and arduino-cli keys its cache on a hash of
  the sketch path, so every compile was a guaranteed miss that rebuilt the whole
  of FastLED and then left the result behind — 215 stale directories and 16 GB
  of them on the machine this was found on. Builds now run from one reused
  directory per sketch name, with a private throwaway directory as the fallback
  when a second build is already using it.

- An fbuild re-upload no longer rebuilds work it already has. The helper
  rewrote the generated sketch on every run and re-patched the vendored FastLED
  headers on every helper start, both with the bytes already on disk — and
  fbuild decides what to recompile from mtimes, so an unchanged design still
  recompiled its largest translation unit, relinked, and rebuilt every FastLED
  object that includes a patched header. Both writers now skip a write that
  would change nothing.

- The Music Player's VU rails report the music rather than the listening level.
  Two separate faults stacked here, and only a bench found either. The decoder
  tap published a raw RMS while every other producer of a channel level applied
  the shared noise gate and full-scale reference, so the rails read roughly four
  times low. Underneath that, ESP32-audioI2S attenuates decoded PCM by the
  playback volume before the tap can see it, so the rails shrank when the
  listener turned the music down while a microphone or line input on the same
  fixture kept metering its source — one fixture meaning two different things
  depending on where its audio came from.
- The Board power-cap fields accept a number whose first digit is below the
  minimum. Both were controlled inputs re-clamped on every keystroke, so typing
  toward a 3000 mA cap was rewritten to the 100 mA minimum before the second
  digit arrived and the value simply could not be reached.

- A Segment Display keeps a whole digit in front of the decimal point. A
  value under 1 lit the point on an otherwise blank digit, so 0.4 read as a
  dot with nothing before it — which on a module whose whole job is to be read
  at a glance looks like a fault rather than a number.
- A Segment Display in Index mode shows dashes for a reading that is not a
  number, the same as Number mode already did. It folded one to 0 and showed a
  confident first-pattern instead, and only in the browser: the generated
  firmware rounded before checking, and rounding a NaN is not obliged to land
  anywhere in particular.
- Editing a Pattern Collection no longer interrupts the show playing it.
  The show's state was keyed on the pattern count, so adding or removing one
  pattern restarted the whole show at a random pattern with a fresh dwell —
  building a collection meant repeatedly interrupting the thing you were
  building it for. A reorder now keeps playing the same pattern, and removing
  the playing one hands its slot to whatever took it.
- Displays are evaluated every preview frame rather than at the slower
  publish cadence. They were treated as code-generation terminals but not as
  evaluation ones, so a display and everything wired into it were skipped on
  most frames and a wired progress bar crawled while its input moved
  smoothly.
- Wires now meet a display's header where it actually is. Pad positions were
  measured for audio modules only, so every other part fell back to a generic
  placement and its wires met the picture wherever that landed. The measured
  set now covers the OLEDs, both segment modules and the ST7789, and describes
  a vertical header as well as a horizontal one — the MAX7219's runs down its
  left edge.
- Corrected the pads the Build Diagram draws on several modules. Pad names
  were hardcoded per part category and had drifted from the hardware: a DS3231
  was drawn with four pads reading 3V3/SDA/SCL/GND where the module has six
  reading 32K/SQW/SCL/SDA/VCC/GND, so its data lines were labelled the wrong
  way round and its supply wire was drawn to the 32K pad; an LDR was drawn
  VCC/SIG/GND where the board is silkscreened S/VCC/GND, putting its supply on
  the signal pad. Pads, supply, ground and each signal now come from the
  catalogue's measured header, so the drawing matches the board in front of
  you and a new module is correct the day its asset lands.
- The Build Diagram draws each part as the exact module it is, resolved from
  the part the item names rather than a table keyed by category. Four audio
  modules shared one entry and were all drawn as a MAX98357A; displays had no
  entry and were drawn as bare pin stubs.
- The Build Diagram now draws auxiliary displays. Its part list was
  hand-maintained and had fallen behind twice the same way: pin collection
  reserved a part's wires while nothing drew the part, so the bench looked
  wired and the diagram silently omitted it. The list is now derived from
  hardware ownership, so a part the workbench owns is a part the diagram
  draws.
- Displays now follow a board change. Without a pin-retarget plan a Segment or
  Info Display kept the pins it was given on the board being left — on an
  ESP32-S3 that could mean GPIO 32, which is wired to flash — and it never
  entered the claimed set, so parts that did retarget were assigned its pins on
  top of it. One omission produced both faults, and both looked like wiring
  mistakes.

### Added

- **Isolated 5 V LED-rail conversion from 12 V or 24 V.** The Hardware shelf
  now offers the Mean Well SD-100A-5 and SD-100B-5. The electrical plan applies
  their imported 40 °C derating curves, adds converters until every full-white
  zone retains 20% headroom, sizes each source-side fuse and conductor, and
  recommends the shared upstream source. The Build Diagram and exports show
  FG, the isolated-output ground bond, output main fuse and 5 V trunk; converter
  outputs are never paralleled.

- **Three starters where the controls are already wired.** Both existing
  control-bearing starters left Player Controls as a stub with nothing plugged
  into either end, so the one thing a beginner most needs to see — that
  blackout, dimming and pattern intent are ordinary visible cables — was the
  one thing they had to work out unaided. *Dimmer and Blackout* is a knob and a
  button reaching an LED output's Controls latch with no player in the graph.
  *Browse a Slideshow* is an encoder turning a highlight and a press committing
  it, with an OLED as the Pattern Browser that makes highlight-then-confirm
  mean anything — the LEDs only ever show what is already running. *Player
  Buttons and Screen* is three buttons named on the Player Controls node
  reaching the player on one cable, with an OLED taking the player's single
  Display wire.

- **Create screen design, on the panel.** A design has no size until something
  physical says what size it is, so it is no longer authored at an arbitrary
  size and told afterwards that it does not fit. A Display Panel mints the
  design instead: one node, one document already the panel's rotated size, and
  the ordinary content cable between them, in one undoable step. An unconnected
  design shows no size at all and cannot be opened, saying which panel to
  connect instead; the editor names the panel it is drawn for and offers the
  way back to it.

- **A 0–1 signal wired into another domain is now named.** Wired values are
  passed straight through — only the speed/scale class is stretched onto a
  node's own rate — so an audio band into Fire 2012's Sparking set it to about
  1 out of 255 and the fire never lit, into Reaction Diffusion's Feed it landed
  ten times past a usable range, into Starfield's Count it asked for one star.
  Nothing errored and the graph on screen was the graph that was drawn, which is
  what made it expensive to find. Graph Health now names the wire and the Map
  Range that repairs it, and the status bar says it as the wire lands — a range
  mismatch is a fact about the two ports, already true, and no later wiring
  makes it false.


- **Stereo VU Meter.** A paired addressable-LED fixture for the left and right
  sides of a matrix frame, added from Hardware and driven by one explicit Audio
  wire. Twelve visualizations — Classic Ladder, Palette Fill, Solid Channel,
  Segmented Blocks, Peak Cap, Falling Comet, Center Burst, Frame-Inward, Dot
  Runner, History Trail, Stereo Balance and Beat Spark — with Manual, Timed
  cycle, Beat cycle and seeded Shuffle selection. True-stereo sources drive the
  rails independently; mono sources mirror one measured channel to both rather
  than pretending to separation they do not have. Works in normal sketches,
  generative shows and the SD Music Player, and validated end to end on
  hardware: see the [bench record](docs/reports/bench/stereo-vu-bench.md).

- Uploads report how long they took. Each phase's exit line carries its own
  duration and the run ends with one total, so a build that felt slow can be
  read rather than guessed at — and the two engines can finally be compared on
  the same sketch. The total also lands on the Output console's status once the
  upload finishes. Both fbuild and arduino-cli get it from the same place, so
  neither engine reports it differently from the other.

- Graph Health now says when a display the build cannot drive is on the canvas.
  A show controller has no display support at all and would drop the part, and
  the SD player runs a fixed template, so a display port fed from a Wave or a
  Math node has nothing to read there. Either case used to build successfully
  and leave the screen dark, which sends you looking at wiring that is fine.
- The SD-card player sketch can now drive a display, and reads the track's own
  tags to fill it. A finished build takes a card of music the app has never
  seen, and the player scrapes title, artist, album, genre, year and bitrate
  from the files themselves; a file with no tags falls back to its name. Wires
  from Music Player to a display resolve to what the player reads on device, and
  a port fed from something the player sketch cannot evaluate is reported rather
  than silently left blank.
- The Music Player now reports what it is playing: title, artist, album,
  genre, year, status, elapsed, duration, remaining, progress, volume and
  bitrate. The player holds the music, so the player says what the music is —
  which matters most for a card of files the app has never seen. The browser
  fills in what it genuinely knows and leaves the tag fields empty rather than
  guessing them from a filename.
- Added a mounted-rotation setting to the Info Display. A 1-bit OLED has no
  idea which way up it is bolted, so the controller is told to scan forwards or
  backwards; the setting turns the picture without turning what the screen
  says. Both pairs were confirmed on a bench SH1106.
- Added the MAX7219 8-digit module behind the existing Segment Display node.
  Digit count, brightness range, colon presence and pin set are now controller
  facts rather than module-wide constants, so one node contract covers a
  four-digit two-wire part and an eight-digit three-wire one. A MAX7219 can
  share clock and data with other SPI devices given its own load line, while a
  TM1637's two wires stay exclusive.
- Added the Info Display node and a shared 1-bit OLED surface: a 128x64 panel
  showing a Now Playing, Clock, or Status screen, on either an SH1106 over SPI
  or an SSD1306 over I2C. The surface knows nothing about the bus, the
  controller's column offset lives in its descriptor rather than being fixed up
  per device, and text rasterises through the same bitmap font the LED Text
  node draws with. The panel is pushed only when its pixels change or a refresh
  interval passes.
- Added the ST7789V 2.4-inch 240x320 touch TFT part, the module carrying the
  display, XPT2046 touch and a microSD slot on one SPI bus. Every device the
  plan names for launch is now modelled and catalogued.
- Added the MAX7219 8-digit segment and SH1106 1.3-inch OLED display parts
  from verified assets. A part manifest that declares a board profile is now
  skipped by the part importer and reported, so an integrated display board is
  not offered as a module to attach to another board.
- Added the Segment Display part and node: a TM1637 four-digit module added
  from the hardware workbench, showing a number, an HH:MM clock, or a position
  in a collection. Preview and firmware render the digits through one shared
  model, the driver is emitted inline so nothing has to be fetched or pinned,
  and the module is rewritten only when the digits change or a refresh
  interval passes.
- Auxiliary displays are now code-generation terminals. Previously the sketch
  kept only what fed an LED output, so a configured display and everything
  wired into it would have been pruned away and left the part dark on a board
  that compiled and uploaded cleanly.
- Added the four launch display parts to the catalogue from verified Blender
  assets: TM1637 4-digit, SSD1306 128x64 OLED, ST7789 240x240 TFT, and
  ILI9341 320x240 with XPT2046 touch. Each carries its controller, panel
  resolution, interface, and touch controller imported from the asset rather
  than declared in the app.
- Added a Transport Control node that drives the player through the same
  command bundle Player Controls publishes, and reads the transport back as
  title, elapsed, duration, progress, pattern name, and pattern position — the
  status a display needs, which the graph could not reach before. Seek is a
  change rather than a value, so a parked scrub does not drag playback back to
  itself, and wiring it warns that no firmware generator can emit it yet.
- Added bus-aware pin validation: I2C clients may share SDA and SCL, and SPI
  clients may share SCK, MOSI, and MISO, while chip selects, reset, and other
  exclusive lines still conflict. Two devices answering one I2C address are now
  reported as an address fault rather than as a fault in the pins they
  correctly share, and deploy validation and the Graph Health drawer read the
  same walk.
- Added a `string` port type for auxiliary-display text, with Text Value,
  Format Number, and Format Date/Time nodes. Preview and generated firmware
  format through one shared model, so a display cannot read one thing in the
  browser and another on the bench; generated code uses fixed buffers and
  `snprintf` rather than an Arduino `String` refreshed once per LED frame.
- Added the auxiliary displays design note recording the data model, frame
  ordering, generator rules, bus-sharing rules, driver candidates, and the
  measurement gates no display family ships without.
- Added LED Corkscrew as a dedicated output form with chain length, turns,
  starting angle, winding direction, diameter, and height controls; an
  unwrapped-cylinder authoring canvas; a depth-aware physical preview; and one
  shared browser/firmware sampling map.
- Added an `Audio` capability node whose source picker is derived from attached
  board audio hardware, defaults a single microphone, and clearly reports when
  no source exists.
- Added an on-board player decoder tap that feeds decoded PCM into FastLED audio
  analysis before I2S/DAC output, with the baked show envelope retained as a
  startup and decoder-failure fallback.
- Added ESP32-S3 PCM1802 stereo line-in hardware with four-wire I2S capture,
  Audio capability discovery, board-aware pin assignment and validation,
  generated FastLED analysis, and complete Build Diagram wiring/export support.
- Added a `Storage` capability node that selects the SD, onboard flash, or USB
  storage attached to the board, and resolves which provider a show reads from.
- Added a Button Bank hardware input that grows a new named button output each
  time one is connected, with per-button pin assignment and pull-up, board-aware
  automatic GPIO selection, and pin-conflict validation for every row.
- Added generic SD playback for tracks with no pre-baked event timeline: the
  player rotates the collected patterns on a wall-clock cadence while their own
  audio nodes react to the live decoder signal, and fades down during genuine
  silence.

### Changed

- **The panel and the design are named apart.** "Transport Display" named the
  glass after one of the four things it can show, and "Custom Display" named
  the document with the same words as the panel input it plugs into — so a
  sentence about connecting one to the other used one phrase for both ends.
  The panel is now the **Display Panel** and the document the **Screen
  Design**, on the node, its port, the hardware shelf, in-app Help, the node
  cards and the guides. Saved workspaces pick up the new names on load.

- **The control picker offers only what the chain can act on.** It filtered on
  type alone, so a Player Controls node wired to an LED output still offered
  Play / Pause, Volume and Previous Track; choosing one minted a port, accepted
  the wire, passed validation and did nothing — the failure that has someone
  pressing a button and blaming their soldering. Each option also says whether
  it is an edge or a position, since "Volume" beside "Volume Up" does not say
  which of the two you get.


- The capacity meter reads its flash and RAM figures from fbuild's own output
  rather than from a private cache file beside the build. fbuild used to print
  no size line at all when an incremental build decided nothing had changed —
  the common case for a meter that re-checks an unchanged sketch — so the
  helper reached into `.firmware_size_cache.json` to get the numbers back. That
  was reported upstream and fixed, so the reach-in is gone.
- The upload helper pins fbuild 2.5.21 and no longer stubs out FastLED's SD
  unity file. That patch existed because the file included `SPI.h`
  unconditionally while fbuild never put `SPI` on the include path for a
  vendored local library, so every ESP8266 build failed on a file nothing in
  this project calls. FastLED has since put `SPI` in the guard that admits the
  Arduino SD backend, and has renamed the file besides — so the patch was
  aiming at a path that no longer exists on a fresh clone, which is a workaround
  that can only mislead. ESP8266 and ESP32-S3 both build with the real file.
- Removed the Transport Control node. It both commanded the player and reported
  what was playing, which left two nodes claiming to be the transport and put
  the song information beside the player rather than on it. The model now
  follows the appliance: Music Player holds the music and says what it is
  playing, Player Controls controls it. Everything Transport Control offered is
  available across those two, except its browser-only Seek, which no firmware
  generator could emit.
- FFT, beat, percussion, audio-feature, and spectrum analysis now consume the
  payload carried by their Audio connection in preview, recording, group/show,
  and generated-firmware paths instead of reading ambient audio state.
- PSRAM now defaults to an automatic policy that enables external render
  buffers only for exact board profiles with a recorded PSRAM interface, while
  retaining manual On/Off and QSPI/OPI controls.
- Serial routing on native-USB ESP32 targets now defaults to automatic
  detection from the selected port's USB identity, with explicit Native USB
  and UART bridge overrides for ambiguous devices.
- Default master brightness is now 128 rather than 200, so a first upload on a
  dense build is less likely to hit the power cap or overheat the strip.
- The Generative Show starter is now Music Player, and lays out an Audio source
  and Player Controls already wired into Pattern Master.
- The Hardware pane now shows the GPIO assigned to each part and scales its
  layout spacing with the band size.

### Fixed

- New Project now creates a blank project directly instead of opening a Save As
  dialog after the user chooses to continue without saving the previous project.
- Opening a project file or recent project no longer asks whether to save when
  the current graph contains only its automatic Board node.
- Open Project File now launches its file picker directly from the menu click,
  preventing browsers from silently blocking it after an asynchronous fallback.
- Save Project File As now opens the platform save dialog directly from the
  menu click, preserving the browser permission needed to choose both the file
  name and save location; helper-backed Windows dialogs are explicitly owned
  and topmost so they cannot wait invisibly behind the app.
- Live Stream now sends the palette and RGB frame for the LED output whose
  receiver was flashed, even when another output is selected in the preview,
  and no longer applies the Board master brightness a second time on-device.
- The Music Player starter no longer exports a sketch describing its Player
  Controls node as unsupported; the node is generated by the SD show player,
  and the sketch now says so.

## [0.7.0] - 2026-08-09

### Added

- Added HUB75 scan-panel output as a third `MatrixOutput` hardware family for
  classic ESP32, ESP32-S2, and ESP32-S3 boards. The generated firmware uses
  `ESP32-HUB75-MatrixPanel-DMA` for single panels, horizontal chains, folded
  2D grids, serpentine panel chains, and independently rotated panel tiles.
  Normal uploads, Flash Wiring Test, Live Stream, generative shows, and the
  music-sync SD player all share the same HUB75 configuration and output path.
  Single-panel output and the general wiring diagnostic have been exercised on
  a real ESP32-S3 with a P4 64×64 panel; chained, folded, rotated, streaming,
  and show/player paths remain experimental until their own hardware passes.

- Added a dedicated **Flash HUB75 Topology** wiring-test mode for folded grids.
  Each tile holds unmistakable fixed-colour corners, logical X/Y axes and
  coordinates, configured rotation, panel-chain ordinal, and a direction arrow
  that reverses on serpentine rows. The normal wiring-test cycle includes the
  same topology phase automatically when the MatrixOutput configuration is a
  valid folded HUB75 grid.

- Added a curated ten-pattern featured set and prepared matching community-site
  pattern payloads for richer public examples.

- Added WASM preview-versus-firmware parity tests and a firmware-RAM calibration
  harness, providing byte-level render comparisons and measured checks for the
  pre-upload memory estimator.

### Changed

- Updated the bundled/helper build path to fbuild 2.5.15 and moved the remaining
  GitHub Actions JavaScript runtimes from Node 20 to Node 24.

### Fixed

- Live-audio recordings no longer open on a silent frame when the first browser
  animation sample lands after capture frame zero. The leading level is
  backfilled from the first real sample without duplicating its beat pulse.

- Generated firmware now renders the same palette colours the preview shows.
  Six palettes — `rainbow`, `heat`, `ocean`, `lava`, `forest` and `party` —
  carried a `fastled:` shortcut that emitted FastLED's same-named built-in
  (`RainbowColors_p`, `HeatColors_p`, …) into the sketch, while the preview
  rendered this project's own colour stops. Same palette name, different
  colours, on the default palette of every palette-consuming node. The other
  23 palettes already baked their stops into a `paldef_*` table and matched;
  all 29 now take that path.

  Measured by compiling the generated sketch to WASM and diffing its LED bytes
  against the evaluator frame by frame: a static ramp through `rainbow` went
  from mean Δ 43.6/255 per channel (max 152) to Δ 9.0 (max 50), and Plasma
  from Δ 39–61 to a flat Δ 13.5 — the drift over time disappearing along with
  it. The remainder is a separate, smaller issue: FastLED spreads 16 palette
  entries over 16 intervals and wraps the last back to the first, while
  `samplePalette` spreads them over 15 and clamps.

  **If you have flashed a design using any of those six palettes, its colours
  will change on the next upload** — toward what the preview has always shown.
  Saved projects are unaffected; nothing about their stored shape changes.

- Generated sketches now declare only the palettes they actually name. Every
  palette was previously emitted regardless of use — 29 `CRGBPalette16`
  globals, non-const and so RAM-resident at 48 bytes each. A typical
  single-palette design now spends 48 bytes.

  Measured on a real Arduino Uno build of an 8×8 Plasma sketch: RAM fell from
  1,831 to 775 bytes (89.4% → 37.8% of the 2 KB available) and flash from
  15,032 to 7,072 bytes. That sketch was within a whisker of running out of
  SRAM purely from colour tables nothing read.

  The flash saving is the larger and less obvious half. These globals carry
  dynamic initialisers, so each one also emits constructor code that runs at
  startup — roughly 360 bytes of flash apiece on top of its 48 bytes of RAM.
  An unused palette cost about 408 bytes in total, not 48.

  The SD-show player still declares all of them, and must: a `.show` file
  stores a palette id that `SET_PALETTE` resolves during playback, so any
  palette may be selected by a file the sketch was never compiled against.
  The generative-show controller also keeps the full set, since its pattern
  bodies are rewritten in from separate codegen runs whose palette use isn't
  visible at that point; it targets ESP32-class hardware where the cost is
  under half a percent of RAM.

- The pre-upload RAM estimate now counts palette tables. It had ignored them
  entirely, under-reporting by up to ~1.4 KB. It resolves them the way codegen
  does — reading palette-typed input ports from the node library rather than
  restating which nodes consume one — counting one shared table per distinct
  named palette plus one per palette-building node. The live capacity meter
  was never affected; it reads the real figure from the linker.

## [0.6.1] - 2026-08-06

### Fixed

- Fixed the LED matrix preview collapsing to a postage stamp on short
  viewports — most visibly on Windows at 125% display scaling, where the
  browser viewport drops under the 620px height breakpoint. In that compact
  layout the canvas gave up height three times as fast as the spectrum and
  transport below it, so it rode down onto its own minimum while the
  decoration kept its space; the block was meant to do the opposite. The
  transport rows now hold a content-sized floor of their own so they cannot
  be clipped in return, and the panel scrolls when the matrix and the
  controls do not both fit.

## [0.6.0] - 2026-08-06

### Added

- Shared patterns now carry a looping 5s preview clip captured through the
  same evaluator and renderer the live preview uses, so the community
  gallery can play each card back from that clip instead of live-evaluating
  every pattern on the page at once; live evaluation is reserved for the one
  pattern a visitor actually opens.
- The sharer's own 1–5 star rating now travels with a per-pattern community
  share, seeding the site's rating with a real opinion instead of starting
  every shared pattern at zero. Whole-project shares have no single Pattern
  Library entry to have been rated, so they omit it.

### Changed

- Custom Palette and Poline nodes now show the interactive stop/anchor rail
  at the top of the node body, where the separate gradient preview strip
  used to be, removing the duplicate gradient display.

### Fixed

- Fixed whole-project community shares silently substituting an unrelated
  inner subgraph for the actual canvas content whenever the project used any
  Group nodes: the share path was flattening the top-level canvas and every
  nested group's subgraph into one node list, so the evaluator's terminal
  search could land on a stray nested `GroupOutput` instead of the canvas's
  real one.
- Fixed shared patterns with `MatrixOutput` stripped (the normal
  hardware-agnostic share shape) rendering a "tiny preview": capture fell
  back to evaluating at a hardcoded 16x16 grid while still packing bytes at
  the caller's requested size, leaving roughly three-quarters of every
  frame black.
- Reduced per-frame allocation in the AnimARTrix evaluator path by drawing
  its pixel buffer from the same recycling pool every other node type
  already uses, instead of allocating a fresh buffer every frame.

## [0.5.1] - 2026-08-03

### Changed

- Community sharing now sends a single, hardware-agnostic pattern instead of
  a whole project. A new **Share** icon on each Pattern Library entry hands
  that saved pattern's graph to the community site as-is. The existing
  command-bar **Share** action still hands over the whole active project, but
  now collapses it down to that same shape first, stripping Matrix Output
  and its wires so the shared graph plugs into anyone's rig via that node's
  own defaults rather than the sharer's board, pins, or chipset. Controller
  and LED count still travel along as separate, editable metadata.

## [0.5.0] - 2026-08-03

### Added

- Added a **Share** action to the command bar and File menu that hands the
  current named project directly to the community site: it packages the
  project along with its detected controller and LED count and opens them in
  a new community tab for the maker to review before publishing. Blocked
  pop-ups and projects over the 2 MB community upload limit are reported
  in place; the existing copyable graph share link remains available as a
  separate action, and the handoff does not persist the project or share
  authentication between sites.

### Changed

- Replaced the universal Pattern Ratings percentage with **Pattern Insights**:
  Studio now judges each pattern against an inferred or manually selected
  intent, examines the complete captured run plus multiple audio scenarios,
  and presents a verdict with weak/typical/strong evidence and actionable
  critique. Persistent personal 1–5 star ratings remain independent of Studio
  Score and can be used alongside intent and score when building collections.
  Library scans are now explicit and cancellable and are subject to the same
  per-pattern trust gate described below.

### Fixed

- Fixed preview recordings (PNG/GIF/WebM) diverging from the live preview in
  five ways: exports now render through the same renderers the on-screen
  matrix uses, so soft/dreamy/cyberpunk/neon/CRT styles and cross-LED glow
  bleed are captured correctly instead of exporting flat; a captured
  PerformanceGenerator show overlay is no longer dropped; a new warm-up
  option renders and discards leading frames so Fire/Trails/Particles/Game of
  Life/Reaction-Diffusion start settled instead of in their blank boot state;
  and 1-row/1-column strip exports no longer gain a phantom black row. A
  related fix replays a folded recording of the live microphone so
  audio-reactive graphs animate in exports instead of sampling one frozen
  instant.

- Fixed a freeze when a full Pattern Insights library scan completed:
  evidence thumbnails now render directly from packed pixel bytes and
  memoize so unrelated card updates don't redraw every canvas, instead of
  mounting the full live LED renderer three times per result card.

- Fixed a GIF export freeze by moving quantization and LZW compression off
  the UI thread, replacing the expensive gradient median-cut path with a
  fast balanced RGB palette, and adding backpressure, cancellation, and
  bounded finalization memory.

- Fixed a WebM recording freeze by rasterizing frames through the shared
  pixel-buffer renderer, skipping obsolete catch-up frames instead of
  blocking the page, and showing an explicit finalization state after the
  last frame.

- Fixed a PNG export freeze by rendering snapshots through the same shared
  rasterizer and showing an explicit finalization state while the browser
  compresses the image.

### Security

- Nested subgraphs — a Group, or a pattern reached through
  `Pattern Collection → Show Engine` — now honor the workspace's untrusted
  trust flag. `evaluateGraph`'s two recursion points previously fell back to
  their `trusted = true` default, so an imported, share-linked, or
  project-file workspace the user had not yet approved via "Trust and run"
  would still execute `CustomFormula`/`FieldFormula`/`Code` nodes as soon as
  they sat inside a group or a pattern collection — the normal shape of a
  shared pattern.

- Pattern Insights scanning now resolves trust per pattern instead of always
  rendering as trusted. Bundled curated patterns run as before; any other
  pattern containing a gated node (directly or in a nested group) prompts
  "Trust and rate" vs. "Skip this pattern" before it executes. A yes is
  remembered by content; a no is not cached, so the pattern is asked again
  on the next scan rather than left permanently unrateable.

## [0.4.0] - 2026-08-02

### Added

- Added a **3D Wireframe** pattern node. It renders rotating built-in
  Platonic-solid presets or an uploaded custom mesh with orthographic or
  perspective projection, optional depth shading, independent X/Y/Z spin,
  live preview, and matching FastLED code generation. Oversized custom meshes
  are automatically decimated within the node's validated vertex/edge limits.

- Added an RTC clock and time-of-day scheduling. An **RTC Clock** source node
  publishes calendar fields plus `valid`/`synced`/`stale` status from one of
  four time sources: the sketch's compile-time build stamp, a manually
  entered date/time, NTP over Wi-Fi, or a battery-backed DS3231 on the board's
  default I²C bus. The DS3231 path uses Arduino Wire directly, needs no RTClib
  dependency, and maps the chip's oscillator-stop flag to `stale`. A
  **Schedule Trigger** node reads that clock through ordinary ports and fires a
  time-of-day window (with a 0–1 progress output) or a one-shot daily trigger,
  gated by day-of-week rules. A **Clock Display** node renders the time as a
  digital or analog face, or runs as a local stopwatch/timer. Preview mirrors
  whichever time source is selected; generated firmware runs a free-running
  software clock for the first three sources (NTP corrects it once Wi-Fi/sync
  succeeds rather than staying dark until then), and Graph Health flags
  unsupported boards, incomplete
  schedules, and an unwired clock display. NTP time sync shares the same
  Wi-Fi bootstrap and browser-local credential store as Art-Net input.
  Experimental until hardware validation passes for software-clock drift, a
  real NTP sync, and a physical DS3231 are recorded.

- Added DMX / Art-Net input. A **DMX / Art-Net** source node carries one
  512-channel universe down a single `dmx` wire, and a **DMX Channel** node
  decodes one slot into a normalized value, a raw byte, and active/changed
  flags. Preview receives Art-Net through a UDP listener in the local helper,
  with connection, packet-rate, and live-channel status on the node. Generated
  firmware implements both transports: Art-Net over Wi-Fi on ESP32/ESP8266, and
  real DMX512 through an RS-485 transceiver on ESP32 (`esp_dmx`, vendored
  automatically by the `fbuild` engine). Validation blocks DMX512 on non-ESP32
  targets and network modes on boards without Wi-Fi, folds the DMX UART pins
  into the shared GPIO conflict check, and flags missing or conflicting Wi-Fi
  settings. Experimental until a hardware validation pass is recorded.

- Added multiple Matrix Output routes in one project. Each route can select an
  independent frame branch and configure its own pins, chipset/color order,
  dimensions, physical layout, brightness, and fit/crop mapping. Preview can
  switch between routes; generated firmware initializes all controllers and
  updates them with one synchronized show call, with cross-output GPIO/layout,
  aggregate power, and RAM validation.

- Added preview recording and export: a **⏺ Record** button in the LED
  preview header opens a dialog that captures the matrix as a PNG snapshot,
  an animated GIF, or a WebM video, with duration, frame rate, scale
  (pixels per LED), seamless-loop crossfade, and LED-look vs. flat-pixel
  style options. Clips render offline and deterministically from the graph
  (stateful nodes run in an isolated state namespace, so the live preview
  is undisturbed), and the GIF encoder is built in with no new dependencies.

- Added an always-available Graph Health drawer with continuously refreshed,
  node-attributed diagnostics for wiring, expressions, pin conflicts,
  preview-only behavior, output power, internal RAM, show structure, and board
  compatibility. Each issue includes a specific repair and can locate the
  affected node or open the relevant workspace control.

- Added a dockable **Performance Deck** for pinning graph properties as large
  knobs, faders, toggles, or selectors. Performers can save and recall parameter
  scenes, morph between two scenes, invoke a panic/restore action, and learn MIDI
  or keyboard bindings without leaving the live graph.

- Added **Pattern Ratings**, an offline quality pass over saved and bundled
  patterns that scores structure, colour balance, brightness, stability, graph
  health, and audio wiring. Rated selections can be turned directly into a
  Pattern Collection, and the bundled audio-reactive shelf was expanded and
  polished using the same checks.

- Added **Palette from Image**, which extracts two to eight representative
  colours from an uploaded image using weighted median-cut quantisation and
  bakes the resulting palette into generated firmware.

- Added opt-in beta hardware coverage reports. The deploy panel identifies
  whether the current host/board/layout/workflow has a recorded support row and
  lets testers explicitly copy or download a privacy-reviewed report; nothing
  is submitted automatically.

- Expanded the node catalogue and node controls with additional Ease variants,
  board-aware pin selection, richer Audio Hue weighting, matrix-aware shape
  sizing, and the completed node-reference/card set for the current library.

### Changed

- Reworked project management around named, autosaved workspaces with recent
  project access, create/duplicate/rename/delete controls, per-project upload
  targets, helper-backed disk mirroring, recovery snapshots, and explicit
  save/continue prompts. Legacy autosaves migrate into the default project.

- Improved the first-run path with guided starters, a redesigned Start gallery,
  clearer in-app help, progressive node-library disclosure, quick audio recipes,
  and refreshed README imagery and pixel branding.

- Expanded the Matrix Output workflow with a streamlined setup wizard, build
  engine switching, custom board-manager URLs and core updates, board-aware GPIO
  guidance, live flash/RAM capacity reporting, wiring diagnostics, and clearer
  upload/readiness errors.

- Added resizable workbench panels and layout presets, improved graph fitting and
  tidy/splice behavior, and completed keyboard/screen-reader smoke coverage for
  the core authoring and upload path.

- Updated the helper toolchain to `fbuild 2.5.4` and broadened recorded hardware
  coverage to include ESP8266 strip upload, wiring diagnostics, and live stream,
  plus ESP32-S3 microphone-driven generative-show transitions and particles.

- Kept RTC/NTP, DMX/Art-Net, PSRAM, tiled/custom layouts, and the music-sync SD
  pipeline explicitly experimental until their remaining hardware-validation
  runs are recorded in the beta support matrix.

### Fixed

- Fixed sustained live streaming freezes caused by unread helper output pipes,
  blocked serial writes, and receiver reads that could wait forever after a
  dropped byte. Also fixed all 1-row/1-column layouts silently dropping every
  streamed frame because display dimensions were used instead of frame
  dimensions.

- Fixed music-sync SD provisioning and playback issues found on real hardware:
  first-write acknowledgement timeouts, undersized ESP32 app partitions,
  excessive audio-library memory use, an invalid DAC API, and incorrect playback
  position tracking.

- Fixed show-codegen buffer/brace issues, Kaleidoscope code generation,
  brightness amplification, stale upload ports, upload contrast/error recovery,
  and misleading unsupported-node comments in generated show firmware.

- Fixed project and graph-state regressions including lost browser-only projects,
  an unreachable project manager, invisible no-save state, group navigation
  discarding undo history, duplicate ids during multi-pattern drops, and node
  drags requiring two Undo presses.

- Fixed pattern-library selection and rendering issues, invalid palette fallbacks,
  sidebar preference loss on an empty canvas, record-dialog Escape handling,
  Save As picker fallback, context-menu layering, preview sizing, and excessive
  code generation/store subscriptions during ordinary graph interaction.

- Fixed Intel macOS desktop dependency resolution by retaining the
  `cryptography <49` constraint required by `esptool 5.3.1`, compiling the
  matching fbuild 2.5.4 source in macOS packages, and adding Intel macOS to the
  cross-platform dependency-compatibility matrix.

### Security

- Wi-Fi credentials entered for Art-Net input or NTP time sync are held in a
  browser-local store keyed by node id instead of as node properties, so they
  never travel in project files, share links, or the helper-backed `Projects/`
  mirror. Previously saved values migrate into the local store and are stripped
  from the project on load. Generated firmware still embeds the credential in
  plain text, since a sketch has no other way to join a network.

- Refreshed vulnerable transitive development dependencies used by linting and
  production builds. Both the production and full npm dependency audits now
  report zero known advisories.

## [0.3.0] - 2026-07-20

Renamed the project to **Design Studio for FastLED** following trademark
feedback that "FastLED ___" read as an official FastLED product rather than a
compatible companion tool.

### Changed

- Renamed the app from "FastLED Studio" to "Design Studio for FastLED"
  throughout: display text (README, docs, in-app UI, generated-firmware
  comments), `package.json`/PWA manifest identifiers, localStorage key
  prefixes, the desktop app's per-user data folder, release-artifact naming,
  and the Windows/macOS launcher files.
- Replaced the branding SVGs and the empty-canvas start-screen wordmark PNG
  with versions reading "Design Studio" (paired with the existing "for
  FastLED" tagline), and retook the README screenshots against the renamed
  app.
- Updated hardcoded repository links (Help modal, hardware-validation report
  links, issue templates, README, CONTRIBUTING) to the renamed GitHub
  repository, `stevenmunn312-tech/Design-Studio-for-FastLED`.

### Fixed

- Check out Git history in the desktop draft-release job before invoking the
  GitHub CLI to create or update a release.

## [0.2.0] - 2026-07-17

First public beta.

### Added

- Public-beta release docs: a beta support matrix, supported-platform policy,
  versioning/tagging procedure, third-party notices, and security reporting
  instructions.
- A multiline-aware Text authoring path with a clearer font manager in the
  Inspector, keeping preview and codegen aligned for custom fonts.
- Concrete PWA install icons and explicit offline/hardware-workflow guidance in
  the README and Help modal.
- Backend Python dependency pinning via direct requirements, a shared
  constraints file, and CI coverage for clean installs on Windows, macOS, and
  Linux.
- A documented desktop viewport contract covering the supported minimum window
  size and the expected degrade path below it.
- A self-contained desktop distribution path: PyInstaller freezes the existing
  frontend/upload helper, bundles fbuild and esptool, isolates mutable user data,
  launch-smokes the result, and emits a portable platform archive.
- Contribution scaffolding for the beta: `CONTRIBUTING.md` plus GitHub issue
  forms for bug reports, hardware validation reports, and feature requests.
- An in-app **About** tab in Help (also reachable from View → About) showing
  the app version, maintainer, MIT license, and credits for Stefan Petrick /
  AnimARTrix, FastLED, Essentia, and the bundled open-source dependencies.
- A tagged/manual GitHub Actions workflow that builds, launch-smokes,
  checksums, and uploads portable desktop archives for Windows, Linux, macOS
  Apple Silicon, and macOS Intel/Rosetta, with optional draft pre-release
  assembly after every platform passes.

### Changed

- The public-beta support promise is now narrower and explicit: only recorded
  end-to-end validation rows are promoted from experimental status.
- Release/readiness references in `README.md`, `CLAUDE.md`, `docs/index.md`,
  and `todo.md` now point to the release docs as the source of truth.
- `README.md` now states the beta stability scope explicitly: breaking changes
  are expected between beta releases, file formats are not final, and saved
  work should be exported before upgrading.

### Removed

- Untracked leftover working-session screenshots from the repository root and
  `artifacts/`, and gitignored those paths.

### Fixed

- Allow the desktop packaging dependency set to resolve on Intel macOS by
  keeping `cryptography` below the upper bound required by `esptool 5.3.1`.
- Replace the unusable macOS executables in the upstream `fbuild 2.5.0` wheel
  with binaries compiled from its exact tagged source commit on each Mac
  architecture before freezing the desktop bundle.

## [0.1.0] - Initial pre-beta baseline

### Added

- Browser-based node-graph authoring for FastLED matrix patterns with live
  preview, code generation, hardware upload helpers, generative shows, and
  music-synced SD-show tooling.
