import { describe, it, expect } from 'vitest'
import {
  cleanRadioStationName, invalidRadioStations, normalizeRadioStations, parseRadioPlaylist,
  radioAccessCodeProblem, radioStationNameProblem, radioStationPagePort, radioStationsM3u,
  radioStationUrlProblem, RADIO_STATIONS_MAX,
} from '../radioStations'

describe('radioStationUrlProblem', () => {
  it('accepts the stream addresses stations publish', () => {
    for (const url of [
      'http://jking.cdnstream1.com/b22139_128mp3',
      'https://icecast.walmradio.com:8443/jazz',
      'http://stream.example.com/live.mp3?type=.mp3&t=1',
      'http://203.0.113.7:8000/;',
      'http://example.com/path%20with%20escapes',
    ]) expect(radioStationUrlProblem(url), url).toBeNull()
  })

  // Every one of these would reach a C string or the library's own address
  // parser as something other than what the user meant.
  it('refuses what the board could not play or C++ should not hold', () => {
    for (const url of [
      '', 'ftp://example.com/a.mp3', 'example.com/live.mp3', 'http://',
      'http://example.com/a b.mp3', 'http://example.com/"quoted"', 'http://example.com/a\\b',
      'http://example.com/<script>', 'http://[2001:db8::1]/live', 'http://user:pass@example.com/live',
      'http://example.com/live#frag', `http://example.com/${'a'.repeat(260)}`, 'http://exämple.com/live',
    ]) expect(radioStationUrlProblem(url), url).not.toBeNull()
  })
})

describe('station names', () => {
  it('cleans an outside name and falls back to the stream host', () => {
    expect(cleanRadioStationName('  Jazz\n\tFM  ')).toBe('Jazz FM')
    expect(cleanRadioStationName('', 'http://radio.example.com:8000/live')).toBe('radio.example.com')
    expect([...cleanRadioStationName('x'.repeat(80))]).toHaveLength(40)
    expect(radioStationNameProblem('Radio Ñandú')).toBeNull()
    expect(radioStationNameProblem('bad\u0007name')).not.toBeNull()
  })
})

describe('normalizeRadioStations', () => {
  it('keeps valid stations once each, in order, up to the limit', () => {
    const stations = normalizeRadioStations([
      { name: 'A', url: 'http://a.example.com/live' },
      { name: 'dup', url: 'http://a.example.com/live' },
      { name: 'bad', url: 'javascript:alert(1)' },
      'nonsense',
      { url: 'http://b.example.com/live' },
    ])
    expect(stations).toEqual([
      { name: 'A', url: 'http://a.example.com/live' },
      { name: 'b.example.com', url: 'http://b.example.com/live' },
    ])
    const many = Array.from({ length: 80 }, (_, i) => ({ name: `S${i}`, url: `http://s${i}.example.com/` }))
    expect(normalizeRadioStations(many)).toHaveLength(RADIO_STATIONS_MAX)
    expect(normalizeRadioStations('not a list')).toEqual([])
  })

  it('names the entries it would drop', () => {
    expect(invalidRadioStations([
      { name: 'A', url: 'http://a.example.com/live' },
      { name: 'B', url: 'http://b.example.com/a b' },
    ])).toEqual([{ index: 1, problem: expect.stringContaining('space') }])
  })
})

describe('playlists', () => {
  it('reads the extended M3U the board reads, and writes it back', () => {
    const text = '﻿#EXTM3U\r\n#EXTINF:-1,Jazz FM\r\nhttp://jazz.example.com/live\r\n\r\n# comment\r\nhttp://plain.example.com/\r\nnot a url\r\n'
    const stations = parseRadioPlaylist(text)
    expect(stations).toEqual([
      { name: 'Jazz FM', url: 'http://jazz.example.com/live' },
      { name: 'plain.example.com', url: 'http://plain.example.com/' },
    ])
    expect(parseRadioPlaylist(radioStationsM3u(stations))).toEqual(stations)
  })
})

describe('station page', () => {
  it('accepts no code, or a printable one of sensible length', () => {
    expect(radioAccessCodeProblem('')).toBeNull()
    expect(radioAccessCodeProblem('secret-123')).toBeNull()
    expect(radioAccessCodeProblem('short')).not.toBeNull()
    expect(radioAccessCodeProblem('has space')).not.toBeNull()
    expect(radioAccessCodeProblem('x'.repeat(33))).not.toBeNull()
  })

  it('moves off port 80 when a Web Remote already serves it', () => {
    expect(radioStationPagePort(false)).toBe(80)
    expect(radioStationPagePort(true)).toBe(8080)
  })
})
