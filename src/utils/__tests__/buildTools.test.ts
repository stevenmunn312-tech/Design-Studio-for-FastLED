import { describe, expect, it } from 'vitest'
import { buildToolsOfflineHint, servedByBuildTools } from '../buildTools'

describe('servedByBuildTools', () => {
  it('recognises the desktop build under either loopback name', () => {
    expect(servedByBuildTools('http://localhost:8008/')).toBe(true)
    expect(servedByBuildTools('http://127.0.0.1:8008/')).toBe(true)
  })

  it('treats a Vite server as a source checkout', () => {
    expect(servedByBuildTools('http://localhost:5173/')).toBe(false)
    expect(servedByBuildTools(undefined)).toBe(false)
  })

  it('gives each setup its own way to start the build tools', () => {
    expect(buildToolsOfflineHint(true)).toMatch(/desktop build/)
    expect(buildToolsOfflineHint(false)).toMatch(/npm run helper/)
  })

  it('sends an embedded demo to the desktop version, which has no tools to start', () => {
    for (const bundled of [true, false]) {
      expect(buildToolsOfflineHint(bundled, true)).toBe(
        'Download the desktop version to use build tools. designstudioforfastled.com')
    }
  })
})
