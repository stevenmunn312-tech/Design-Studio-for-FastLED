---
name: file-edit-no-sed
description: Use when editing a repo source file. Locate with the Grep tool, change with the Edit tool — not Bash sed/grep. On Windows CRLF files, sed loses backslash escapes and misses `\n` matches, forcing retry loops.
---

# Edit files with the right tool

To change a file in this repo:

1. **Locate** the exact text with the `Grep` tool (not `Bash(grep)`).
2. **Change** it with the `Edit` tool — paste the surrounding lines verbatim as `old_string` so the match is unique.

Do **not** build `sed -i` / `sed` → `grep` → `sed` round-trips to edit source. On this Windows repo:
- files are CRLF, so `\n` patterns in sed miss;
- backslash escapes get halved (see memory `bash-heredoc-halves-backslashes`);
- each miss costs a re-run, which is the 3-step loop this skill removes.

`sed`/`grep` are fine for read-only inspection piped to stdout.
