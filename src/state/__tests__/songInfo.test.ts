import { describe, it, expect, beforeEach } from 'vitest'
import {
  SONG_INFO_PORTS, SONG_STATUSES, SONG_TAG_FIELDS,
  blankSongInfo, resolveSongInfo, songInfoOutputs,
} from '../songInfo'
import { NODE_LIBRARY } from '../nodeLibrary'
import { evaluateGraphFull, resetEvaluatorState } from '../graphEvaluator'
import { usePlayerTransport } from '../playerTransport'
import type { StudioNode } from '../graphStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'show', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

describe('the Music Player reports what it is playing', () => {
  it('publishes a port for every song field', () => {
    const def = NODE_LIBRARY.find((n) => n.type === 'PatternMaster')!
    const ids = def.outputs.map((port) => port.id)
    expect(ids[0]).toBe('frame')
    for (const port of SONG_INFO_PORTS) {
      expect(ids, port.id).toContain(port.id)
      expect(def.outputs.find((p) => p.id === port.id)!.dataType).toBe(port.dataType)
    }
  })

  it('carries the tags a display would want as text', () => {
    const def = NODE_LIBRARY.find((n) => n.type === 'PatternMaster')!
    const strings = def.outputs.filter((port) => port.dataType === 'string').map((port) => port.id)
    for (const field of SONG_TAG_FIELDS) expect(strings, field).toContain(field)
    expect(strings).toContain('status')
  })

  it('maps every port onto a real field', () => {
    const outputs = songInfoOutputs(blankSongInfo())
    for (const port of SONG_INFO_PORTS) expect(outputs[port.id], port.id).toBeDefined()
    expect(Object.keys(outputs)).toHaveLength(SONG_INFO_PORTS.length)
  })
})

describe('what the browser can honestly report', () => {
  it('is stopped with nothing loaded', () => {
    const info = resolveSongInfo({})
    expect(info.status).toBe('STOPPED')
    expect(SONG_STATUSES).toContain(info.status)
  })

  it('separates paused from stopped', () => {
    expect(resolveSongInfo({ loaded: true, playing: false }).status).toBe('PAUSED')
    expect(resolveSongInfo({ loaded: true, playing: true }).status).toBe('PLAYING')
  })

  it('derives remaining and progress from the position', () => {
    const info = resolveSongInfo({ posMs: 30_000, durationMs: 120_000, loaded: true })
    expect(info.elapsedSec).toBe(30)
    expect(info.remainingSec).toBe(90)
    expect(info.progress).toBe(0.25)
  })

  it('never runs past the end of the track', () => {
    const info = resolveSongInfo({ posMs: 200_000, durationMs: 120_000, loaded: true })
    expect(info.elapsedSec).toBe(120)
    expect(info.remainingSec).toBe(0)
    expect(info.progress).toBe(1)
  })

  /*
   * The case the feature exists for: a card of files the app has never seen.
   * A filename is not an artist, and guessing one would put a wrong name on a
   * screen — worse than a blank row, because a blank row is obviously blank.
   */
  it('leaves the tag fields empty rather than guessing them', () => {
    const info = resolveSongInfo({ title: 'Pink Floyd - Time.mp3', loaded: true })
    expect(info.title).toBe('Pink Floyd - Time.mp3')
    for (const field of ['artist', 'album', 'genre', 'year'] as const) {
      expect(info[field], field).toBe('')
    }
    expect(info.bitrateKbps).toBe(0)
  })
})

describe('the node publishes it', () => {
  beforeEach(() => {
    resetEvaluatorState()
    usePlayerTransport.setState({ transport: null, posMs: 0, playing: false, volume: 0.5 })
  })

  const outputsOf = () =>
    evaluateGraphFull([node('m', 'PatternMaster')], [], 0, 8, 8).outputs.get('m') ?? {}

  it('reports stopped with no transport', () => {
    expect(outputsOf().status).toBe('STOPPED')
    expect(outputsOf().playing).toBe(false)
  })

  it('reports the loaded track', () => {
    usePlayerTransport.setState({
      transport: {
        nodeId: 'gen', title: 'Midnight Drive', durationMs: 200_000,
        hasPrev: false, hasNext: false, toggle: () => {}, seek: () => {}, prev: () => {}, next: () => {},
      },
      posMs: 50_000, playing: true, volume: 0.75,
    })
    const out = outputsOf()
    expect(out.title).toBe('Midnight Drive')
    expect(out.status).toBe('PLAYING')
    expect(out.elapsed).toBe(50)
    expect(out.remaining).toBe(150)
    expect(out.progress).toBeCloseTo(0.25)
  })

  it('still produces a frame alongside the song information', () => {
    expect(outputsOf().frame).toBeDefined()
  })
})
