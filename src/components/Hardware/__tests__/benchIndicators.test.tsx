import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render } from '@testing-library/react'
import BenchIndicators from '../BenchIndicators'
import { indicatorGlow, indicatorRenderFor } from '../benchIndicatorGlow'
import { BOARD_PROFILES } from '../../../build/boardProfiles'
import type { RenderIndicator } from '../../../build/boardCapabilities'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { evaluateGraphFull, resetEvaluatorState } from '../../../state/graphEvaluator'
import { useHardwareInputStore } from '../../../state/hardwareInputStore'
import { IR_RECEIVER_MODULES } from '../../../state/irModules'
import { IR_RECEIVING_KEY } from '../../../state/irRemote'
import { libraryDefaults, NODE_LIBRARY } from '../../../state/nodeLibrary'
import { PART_CATALOGUE, partById } from '../../../state/partCatalogue'
import { pdTriggerSpec } from '../../../state/pdTrigger'
import { usePreviewStore } from '../../../state/previewStore'
import { relayChannelCountForPart, relayEnergisedKey } from '../../../state/relayModule'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      nodeType,
      category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  } as StudioNode
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id: `${source}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle } as StudioEdge
}

function inside(rect: number[], width: number, height: number) {
  const [x, y, w, h] = rect
  return x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= width && y + h <= height
}

const RELAY_4CH = 'relay-module-4ch-5v'

describe('what lights a bench indicator', () => {
  beforeEach(() => {
    resetEvaluatorState()
    useHardwareInputStore.setState({ button: new Map() })
  })

  it('publishes each relay coil the way the firmware drives it', () => {
    const nodes = [node('btn', 'ButtonInput'), node('relay', 'RelayOutput', { partId: RELAY_4CH })]
    const edges = [edge('btn', 'pressed', 'relay', 'channel2')]
    useHardwareInputStore.getState().setButton('btn', true)
    const outputs = evaluateGraphFull(nodes, edges, 0).outputs.get('relay')
    // Wired and pressed is energised; unwired is off, as `boolExpr` emits.
    expect(outputs?.[relayEnergisedKey(2)]).toBe(true)
    expect(outputs?.[relayEnergisedKey(1)]).toBe(false)
    expect(Object.keys(outputs ?? {})).toHaveLength(relayChannelCountForPart(RELAY_4CH))
  })

  it('publishes that a remote is firing while a key is held', () => {
    const ir = node('ir', 'IRRemoteInput', {
      buttons: [{ id: 'power', label: 'Power', protocol: 'NEC', address: 0, command: 69, repeat: 'once' }],
    })
    expect(evaluateGraphFull([ir], [], 0).outputs.get('ir')?.[IR_RECEIVING_KEY]).toBe(false)
    useHardwareInputStore.getState().setButton('ir:power', true)
    expect(evaluateGraphFull([ir], [], 0.1).outputs.get('ir')?.[IR_RECEIVING_KEY]).toBe(true)
  })

  it('reads each drive from its own node', () => {
    const channel: RenderIndicator = { rectPx: [0, 0, 1, 1], color: [255, 0, 0], drive: 'channel', channel: 2 }
    expect(indicatorGlow(channel, 'RelayOutput', {}, { [relayEnergisedKey(2)]: true }).level).toBe(1)
    expect(indicatorGlow(channel, 'RelayOutput', {}, { [relayEnergisedKey(1)]: true }).level).toBe(0)
    // A dimmed MOSFET channel's LED shows the share of power its load gets.
    expect(indicatorGlow(channel, 'PowerSwitchOutput', { partId: 'monkmakes-mosfetti' }, { load2: 0.4 }).level)
      .toBeCloseTo(0.4)
    const signal: RenderIndicator = { ...channel, drive: 'signal', channel: undefined }
    expect(indicatorGlow(signal, 'IRRemoteInput', {}, { [IR_RECEIVING_KEY]: true }).level).toBe(1)
    expect(indicatorGlow(signal, 'IRRemoteInput', {}, undefined).level).toBe(0)
    const power: RenderIndicator = { ...channel, drive: 'power', channel: undefined }
    expect(indicatorGlow(power, 'Board', {}, undefined).level).toBe(1)
    const voltage: RenderIndicator = {
      ...power, drive: 'voltage', colorsByVoltage: { 5: [255, 32, 24], 20: [40, 90, 255] },
    }
    expect(indicatorGlow(voltage, 'PdTriggerSource', { requestedVoltage: '20' }, undefined).color).toEqual([40, 90, 255])
  })

  it('draws indicators only over the render they were measured on', () => {
    const render = partById(RELAY_4CH)!.render!
    expect(indicatorRenderFor(RELAY_4CH, `/${render.file}`)).toBe(render)
    expect(indicatorRenderFor(RELAY_4CH, '/parts/some-other-picture.webp')).toBeNull()
  })
})

describe('imported indicators', () => {
  it('sit inside their render and name a drive their part has', () => {
    const irParts = new Set(IR_RECEIVER_MODULES.map((module) => module.partId))
    for (const entry of Object.values(PART_CATALOGUE)) {
      const render = entry.render
      for (const indicator of render?.indicators ?? []) {
        expect(inside(indicator.rectPx, render!.widthPx, render!.heightPx), entry.partId).toBe(true)
        if (indicator.drive === 'signal') expect(irParts.has(entry.partId), entry.partId).toBe(true)
        if (indicator.drive === 'voltage') {
          // Every voltage the trigger can ask for has a colour to show.
          for (const volts of pdTriggerSpec(entry.partId).selectableVoltagesV) {
            expect(indicator.colorsByVoltage?.[String(volts)], `${entry.partId} ${volts} V`).toBeDefined()
          }
        }
      }
      // Channel LEDs are numbered 1..N for exactly the part's own channels.
      const channels = (render?.indicators ?? [])
        .filter((indicator) => indicator.drive === 'channel')
        .map((indicator) => indicator.channel)
      if (channels.length) {
        const count = entry.relay?.channels ?? entry.mosfet?.channels
        expect(channels.sort(), entry.partId).toEqual(Array.from({ length: count ?? 0 }, (_, i) => i + 1))
      }
    }
  })

  it('give boards only power LEDs, inside the imported render', () => {
    for (const profile of BOARD_PROFILES) {
      for (const indicator of profile.render?.indicators ?? []) {
        expect(indicator.drive, profile.id).toBe('power')
        expect(inside(indicator.rectPx, profile.render!.widthPx, profile.render!.heightPx), profile.id).toBe(true)
      }
    }
  })
})

describe('the bench overlay', () => {
  afterEach(() => usePreviewStore.getState().clear())

  it('lights a relay channel LED while its coil is energised', () => {
    const relayRender = partById(RELAY_4CH)!.render!
    usePreviewStore.getState().setOutputs(new Map([['relay', { [relayEnergisedKey(3)]: true }]]))
    const { container } = render(
      <BenchIndicators nodeId="relay" nodeType="RelayOutput" properties={{}} render={relayRender} />,
    )
    const lit = () => [...container.querySelectorAll('[data-indicator-lit]')].map((g) => g.getAttribute('data-indicator-lit'))
    expect(lit().sort()).toEqual(['channel', 'power'])
    // The power LED is already lit in the render: it only gains its glow.
    expect(container.querySelector('[data-indicator-lit="power"] rect')).toBeNull()
    expect(container.querySelector('[data-indicator-lit="channel"] rect')).not.toBeNull()

    act(() => usePreviewStore.getState().setOutputs(new Map([['relay', { [relayEnergisedKey(3)]: false }]])))
    expect(lit()).toEqual(['power'])
  })

  it('draws nothing for a render without indicators', () => {
    const { container } = render(
      <BenchIndicators nodeId="x" nodeType="RelayOutput" properties={{}} render={{ widthPx: 10, heightPx: 10 }} />,
    )
    expect(container.querySelector('svg')).toBeNull()
  })
})
