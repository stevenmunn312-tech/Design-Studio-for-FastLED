# Shipping v1.0.2

v1.0.0 and v1.0.1 were tagged on 2026-11-22 and never published; v1.0.2
(2026-11-26) replaces them. Only the steps that ship v1.0.2 are here; tick a step when its outcome is recorded where it belongs, and empty
this file when they are done.

- **Bench and community testing** is in the
  [bench backlog](docs/plans/bench-backlog.md).
- **Work deferred until after v1** is in the
  [post-v1 list](docs/plans/post-v1.md).
- **Completed release work** is recorded in the
  [changelog](CHANGELOG.md), the
  [support matrix](docs/release/beta-support-matrix.md), the
  [smoke tests](docs/release/clean-machine-smoke-test.md) and Git history.

## Halted 2026-11-23: release blocker

**Do not submit or publish anything.** With Windows long-path support off
(the Windows default), fbuild 2.5.52 cannot install the ESP32 toolchain or
Arduino framework, so the app's default engine cannot build any ESP32 sketch.
Seen on a new standard account with `LongPathsEnabled = 0` running Store
package 1.0.1; it affects the Store package and the portable ZIP alike. Every
earlier passing run used this PC with long paths on machine-wide, so none of
them covered this. The cause, the measurements and the test conditions are in
the [long-paths blocker](docs/release/long-paths-blocker.md) handoff.

- Cause: fbuild's fallback accepts paths up to 247 characters, and the ESP32
  packages need 245 to 290 below the cache root. No cache folder can work.
- Reported upstream on 2026-11-23 as FastLED/fbuild#2156. FastLED/fbuild#2159
  (a repair prompt at start-up) does not cover it: the app runs fbuild without
  a terminal, and a standard user cannot approve the prompt.
- arduino-cli installs and builds the ESP32-S3 under the same conditions
  (Steve's test, 2026-11-23). Other ESP32 boards are untested.
- Decision, 2026-11-23: wait for the fbuild fix. If it does not come, the
  fallback is to have the app use arduino-cli for ESP32 boards when long paths
  are off.

- [x] A fixed fbuild is released: move the pin and rerun the minimal project in
  `tmp/fbuild-longpath-repro`. fbuild 2.5.55 (FastLED/fbuild#2175) pinned on
  2026-11-26; the repro passed with long paths off
  ([retest](docs/release/long-paths-blocker.md#retest-on-fbuild-2555)).
- [x] In the packaged app, 2.5.55 compiled but could not start the bundled
  esptool ("Access is denied"). Fixed 2026-11-26: the helper hands fbuild a
  copy in the build folder
  ([details](docs/release/long-paths-blocker.md#the-packaged-app-could-not-run-esptool-found-and-fixed-2026-11-26)).
- [x] Store-identity layout built locally from `main` (`8df5772c`), on
  `storetest-longname` with long paths off: build and upload to the ESP32-S3
  passed, 2026-11-26. It did not cover a first download or the package that
  ships ([what it covered](docs/release/long-paths-blocker.md#the-packaged-app-could-not-run-esptool-found-and-fixed-2026-11-26)).
- [x] Decide what ships: a new version, 1.0.2, from `main` (Steve,
  2026-11-26). The `v1.0.1` tag stays as it is.
- [ ] The Store smoke test under Publish below, on the 1.0.2 package, on an
  account that has never run fbuild, through first download and upload.
  Until it passes, the halt stands.

State: the Store holds only the certified, unpublished 1.0.0 dry run (leave
it alone); tags `v1.0.0` and `v1.0.1` exist with private draft releases, both
superseded by `v1.0.2`. The 1.0.1 builds are also on an unlisted preview page
on the website for one invited tester.

## Fresh preview for the invited tester

`main` has moved well past 1.0.1 (first-launch showcase, true-light previews,
Gamma 2.2 default, the gamma floor, the loudness retune, the volume fix, the
shelf fix). The preview page still serves 1.0.1.

- [x] Bench-check Gamma 2.2 on a real matrix against the preview: colours and
  contrast match, a fade reaches off without stepping badly, Gamma 1 looks
  washed out on both. Steve, 2026-11-24.
- [ ] Once that passes, run the Desktop Packages workflow on GitHub for all
  four platforms (Steve approved this one run on 2026-11-23). Use a
  pre-release tag, not `v1.0.0` or `v1.0.1`; no draft release.
- [ ] Replace the files on the preview page (bucket folder unchanged, so the
  link stays the same) and tell the tester what is still open: ESP32 builds
  with long paths off, unsigned builds.

## Publish

v1.0.2 is the release: `main` on 2026-11-26, with fbuild 2.5.55 and the
esptool fix that let a Store install build ESP32 boards with long paths off.
The v1.0.0 and v1.0.1 draft releases and their MSIX files are superseded.

- [ ] Build the v1.0.2 packages with the Desktop Packages workflow on GitHub
  (needs Steve's go-ahead for this run). The same run can refresh the
  preview page above.
- [ ] Test the v1.0.2 Store package the way a real user meets it: Windows
  long paths **off**, a new account with a long username that has never run
  fbuild, first build and upload
  ([clean-machine smoke test](docs/release/clean-machine-smoke-test.md)).
- [ ] Run WACK on the v1.0.2 MSIX (the v1.0.1 pass, 2026-11-22, does not
  carry over).
- [ ] Microsoft Store: cancel the certified dry-run submission, swap in the
  1.0.2.0 package, resubmit, and **Publish now** once certified
  ([Microsoft Store](docs/release/microsoft-store.md#submit)).
- [ ] Review the v1.0.2 draft GitHub release and publish it; delete the
  v1.0.0 and v1.0.1 drafts.

## macOS and Linux

The macOS and Linux archives ship unsigned and experimental until these pass.

- [ ] Join the Apple Developer Program (decided 2026-11-22, after Store
  certification), then sign the macOS app with a Developer ID and the hardened
  runtime, notarize and staple it.
- [ ] Run the macOS package on a clean machine, Apple Silicon and Intel
  ([clean-machine smoke test](docs/release/clean-machine-smoke-test.md#macos-and-linux)).
- [ ] Run the Linux package on a clean machine.
