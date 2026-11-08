import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEMO_TRACK_FILE, demoTrackUrl } from '../demoTrack'

describe('demo track', () => {
  const file = resolve(__dirname, '../../../../public/demo-music', DEMO_TRACK_FILE)

  it('is bundled in public/demo-music', () => {
    expect(existsSync(file)).toBe(true)
  })

  it('is an MP3 the board will play: .mp3 name and no ID3 header', () => {
    // The player firmware only lists .mp3 files, and ESP32-audioI2S silently
    // never starts a track whose ID3 header takes too long to read.
    expect(DEMO_TRACK_FILE.endsWith('.mp3')).toBe(true)
    const head = readFileSync(file).subarray(0, 3)
    expect(head.toString('latin1')).not.toBe('ID3')
    // An MPEG audio frame sync: eleven set bits.
    expect(head[0]).toBe(0xff)
    expect(head[1] & 0xe0).toBe(0xe0)
  })

  it('builds a URL under the base path with the space encoded', () => {
    expect(demoTrackUrl('/')).toBe('/demo-music/Ethereal%20Pulse.mp3')
    expect(demoTrackUrl('/studio')).toBe('/studio/demo-music/Ethereal%20Pulse.mp3')
  })
})
