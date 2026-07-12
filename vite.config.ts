import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { uploadHelper } from './vite-plugin-upload-helper'

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineConfig(() => {
  const isTest = process.env.VITEST === 'true'

  return {
    // Chromium's page-wide memory estimate requires a cross-origin-isolated
    // context. These headers cover both the local authoring server and preview.
    server: { headers: crossOriginIsolationHeaders },
    preview: { headers: crossOriginIsolationHeaders },
    // The Essentia analysis worker lazily `import()`s its WASM, so it needs the ES
    // worker format — the default 'iife' can't code-split a worker.
    worker: { format: 'es' },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
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
          name: 'FastLED Studio',
          short_name: 'FastLED',
          description: 'Node-graph LED effects designer for FastLED microcontrollers',
          theme_color: '#0d0f12',
          background_color: '#0d0f12',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
          // The Essentia.js WASM chunk (~2.5 MB) is loaded on demand only when the
          // user analyses a song with that engine — keep it out of the precache so
          // the base install stays small; runtime-cache it after first use instead.
          globIgnores: ['**/essentia-wasm*.js'],
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
