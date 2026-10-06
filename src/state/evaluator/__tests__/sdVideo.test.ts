import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateGraph } from '../../graphEvaluator'
import { NODE_LIBRARY, libraryDefaults } from '../../nodeLibrary'
import {
  asSdVideoClip, encodeSdv, parseSdvHeader, SDV_HEADER_BYTES, SDV_MAX_SIDE, sdvBandwidth, sdvFrameBytes,
  sdvFrameIndex, sdvPath, sdvSourceIndex, sdvSpeed,
} from '../sdVideo'
import { deleteSdVideo, getSdVideoBytes, saveSdVideo } from '../../sdVideoStore'
import { clipFrameCount, coverRect } from '../../../utils/sdVideoImport'
import { findSdVideoErrors } from '../../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../../graphStore'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def?.label ?? nodeType, nodeType, category,
      properties: { ...libraryDefaults(nodeType), ...props }, inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}
const edge = (id: string, source: string, sh: string, target: string, th: string) =>
  ({ id, source, target, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

/** A clip whose frame `f` is a flat colour (f * 10, f, 255 - f), pixel (x, y)
 *  nudging red by x so a resample is visible. */
function clipBytes(w: number, h: number, fps: number, frames: number): Uint8Array {
  const data = new Uint8Array(sdvFrameBytes(w, h) * frames)
  for (let f = 0; f < frames; f++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const at = f * sdvFrameBytes(w, h) + (y * w + x) * 3
        data[at] = f * 10 + x; data[at + 1] = f; data[at + 2] = 255 - f
      }
    }
  }
  return encodeSdv(w, h, fps, frames, data)
}

describe('sdv file format', () => {
  it('round-trips a header and refuses anything else', () => {
    const bytes = clipBytes(4, 3, 24, 5)
    expect(parseSdvHeader(bytes)).toEqual({ w: 4, h: 3, fps: 24, frames: 5 })
    expect(bytes.length).toBe(SDV_HEADER_BYTES + 4 * 3 * 3 * 5)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('SDV1')
    expect(parseSdvHeader(bytes.slice(0, 20))).toBeNull()
    expect(parseSdvHeader(new Uint8Array(40))).toBeNull()
    const bad = bytes.slice(); bad[0] = 0x58
    expect(parseSdvHeader(bad)).toBeNull()
  })

  it('validates clip records', () => {
    const ok = { id: 'a', name: 'x.mp4', w: 16, h: 16, fps: 30, frames: 10 }
    expect(asSdVideoClip(ok)).toEqual(ok)
    expect(asSdVideoClip({ ...ok, w: SDV_MAX_SIDE + 1 })).toBeNull()
    expect(asSdVideoClip({ ...ok, fps: 0 })).toBeNull()
    expect(asSdVideoClip({ ...ok, frames: 0 })).toBeNull()
    expect(asSdVideoClip({ ...ok, id: '' })).toBeNull()
    expect(asSdVideoClip(null)).toBeNull()
  })

  it('makes a card path from any file name that is safe in C and on FAT', () => {
    expect(sdvPath('My Holiday (final).MP4')).toBe('/video/My_Holiday_final.sdv')
    expect(sdvPath('a"; system("x")//.mov')).toBe('/video/a_system_x.sdv')
    expect(sdvPath('!!!.mp4')).toBe('/video/clip.sdv')
    expect(sdvPath('x'.repeat(80) + '.mp4').length).toBe('/video/'.length + 32 + '.sdv'.length)
  })

  it('prices bandwidth from the frame size and rate', () => {
    expect(sdvBandwidth(16, 16, 30)).toBe(23040)
    expect(sdvBandwidth(64, 64, 60)).toBe(737280)
  })
})

describe('sdv playback rules', () => {
  it('picks the frame from the clock, looping or holding the last', () => {
    expect(sdvFrameIndex(0, 30, 1, 10, true)).toBe(0)
    expect(sdvFrameIndex(0.1, 30, 1, 10, true)).toBe(3)
    expect(sdvFrameIndex(1, 30, 1, 10, true)).toBe(0)
    expect(sdvFrameIndex(0.34, 30, 1, 10, true)).toBe(0)
    expect(sdvFrameIndex(5, 30, 1, 10, false)).toBe(9)
    expect(sdvFrameIndex(0.1, 30, 2, 10, true)).toBe(6)
    expect(sdvFrameIndex(-3, 30, 1, 10, true)).toBe(0)
    expect(sdvFrameIndex(9, 30, 0, 10, true)).toBe(0)
  })

  it('clamps speed to zero through four', () => {
    expect(sdvSpeed(-1)).toBe(0)
    expect(sdvSpeed(99)).toBe(4)
    expect(sdvSpeed('nope')).toBe(1)
    expect(sdvSpeed(undefined)).toBe(1)
  })

  it('maps canvas pixels to clip pixels by nearest', () => {
    expect(Array.from({ length: 8 }, (_, x) => sdvSourceIndex(x, 8, 4))).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
    expect(Array.from({ length: 4 }, (_, x) => sdvSourceIndex(x, 4, 8))).toEqual([0, 2, 4, 6])
    expect(sdvSourceIndex(3, 4, 4)).toBe(3)
  })
})

