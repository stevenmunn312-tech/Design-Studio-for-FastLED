import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DisplayDocument, DisplayWidget, PlacedDisplayWidget } from '../displayDocument'
import {
  defaultDisplayWidgetBounds,
  defaultDisplayWidgetProperties,
  displayControlRange,
  displayWidgetHasScale,
  displayWidgetValidationIssues,
  normalizeDisplayWidgetProperties,
} from '../displayRegistry'
import { createDisplayDocument } from '../displayEditor'
import { displayWidgetTargetRangeRepair } from '../displayControlRangeRepair'
import {
  adoptedControlProperties,
  displayControlIsUnconfigured,
  touchControlPlan,
} from '../../player/wireFirstControls'
import {
  customDisplayLvglLoopCpp,
  customDisplayLvglOutputExpression,
  customDisplayLvglSetupCpp,
  type CustomDisplayLvglEmit,
} from '../../../codegen/displays/customDisplayLvglCpp'
import { NODE_LIBRARY } from '../../nodeLibrary'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { normalizeWebRemoteControls, webRemoteStateRange } from '../../peripherals/webRemote'
import { webRemotePageHtml } from '../../peripherals/webRemotePage'
import { logTravelPosition, RANGE_TRAVEL_STEPS, rangePosition } from '../../rangeScale'

/*
 * A Slider or Dial can travel its range logarithmically. The widget's Scale
 * is authored like its range, adopted from a log property when one is wired,
 * and honoured by the preview, the LVGL runtime and the Web Remote page.
 */

function control(
  type: 'Slider' | 'Dial' | 'Step Control',
  properties: DisplayWidget['properties'] = {},
): PlacedDisplayWidget {
  return {
    id: type === 'Step Control' ? 'step' : type.toLowerCase(),
    type,
    label: type,
    bounds: defaultDisplayWidgetBounds(type),
    properties: { ...defaultDisplayWidgetProperties(type), ...properties },
  }
}

const TRAIL = { min: 0.1, max: 120, step: 0.1 }

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...definition.defaultProperties, ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as unknown as StudioNode
}

describe('a Slider or Dial Scale', () => {
  it('is authored on the two controls a finger drags, and kept through a save', () => {
    expect(displayWidgetHasScale('Slider')).toBe(true)
    expect(displayWidgetHasScale('Dial')).toBe(true)
    expect(displayWidgetHasScale('Step Control')).toBe(false)
    expect(normalizeDisplayWidgetProperties('Slider', { ...TRAIL, scale: 'log' }, 120, 32).scale).toBe('log')
    expect(normalizeDisplayWidgetProperties('Dial', { scale: 'log' }, 120, 32).scale).toBe('log')
    // A Step Control has nothing to scale, and an unknown scale is dropped.
    expect('scale' in normalizeDisplayWidgetProperties('Step Control', { scale: 'log' }, 120, 32)).toBe(false)
    expect('scale' in normalizeDisplayWidgetProperties('Slider', { scale: 'cubic' }, 120, 32)).toBe(false)
  })

  it('reads as the control\'s scale only where the range allows it', () => {
    expect(displayControlRange(control('Slider', { ...TRAIL, scale: 'log' })).scale).toBe('log')
    expect(displayControlRange(control('Slider', TRAIL)).scale).toBe('linear')
    expect(displayControlRange(control('Dial', { min: 0, max: 1, scale: 'log' })).scale).toBe('linear')
    expect(displayControlRange(control('Step Control', { ...TRAIL, scale: 'log' })).scale).toBe('linear')
  })

  it('says why a log scale with no minimum above zero is moving linearly', () => {
    const messages = (widget: DisplayWidget) => displayWidgetValidationIssues(widget, 'touch-tft')
      .map((issue) => issue.message).join(' ')
    expect(messages(control('Slider', { min: 0, max: 10, scale: 'log' }))).toContain('A log scale needs a minimum above zero')
    expect(messages(control('Slider', { ...TRAIL, scale: 'log' }))).not.toContain('log scale')
    expect(messages(control('Slider', { min: 0, max: 10 }))).not.toContain('log scale')
  })
})

