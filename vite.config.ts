import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { normalizePath } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { uploadHelper } from './vite-plugin-upload-helper'

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}
const namedLocalHosts = ['design-studio-for-fastled.localhost', 'design-studio-for-fastled.localtest.me']
const APP_CHUNK_WARNING_KIB = 750
// Forward-slashed, as chokidar matches its ignore globs against posix paths.
const repoRoot = normalizePath(fileURLToPath(new URL('.', import.meta.url))).replace(/\/$/, '')

export default defineConfig(() => {
  const isTest = process.env.VITEST === 'true'

  return {
    define: {
      // Keep beta validation reports tied to the exact package release that
      // generated them. npm exposes this from package.json for every script;
      // the fallback keeps direct Vite/Vitest invocations deterministic.
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
    },
    // Chromium's page-wide memory estimate requires a cross-origin-isolated
    // context. These headers cover both the local authoring server and preview.
    server: {
      headers: crossOriginIsolationHeaders,
      allowedHosts: namedLocalHosts,
      // A build writing here is not a source change, and watching it is worse
      // than useless: chokidar throws EBUSY on a compiler's open output file
      // and the error kills the dev server mid-session. Every toolchain output
      // directory under backend/ belongs in this list. The gitignored scratch,
      // capture and build folders at the root go too: they hold thousands of
      // directories, and watching them kept each idle dev server rescanning on
      // one to two cores, enough to stall the desktop.
      watch: {
        ignored: [
          '**/backend/.fbuild-project/**',
          '**/backend/sketches/**',
          '**/backend/exports/**',
          '**/backend/__pycache__/**',
          '**/backend/.pytest_cache/**',
          '**/backend/.venv/**',
          '**/backend/.arduino-libraries/**',
          ...['tmp', 'artifacts', 'release', 'dist', '.desktop-build', '.claude/worktrees']
            .map((dir) => `${repoRoot}/${dir}/**`),
        ],
      },
    },
    preview: { headers: crossOriginIsolationHeaders, allowedHosts: namedLocalHosts },
    // Workers are created with `{ type: 'module' }`, so they build as ES modules.
    worker: { format: 'es' },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: APP_CHUNK_WARNING_KIB,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const moduleId = id.replaceAll('\\', '/')
            // Large, stable application domains benefit from independent
            // caching and keep the startup entry from becoming one monolith.
            // These are eager core dependencies, not pretend lazy routes: the
            // browser can fetch them in parallel while retaining them across
            // UI-only releases.
            if (moduleId.includes('/src/build/generated/')) return 'hardware-catalog'
            // The shipped pattern library is data that changes on its own
            // cadence, so a code release does not re-download it.
            if (moduleId.includes('/src/assets/bundled-patterns/')
              || /\/src\/state\/patterns\/bundled(Patterns|AudioShelf\d*)\.ts$/.test(moduleId)) return 'pattern-library'
            // The evaluator and every node's preview (src/nodes/*/evaluate.ts).
            // Each node's firmware (codegen.ts beside it) stays with the lazy
            // generator.
            if (moduleId.includes('/src/state/graphEvaluator.ts')
              || moduleId.includes('/src/state/evaluator/')
              || /\/src\/nodes\/[^/]+\/evaluate\.ts$/.test(moduleId)) return 'graph-runtime'
            // The node registry and every category's definitions beside it.
            if (moduleId.includes('/src/state/nodeLibrary.ts')
              || /\/src\/nodes\/[^/]+\/definitions\.ts$/.test(moduleId)) return 'node-catalog'
            if (!id.includes('node_modules')) return
            if (id.includes('@xyflow/react')) return 'xyflow'
            if (id.includes('react') || id.includes('zustand') || id.includes('zundo')) return 'react-vendor'
          },
        },
      },
    },
    plugins: [
      react(),
      // Vitest doesn't need the helper auto-spawner or PWA service-worker plugin,
      // and skipping them avoids stray open handles during test shutdown.
      !isTest && uploadHelper(),
      !isTest && VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Design Studio for FastLED',
          short_name: 'Design Studio',
          description: 'Node-graph LED effects designer for FastLED microcontrollers',
          theme_color: '#0d0f12',
          background_color: '#0d0f12',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Self-hosted fonts stay in the precache: the UI paints with them,
          // including offline. woff2 is Inter and JetBrains Mono; ttf is Audiowide.
          globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,ttf}'],
          // The generated node-card images (~140 SVGs) load only when a Help
          // node-reference page is opened,
          // the board renders (~590 KB of WebP) only when the Board node's
          // pinout view is shown, and the display design pack (~390 vector
          // assets) only inside a custom display's editor — keep them all out
          // of the precache so the base install stays small; runtime-cache them
          // after first use.
          globIgnores: [
            'node-cards/**', 'boards/**', 'display-assets/**',
          ],
          runtimeCaching: [
            {
              urlPattern: /\/node-cards\/.+\.svg$/,
              // Generated help images keep stable URLs across releases.
              // Refresh online; retain cached illustrations for offline help.
              handler: 'NetworkFirst',
              options: { cacheName: 'node-cards', networkTimeoutSeconds: 3, expiration: { maxEntries: 200 } },
            },
            {
              urlPattern: /\/boards\/.+\.webp$/,
              handler: 'CacheFirst',
              options: { cacheName: 'board-renders', expiration: { maxEntries: 40 } },
            },
            {
              urlPattern: /\/display-assets\/.+\.(?:svg|json)$/,
              handler: 'CacheFirst',
              options: { cacheName: 'display-assets', expiration: { maxEntries: 400 } },
            },
          ],
        },
      }),
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['.claude/**', 'dist/**', 'node_modules/**'],
    },
  }
})
