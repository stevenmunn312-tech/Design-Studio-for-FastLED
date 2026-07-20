# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

**See `CLAUDE.md` at the repo root for the full project overview, architecture,
and node-library reference.** That file is written for Claude Code but applies
equally here — keeping a single copy avoids the two docs silently drifting
apart (which is what happened to this file before it was replaced with this
pointer).

## Git workflow (public repository)

This is a public repository. Keep `main` releasable and make every change on a
short-lived branch reviewed through a pull request. **These instructions
override the global cortex / strict-git rules for this repository.**

- **Use plain `git`** (`git add`, `git commit`, `git push`, `git pull`). Do **not**
  use `cortex git` here.
- **Never commit or push directly to `main`.** Start from an up-to-date `main`,
  then create a descriptive branch before editing. Codex branches use the
  `codex/` prefix; other contributors may use `fix/`, `feature/`, `docs/`, or
  another clear prefix.
- Keep branches focused on one change. Push the branch with upstream tracking
  and open a pull request into `main`; use a draft PR while work is still in
  progress unless the user explicitly asks for a ready-for-review PR.
- **Don't ask permission for routine git** — staging, committing, pushing, and
  pulling on the working branch are pre-approved. Opening the corresponding
  draft PR is also part of the normal workflow.
- **Commit message style:** a short, plain summary line is fine (e.g.
  `add Fade node`, `fix toolbar contrast`). No need to split into many tiny
  atomic commits. Still end commit messages with the
  `Co-Authored-By: Codex <noreply@anthropic.com>` trailer.
- **Do still pause and ask** before genuinely destructive or irreversible things:
  deleting branches, force-pushing, rewriting shared history, `git reset --hard`,
  or discarding the user's uncommitted work.
- Normal loop: update `main` → create branch → code → run checks → stage the
  intended files → commit → `git push -u origin <branch>` → open a draft PR.
  If `main` moves while the branch is in progress, fetch it and merge it into
  the branch; do not rewrite a shared branch without explicit approval.

## Commands

```bash
npm run dev            # start Vite dev server (http://localhost:5173)
npm run build          # tsc -b type-check + Vite production build (also emits PWA service worker)
npm run lint           # ESLint (flat config in eslint.config.js)
npm run preview        # serve the production build locally
npm test               # vitest run (one-shot)
npm run test:watch     # vitest in watch mode
npm run test:coverage  # vitest with v8 coverage
```

Run a single test file or test by name:

```bash
npx vitest run src/state/__tests__/graphEvaluator.test.ts   # one file
npx vitest run -t "cycle"                                   # tests matching a name
```

The npm scripts route tools through `node --disable-warning=DEP0040` so normal project commands stay quiet around an upstream transitive `punycode` deprecation. Direct `npx vite` / `npx vitest` runs may still emit it.
