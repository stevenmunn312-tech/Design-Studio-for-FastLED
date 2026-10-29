import { describe, it, expect, vi } from 'vitest'
import { radioBrowserResult, radioBrowserSearchUrl, searchRadioBrowser, RADIO_BROWSER_LIMIT } from '../radioBrowser'

const entry = (overrides: Record<string, unknown> = {}) => ({
  name: 'Jazz FM', url: 'http://jazz.example.com/playlist.m3u', url_resolved: 'http://jazz.example.com/live',
  codec: 'MP3', bitrate: 128, hls: 0, lastcheckok: 1, countrycode: 'gb', tags: 'jazz,smooth',
  ...overrides,
})

describe('radioBrowserResult', () => {
  it('takes the resolved stream and the fields the list shows', () => {
    expect(radioBrowserResult(entry())).toEqual({
      name: 'Jazz FM', url: 'http://jazz.example.com/live', codec: 'MP3', bitrateKbps: 128, country: 'GB', tags: 'jazz,smooth',
    })
  })

  // The directory is not ours: anything the board could not play, or that
  // would not pass the typed-URL rules, never reaches the list.
  it('drops HLS, broken, unplayable and unsafe entries', () => {
    expect(radioBrowserResult(entry({ hls: 1 }))).toBeNull()
    expect(radioBrowserResult(entry({ lastcheckok: 0 }))).toBeNull()
    expect(radioBrowserResult(entry({ codec: 'WMA' }))).toBeNull()
    expect(radioBrowserResult(entry({ url_resolved: 'http://x.example.com/"><script>' }))).toBeNull()
    expect(radioBrowserResult(null)).toBeNull()
  })

  it('cleans the name it was sent', () => {
    expect(radioBrowserResult(entry({ name: '\u0000  Jazz\nFM  ' }))?.name).toBe('Jazz FM')
  })
})

describe('searchRadioBrowser', () => {
  it('asks for playable stations by name, most listened first', () => {
    const url = new URL(radioBrowserSearchUrl('  smooth jazz '))
    expect(url.origin).toBe('https://all.api.radio-browser.info')
    expect(url.pathname).toBe('/json/stations/search')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ name: 'smooth jazz', hidebroken: 'true', order: 'clickcount', reverse: 'true' })
  })

  it('returns playable stations without duplicates, up to the limit', async () => {
    const body = [
      entry(), entry(), entry({ codec: 'WMA', url_resolved: 'http://w.example.com/' }),
      ...Array.from({ length: 60 }, (_, i) => entry({ name: `S${i}`, url_resolved: `http://s${i}.example.com/` })),
    ]
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
    const results = await searchRadioBrowser('jazz', { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(results).toHaveLength(RADIO_BROWSER_LIMIT)
    expect(results[0].url).toBe('http://jazz.example.com/live')
    expect(new Set(results.map((result) => result.url)).size).toBe(results.length)
  })

  it('does not search for nothing, and reports a failed answer', async () => {
    const fetchImpl = vi.fn(async () => new Response('busy', { status: 503 }))
    expect(await searchRadioBrowser('   ', { fetchImpl })).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
    await expect(searchRadioBrowser('jazz', { fetchImpl })).rejects.toThrow('503')
  })
})
