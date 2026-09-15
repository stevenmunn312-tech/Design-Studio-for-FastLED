# Property input catalogue

Auto-generated inventory for the Step 1 audit of
[direct-controls-and-output-status.md](direct-controls-and-output-status.md).
174 nodes, every input classified as **main** (always visible) or **optional**
(hideable, exposable on demand), plus action inputs.

Status: draft — classification proposed; `NODE_LIBRARY` declarations are
landing in slices.

Implementation status:

- Landed: Text, ClockDisplay, Circle, Line, Shape, Path, Noise, Fire,
  Fire2012, Plasma, Rainbow, Pride2015, Pacifica, TwinkleFox, Scanner,
  Confetti, Juggle, SpectrumBars, Blur2D, Blend, the simple frame-composite
  nodes through Array, audio-reactive tuning controls through PrismStorm,
  RadialBurst through Particles, Mirror/Trails/FrameFeedback, GradientFrame,
  FractalNoise through GameOfLife, Transition, PlayerParticles, PatternMaster,
  PatternSlideshow, CustomFormula, TransportDisplay and MatrixOutput.
- Deferred: optional inputs whose nodes do not yet have matching
  `defaultProperties` fallbacks, such as ClockDisplay's external time fields,
  `Fire.intensity`, trigger inputs and the individual audio feature bands.
  Add the fallback intentionally before exposing those ports.

## Classification rules

- **Main** — carries the primary substance the node operates on: `frame`,
  `display`, `audio`, `field`, `color`, `palette`, `patternset`,
  `transitionset`, `music`, `image`, `dmx`, `datetime`, `playercontrols`,
  `controls`, `base` (compositing base layer).
- **Optional** — tuning parameter that modifies how the node operates: `speed`,
  `scale`, `count`, `fade`, `amount`, `decay`, `rate`, `intensity`, `cooling`,
  `sparking`, `x`/`y`/`cx`/`cy`/`radius`/`thickness`/`size`/`aspect`,
  `angle`/`rotation`/`phase`/`frequency`/`amplitude`, audio bands
  (`bass`/`mids`/`treble`/`kick`/`snare`/`hihat`/`vocals`/`energy`),
  `feed`/`kill`, `separation`/`alignment`/`cohesion`/`visualRange`,
  `offsetX`/`offsetY`, `brightness`/`contrast`/`saturation`/`hueShift`/`zoom`,
  `t`/`value`/`a`/`b`/`min`/`max`/`inMin`/`inMax`/`outMin`/`outMax`,
  `enabled`/`run`/`reset`/`trigger`/`gate`/`sel`, `scroll`/`durationSec`,
  `positionX`/`positionY`/`cropX`/`cropY`/`playbackRate`, `strength`/`spin`,
  `tilesX`/`tilesY`, `damping`/`impulse`, `s`/`v`, `shift`/`hue`/`sat`/`val`,
  `kelvin`/`heat`, `response`, `orientation`/`repeat`, `arms`/`segments`,
  `vertical`, `letterSpacing`/`padWidth`/`maxIntegerDigits`/`decimals`.
- **Action** — momentary trigger/toggle: `ledToggle`, `brightnessUp`,
  `brightnessDown`.
- **Rebuild-only** — pin assignments, hardware models, memory allocation,
  chipset/color-order — these are properties, not inputs, and are never
  exposable as sockets.

## Nodes with no inputs (excluded)

Audio, Storage, MicInput, LineInput, MusicLibrary, Interval, TimeNode,
Random, TextValue, BeatSin, PaletteSelector, ButtonInput, TouchInput,
MotionInput, LightInput, PotInput, EncoderInput, DMXInput, MidiInput,
SDCard, Amplifier, Comment, Board, ControlMap, TransitionSet, FormulaField,
RTCInput — these have outputs only or are pure configuration nodes.

---

## Pattern nodes (60 nodes)

### SolidColor
- `color` (color) — **main**

### Text
- `color` (color) — **main**
- `x` (float) — optional
- `y` (float) — optional
- `scroll` (float) — optional

