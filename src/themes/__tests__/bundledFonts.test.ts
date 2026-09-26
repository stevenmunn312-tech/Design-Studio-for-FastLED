import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Inter and JetBrains Mono used to load from fonts.googleapis.com. The
 * preconnect fired on every launch, and an offline service worker had nothing
 * cached until that first network hit, so the UI fell back to system fonts.
 * jsdom does not load faces, so this locks the wiring: local files, no Google
 * host, and both font types in the precache glob.
 */
const root = process.cwd()
const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8')
const tokens = readFileSync(resolve(root, 'src/themes/tokens.css'), 'utf8')
const viteConfig = readFileSync(resolve(root, 'vite.config.ts'), 'utf8')

describe('bundled UI fonts', () => {
  it('does not contact Google Fonts', () => {
    for (const source of [indexHtml, tokens, viteConfig]) {
      expect(source).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/)
    }
    expect(viteConfig).not.toMatch(/https:\/\/fonts\./)
  })

  it('serves Inter, JetBrains Mono, and Audiowide from public/fonts', () => {
    expect(indexHtml).toContain('href="/fonts/Inter-latin.woff2"')
    expect(indexHtml).toContain('href="/fonts/JetBrainsMono-latin.woff2"')
    const urls = [...tokens.matchAll(/url\('(\/fonts\/[^']+)'\)/g)].map((match) => match[1])
    expect(urls).toEqual(expect.arrayContaining([
      '/fonts/Audiowide-Regular.ttf',
      '/fonts/Inter-latin.woff2',
      '/fonts/JetBrainsMono-latin.woff2',
    ]))
    for (const url of urls) {
      expect(existsSync(resolve(root, 'public', url.slice(1))), url).toBe(true)
    }
    expect(existsSync(resolve(root, 'public/fonts/Inter-OFL.txt'))).toBe(true)
    expect(existsSync(resolve(root, 'public/fonts/JetBrainsMono-OFL.txt'))).toBe(true)
    expect(existsSync(resolve(root, 'public/fonts/Audiowide-OFL.txt'))).toBe(true)
  })

  it('precaches the self-hosted font files', () => {
    const glob = /globPatterns:\s*\[([^\]]*)\]/.exec(viteConfig)
    expect(glob, 'vite.config.ts workbox globPatterns').toBeTruthy()
    expect(glob![1]).toMatch(/woff2/)
    expect(glob![1]).toMatch(/ttf/)
  })
})
