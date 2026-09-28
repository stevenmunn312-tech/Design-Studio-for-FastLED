#!/usr/bin/env node
// Keeps a Claude Code session on the latest commit of its branch.
//
// Usage: node git-sync.cjs <SessionStart|UserPromptSubmit>
//
// Fetches the checked-out branch's upstream. When the branch is only behind
// and no tracked file is modified, fast-forwards it. Otherwise tells Claude
// how far behind it is. Never merges, rebases, resets or stashes.
// Silent when up to date, detached, without an upstream, or offline.
// Set CLAUDE_GIT_SYNC=0 to turn it off.
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const EVENT = process.argv[2] || 'UserPromptSubmit';
const ROOT = path.resolve(__dirname, '..', '..', '..');
const LOG_LIMIT = 10;

function git(args, timeout = 5000) {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return {
    ok: result.status === 0 && !result.error,
    out: (result.stdout || '').trim(),
    err: (result.stderr || '').trim(),
  };
}

function say(text) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: EVENT,
      additionalContext: `git-sync: ${text}`,
    },
  }));
}

function main() {
  if (process.env.CLAUDE_GIT_SYNC === '0') return;

  const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!branch.ok) return;

  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!upstream.ok) return;

  const remote = git(['config', `branch.${branch.out}.remote`]);
  const merge = git(['config', `branch.${branch.out}.merge`]);
  if (!remote.ok || !merge.ok || remote.out === '.') return;

  if (!git(['fetch', '--quiet', '--no-tags', remote.out, merge.out], 15000).ok) return;

  const counts = git(['rev-list', '--left-right', '--count', `HEAD...${upstream.out}`]);
  if (!counts.ok) return;
  const [ahead, behind] = counts.out.split(/\s+/).map(Number);
  if (!behind) return;

  const where = `${branch.out} is behind ${upstream.out} by ${behind} commit${behind === 1 ? '' : 's'}`;

  if (ahead) {
    say(`${where} and ahead by ${ahead}. Not synced automatically. Integrate ${upstream.out} before editing.`);
    return;
  }

  const dirty = git(['status', '--porcelain', '--untracked-files=no']);
  if (!dirty.ok) return;
  if (dirty.out) {
    say(`${where}. Tracked files are modified, so it was not fast-forwarded. Run \`git pull --ff-only\` before editing; git refuses if the changes overlap.`);
    return;
  }

  const before = git(['rev-parse', '--short', 'HEAD']).out;
  const pull = git(['merge', '--ff-only', '--quiet', upstream.out], 15000);
  if (!pull.ok) {
    const reason = pull.err.replace(/\s+/g, ' ').slice(0, 300) || 'git merge --ff-only failed';
    say(`${where}. Fast-forward failed: ${reason} Resolve that, then run \`git pull --ff-only\` before editing.`);
    return;
  }
  const after = git(['rev-parse', '--short', 'HEAD']).out;

  const log = git(['log', '--oneline', `-${LOG_LIMIT}`, `${before}..${after}`]).out;
  const more = behind > LOG_LIMIT ? `\n... and ${behind - LOG_LIMIT} more` : '';
  const touched = git(['diff', '--name-only', before, after, '--', 'CLAUDE.md', '.claude']).out;
  const note = touched
    ? '\nThis update changed CLAUDE.md or .claude/. Re-read CLAUDE.md. New hooks load in the next session.'
    : '';

  say(`fast-forwarded ${branch.out} ${before}..${after} (${behind} commit${behind === 1 ? '' : 's'} from ${upstream.out}). Files read before this may be stale.\n${log}${more}${note}`);
}

try {
  main();
} catch {
  // A sync problem must never block the session.
}
