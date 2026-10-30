import { describe, expect, it } from 'vitest'
import { radioPreviewTracks, radioRelayUrl, splitStreamTitle } from '../radioPreview'

describe('radio preview', () => {
  it('plays each station through the helper relay, keyed by its own address', () => {
    const tracks = radioPreviewTracks([
      { name: 'Jazz', url: 'http://jazz.example.com/live?x=1&y=2' },
    ], 'http://localhost:8008')
    expect(tracks).toEqual([{
      id: 'radio:http://jazz.example.com/live?x=1&y=2',
      name: 'Jazz',
      url: 'http://localhost:8008/api/radio/stream?url=http%3A%2F%2Fjazz.example.com%2Flive%3Fx%3D1%26y%3D2',
      stationUrl: 'http://jazz.example.com/live?x=1&y=2',
    }])
    expect(new URL(radioRelayUrl('http://a.example.com/', 'http://localhost:8008')).searchParams.get('url')).toBe('http://a.example.com/')
  })

  // The board splits the stream title the same way (audio_showstreamtitle).
  it('splits what is on air into artist and title', () => {
    expect(splitStreamTitle('Miles Davis - So What')).toEqual({ artist: 'Miles Davis', title: 'So What' })
    expect(splitStreamTitle('Station ID')).toEqual({ title: 'Station ID' })
    expect(splitStreamTitle('A - B - C')).toEqual({ artist: 'A', title: 'B - C' })
  })
})
