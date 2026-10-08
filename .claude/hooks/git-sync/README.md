# Git sync

Keeps Claude Code sessions on the latest commit of their branch. Another
session can push to `Hardware` after this one's checkout was made. Without
this hook the session keeps working on the old commit until someone runs
`git pull`.

`.claude/settings.json` runs `git-sync.cjs` at `SessionStart` and on every
`UserPromptSubmit`, passing the event name as its only argument. The command
is a `node -e` launcher so PowerShell and Git Bash both accept it: PowerShell
rejects the bash `HOOK_ROOT=$(...)` assignment, and a Git Bash
`CLAUDE_PROJECT_DIR` of `/c/dev/...` is rewritten to `c:/dev/...` before node
opens the script. Each run:

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

## Cloud sessions need the setup script too

A cloud session does not start from a fresh clone. The environment restores a
cached clone, which can be days old. At start-up it fetches the branch but then
checks out the cached local `Hardware`, so Claude starts on the old commit. If
that commit predates this hook, `.claude/` or the caveman skills, none of them
load. Nothing committed to the repo can fix that, because the cached tree never
contains it.

Add this to the environment's setup script (the cloud environment menu in the
session's title bar, then Edit, then Setup script). It fast-forwards the cached
branch before Claude starts. It leaves diverged or dirty work alone and always
exits 0.

```bash
#!/bin/bash
repo=/home/user/Design-Studio-for-FastLED
branch=Hardware
if [ -d "$repo/.git" ] && git -C "$repo" fetch -q origin "$branch" \
   && git -C "$repo" merge-base --is-ancestor "refs/heads/$branch" FETCH_HEAD; then
  if [ "$(git -C "$repo" symbolic-ref -q --short HEAD)" = "$branch" ]; then
    git -C "$repo" merge -q --ff-only FETCH_HEAD
  else
    git -C "$repo" update-ref "refs/heads/$branch" FETCH_HEAD
  fi
fi
exit 0
```

To check a session, run `git rev-list --count HEAD..origin/Hardware` after
`git fetch origin Hardware`. It should print `0`.
