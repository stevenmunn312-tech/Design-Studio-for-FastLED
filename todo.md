# v1.0.0 release steps

Only the steps that release v1, in the order they are done. Tick a step when
its outcome is recorded where it belongs, and remove a section once every step
in it is ticked. Item ids (HW-17, HW-18) are unchanged, so links to "root todo,
HW-nn" still name the same work.

Everything else moved out on 2026-11-12:

- **Bench and community testing** is in the
  [bench backlog](docs/plans/bench-backlog.md). It runs in parallel and holds up
  nothing here; step 4 (HW-18) uses whatever evidence is on record when it is reached.
- **Work deferred until after v1** is in the
  [post-v1 list](docs/plans/post-v1.md).
- **Completed items** are in the
  [archive](docs/archive/todo-completed-to-2026-11-12.md), and the history
  before 2026-09-24 in the
  [earlier archive](docs/archive/hardware-todo-to-2026-09-24.md).

## 1. Close the save format to new shapes

- [ ] Land or drop every remaining merge, rename and removed property. None is
  open on 2026-11-12. From here a saved shape changes only to remove a pre-1.0
  leftover, until step 4 (HW-18) freezes the format.
- [x] Give project and pattern files a format version before the freeze.
  Done 2026-11-17: `formatVersion: 1` from `src/state/saveFormat.ts`; newer
  files are refused on open and import, left out of the folder listings, and
  never overwritten by the helper. Graph JSON import and export were removed,
  so the project file is the one workspace shape
  ([versioning](docs/release/versioning-and-releases.md#development-lines-and-the-v1-baseline)).

## 2. Freeze the code and run the full compile matrix

No full matrix runs before this step, because every sketch keeps changing.
The fbuild pin is settled on 2.5.52 (decided 2026-11-20), and the
distribution work in step 3 changes no generated firmware, so the freeze
comes before it (reordered 2026-11-20).

- [x] Declare the freeze: generated firmware stops changing. Declared
  2026-11-20 on fbuild 2.5.52. A later change to generated firmware reruns
  the legs it touches.
- [x] Read the current plan with
  `python scripts/compile-fixtures/compile-matrix.py --engine all --list`. On
  2026-11-20 it is 265 builds of 1,227 candidates, 170 on Arduino CLI and 95
  on fbuild, picked so each board builds every library, configuration and
  FastLED, core or library name the fixtures use at least once.
- [ ] Run the `Compile matrix` GitHub workflow on the frozen commit, both
  engines (20 Windows runners).
- [ ] Fix each failure and rerun only its leg, or record it as a limitation
  for step 4 (HW-18). Known on the last full run: the Nano ESP32 fails on an fbuild
  board-flag bug
  ([FastLED/fbuild#1760](https://github.com/FastLED/fbuild/issues/1760)).
- [ ] Record the run in the
  [fbuild runbook](docs/runbooks/fbuild-workarounds.md) and the compile
  reports.

## 3. HW-17 · Distribution smoke tests

Exit: per-platform launch and install, helper discovery, permissions, offline
and recovery evidence
([desktop distribution](docs/release/desktop-distribution.md#signing-and-publishing)).

- [x] Relaunch the offline PWA from a clean browser profile. Passes in
  Chromium, 2026-11-14.
- [ ] Sign the Windows launcher and bundled executables with Authenticode, or
  publish through the [Microsoft Store](docs/release/microsoft-store.md) MSIX,
  which the Store signs.
- [ ] Run the Windows package on a clean account or machine, through launch
  and an upload.
- [x] Reconcile the fbuild 2.5.4 tools the macOS bundle substitutes with the
  pinned Python dependency
  ([package workflow](docs/release/desktop-distribution.md#github-package-workflow)).
  The 2.5.51 wheel's tools run on both Mac runners; the bundle carries them.
- [x] Give the macOS package its application layout. Done 2026-11-18: a
  `Design Studio for FastLED.app` bundle with a small window that keeps the
  Studio running, sealed ad hoc and zipped with `ditto`
  ([macOS app](docs/release/desktop-distribution.md#macos-app)).
- [ ] Sign the macOS app with a Developer ID and the hardened runtime, then
  notarize and staple it. Needs an Apple Developer Program membership.
- [ ] Run the macOS package on a clean machine, Apple Silicon and Intel.
- [ ] Run the Linux package on a clean machine.
- [x] Record a checksum and a provenance record for every archive. The
  package workflow writes a SHA-256 file and a GitHub attestation for each.

## 4. HW-18 · v1 scope and format baseline

The pre-1.0 compatibility sweep is done
([cleanup record](docs/release/versioning-and-releases.md#pre-v1-cleanup-record)).

- [ ] Remove any pre-1.0 leftover found since the sweep, the same way,
  without a migration.
- [ ] Delete `src/state/preV1Aliases.ts`, its test and its call sites (grep
  `preV1Aliases`) in that same leftover sweep. It is the one place the nine
  renamed type ids and round eight's port and property renames are named; after
  the freeze an old save needs a real migration, not this table.
- [ ] Choose the supported combinations from the evidence on record in the
  [bench backlog](docs/plans/bench-backlog.md) and the reports, and update the
  [support matrix](docs/release/beta-support-matrix.md). Everything else stays
  experimental.
- [ ] Reconcile the release copy with that scope.
- [ ] Freeze the panel, document and control save format. It becomes the
  compatibility baseline.
- [ ] Record the limitations and deferments, including the boards fbuild
  2.5.52 cannot build, which stay on arduino-cli: the UNO R4 Minima (§18) and
  the XIAO nRF52840
  ([runbook](docs/runbooks/fbuild-workarounds.md#probes)).
- [ ] Repeat the
  [keyboard and screen-reader smoke test](docs/release/accessibility-smoke-test.md)
  on the candidate build; the recorded pass (2026-07-26) predates the
  workspace tabs and shelves.

## 5. Release

The [release checklist](docs/release/versioning-and-releases.md#release-checklist)
is the authority; these are its steps.

- [ ] Update `README.md` and `CHANGELOG.md`, and empty this file.
- [x] Set the version in `package.json` to `1.0.0`. Done 2026-11-20, ahead of
  the release, so the first Microsoft Store package is 1.0.0.0.
- [ ] Review the support matrix and the
  [supported platform policy](docs/release/supported-platform-policy.md)
  against the validation evidence.
- [ ] Review `THIRD_PARTY_NOTICES.md` for new bundled assets and dependency
  changes.
- [ ] Run the verification gates: lint, tests and `tsc -b`, and the backend
  tests.
- [ ] Build each advertised desktop archive on its target OS with
  `npm run package:desktop`, record its checksum, and repeat the launch smoke
  on a clean account or machine.
- [ ] Sign and notarize the platform executables.
- [ ] Commit the version bump and changelog.
- [ ] Create the annotated tag `v1.0.0` on that commit.
- [ ] Push the commit and the tag together.
