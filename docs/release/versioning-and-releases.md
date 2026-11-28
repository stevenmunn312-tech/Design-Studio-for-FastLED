# Versioning and Releases

Design Studio for FastLED uses semantic versioning. Releases below `1.0.0`
were public betas whose formats could change between versions; from `1.0.0`
the save format is a compatibility baseline (below).

## Development lines and the v1 baseline

`main` is the single development line, and the 1.0 releases are cut from it.
`v1.0.0` and `v1.0.1` were tagged on 2026-11-22 and `v1.0.2` on 2026-11-26,
all never published; `v1.0.3` (2026-11-28) replaces them ([root todo](../../todo.md)). On 2026-11-09 `main` was
pointed at the former `Hardware` breaking-development branch, which is now
retired; the last state of the 0.7 public-beta line is the `beta-final` tag.
`v0.8.0` (2026-11-16) is the first public release cut from `main`; it does not
migrate 0.7 saves.

**The v1 save format froze on 2026-11-21** and is the compatibility baseline.
From here a save written by v1.0.0 must open in every later version. Adding a
node type, port, property or optional field is free. Removing or renaming one,
or changing what a saved value means, needs a migration from format 1, a raised
`SAVE_FORMAT_VERSION` and a release note. The freeze covers the whole project
file:

- the graph: node type ids, port ids (edges and exposed inputs) and property
  keys, held by `src/state/__tests__/saveFormatBaseline.json`, which its test
  checks against `NODE_LIBRARY`;
- panels and screens: display documents, at `schemaVersion` 1. A document
  with another schema version is dropped on load, so a schema change also
  raises `SAVE_FORMAT_VERSION`;
- controls: the Control Deck (`performanceDeck`: pins and scenes), and the
  control nodes such as Control Map, which the graph baseline covers;
- pattern files and `#share=` links, which carry the same workspace shape.

Project and pattern files carry `formatVersion` (currently 1, from
`src/state/saveFormat.ts`). A file without it predates versions and reads as 1.
An app refuses a file with a higher number rather than dropping what it does
not know: Open Project File and pattern import say so, the Projects and
Patterns folders leave such files out of the list, and the helper will not
overwrite one with an older format's save. Raise the number only together with
a migration from the previous format.

### Pre-v1 cleanup record

- 2026-09-24: removed the show-time bindings for pattern group inputs named
  `bass`, `mids`, `treble`, `kick`, `snare`, `hihat`, `vocals`, `beat` and
  `silence`, which only older saved patterns carried. V1 group roles are
  `energy`, `speed` and `palette`; an undriven `energy` still follows the mean
  audio band in the preview and the show and player sketches.
- 2026-09-24: removed the always-empty `ElectricalPlan.supplyChecks` field
  kept for older saved profiles, and the hardware manifest's node-label path
  for matrix outputs. The plan is recomputed, never persisted, and every LED
  output is named by its `form` label.
- 2026-09-24: removed the untagged three-band `.show` audio trailer. Every
  baked envelope is the tagged `AENV` version-2 trailer with left/right levels,
  and the player reads nothing else. A saved song whose analysis or show
  predates stereo levels is analysed again on project load, discarding manual
  timeline edits to that show. The baked-audio SD player sketch compiled for
  `esp32:esp32:esp32` on arduino-cli (1,078,843 B flash, 44,808 B RAM).
- 2026-09-24: removed the recovery that reflowed any themed icon control as
  an unedited template after an older orientation bug. V1 screen designs
  reflow only when every widget still sits in its authored template bounds.
- 2026-09-24: removed scrubbing of the retired MicInput `sampleRate` field
  from saved personal defaults and node presets. V1 MicInput has no such field.
- 2026-09-24: removed display-label lookup for hardware part selections and
  the retired integer-scale handling around FFT smoothing. V1 part choices
  persist catalogue ids, and FFT smoothing is the node's direct 0-1 scalar.
- 2026-09-24: removed LED-output form migration and chipset inference. V1 LED
  outputs persist `form`; retired `chipset: 'HUB75'` and `layout: 'strip'`
  spellings are no longer rewritten or treated as physical-form declarations.
- 2026-09-24: removed missing-property backfills for AudioHue band weights,
  Circle/Clock Display matrix scaling, and Stereo VU count provenance. V1
  nodes persist those authored/default properties when the node is created.
- 2026-09-24: removed load-time hardware-pin migrations for RTC nodes without
  I2C pins, SD cards that stored only chip select, and the obsolete N16R8
  amplifier tuple. V1 hardware nodes persist their complete assigned wiring.
- 2026-09-24: removed `BuildProfile.physicalBoardProfileId` and the load-time
  migration that created a Board selection from it. The singleton `Board` node
  is the only persisted exact-board selection in the v1 workspace shape.
- 2026-09-24: removed the legacy `preview-diffusion` browser preference.
  Preview presentation now loads only the v1 `preview-style` key; an abandoned
  boolean no longer silently selects the Neon style.
- 2026-09-24: removed the retired Board `usePsram` and `usbCdcOnBoot`
  persistence fields. V1 saves store the three-state `psramPolicy` and
  `serialRoute` controls; the booleans are derived for generator/backend
  consumers and old boolean fields are stripped during graph normalization.
