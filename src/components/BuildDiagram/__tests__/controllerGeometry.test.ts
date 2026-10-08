import { describe, expect, it } from 'vitest'
import { BOARD_PROFILES, boardProfileById } from '../../../build/boards/boardProfiles'
import { controllerPowerPoint, controllerRender, renderTerminalPoint } from '../controllerGeometry'

const measured = BOARD_PROFILES.flatMap((profile) => {
  const render = controllerRender(profile)
  return render ? [[profile.id, profile, render] as const] : []
})

describe('measured controller renders', () => {
  it('covers the reviewed boards', () => {
    expect(measured.map(([id]) => id)).toEqual(expect.arrayContaining([
      'espressif-esp32-s3-devkitc-1',
      'esp32-c3-super-mini',
      'esp32-c6-devkitc-1',
      'esp8266-lolin-d1-mini',
      'raspberry-pi-pico-w',
      'teensy-4-1',
      'arduino-nano-esp32',
      'wt32-eth01',
      'quinled-dig-uno',
      'quinled-dig-quad',
    ]))
  })

  it('gives a board with no USB no USB point', () => {
    expect(controllerPowerPoint('usb', boardProfileById('wt32-eth01')!)).toBeUndefined()
    expect(controllerPowerPoint('usb', boardProfileById('arduino-nano-esp32')!)).toBeDefined()
  })

  /*
   * One rail position per header pad: one short and the last wire lands on its
   * neighbour, one long and a pad nobody has gets a wire.
   */
  it.each(measured)('gives %s one measured pad per header pin', (_id, profile, render) => {
    if (render.anchorPoints) {
      expect(Object.keys(render.anchorPoints).sort()).toEqual((profile.pins ?? []).map((pin) => pin.anchorId).sort())
      for (const pin of profile.pins ?? []) {
        const point = renderTerminalPoint(render, pin.anchorId)
        expect(point, pin.anchorId).toBeDefined()
        expect(point!.x).toBeGreaterThan(render.x)
        expect(point!.x).toBeLessThan(render.x + render.width)
        expect(point!.y).toBeGreaterThan(render.y)
        expect(point!.y).toBeLessThan(render.y + render.height)
      }
      return
    }
    const onRail = (prefix: string) => (profile.pins ?? []).filter((pin) => pin.anchorId.startsWith(`${prefix}-`))
    expect(onRail(render.leftPrefix)).toHaveLength(render.pinsPerRail)
    expect(onRail(render.rightPrefix)).toHaveLength(render.pinsPerRail)
    for (const pin of [...onRail(render.leftPrefix), ...onRail(render.rightPrefix)]) {
      const point = renderTerminalPoint(render, pin.anchorId)
      expect(point, pin.anchorId).toBeDefined()
      expect(point!.x).toBeGreaterThan(render.x)
      expect(point!.x).toBeLessThan(render.x + render.width)
      expect(point!.y).toBeGreaterThan(render.y)
      expect(point!.y).toBeLessThan(render.y + render.height)
    }
  })

  it.each(measured)('lands the %s rail stubs on its own 3V3 and ground pads', (_id, profile, render) => {
    const byAnchor = new Map((profile.pins ?? []).map((pin) => [pin.anchorId, pin]))
    expect(byAnchor.get(render.powerAnchors.v3v3)).toMatchObject({ role: 'power-out', label: '3V3' })
    expect(byAnchor.get(render.powerAnchors.ground)?.role).toBe('ground')
  })

  // Pads are measured in the render's own pixels and only ratios reach the
  // sheet, so the spec's aspect must be the shipped image's.
  it.each(measured)('measures %s in the shipped render’s aspect', (id, profile, render) => {
    expect(render.href).toBe(`/boards/${id}.webp`)
    const shipped = profile.render!
    expect(render.sourceHeight / render.sourceWidth).toBeCloseTo(shipped.heightPx / shipped.widthPx, 2)
  })
})
