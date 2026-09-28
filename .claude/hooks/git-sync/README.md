# Git sync

Keeps Claude Code sessions on the latest commit of their branch. A cloud
session clones the repository once when its container starts, and another
session can push to `Hardware` after that. Without this hook the session
keeps working on the old commit until someone runs `git pull`.

`.claude/settings.json` runs `git-sync.cjs` at `SessionStart` and on every
`UserPromptSubmit`, before the caveman hooks, passing the event name as its
only argument. Each run:

1. Skips a detached `HEAD`, a branch without an upstream, or a failed fetch
   (offline, no credentials). Git is never allowed to prompt.
2. Fetches the upstream branch only, without tags.
3. When the branch is only behind and no tracked file is modified, runs
   `git merge --ff-only`. Claude gets the old and new commits, the first ten
   commit subjects, and a note when `CLAUDE.md` or `.claude/` changed.
4. When tracked files are modified, the branch has diverged, or the
   fast-forward fails, Claude only gets told how far behind it is.

It never merges, rebases, resets or stashes. Untracked files are left alone;
git refuses the fast-forward if an incoming commit would overwrite one.

Turn it off per machine with `CLAUDE_GIT_SYNC=0`.

Hooks are read when a session starts, so a pulled change to
`.claude/settings.json` takes effect in the next session.
