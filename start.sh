#!/usr/bin/env bash
# FastLED Studio launcher (macOS / Linux).
#
# Sets everything up on first run — app dependencies, the Python upload
# helper, a production build — then serves the app and opens your browser.
# Run it again any time; completed steps are skipped.
#
# macOS users: double-click "Start FastLED Studio.command" instead (it runs
# this script). Linux users: ./start.sh
set -u

cd "$(dirname "$0")" || exit 1

say() { printf '\n== %s\n' "$1"; }

fail() {
  printf '\n!! %s\n' "$1"
  # When double-clicked, keep the terminal window around to read the message.
  if [ -t 0 ]; then read -r -p 'Press Enter to close... '; fi
  exit 1
}

# ---- Node.js -------------------------------------------------------------
command -v node >/dev/null 2>&1 \
  || fail 'Node.js is not installed. Download the LTS installer from https://nodejs.org, install it, then run this again.'

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "$NODE_MAJOR" -ge 18 ] \
  || fail "Node.js 18 or newer is required (you have $(node --version)). Update at https://nodejs.org, then run this again."

# ---- App dependencies (first run only) ------------------------------------
if [ ! -d node_modules ]; then
  say 'First run: installing app dependencies — this can take a few minutes...'
  npm ci || npm install || fail 'Dependency install failed — check the log above (is your internet connection up?).'
fi

# ---- Python upload helper (optional: only needed to flash a board) --------
PY=""
for c in python3 python; do
  command -v "$c" >/dev/null 2>&1 && { PY="$c"; break; }
done

VENV=backend/.venv
if [ -n "$PY" ]; then
  if [ ! -x "$VENV/bin/python" ]; then
    say 'Setting up the upload helper (Python)...'
    "$PY" -m venv "$VENV" \
      || { echo 'Could not create a Python environment — the designer still works; uploading to a board stays disabled.'; VENV=""; }
  fi
  if [ -n "$VENV" ]; then
    STAMP="$VENV/installed-requirements.txt"
    if ! cmp -s backend/requirements.txt "$STAMP" 2>/dev/null; then
      say 'Installing upload helper dependencies...'
      if "$VENV/bin/pip" install -q -r backend/requirements.txt; then
        cp backend/requirements.txt "$STAMP"
      else
        echo 'Helper install failed — the designer still works; uploading to a board stays disabled.'
      fi
    fi
    # The preview server auto-spawns the helper with plain `python3`
    # (vite-plugin-upload-helper.ts); putting the venv first on PATH points
    # that spawn at the interpreter that has uvicorn installed.
    export PATH="$PWD/$VENV/bin:$PATH"
  fi
else
  echo 'Python 3 not found — the designer will run, but uploading to a board needs Python 3 (https://python.org).'
fi

# ---- Build (first run, or when the checkout has changed) -------------------
WANT=$(git rev-parse HEAD 2>/dev/null || echo no-git)
HAVE=$(cat dist/.build-stamp 2>/dev/null || echo none)
if [ ! -f dist/index.html ] || { [ "$WANT" != no-git ] && [ "$WANT" != "$HAVE" ]; }; then
  say 'Building FastLED Studio...'
  npm run build || fail 'Build failed — check the log above.'
  printf '%s\n' "$WANT" > dist/.build-stamp
fi

# ---- Run -------------------------------------------------------------------
say 'Starting FastLED Studio — your browser will open in a moment.'
echo '   Keep this window open while you use the app; press Ctrl+C here to quit.'
npm run preview -- --open
