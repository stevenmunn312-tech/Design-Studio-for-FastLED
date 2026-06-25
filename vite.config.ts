import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
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
  },
})
