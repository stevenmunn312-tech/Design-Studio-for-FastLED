import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { uploadHelper } from './vite-plugin-upload-helper'

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}
const namedLocalHosts = ['design-studio-for-fastled.localhost', 'design-studio-for-fastled.localtest.me']
const APP_CHUNK_WARNING_KIB = 750

/**
 * Vite has one global chunk threshold, but this app has one deliberate
 * exception: Essentia's third-party WASM module is a 2.5 MB lazy asset loaded
 * only for song analysis. Keep a tighter warning budget for every application
 * chunk instead of raising the global limit and losing regression coverage.
 */
function applicationChunkBudget(): Plugin {
  return {
    name: 'application-chunk-budget',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk' || output.fileName.includes('essentia-wasm')) continue
        const sizeKib = Buffer.byteLength(output.code, 'utf8') / 1024
        if (sizeKib > APP_CHUNK_WARNING_KIB) {
          this.warn(`${output.fileName} is ${sizeKib.toFixed(1)} KiB; application chunks should stay below ${APP_CHUNK_WARNING_KIB} KiB`)
        }
      }
    },
  }
}

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
      watch: {
        ignored: [
          '**/backend/.fbuild-project/**',
          '**/backend/__pycache__/**',
          '**/backend/.pytest_cache/**',
        ],
      },
    },
    preview: { headers: crossOriginIsolationHeaders, allowedHosts: namedLocalHosts },
    // The Essentia analysis worker lazily `import()`s its WASM, so it needs the ES
    // worker format — the default 'iife' can't code-split a worker.
    worker: { format: 'es' },
    build: {
      target: 'es2022',
      // The third-party Essentia WASM chunk is expected at ~2.5 MB and already
      // lazy/excluded from the base PWA precache. applicationChunkBudget keeps
      // the actionable 750 KiB ceiling on every other JavaScript chunk.
      chunkSizeWarningLimit: 2600,
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
            if (moduleId.includes('/src/state/graphEvaluator.ts')) return 'graph-runtime'
            if (moduleId.includes('/src/state/nodeLibrary.ts')) return 'node-catalog'
            if (!id.includes('node_modules')) return
            if (id.includes('@xyflow/react')) return 'xyflow'
            if (id.includes('react') || id.includes('zustand') || id.includes('zundo')) return 'react-vendor'
          },
        },
      },
    },
    plugins: [
      applicationChunkBudget(),
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
          globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
          // The Essentia.js WASM chunk (~2.5 MB) is loaded on demand only when the
          // user analyses a song with that engine, the generated node-card
          // images (~140 SVGs) only when a Help node-reference page is opened,
          // and the board renders (~590 KB of WebP) only when the Board node's
          // pinout view is shown — keep them all out of the precache so the
          // base install stays small; runtime-cache them after first use.
          globIgnores: ['**/essentia-wasm*.js', 'node-cards/**', 'boards/**'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\./,
              handler: 'CacheFirst',
              options: { cacheName: 'fonts', expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
            {
              urlPattern: /essentia-wasm.*\.js$/,
              handler: 'CacheFirst',
              options: { cacheName: 'essentia-wasm', expiration: { maxEntries: 2 } },
            },
            {
              urlPattern: /\/node-cards\/.+\.svg$/,
              handler: 'CacheFirst',
              options: { cacheName: 'node-cards', expiration: { maxEntries: 200 } },
            },
            {
              urlPattern: /\/boards\/.+\.webp$/,
              handler: 'CacheFirst',
              options: { cacheName: 'board-renders', expiration: { maxEntries: 40 } },
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