- 2026-09-24: removed the pre-Board controller fallback. Brightness, current
  limiting, PSRAM and serial policy now come only from the singleton `Board`;
  Board-absent generator callers receive safe defaults instead of interpreting
  stale LED-output properties as global policy.
- 2026-09-24: removed the obsolete `hardware` node category from the v1 type
  surface. Hardware-backed nodes use their current `input`, `show`, or `output`
  category; known saved nodes still receive that canonical library category on
  load.
- 2026-09-24: removed the load-time aliases that reinterpreted the retired
  `AnimatedImage` and `LedStringOutput` node types as `Image` and
  `MatrixOutput`. Neither retired type is part of the v1 format; an old or
  malformed workspace now keeps the unsupported type visible instead of
  silently changing its meaning.
- 2026-10-20: replaced the `AENV` version-2 trailer with version 3, which adds
  a block of FastLED's 16 equalizer bins per frame after the band and level
  bytes. A show's FFT bins now follow the song, where version 2 spread three
  bands across them. Song analyses gain a `spectrum` track; a saved song whose
  analysis or show predates it is analysed again on project load, discarding
  manual timeline edits to that show. The baked-spectrum SD player sketch
  compiled for `esp32:esp32:esp32s3` on arduino-cli (1,162,643 B flash,
  49,164 B RAM).
- 2026-11-10: renamed the audio-reactive patterns' `energy` property and input
  port to `reactivity`, with no migration, so a wire from Audio Features'
  Energy (or Loudness) into it is a deliberate choice rather than a matching
  name. The group-input role the show engines feed by name followed: V1
  roles are `reactivity`, `speed` and `palette`, and an undriven
  `reactivity` follows the mean audio band. A saved pattern that still says
  `energy` keeps its slider value only as an unread property and loses its
  wire. The show file's `SET_ENERGY` command keeps its name: it carries the
  song section's energy, which now drives the `reactivity` role. Bundled
  patterns, the promoted saved graphs and the Help examples were converted.
- 2026-11-10: remapped Speed on fourteen audio patterns (Bass Rings through
  Hi-Hat Shards) so the internal rate is twice the slider: the old default of
  1 is now 0.5, and 1 runs twice as fast. With no migration, a saved pattern
  that is not converted plays twice as fast. Bundled patterns, the promoted
  saved graphs, shelf seeds and Help examples were converted (saved values
  halved, wired ranges halved or a Math ×0.5 added), and render the same
  frames as before.
- 2026-11-17: removed File → Import Graph JSON and Export Graph JSON. A bare
  workspace file is no longer a save shape: Open Project File reads only the
  project format, which Save Project File As writes. Project and pattern files
  gained `formatVersion: 1`.
- 2026-11-21: deleted the round-eight alias table (`src/state/preV1Aliases.ts`)
  that let saves from before 2026-11-19 open with the nine old type ids
  (`Clock`, `Temperature`, `FieldWarp`, `CustomFormula`, `PrismStorm`,
  `Sequencer`, `Ripple`, `Symmetry`, `TransitionSet`) and the renamed ports and
  properties. A save that still uses them now opens with those nodes unknown.
  Also dropped the fold-in of the first trust store
  (`trusted-pattern-content.v1`, replaced 2026-09-26), so content trusted only
  there is asked about once more. Kept on purpose: the Amplifier's
  `MAX98357A` model value (the node's current default), bench layout ids such
  as `microwave-motion` (current ids, not aliases), and the whole-show freeze
  for a music entry edited before show locks (2026-10-19), which lives in the
  music library rather than in a save file.

## Version scheme

- `MAJOR` (`1.0.0` and beyond): intentionally breaking release-line changes or
  a stable support-policy reset.
- `MINOR` (`x.y.0`): new features, meaningful workflow changes, or new
  supported rows.
- `PATCH` (`x.y.z`): fixes, tests, docs, dependency refreshes, or release
  packaging changes that do not intentionally change the main workflow.

## Tag format

- Git tags should use a `v` prefix: `v0.1.0`, `v0.1.1`, `v0.2.0`, etc.
- The tag should point at the exact commit that matches the release notes and
  packaged artifacts.

## Release checklist

1. Update `README.md` and `CHANGELOG.md`; remove shipped items from the
   active-only `todo.md`. Keep `CLAUDE.md` limited to durable agent guidance.
2. Update `package.json`'s version field.
3. Review `docs/release/beta-support-matrix.md` and
   `docs/release/supported-platform-policy.md` so the support promise matches
   the actual validation evidence.
4. Review `THIRD_PARTY_NOTICES.md` for new bundled assets or dependency
   changes.
5. Run the normal verification gates appropriate to the release scope.
6. Build each advertised desktop archive on its target OS with
   `npm run package:desktop`; record checksums and repeat the launch smoke on a
   clean account/machine.
7. Sign/notarize platform executables before describing them as supported.
8. Commit the version bump and changelog update.
9. Create an annotated tag using the `vX.Y.Z` format.
10. Push the commit and tag together.

## First public beta guidance

- `0.1.0` is the pre-beta baseline already recorded in `CHANGELOG.md`; the
  first public-beta tag is `v0.2.0`, matching the `0.2.0` changelog entry.
- Do not cut a public beta tag while the support matrix still depends on
  undocumented validation assumptions.
