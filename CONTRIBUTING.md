# Contributing to Design Studio for FastLED

Thanks for helping test Design Studio for FastLED! The project is in **public beta**: the
feature set is broad, but the support promise is deliberately narrow and the
file formats are not final. The fastest way to help right now is testing on
real hardware and filing precise reports.

## Reporting bugs

Open a [bug report](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/issues/new/choose)
and include:

- your operating system and version, browser and version, and the FastLED
  Studio version (shown in the app and in the release you downloaded);
- whether you run the portable desktop package or from source;
- steps to reproduce, what you expected, and what actually happened;
- for hardware problems: exact board, LED chipset, matrix/strip dimensions,
  color order, pins, layout type, build engine (`fbuild` or `arduino-cli`),
  and the relevant log tail.

Never include Wi-Fi credentials, private project data, serial numbers you
consider sensitive, or unrelated log contents.

## Hardware validation reports

Reports from real wiring are how experimental combinations become supported
ones. The preferred path is the in-app flow: after an upload or wiring test,
the Upload tab offers an opt-in report that pre-fills a GitHub
issue with the exact configuration. See the
[hardware validation guide](docs/release/beta-hardware-validation.md) and the
[beta support matrix](docs/release/beta-support-matrix.md).

## Security issues

Do **not** open a public issue for vulnerabilities. Follow the
[security policy](SECURITY.md) instead.

## Feature requests

Welcome — file one via the feature request template. During the beta,
priorities are stability, hardware coverage, and workflow polish, so new
feature work may wait behind those.

## Pull requests

PRs are welcome during the beta with two caveats:

1. **Open an issue first for anything non-trivial.** The codebase is moving
   quickly, and saved projects/patterns/share links need deliberate compatibility
   handling when a change reshapes them; agreeing on direction first avoids
   wasted work.
2. **Keep PRs small and focused.** One fix or one feature per PR.

`Hardware` is the active development line. Start contributor branches from
`Hardware` and target pull requests there. Repository maintainers and authorized
agents work directly on `Hardware` by default; use a focused branch when one is
requested. Automated Codex branches use the `codex/` prefix.

`main` is the frozen public-beta line. Change it only for an explicitly requested
beta hotfix, using a focused branch and pull request unless the maintainer
requests another hotfix workflow. Never merge `main` and `Hardware` in either
direction. Update a contribution from its own target line without force-pushing
or rewriting shared history. Open a draft PR while work is still in progress.

Before submitting, all three gates must pass locally:

```bash
npm run lint
npm test
npm run build
```

If you touched the upload helper, also run `pytest backend/tests`.

### Adding a node type

A new node needs four touch-points, enforced by tests:

1. a definition in its category's `src/nodes/<category>/definitions.ts`;
2. a handler in the same category's `evaluate.ts` table (live preview);
3. an emitter in the same category's `codegen.ts` table (firmware);
4. a one-line tooltip in that `definitions.ts` file's descriptions table.

Property controls, labels and gating stay shared in `src/state/nodeLibrary.ts`.

Preview and generated firmware must match — when the two can't use identical
math, document the divergence.

## Licensing

Contributions are accepted under the repository's [MIT license](LICENSE).
The `src/animartrix/` module is separately licensed **CC BY-NC-SA 4.0**
(Stefan Petrick's AnimARTrix adaptation); contributions there must respect
that license and preserve attribution. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Development setup

Follow [development setup](docs/getting-started/development-setup.md) for the
supported runtimes, installation and local servers. The
[upload-helper guide](docs/getting-started/upload-helper.md) covers Python and
firmware toolchains.

[CLAUDE.md](CLAUDE.md) contains the concise repository invariants and commands
agents need on every task. The [documentation index](docs/index.md) routes to
architecture, feature contracts, plans and validation evidence.
