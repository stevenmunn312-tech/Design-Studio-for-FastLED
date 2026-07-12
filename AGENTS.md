# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

**See `CLAUDE.md` at the repo root for the full project overview, architecture,
and node-library reference.** That file is written for Claude Code but applies
equally here — keeping a single copy avoids the two docs silently drifting
apart (which is what happened to this file before it was replaced with this
pointer).

## Git workflow (this repo) — keep it simple

This is a solo, single-branch project. **These instructions override the global
cortex / strict-git rules for this repository.**

- **Use plain `git`** (`git add`, `git commit`, `git push`, `git pull`). Do **not**
  use `cortex git` here.
- **Work directly on `main`.** No feature branches, no rebasing, no squash
  ceremony unless the user explicitly asks.
- **Don't ask permission for routine git** — staging, committing, pushing, and
  pulling are pre-approved. Just do them and report what happened in one line.
- **Commit message style:** a short, plain summary line is fine (e.g.
  `add Fade node`, `fix toolbar contrast`). No need to split into many tiny
  atomic commits. Still end commit messages with the
  `Co-Authored-By: Codex <noreply@anthropic.com>` trailer.
- **Do still pause and ask** before genuinely destructive or irreversible things:
  deleting branches, force-pushing, `git reset --hard`, or discarding the user's
  uncommitted work.
- Normal loop: code → `git commit -am "..."` → `git push`. If GitHub has new
  changes, `git pull` first.

## Verifying UI changes — no preview tools

**Do not use the preview/browser tools** to verify UI or visual changes in this
repo. After making a change that would need visual verification, just tell the
user what to check and ask them to verify it themselves in their own running
dev server — do not launch or drive a preview session.

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