### ClockDisplay
- `dateTime` (datetime) — **main**
- `base` (frame) — **main**
- `color` (color) — **main**
- `secondsOfDay` (float) — optional
- `valid` (bool) — optional
- `day` (float) — optional
- `month` (float) — optional
- `run` (bool) — optional
- `reset` (bool) — optional
- `durationSec` (float) — optional
- `x` (float) — optional
- `y` (float) — optional
- `radius` (float) — optional

### Circle
- `base` (frame) — **main**
- `fill` (color) — **main**
- `edge` (color) — **main**
- `cx` (float) — optional
- `cy` (float) — optional
- `radius` (float) — optional
- `thickness` (float) — optional

### Line
- `base` (frame) — **main**
- `color` (color) — **main**
- `x1` (float) — optional
- `y1` (float) — optional
- `x2` (float) — optional
- `y2` (float) — optional

### Shape
- `base` (frame) — **main**
- `fill` (color) — **main**
- `edge` (color) — **main**
- `cx` (float) — optional
- `cy` (float) — optional
- `size` (float) — optional
- `aspect` (float) — optional
- `sides` (float) — optional
- `rotation` (float) — optional
- `thickness` (float) — optional

### Path
- `base` (frame) — **main**
- `color` (color) — **main**
- `t` (float) — optional
- `scale` (float) — optional
- `thickness` (float) — optional

### Wireframe3D
- `base` (frame) — **main**
- `color` (color) — **main**

### Noise
- `speed` (float) — optional
- `scale` (float) — optional
- `paletteIn` (palette) — **main**

### Fire
- `intensity` (float) — optional
- `cooling` (float) — optional
- `sparking` (float) — optional
- `paletteIn` (palette) — **main**

### Fire2012
- `cooling` (float) — optional
- `sparking` (float) — optional
- `paletteIn` (palette) — **main**

### Plasma
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### Rainbow
- `speed` (float) — optional

### Pride2015
- `speed` (float) — optional
- `scale` (float) — optional

### Pacifica
- `speed` (float) — optional
- `scale` (float) — optional
- `paletteIn` (palette) — **main**

### TwinkleFox
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### Scanner
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### Confetti
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### Juggle _(already classified)_
- `speed` (float) — optional (propertyInputs)
- `paletteIn` (palette) — optional (propertyInputs)
- `count` (float) — optional (propertyInputs)
- `fade` (float) — optional (propertyInputs)

### SpectrumBars
- `bass` (float) — optional
- `mids` (float) — optional
- `treble` (float) — optional
- `energy` (float) — optional
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### SpectrumVisualizer
- `audio` (audio) — **main**
- `paletteIn` (palette) — **main**

### BassPulse
- `bass` (float) — optional
- `paletteIn` (palette) — **main**

### BassRings
- `bass` (float) — optional
- `energy` (float) — optional
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### MidrangeWaves
- `mids` (float) — optional
- `energy` (float) — optional
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### MidrangeBloom
- `mids` (float) — optional
- `energy` (float) — optional
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### TrebleSparks
- `treble` (float) — optional
- `density` (float) — optional
- `paletteIn` (palette) — **main**

### TreblePrism
- `treble` (float) — optional
- `energy` (float) — optional
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### AudioCascade
- `bass` (float) — optional
- `mids` (float) — optional
- `treble` (float) — optional
- `energy` (float) — optional
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### BeatFlash
- `beat` (bool) — optional
- `frame` (frame) — **main**
- `attack` (float) — optional
- `decay` (float) — optional
- `intensity` (float) — optional
- `paletteIn` (palette) — **main**

### KickShock
- `kick` (float) — optional
- `snare` (float) — optional
- `hihat` (float) — optional
- `energy` (float) — optional
- `speed` (float) — optional
- `tiles` (float) — optional
- `paletteIn` (palette) — **main**

### VocalAurora
- `vocals` (float) — optional
- `energy` (float) — optional
- `silence` (bool) — optional
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### BeatKaleidoscope
- `beat` (bool) — optional
- `hue` (float) — optional
- `energy` (float) — optional
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### SpectraMosaic
- `bass` (float) — optional
- `mids` (float) — optional
- `treble` (float) — optional
- `energy` (float) — optional
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### PercussionBlobs
- `kick` (float) — optional
- `snare` (float) — optional
- `hihat` (float) — optional
- `paletteIn` (palette) — **main**