describe('a log property hands its travel to the control wired to it', () => {
  it('mints a log Slider for Color Trails\' Trail length', () => {
    const plan = touchControlPlan('ColorTrails', 'trailLength', {})
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.spec.type).toBe('Slider')
    expect(plan.spec.properties).toMatchObject({ ...TRAIL, scale: 'log' })
  })

  it('gives a Step Control the range but not the scale, and a linear property no scale', () => {
    const input = { label: 'Trail length', dataType: 'float' as const, propertyKey: 'trailLength' }
    expect(adoptedControlProperties('Step Control', 'ColorTrails', input, {})?.properties).toEqual(TRAIL)
    expect(adoptedControlProperties('Dial', 'ColorTrails', input, {})?.properties).toEqual({ ...TRAIL, scale: 'log' })
    const density = { label: 'Density', dataType: 'float' as const, propertyKey: 'density' }
    expect(adoptedControlProperties('Slider', 'GeometryField', density, {})?.properties).toEqual({ min: 2, max: 40, step: 1 })
  })

  it('treats a chosen scale as a decision adoption will not undo', () => {
    expect(displayControlIsUnconfigured(control('Slider'))).toBe(true)
    expect(displayControlIsUnconfigured(control('Slider', { scale: 'linear' }))).toBe(false)
  })

  it('offers the target\'s scale with its range in the repair, and is satisfied once they match', () => {
    const panel = node('tft', 'TransportDisplay', { displayId: 'screen' })
    const touch = node('touch', 'TouchInput', { panelId: 'tft' })
    const trails = node('ct', 'ColorTrails')
    const edges = [{ id: 'e', source: 'touch', sourceHandle: 'widget:slider:out', target: 'ct', targetHandle: 'trailLength' }] as StudioEdge[]
    const nodes = [panel, touch, trails]
    const linear = displayWidgetTargetRangeRepair('screen', control('Slider', TRAIL), nodes, edges)
    expect(linear).toMatchObject({ ...TRAIL, scale: 'log' })
    expect(displayWidgetTargetRangeRepair('screen', control('Slider', { ...TRAIL, scale: 'log' }), nodes, edges)).toBeNull()
  })
})

describe('a log Slider on the glass', () => {
  const slider = control('Slider', { ...TRAIL, scale: 'log', initial: 14.4 })
  const dial = control('Dial', { min: 1, max: 1000, step: 1, scale: 'log' })
  const plain = control('Slider', TRAIL)
  const emit: CustomDisplayLvglEmit = {
    id: 'panel',
    document: { ...createDisplayDocument('panel', 320, 240), widgets: [slider, { ...dial, id: 'dial' }, { ...plain, id: 'plain' }] } as DisplayDocument,
    bindings: {
      slider: [{ role: 'set', expression: 'n_trail' }],
      plain: [{ role: 'set', expression: 'n_trail' }],
    },
  }
  const setup = customDisplayLvglSetupCpp(emit).join('\n')

  it('holds a place along the travel, seeded where its start sits', () => {
    const position = rangePosition(14.4, 0.1, 120, 'log')
    expect(setup).toContain('_cd_panel[0].minimum = 0.0f;')
    expect(setup).toContain('_cd_panel[0].maximum = 1.0f;')
    expect(setup).toContain('_cd_panel[0].step = 0.0f;')
    expect(setup).toContain(`_cd_panel[0].floatValue = ${Math.round(position * 1e6) / 1e6}f;`)
    expect(setup).toContain(`lv_slider_set_value(_cd_panel[0].object, ${Math.round(position * 10000)}, LV_ANIM_OFF);`)
    // A linear Slider is untouched: its runtime holds the value.
    expect(setup).toContain('_cd_panel[2].maximum = 120.0f;')
    expect(setup).toContain('_cd_panel[2].step = 0.1f;')
  })

  it('reports a value on its step from the place, and turns a reading into a place', () => {
    expect(customDisplayLvglOutputExpression(emit, 'slider')).toBe('_rsLogValue(_cdFloatOutput(_cd_panel[0]), 0.1f, 120.0f, 0.1f)')
    expect(customDisplayLvglOutputExpression(emit, 'dial')).toBe('_rsLogValue(_cdFloatOutput(_cd_panel[1]), 1.0f, 1000.0f, 1.0f)')
    expect(customDisplayLvglOutputExpression(emit, 'plain')).toBe('_cdFloatOutput(_cd_panel[2])')
    const loop = customDisplayLvglLoopCpp(emit).join('\n')
    expect(loop).toContain('_cd_panel[0].floatValue = constrain(_rsLogPosition((float)(n_trail), 0.1f, 120.0f), _cd_panel[0].minimum, _cd_panel[0].maximum);')
    expect(loop).toContain('_cd_panel[2].floatValue = constrain((float)(n_trail), _cd_panel[2].minimum, _cd_panel[2].maximum);')
  })
})