describe('SD Video node preview', () => {
  const clip = { id: 'clip-test', name: 'demo.mp4', w: 4, h: 2, fps: 10, frames: 6 }

  beforeEach(async () => { await deleteSdVideo(clip.id) })

  function play(props: Record<string, unknown>, t: number, W = 4, H = 2) {
    return evaluateGraph(
      [node('v', 'SDVideo', 'pattern', props), node('out', 'MatrixOutput', 'output', {})],
      [edge('e', 'v', 'frame', 'out', 'frame')], t * 60, W, H,
    )!
  }

  it('is black with no clip, and black while the bytes have not loaded', async () => {
    const empty = play({}, 0)
    expect(empty.flat().every((p) => !p.r && !p.g && !p.b)).toBe(true)
    const unloaded = play({ clip }, 0)
    expect(unloaded.flat().every((p) => !p.r && !p.g && !p.b)).toBe(true)
    expect(getSdVideoBytes(clip.id)).toBeNull()
  })

  it('plays the frame the clock selects, at the clip size', async () => {
    await saveSdVideo(clip.id, clipBytes(4, 2, 10, 6))
    const first = play({ clip }, 0)
    expect(first[0][0]).toEqual({ r: 0, g: 0, b: 255 })
    expect(first[1][3]).toEqual({ r: 3, g: 0, b: 255 })
    const later = play({ clip }, 0.25)
    expect(later[0][0]).toEqual({ r: 20, g: 2, b: 253 })
  })

  it('loops by default, holds the last frame with loop off, and follows speed', async () => {
    await saveSdVideo(clip.id, clipBytes(4, 2, 10, 6))
    expect(play({ clip }, 0.6)[0][0].g).toBe(0)
    expect(play({ clip, loop: false }, 0.6)[0][0].g).toBe(5)
    expect(play({ clip, loop: false }, 30)[0][0].g).toBe(5)
    expect(play({ clip, speed: 2 }, 0.2)[0][0].g).toBe(4)
    expect(play({ clip, speed: 0 }, 0.4)[0][0].g).toBe(0)
  })

  it('stretches a clip onto a canvas of another size by nearest pixel', async () => {
    await saveSdVideo(clip.id, clipBytes(4, 2, 10, 6))
    const big = play({ clip }, 0, 8, 4)
    expect(big[0].map((p) => p.r)).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
    expect(big).toHaveLength(4)
  })

  it('ignores a clip whose stored bytes disagree with its record', async () => {
    await saveSdVideo(clip.id, clipBytes(2, 2, 10, 6))
    expect(play({ clip }, 0).flat().every((p) => !p.r && !p.g && !p.b)).toBe(true)
  })
})

describe('importer helpers', () => {
  it('cover-fits a picture onto the canvas, centred and never stretched', () => {
    const wide = coverRect(160, 90, 16, 16)
    expect(wide.h).toBe(16)
    expect(wide.y).toBe(0)
    expect(wide.w).toBeCloseTo(16 * 160 / 90, 9)
    expect(wide.x).toBeCloseTo(-(wide.w - 16) / 2, 9)
    const square = coverRect(50, 50, 16, 16)
    expect(square).toEqual({ x: 0, y: 0, w: 16, h: 16 })
    const tall = coverRect(9, 16, 16, 16)
    expect(tall.w).toBe(16)
    expect(tall.y).toBeLessThan(0)
  })

  it('counts frames and reports a clip cut at the length limit', () => {
    expect(clipFrameCount(2, 30)).toEqual({ frames: 60, truncated: false })
    expect(clipFrameCount(0.01, 30)).toEqual({ frames: 1, truncated: false })
    expect(clipFrameCount(600, 30)).toEqual({ frames: 120 * 30, truncated: true })
  })
})

describe('SD Video deploy checks', () => {
  const clip = { id: 'c', name: 'a.mp4', w: 16, h: 16, fps: 30, frames: 10 }
  const graph = (videoProps: Record<string, unknown>, extra: StudioNode[] = []) => ({
    nodes: [node('v', 'SDVideo', 'pattern', videoProps), node('out', 'MatrixOutput', 'output', {}), ...extra],
    edges: [edge('e', 'v', 'frame', 'out', 'frame')],
  })

  it('needs a clip, an SD card and an ESP32-family board', () => {
    const bare = graph({})
    const errors = findSdVideoErrors(bare.nodes, bare.edges, 'esp8266:esp8266:nodemcuv2')
    expect(errors.some((e) => /has no clip/.test(e))).toBe(true)
    expect(errors.some((e) => /SD Card part/.test(e))).toBe(true)
    expect(errors.some((e) => /ESP32-family/.test(e))).toBe(true)
  })

  it('passes with a clip, a card and an ESP32', () => {
    const ok = graph({ clip }, [node('sd', 'SDCard', 'show')])
    expect(findSdVideoErrors(ok.nodes, ok.edges, 'esp32:esp32:esp32')).toEqual([])
  })

  it('says nothing about a node that feeds no output, or about no SD Video at all', () => {
    const parked = { nodes: [node('v', 'SDVideo', 'pattern', {}), node('out', 'MatrixOutput', 'output', {})], edges: [] }
    expect(findSdVideoErrors(parked.nodes, parked.edges, 'esp32:esp32:esp32')).toEqual([])
    expect(findSdVideoErrors([node('out', 'MatrixOutput', 'output', {})], [], '')).toEqual([])
  })
})
