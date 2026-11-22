# After the v1.0.0 tag

v1.0.0 was tagged on 2026-11-22. Only the steps that ship it are here; tick a
step when its outcome is recorded where it belongs, and empty this file when
they are done.

- **Bench and community testing** is in the
  [bench backlog](docs/plans/bench-backlog.md).
- **Work deferred until after v1** is in the
  [post-v1 list](docs/plans/post-v1.md).
- **Completed release work** is recorded in the
  [changelog](CHANGELOG.md), the
  [support matrix](docs/release/beta-support-matrix.md), the
  [smoke tests](docs/release/clean-machine-smoke-test.md) and Git history.

## Publish

- [ ] Review the draft GitHub release the package run assembles from the
  `v1.0.0` tag (Windows, Linux and both macOS archives, with checksums and
  provenance), then publish it.
- [ ] Microsoft Store: run WACK on the MSIX built from the tag, cancel the
  certified dry-run submission (it was built from `ce83f98`, before the
  clean-machine fixes), swap in the new package, resubmit, and **Publish now**
  once certified. If Partner Center refuses a second 1.0.0.0, the fix is a
  version change only ([Microsoft Store](docs/release/microsoft-store.md#submit)).

## macOS and Linux

The macOS and Linux archives ship unsigned and experimental until these pass.

- [ ] Join the Apple Developer Program (decided 2026-11-22, after Store
  certification), then sign the macOS app with a Developer ID and the hardened
  runtime, notarize and staple it.
- [ ] Run the macOS package on a clean machine, Apple Silicon and Intel
  ([clean-machine smoke test](docs/release/clean-machine-smoke-test.md#macos-and-linux)).
- [ ] Run the Linux package on a clean machine.