describe('a log Slider on the Web Remote page', () => {
  const [log, linear] = normalizeWebRemoteControls([
    { id: 'trail', type: 'Slider', label: 'Trail', properties: { ...TRAIL, initial: 14.4, scale: 'log' } },
    { id: 'mix', type: 'Slider', label: 'Mix', properties: { min: 0, max: 1, step: 0.01 } },
  ])

  it('keeps the scale with the control', () => {
    expect(log.properties.scale).toBe('log')
    expect(webRemoteStateRange(log)).toEqual({ ...TRAIL, scale: 'log' })
    expect(webRemoteStateRange(linear).scale).toBe('linear')
  })

  it('draws its input as the travel and carries the log helpers only when one is there', () => {
    const page = webRemotePageHtml('Remote', [log, linear])
    expect(page).toContain('data-g="1"')
    expect(page).toContain(`<input id="c0" type="range" min="0" max="${RANGE_TRAVEL_STEPS}" step="1" value="${Math.round(rangePosition(14.4, 0.1, 120, 'log') * RANGE_TRAVEL_STEPS)}">`)
    expect(page).toContain('<input id="c1" type="range" min="0" max="1" step="0.01" value="0">')
    expect(page).toContain('function lv(c,p)')
    expect(page).toContain(`function rv(c,r){return c.dataset.g?lv(c,r.value/${RANGE_TRAVEL_STEPS}):r.value;}`)
    expect(page).toContain(`slide(c,i,rv(c,r))`)

    const plain = webRemotePageHtml('Remote', [linear])
    expect(plain).not.toContain('function lv(')
    expect(plain).not.toContain('rv(c,r)')
    expect(plain).toContain('slide(c,i,r.value)')
  })

  describe('as the board serves it', () => {
    // The board's state, as `/s` and `/set` answer it.
    let board: number[] = []
    const sent: number[] = []

    beforeEach(() => {
      vi.useFakeTimers()
      board = [14.4, 0]
      sent.length = 0
      vi.stubGlobal('fetch', vi.fn((url: string, init?: { body?: string }) => {
        if (url === '/set') {
          const form = new URLSearchParams(init?.body ?? '')
          board[Number(form.get('i'))] = Number(form.get('v'))
          sent.push(Number(form.get('v')))
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([...board]) })
      }))
      // The page's own markup and script, run in this document: off a
      // `srcdoc` frame it talks to the board over fetch.
      const page = webRemotePageHtml('Remote', [log, linear])
      document.body.innerHTML = page.slice(page.indexOf('<body>') + 6, page.indexOf('<script>'))
      new Function(page.slice(page.indexOf('<script>') + 8, page.indexOf('</script>')))()
    })

    afterEach(() => {
      document.body.innerHTML = ''
      vi.unstubAllGlobals()
      vi.useRealTimers()
    })

    it('sends seconds for a place along the travel, and moves the thumb to a reading', async () => {
      const range = document.getElementById('c0') as HTMLInputElement
      const readout = range.parentElement!.querySelector('.o')!
      await vi.advanceTimersByTimeAsync(0)
      expect(Number(range.value)).toBe(logTravelPosition(14.4, 0.1, 120))

      // A drag: input while moving, change on release.
      const drag = async (place: number) => {
        range.value = String(place)
        range.dispatchEvent(new Event('input'))
        range.dispatchEvent(new Event('change'))
        await vi.advanceTimersByTimeAsync(0)
      }
      await drag(RANGE_TRAVEL_STEPS / 2)
      expect(sent.at(-1)).toBe(3.5)
      expect(readout.textContent).toBe('3.5')
      // The thumb settles where 3.5 s sits, not where the finger left it.
      expect(Number(range.value)).toBe(logTravelPosition(3.5, 0.1, 120))

      await drag(RANGE_TRAVEL_STEPS)
      expect(sent.at(-1)).toBe(120)
      await drag(0)
      expect(sent.at(-1)).toBe(0.1)

      // A reading from the board puts the thumb at its place on the next poll.
      board = [17.8, 0.25]
      await vi.advanceTimersByTimeAsync(1000)
      expect(Number(range.value)).toBe(logTravelPosition(17.8, 0.1, 120))
      expect(readout.textContent).toBe('17.8')
      // The linear slider beside it is a value, as it always was.
      expect((document.getElementById('c1') as HTMLInputElement).value).toBe('0.25')
    })
  })
})