### EmberPulse
- `bass` (float) — optional
- `mids` (float) — optional
- `treble` (float) — optional
- `beat` (bool) — optional
- `energy` (float) — optional
- `speed` (float) — optional

### TurbulentBloom
- `bass` (float) — optional
- `mids` (float) — optional
- `treble` (float) — optional
- `energy` (float) — optional
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### GravityWell
- `bass` (float) — optional
- `energy` (float) — optional
- `speed` (float) — optional
- `color` (color) — **main**

### RainRipples
- `trigger` (bool) — optional
- `energy` (float) — optional
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### PrismStorm
- `treble` (float) — optional
- `mids` (float) — optional
- `hihat` (float) — optional
- `energy` (float) — optional
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### RadialBurst
- `speed` (float) — optional
- `arms` (float) — optional
- `paletteIn` (palette) — **main**

### Spiral
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### Kaleidoscope
- `frame` (frame) — **main**
- `segments` (float) — optional

### Particles
- `rate` (float) — optional
- `decay` (float) — optional
- `paletteIn` (palette) — **main**

### FormulaPoints
- `paletteIn` (palette) — **main**

### GradientFrame
- `colorA` (color) — **main**
- `colorB` (color) — **main**
- `vertical` (bool) — optional

### FractalNoise
- `speed` (float) — optional
- `scale` (float) — optional
- `paletteIn` (palette) — **main**

### GaborNoise
- `speed` (float) — optional
- `scale` (float) — optional
- `frequency` (float) — optional
- `orientation` (float) — optional
- `paletteIn` (palette) — **main**

### PaletteGradient
- `angle` (float) — optional
- `repeat` (float) — optional
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### Image
- `positionX` (float) — optional
- `positionY` (float) — optional
- `rotation` (float) — optional
- `brightness` (float) — optional
- `zoom` (float) — optional
- `cropX` (float) — optional
- `cropY` (float) — optional
- `saturation` (float) — optional
- `contrast` (float) — optional
- `hueShift` (float) — optional
- `playbackRate` (float) — optional

### Blobs
- `speed` (float) — optional
- `scale` (float) — optional
- `count` (float) — optional
- `paletteIn` (palette) — **main**

### FlowField
- `speed` (float) — optional
- `scale` (float) — optional
- `count` (float) — optional
- `fade` (float) — optional
- `paletteIn` (palette) — **main**

### Starfield
- `paletteIn` (palette) — **main**
- `speed` (float) — optional
- `count` (float) — optional

### Boids
- `color` (color) — **main**
- `paletteIn` (palette) — **main**
- `speed` (float) — optional
- `count` (float) — optional
- `separation` (float) — optional
- `alignment` (float) — optional
- `cohesion` (float) — optional
- `visualRange` (float) — optional

### AudioFlow
- `bass` (float) — optional
- `mids` (float) — optional
- `treble` (float) — optional
- `speed` (float) — optional
- `scale` (float) — optional
- `paletteIn` (palette) — **main**

### ColorTrails
- `bass` (float) — optional
- `mids` (float) — optional
- `treble` (float) — optional
- `beat` (bool) — optional
- `paletteIn` (palette) — **main**

### Animartrix
- `bass` (float) — optional
- `mids` (float) — optional
- `treble` (float) — optional
- `kick` (float) — optional
- `snare` (float) — optional
- `hihat` (float) — optional
- `beat` (bool) — optional
- `speed` (float) — optional

### ReactionDiffusion
- `feed` (float) — optional
- `kill` (float) — optional
- `speed` (float) — optional
- `paletteIn` (palette) — **main**

### GameOfLife
- `paletteIn` (palette) — **main**
- `speed` (float) — optional
- `fade` (float) — optional

### CustomFormula
- `a` (float) — optional
- `b` (float) — optional
- `paletteIn` (palette) — **main**

### Code
- `frame` (frame) — **main**

---

## Composite nodes (17 nodes)

### Blur2D
- `frame` (frame) — **main**
- `amount` (float) — optional

### Blend _(already classified)_
- `a` (frame) — **main**
- `b` (frame) — **main**
- `amount` (float) — optional (propertyInputs)

### Mask
- `frame` (frame) — **main**
- `mask` (frame) — **main**

