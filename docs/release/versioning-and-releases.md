# Versioning and Releases

FastLED Studio is pre-1.0 and uses semantic versioning with the usual
pre-release caution: while the project remains below `1.0.0`, compatibility can
still move quickly.

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

1. Make sure `README.md`, `CHANGELOG.md`, `todo.md`, and `CLAUDE.md` reflect
   the shipped state.
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
