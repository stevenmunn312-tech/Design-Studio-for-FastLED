# Caveman mode (vendored)

Terse-reply mode for Claude Code, vendored from
[JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) v2.7.0
(MIT, see `LICENSE`). It is on by default at the `full` level in every session
opened in this repository.

`.claude/settings.json` registers two hooks:

- `SessionStart` runs `caveman-activate.js`, which injects the ruleset from
  `.claude/skills/caveman/SKILL.md`.
- `UserPromptSubmit` runs `caveman-mode-tracker.js`, which follows `/caveman`
  level changes and "stop caveman" and re-states the active level each turn.

Mode state lives under `~/.claude/` (`.caveman-sessions/`, `.caveman-active`,
`.caveman-mode-log.jsonl`); nothing is written to the repository and nothing
goes over the network.

## Use

- `/caveman [lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra]` switches level.
- `stop caveman` or `normal mode` turns it off for the session.
- `/caveman-help`, `/caveman-stats`, `/caveman-commit`, `/caveman-review`.
- Opt out per machine with `CAVEMAN_DEFAULT_MODE=off` or
  `{ "defaultMode": "off" }` in `~/.config/caveman/config.json`.

Optional status-line badge, in your user `~/.claude/settings.json`:
`"statusLine": { "type": "command", "command": "bash \"<repo>/.claude/hooks/caveman/caveman-statusline.sh\"" }`.

## What was taken

Hook files are byte-identical to upstream `src/hooks/` (checked against its
`checksums.sha256`): `package.json` (keeps them CommonJS under this repo's
`"type": "module"`), `caveman-config.js`, `caveman-parse.js`,
`caveman-activate.js`, `caveman-mode-tracker.js`, `caveman-stats.js`,
`caveman-statusline.sh`. Skills are upstream `SKILL.md` files for `caveman`,
`caveman-help`, `caveman-stats`, `caveman-commit` and `caveman-review`.

Local changes:

- `caveman-help` drops its `/caveman-compress` row, since that skill is not vendored.
- The `SessionStart` command pre-creates `~/.claude/.caveman-nudge-shown`, so
  the hook does not ask Claude to offer status-line setup in every fresh cloud
  container.

Deliberately left out: the Caveman Cloud skills (`caveman-setup`,
`caveman-discover`, `caveman-evidence-review`, `caveman-manage`,
`caveman-optimize`, `caveman-learn`), which route an app's LLM traffic through
a third-party gateway; `caveman-compress`, whose Python scripts call Claude and
rewrite memory files such as `CLAUDE.md`; the `cavecrew` subagents and generic
workflow skills; and `/caveman-init`, which runs an unpinned script from
upstream `main`.

To update, copy the same files from a newer release, check them against its
`checksums.sha256`, and re-apply the local changes above.