### BrightnessMod
- `frame` (frame) — **main**
- `brightness` (float) — optional

### Fade
- `frame` (frame) — **main**
- `fade` (float) — optional

### HueShift
- `frame` (frame) — **main**
- `shift` (float) — optional

### Gamma
- `frame` (frame) — **main**
- `gamma` (float) — optional

### Saturation
- `frame` (frame) — **main**
- `amount` (float) — optional

### ColorBoost
- `frame` (frame) — **main**
- `boost` (float) — optional

### Transform
- `frame` (frame) — **main**
- `rate` (float) — optional
- `angle` (float) — optional

### Array
- `frame` (frame) — **main**
- `count` (float) — optional
- `offsetX` (float) — optional
- `offsetY` (float) — optional
- `angle` (float) — optional
- `scale` (float) — optional
- `falloff` (float) — optional

### Invert
- `frame` (frame) — **main**

### Mirror
- `frame` (frame) — **main**
- `color` (color) — **main**
- `glowAmount` (float) — optional

### Trails
- `frame` (frame) — **main**
- `decay` (float) — optional

### FrameFeedback
- `frame` (frame) — **main**
- `amount` (float) — optional
- `fade` (float) — optional
- `offsetX` (float) — optional
- `offsetY` (float) — optional
- `angle` (float) — optional
- `scale` (float) — optional

### FrameSwitch
- `a` (frame) — **main**
- `b` (frame) — **main**
- `sel` (bool) — optional

### Zones
- `base` (frame) — **main**
- `a` (frame) — **main**
- `b` (frame) — **main**
- `c` (frame) — **main**
- `d` (frame) — **main**

---

## Color nodes (15 nodes)

### GradientSampler
- `t` (float) — optional
- `colorA` (color) — **main**
- `colorB` (color) — **main**

### PaletteSampler
- `paletteIn` (palette) — **main**
- `t` (float) — optional

### PaletteSweep
- `paletteIn` (palette) — **main**
- `rate` (float) — optional

### HueCycle
- `rate` (float) — optional
- `s` (float) — optional
- `v` (float) — optional

### HSVToRGB
- `h` (float) — optional
- `s` (float) — optional
- `v` (float) — optional

### RGBToHSV
- `rgb` (color) — **main**

### Temperature
- `kelvin` (float) — optional

### HeatColor
- `heat` (float) — optional

### BlendColors
- `a` (color) — **main**
- `b` (color) — **main**
- `t` (float) — optional

### CHSV
- `hue` (float) — optional
- `sat` (float) — optional
- `val` (float) — optional

### CustomPalette
- `color0` (color) — **main**
- `color1` (color) — **main**
- `color2` (color) — **main**
- `color3` (color) — **main**

### PaletteFromImage
- `image` (image) — **main**

### Poline
- `colorA` (color) — **main**
- `colorB` (color) — **main**
- `colorC` (color) — **main**

### PaletteBlend
- `paletteA` (palette) — **main**
- `paletteB` (palette) — **main**
- `amount` (float) — optional

---

## Math nodes (18 nodes)

### Math
- `a` (float) — optional
- `b` (float) — optional

### Clamp
- `value` (float) — optional
- `min` (float) — optional
- `max` (float) — optional

### MapRange
- `value` (float) — optional
- `inMin` (float) — optional
- `inMax` (float) — optional
- `outMin` (float) — optional
- `outMax` (float) — optional

### Lerp
- `a` (float) — optional
- `b` (float) — optional
- `t` (float) — optional

### Ease
- `t` (float) — optional

### Abs
- `x` (float) — optional

### Mod
- `x` (float) — optional
- `m` (float) — optional

### Gate
- `value` (float) — optional
- `gate` (bool) — optional

### Smooth
- `value` (float) — optional

### SampleHold
- `value` (float) — optional
- `trigger` (bool) — optional

### Switch
- `a` (float) — optional
- `b` (float) — optional
- `sel` (bool) — optional

### Not
- `x` (bool) — optional

### Compare
- `a` (float) — optional
- `b` (float) — optional

### Trigger
- `trigger` (bool) — optional

### FormatNumber
- `value` (float) — optional

### FormatDateTime
- `dateTime` (datetime) — **main**

