# Shipping v1.0.1

v1.0.0 and v1.0.1 were tagged on 2026-11-22. Only the steps that ship v1.0.1
are here; tick a step when its outcome is recorded where it belongs, and empty
this file when they are done.

- **Bench and community testing** is in the
  [bench backlog](docs/plans/bench-backlog.md).
- **Work deferred until after v1** is in the
  [post-v1 list](docs/plans/post-v1.md).
- **Completed release work** is recorded in the
  [changelog](CHANGELOG.md), the
  [support matrix](docs/release/beta-support-matrix.md), the
  [smoke tests](docs/release/clean-machine-smoke-test.md) and Git history.

## Publish

v1.0.1 is the release: the same app as v1.0.0 plus the short build folder a
Store install needs. The v1.0.0 draft release and its MSIX are superseded.

- [ ] Test the v1.0.1 Store package the way a real user meets it: Windows
  long paths **off**, a new account with a long username, first build and
  upload ([clean-machine smoke test](docs/release/clean-machine-smoke-test.md)).
- [ ] Run WACK on the v1.0.1 MSIX.
- [ ] Microsoft Store: cancel the certified dry-run submission, swap in the
  1.0.1.0 package, resubmit, and **Publish now** once certified
  ([Microsoft Store](docs/release/microsoft-store.md#submit)).
- [ ] Review the v1.0.1 draft GitHub release and publish it; delete the
  v1.0.0 draft.

## macOS and Linux

The macOS and Linux archives ship unsigned and experimental until these pass.

- [ ] Join the Apple Developer Program (decided 2026-11-22, after Store
  certification), then sign the macOS app with a Developer ID and the hardened
  runtime, notarize and staple it.
- [ ] Run the macOS package on a clean machine, Apple Silicon and Intel
  ([clean-machine smoke test](docs/release/clean-machine-smoke-test.md#macos-and-linux)).
- [ ] Run the Linux package on a clean machine.
