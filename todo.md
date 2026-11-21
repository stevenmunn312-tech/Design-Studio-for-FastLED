# v1.0.0 release steps

Only the steps that release v1, in the order they are done. Tick a step when
its outcome is recorded where it belongs, and remove a section once every step
in it is ticked. Item ids (HW-17, HW-18) are unchanged, so links to "root todo,
HW-nn" still name the same work.

Everything else moved out on 2026-11-12:

- **Bench and community testing** is in the
  [bench backlog](docs/plans/bench-backlog.md). It runs in parallel and holds up
  nothing here; HW-18 set the v1 scope from the evidence on record on
  2026-11-21 ([support matrix](docs/release/beta-support-matrix.md)).
- **Work deferred until after v1** is in the
  [post-v1 list](docs/plans/post-v1.md).
- **The code freeze** was declared on 2026-11-20 on fbuild 2.5.52, and the
  full compile matrix passed on it (264 legs; runbook,
  [code-freeze run](docs/runbooks/fbuild-workarounds.md#code-freeze-run-on-fbuild-2552-20-november-2026)).
  A later change to generated firmware or a board mapping reruns the legs it
  touches.
- **Completed items** are in the
  [archive](docs/archive/todo-completed-to-2026-11-12.md), and the history
  before 2026-09-24 in the
  [earlier archive](docs/archive/hardware-todo-to-2026-09-24.md).

## 2. HW-17 · Distribution smoke tests

Exit: per-platform launch and install, helper discovery, permissions, offline
and recovery evidence
([desktop distribution](docs/release/desktop-distribution.md#signing-and-publishing)).

- [x] Relaunch the offline PWA from a clean browser profile. Passes in
  Chromium, 2026-11-14.
- [ ] Sign the Windows launcher and bundled executables with Authenticode, or
  publish through the [Microsoft Store](docs/release/microsoft-store.md) MSIX,
  which the Store signs. The listing is filled in; the MSIX is built from the
  `v1.0.0` tag and submitted after step 4's tag, not before. A 1.0.0.0 package
  built from `ce83f98` was submitted early on 2026-11-20; it stays as a dry
  run of certification, never published, and is deleted once its result is in.
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

## 4. Release

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
- [ ] Build the MSIX from the tag, run WACK, upload it to the draft Store
  submission and submit it for certification
  ([Microsoft Store](docs/release/microsoft-store.md#submit)).