### XYMapper
- `x` (float) — optional
- `y` (float) — optional

---

## Signal nodes (13 nodes)

### Sin / Cos
- `x` (float) — optional

### Wave
- `amplitude` (float) — optional
- `frequency` (float) — optional
- `phase` (float) — optional

### ComplexWave
- `a` (float) — optional
- `b` (float) — optional

### Envelope
- `trigger` (bool) — optional

### Counter
- `rate` (float) — optional

### ScheduleTrigger
- `valid` (bool) — optional
- `synced` (bool) — optional
- `secondsOfDay` (float) — optional
- `weekday` (float) — optional
- `day` (float) — optional
- `month` (float) — optional
- `year` (float) — optional
- `enable` (bool) — optional

### Clock
- `tap` (bool) — optional
- `sync` (bool) — optional
- `reset` (bool) — optional

### DMXChannel
- `dmx` (dmx) — **main**

---

## Field nodes (11 nodes)

### FieldFormula
- `a` (float) — optional
- `b` (float) — optional
- `fieldIn` (field) — **main**

### FieldNoise
- `speed` (float) — optional
- `scale` (float) — optional

### WaveSim
- `trigger` (bool) — optional
- `speed` (float) — optional
- `damping` (float) — optional
- `impulse` (float) — optional

### FieldToFrame
- `field` (field) — **main**
- `paletteIn` (palette) — **main**
- `brightness` (float) — optional

### DistanceField
- `px` (float) — optional
- `py` (float) — optional
- `scale` (float) — optional

### FrameToField
- `frame` (frame) — **main**

### FieldMath
- `a` (field) — **main**
- `b` (field) — **main**

### FieldWarp
- `field` (field) — **main**
- `dx` (field) — **main**
- `dy` (field) — **main**
- `strength` (float) — optional

### FieldRotate
- `field` (field) — **main**
- `angle` (float) — optional
- `spin` (float) — optional

### FieldTile
- `field` (field) — **main**
- `tilesX` (float) — optional
- `tilesY` (float) — optional

---

## Show nodes (12 nodes)

### Transition
- `a` (frame) — **main**
- `b` (frame) — **main**
- `t` (float) — optional

### PlayerParticles
- `enabled` (bool) — optional
- `color` (color) — **main**
- `intensity` (float) — optional
- `randomStyle` (bool) — optional
- `randomColor` (bool) — optional

### PatternMaster (Music Player)
- `audio` (audio) — **main**
- `controls` (playercontrols) — **main**
- `patternset` (patternset) — **main**
- `transitions` (transitionset) — **main**
- `particleFx` (playerparticles) — **main**
- `beat` (bool) — optional
- `minTime` (float) — optional
- `maxTime` (float) — optional
- `transitionSec` (float) — optional

### SongInfo
- `display` (display) — **main**

### Sequencer
- `p0` (frame) — **main**
- `p1` (frame) — **main**
- `p2` (frame) — **main**
- `p3` (frame) — **main**

### PatternCollection
- `pattern` (frame) — **main**

### PatternSlideshow
- `audio` (audio) — **main**
- `controls` (playercontrols) — **main**
- `patternset` (patternset) — **main**
- `transitions` (transitionset) — **main**
- `interval` (float) — optional

### PerformanceGenerator
- `music` (music) — **main**
- `patternset` (patternset) — **main**
- `transitions` (transitionset) — **main**
- `controls` (playercontrols) — **main**

---

## Audio nodes (5 nodes)

### FFTAnalyzer / BeatDetect / PercussionDetect / AudioFeatures
- `audio` (audio) — **main**

### AudioHue
- `bass` (float) — optional
- `mids` (float) — optional
- `treble` (float) — optional

---

## Output nodes (8 nodes)

### MatrixOutput _(already classified)_
- `frame` (frame) — **main**
- `enabled` (bool) — optional (propertyInputs)
- `brightness` (float) — optional (propertyInputs)
- `controls` (playercontrols) — **main**
- `ledToggle` (bool) — **action** (actionInputs)
- `brightnessUp` (bool) — **action** (actionInputs)
- `brightnessDown` (bool) — **action** (actionInputs)

### StereoVuMeter
- `audio` (audio) — **main**
- `paletteIn` (palette) — **main**

