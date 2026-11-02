import { describe, expect, it } from 'vitest'
import {
  channelMarks, channelPath, laneCommands, nearestClipStart, newLaneEvent, paletteClips, patternClips,
  rulerTicks, snapModes, zoomAround,
} from '../showLanes'
import type { ShowEvent, ShowFile } from '../../../types/showFile'

const speed = (event: ShowEvent) => event.cmd === 'SET_SPEED'

describe('show lane helpers', () => {
  it('draws a ramp from the value in force and cuts it where the next event starts', () => {
    const events: ShowEvent[] = [
      { t: 1000, cmd: 'SET_SPEED', params: { value: 3, rampMs: 2000 } },
      { t: 2000, cmd: 'SET_SPEED', params: { value: 0 } },
    ]
    expect(channelPath(events, speed, 1, 4000)).toEqual([
      { t: 0, v: 1 },
      { t: 1000, v: 1 },
      // Halfway up the ramp when the second event lands on it.
      { t: 2000, v: 2 },
      { t: 2000, v: 0 },
      { t: 4000, v: 0 },
    ])
    expect(channelMarks(events, speed, 1)).toEqual([
      { index: 0, t: 1000, from: 1, to: 3, rampMs: 2000 },
      { index: 1, t: 2000, from: 2, to: 0, rampMs: 0 },
    ])
  })

  it('starts a new event on the value in force, so adding one changes nothing', () => {
    const show: ShowFile = {
      version: 2, songTitle: 'S', durationMs: 10000, bpm: 120, patternSet: ['a', 'b'],
      events: [
        { t: 0, cmd: 'SET_PATTERN', params: { index: 1 } },
        { t: 0, cmd: 'SET_PALETTE', params: { name: 'lava' } },
        { t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 0 } },
        { t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 200, rampMs: 4000 } },
      ],
    }
    expect(newLaneEvent(show, show.events, 'SET_BRIGHTNESS', 1000).params).toEqual({ value: 50 })
    expect(newLaneEvent(show, show.events, 'SET_PALETTE', 5000).params).toEqual({ name: 'lava' })
    expect(newLaneEvent(show, show.events, 'SET_PATTERN', 5000).params).toEqual({ index: 1 })
    expect(newLaneEvent(show, show.events, 'SET_SPEED', 5000).params).toEqual({ value: 1 })
    expect(newLaneEvent(show, show.events, 'TRANSITION', 99999).t).toBe(10000)
  })

  it('spaces ruler ticks for the window and zooms around the pointer', () => {
    expect(rulerTicks(0, 60000, 840)).toEqual([0, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000, 60000])
    expect(rulerTicks(21000, 26000, 840)).toEqual([21000, 21500, 22000, 22500, 23000, 23500, 24000, 24500, 25000, 25500, 26000])
    // The anchor sits a quarter of the way in before and after the zoom.
    const zoomed = zoomAround(1, 0, 15000, 2, 60000)
    expect(zoomed).toEqual({ zoom: 2, startMs: 7500 })
    expect((15000 - zoomed.startMs) / (60000 / zoomed.zoom)).toBe(0.25)
    expect(zoomAround(32, 0, 0, 2, 60000).zoom).toBe(32)
  })

  it('offers only the snaps that have marks and leaves flashes out of a sequence', () => {
    expect(snapModes([], [])).toEqual(['none'])
    expect(snapModes([0, 500], [{ startMs: 0, endMs: 1, type: 'intro', energy: 0 }])).toEqual(['beat', 'section', 'none'])
    expect(laneCommands('sequence')).not.toContain('BEAT_FLASH')
    expect(laneCommands('song')).toContain('PARTICLE_BURST')
    expect(laneCommands('song')).not.toContain('SET_PARAM')
  })

  it('runs a palette to the next one and snaps sequence values to step starts', () => {
    const show: ShowFile = {
      version: 2, songTitle: 'S', durationMs: 9000, bpm: 120,
      events: [
        { t: 0, cmd: 'SET_PATTERN', params: { index: 0 } },
        { t: 0, cmd: 'SET_PALETTE', params: { name: 'ocean' } },
        { t: 4000, cmd: 'SET_PATTERN', params: { index: 1 } },
        { t: 6000, cmd: 'SET_PALETTE', params: { name: 'lava' } },
      ],
    }
    expect(paletteClips(show.events, show.durationMs)).toEqual([
      { start: 0, end: 6000, eventIndex: 1, name: 'ocean' },
      { start: 6000, end: 9000, eventIndex: 3, name: 'lava' },
    ])
    const clips = patternClips(show)
    expect(nearestClipStart(clips, 1500)).toBe(0)
    expect(nearestClipStart(clips, 3100)).toBe(4000)
  })
})
