# Versioning and Releases

Design Studio for FastLED is pre-1.0 and uses semantic versioning with the usual
pre-release caution: while the project remains below `1.0.0`, compatibility can
still move quickly.

## Development lines and the v1 baseline

`main` is the frozen public-beta line; change it only for an explicitly requested
beta hotfix. `Hardware` is authoritative breaking development toward LTS v1.0.0.
Never merge the two lines in either direction. Before v1 ships, Hardware does
not require pre-1.0 save compatibility or migrations. The released v1 format
becomes the new compatibility baseline. [Root todo HW-18](../../todo.md) tracks
the format/support freeze after the control and display workflow stabilizes.

### Pre-v1 cleanup record

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

## Version scheme

- `MAJOR` (`1.0.0` and beyond): intentionally breaking release-line changes or
  a stable support-policy reset.
- `MINOR` (`0.y.0` while pre-1.0): new features, meaningful workflow changes,
  or new supported beta rows.
- `PATCH` (`0.y.z`): fixes, tests, docs, dependency refreshes, or release
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