### InfoDisplay _(already classified)_
- `display` (display) — **main**
- `enabled` (bool) — optional (propertyInputs, default exposed)

### TransportDisplay _(already classified)_
- `display` (display) — **main**
- `enabled` (bool) — optional (propertyInputs, default exposed)

### MasterSpeed
- `speed` (float) — optional
- `controls` (playercontrols) — **main**

### SegmentDisplay _(already classified)_
- `display` (display) — **main**
- `enabled` (bool) — optional (propertyInputs, default exposed)

---

## Input nodes (14 nodes)

### ButtonBank
- `add-button` (bool) — special (trailing socket for dynamic port minting)

---

## Summary counts

| Category | Nodes | Main inputs | Optional inputs | Action inputs |
|----------|-------|-------------|-----------------|---------------|
| pattern  | 60    | ~110        | ~210            | 0             |
| composite| 17    | 27          | 23              | 0             |
| color    | 15    | 22          | 21              | 0             |
| math     | 18    | 2           | 37              | 0             |
| signal   | 13    | 1           | 26              | 0             |
| field    | 11    | 14          | 15              | 0             |
| show     | 12    | 22          | 12              | 0             |
| audio    | 5     | 4           | 3               | 0             |
| output   | 8     | 10          | 6               | 3             |
| input    | 14    | 0           | 0               | 0             |
| note     | 1     | 0           | 0               | 0             |
| **Total**| **174**| **~212**    | **~353**        | **3**         |

---

## Resolved decisions

### Math/signal/color nodes: keep all inputs visible

These categories have no "main data" ports to distinguish from tuning
parameters — every input is the node's substance. Making any start hidden
would render nodes blank or incomplete. No `propertyInputs` declarations
needed.

### Nodes with only optional inputs: keep all visible

`Sin`, `Cos`, `Abs`, `Ease`, `Smooth`, `Not`, `Compare`, `Trigger`,
`Counter`, `Envelope`, `Wave`, `MapRange`, `Lerp`, `Clamp`, `Gate`,
`SampleHold`, `Switch`, `Mod`, `XYMapper`, `FormatNumber`, `FormatDateTime`,
`ScheduleTrigger`, `Clock`, `Counter`, `BeatSin`, `Interval`, `TimeNode`,
`Random`, `TextValue` — all inputs stay visible by default.

### Pattern/composite nodes with mixed inputs: classify

These are the nodes that benefit from the main-vs-optional split. Each has
clear primary data ports (`frame`, `base`, `color`, `palette`) and clear
tuning parameters (`speed`, `count`, `fade`, `x`, `y`, etc.).

### Display nodes: Enabled stays default-visible

`InfoDisplay`, `TransportDisplay`, `SegmentDisplay` already declare
`propertyInputs: { enabled: 'enabled' }` with `defaultExposedInputs:
['enabled']`. Keep this — a panel's on/off state is important to see.

### MasterSpeed: speed stays visible

`MasterSpeed` has only `speed` and `controls`. Both are its substance. No
`propertyInputs` needed.

---

## Implementation plan

The catalogue above defines which nodes get `propertyInputs` declarations.
The implementation order is:

1. **Pattern nodes with mixed inputs** — fallback-backed declarations are
   landed for the current pattern set. Ports driven only by external live
   values (`bass`, `mids`, `treble`, `beat`, `trigger`, etc.) remain visible
   or deferred until they have an intentional fallback property.
2. **Composite nodes with mixed inputs** — fallback-backed declarations are
   landed. `FrameSwitch.sel` remains deferred because the node has no saved
   manual fallback property yet.
3. **Show nodes** — fallback-backed timing and particle declarations are
   landed. `PatternMaster.beat` remains deferred for the same live-input
   fallback reason.
4. **Verification** — every declared `propertyInputs` port must be verified
   that both evaluator and all generators read the property through it.
   The invariant test now asserts every declaration has a matching
   `defaultProperties` key and declared input port.
5. **Tests** — add targeted regression expectations as needed for future
   node families; the shared invariant coverage is in
   `src/state/__tests__/propertyInputs.test.ts`.

The math/signal/color/field/audio categories need no changes — all inputs
stay visible as today.
