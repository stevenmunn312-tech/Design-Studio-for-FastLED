import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

// The UI test drives the packaged desktop app (`npm run package:desktop`),
// not the dev server: it proves the frozen launcher serves a working Studio.
const APP_NAME = 'Design Studio for FastLED'
const RELEASE = join('release', 'desktop')
const launcher = process.platform === 'darwin'
  ? join(RELEASE, `${APP_NAME}.app`, 'Contents', 'MacOS', APP_NAME)
  : join(RELEASE, APP_NAME, process.platform === 'win32' ? `${APP_NAME}.exe` : APP_NAME)

// The built page always calls the helper on port 8008, so the app has to run
// there. A fresh data folder keeps the run away from real projects and makes
// every run a first run. Workers re-read this file; the variable keeps one folder.
const PORT = 8008
process.env.FLS_E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'fls-e2e-'))
const dataDir = process.env.FLS_E2E_DATA_DIR

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'artifacts/e2e',
  reporter: 'list',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `"${launcher}"`,
    url: `http://localhost:${PORT}/api/desktop/status`,
    // Never borrow a Studio that is already running: it holds real projects.
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      FLS_NO_BROWSER: '1',
      FLS_DESKTOP_PORT: String(PORT),
      FLS_DATA_DIR: dataDir,
      FLS_CONTENT_DIR: join(dataDir, 'content'),
    },
  },
})
