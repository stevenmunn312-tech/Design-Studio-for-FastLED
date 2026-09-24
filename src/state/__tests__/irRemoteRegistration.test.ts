import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraphStore } from '../graphStore'
import {
  NODE_LIBRARY,
  gpioRequirementForProperty,
  isGpioPinProperty,
  libraryDefaults,
} from '../nodeLibrary'
import { isHardwareLibraryHiddenNodeType, isHardwareManagedSignalNodeType } from '../hardware'
import { busAssignmentFor } from '../busTopology'
import { collectPinUses, buildHardwareManifest } from '../../build/hardwareManifest'
import { IR_REMOTE_LEARN_HANDLE, irRemoteButtonHandle } from '../irRemote'
import { IR_RECEIVER_MODULES, irReceiverModuleFor } from '../irModules'
import { partById } from '../partCatalogue'
import { resolvePartIdentity } from '../partOptions'
import {
  peripheralGroundPadIndex,
  peripheralPadLabel,
  peripheralPowerPadIndex,
  peripheralSignalPadIndex,
} from '../../components/BuildDiagram/physicalDiagramLayout'
import type { StudioEdge, StudioNode } from '../graphStore'
import type { HardwareManifestItem } from '../../build/hardwareManifest'

/*
 * The registration half of the IR receiver: the surfaces a hardware part has
 * to appear on before anything can be wired to it or built from it. The mapping
 * primitives themselves are `irRemote.test.ts`; this file is about the node.
 */

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def?.label ?? nodeType, nodeType, category: def?.category ?? 'input',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, sourceHandle: sh, target: t, targetHandle: th }) as unknown as StudioEdge

const button = (id: string, label: string, command: number, repeat: 'once' | 'held' = 'once') =>
  ({ id, label, protocol: 'NEC', address: 0, command, repeat })

const nodeOf = (id: string) => useGraphStore.getState().nodes.find((entry) => entry.id === id)
const outputsOf = (id: string) => ((nodeOf(id)?.data.outputs ?? []) as Array<{ id: string }>)
  .map((port) => port.id)
const buttonsOf = (id: string) =>
  (nodeOf(id)?.data.properties.buttons ?? []) as Array<{ id: string; label: string; protocol: string }>

describe('IRRemoteInput is registered as hardware', () => {
  it('is owned by the bench and kept out of the node library', () => {
    // Both, and for different reasons: it carries a signal, so it lives in the
    // root graph and draws on the canvas; but it is a physical part, so it can
    // only arrive by being added to the bench.
    expect(isHardwareManagedSignalNodeType('IRRemoteInput')).toBe(true)
    expect(isHardwareLibraryHiddenNodeType('IRRemoteInput')).toBe(true)
  })

  it('claims one exclusive digital-input pin with no pull-up', () => {
    expect(isGpioPinProperty('IRRemoteInput', 'pin')).toBe(true)
    // A receiver drives the line itself. A pull-up would fight its output
    // stage rather than hold an idle level, as it would on a PIR.
    expect(gpioRequirementForProperty('IRRemoteInput', 'pin', {}))
      .toEqual({ capability: 'digitalInput', pullup: false })
    // Nothing shares the line, so it needs no bus row of its own — the
    // default claim is what an exclusive pin means.
    expect(busAssignmentFor('IRRemoteInput', 'pin')).toEqual({ kind: 'none', role: 'exclusive' })
  })

  it('costs one pin however many keys are learned', () => {
    const remote = node('ir', 'IRRemoteInput', {
      pin: 13,
      buttons: [button('power', 'Power', 69), button('up', 'Up', 70), button('down', 'Down', 71)],
    })
    const uses = collectPinUses([remote]).filter((use) => use.nodeType === 'IRRemoteInput')
    expect(uses).toHaveLength(1)
    expect(uses[0].pin).toBe(13)
    expect(uses[0].propertyKey).toBe('pin')
  })

  it('reaches the build manifest as its own peripheral kind', () => {
    const manifest = buildHardwareManifest(
      [node('ir', 'IRRemoteInput', { pin: 13, buttons: [button('power', 'Power', 69)] })],
      [],
      'esp32:esp32:esp32s3',
    )
    const item = manifest.primaryItems.find((entry) => entry.sourceNodeType === 'IRRemoteInput')
    expect(item?.kind).toBe('ir-input')
    expect(item?.supported).toBe(true)
    expect(item?.pins).toHaveLength(1)
  })
})

describe('IRRemoteInput ports follow its learned keys', () => {
  it('mints one output per key, with the Learn socket trailing', () => {
    useGraphStore.getState().loadGraph(
      [node('ir', 'IRRemoteInput', { buttons: [button('power', 'Power', 69), button('up', 'Up', 70)] })],
      [],
    )
    expect(outputsOf('ir')).toEqual([
      irRemoteButtonHandle('power'), irRemoteButtonHandle('up'), IR_REMOTE_LEARN_HANDLE,
    ])
  })

  it('keeps a wired key whose saved mapping was lost', () => {
    /*
     * A damaged save must not take a live wire with it. The retained row has
     * no protocol, which is what makes it visibly invalid to validation rather
     * than a plausible mapping nobody authored — the wire survives to be
     * repaired instead of disappearing from the canvas.
     */
    useGraphStore.getState().loadGraph(
      [
        node('ir', 'IRRemoteInput', { buttons: 'not an array' }),
        node('step', 'StepValue'),
      ],
      [edge('e1', 'ir', irRemoteButtonHandle('power'), 'step', 'increase')],
    )

    expect(outputsOf('ir')).toEqual([irRemoteButtonHandle('power'), IR_REMOTE_LEARN_HANDLE])
    expect(buttonsOf('ir').map((entry) => entry.id)).toEqual(['power'])
    expect(buttonsOf('ir')[0].protocol).toBe('')
    expect(useGraphStore.getState().edges).toHaveLength(1)
  })

  it('does not invent a key from a wire on the Learn socket', () => {
    // That socket is an invitation, not a signal. A stray edge on it must not
    // become a mapping nobody learned.
    useGraphStore.getState().loadGraph(
      [node('ir', 'IRRemoteInput'), node('step', 'StepValue')],
      [edge('e1', 'ir', IR_REMOTE_LEARN_HANDLE, 'step', 'increase')],
    )
    expect(buttonsOf('ir')).toEqual([])
    expect(outputsOf('ir')).toEqual([IR_REMOTE_LEARN_HANDLE])
  })

  it('keeps every wire across a save and reload when a key is renamed', () => {
    const remote = node('ir', 'IRRemoteInput', { buttons: [button('power', 'Power', 69)] })
    useGraphStore.getState().loadGraph([remote, node('step', 'StepValue')], [
      edge('e1', 'ir', irRemoteButtonHandle('power'), 'step', 'increase'),
    ])

    // The handle comes from the entry id, never the label, so the label is
    // free to change.
    const renamed = JSON.parse(JSON.stringify(nodeOf('ir'))) as StudioNode
    renamed.data.properties.buttons = [button('power', 'On / Off', 69)]
    useGraphStore.getState().loadGraph([renamed, node('step', 'StepValue')], [
      edge('e1', 'ir', irRemoteButtonHandle('power'), 'step', 'increase'),
    ])

    expect(outputsOf('ir')).toEqual([irRemoteButtonHandle('power'), IR_REMOTE_LEARN_HANDLE])
    expect((nodeOf('ir')?.data.outputs as Array<{ label: string }>)[0].label).toBe('On / Off')
    expect(useGraphStore.getState().edges).toHaveLength(1)
  })
})

describe('editing learned IR keys', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGraphStore.setState({
      nodes: [], edges: [], activeGraphId: 'root',
      graphs: { root: { id: 'root', name: 'Main' } }, graphData: {},
    } as never)
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().clear()
  })
  afterEach(() => vi.useRealTimers())

  it('adds, renames and removes a key in single undo steps, and keeps the wires of a rename', () => {
    useGraphStore.getState().loadGraph(
      [node('ir', 'IRRemoteInput', { buttons: [button('power', 'Power', 69)] }), node('step', 'StepValue')],
      [edge('e1', 'ir', irRemoteButtonHandle('power'), 'step', 'increase')],
    )
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().clear()

    useGraphStore.getState().addIrRemoteButton('ir')
    vi.advanceTimersByTime(400)
    useGraphStore.getState().updateIrRemoteButton('ir', 'power', { label: 'On / Off' })
    vi.advanceTimersByTime(400)

    expect(buttonsOf('ir').map((entry) => entry.label)).toEqual(['On / Off', 'Button 2'])
    expect(useGraphStore.getState().edges).toHaveLength(1)
    expect(outputsOf('ir')).toContain(irRemoteButtonHandle('power'))

    useGraphStore.temporal.getState().undo()
    expect(buttonsOf('ir').find((entry) => entry.id === 'power')?.label).toBe('Power')
    useGraphStore.temporal.getState().undo()
    expect(buttonsOf('ir')).toHaveLength(1)

    useGraphStore.getState().removeIrRemoteButton('ir', 'power')
    vi.advanceTimersByTime(400)
    expect(buttonsOf('ir')).toEqual([])
    expect(useGraphStore.getState().edges).toEqual([])
    useGraphStore.temporal.getState().undo()
    expect(buttonsOf('ir')).toHaveLength(1)
    expect(useGraphStore.getState().edges).toHaveLength(1)
  })
})

describe('the offered IR receivers', () => {
  const itemFor = (partId: string): HardwareManifestItem => ({
    id: 'ir-input:ir', kind: 'ir-input', title: 'IR Remote', subtitle: '',
    sourceNodeId: 'ir', supported: true,
    pins: [{ propertyKey: 'pin' }] as HardwareManifestItem['pins'],
    facts: { partId },
  } as HardwareManifestItem)

  it.each(IR_RECEIVER_MODULES.map((module) => [module.partId] as const))(
    'catalogues %s with a render and a measured size',
    (partId) => {
      const entry = partById(partId)
      expect(entry, `${partId} is not in the catalogue`).toBeDefined()
      expect(entry!.render?.file).toBeTruthy()
      expect(entry!.dimensionsMm.width).toBeGreaterThan(0)
      expect(entry!.pinLabelsLeftToRight).toHaveLength(3)
    },
  )

  it.each(IR_RECEIVER_MODULES.map((module) => [module.partId] as const))(
    'finds supply, ground and signal on %s by the name it prints',
    (partId) => {
      const item = itemFor(partId)
      const label = (index: number) => peripheralPadLabel(item, index)
      // Every role resolves to a distinct pad. A name the tables cannot see
      // falls back to a guess, which is how a wire lands on its neighbour.
      const power = peripheralPowerPadIndex(item)!
      const ground = peripheralGroundPadIndex(item)
      const signal = peripheralSignalPadIndex(item, 0)
      expect(new Set([power, ground, signal]).size, `${partId}: ${label(power)}/${label(ground)}/${label(signal)}`).toBe(3)
      expect(label(signal)).toMatch(/^(S|OUT)$/)
      expect(label(ground)).toMatch(/^(GND|-)$/)
      expect(label(power)).toMatch(/^(\+|VS)$/)
    },
  )

  /*
   * The fact the whole two-part split exists for.
   *
   * A KY-022 puts its supply on the centre pin and a TSOP38238 puts ground
   * there, so the two cannot share one catalogue entry however similar they
   * look on a shelf. Asserted as a difference rather than as two literals, so
   * it still means something if either module's own labels are re-measured.
   */
  it('keeps the two receivers on different centre pins', () => {
    const roleOfCentre = (partId: string) => {
      const item = itemFor(partId)
      if (peripheralPowerPadIndex(item) === 1) return 'supply'
      if (peripheralGroundPadIndex(item) === 1) return 'ground'
      return 'signal'
    }
    expect(roleOfCentre('ky-022-ir-receiver-module')).toBe('supply')
    expect(roleOfCentre('tsop38238-ir-receiver')).toBe('ground')
  })

  it('resolves an unset or stale module to the one the shelf offers first', () => {
    expect(irReceiverModuleFor(undefined)).toBe(IR_RECEIVER_MODULES[0])
    expect(irReceiverModuleFor('a-receiver-nobody-catalogued')).toBe(IR_RECEIVER_MODULES[0])
    expect(resolvePartIdentity('IRRemoteInput', {})?.option.id).toBe(IR_RECEIVER_MODULES[0].partId)
    expect(resolvePartIdentity('IRRemoteInput', { partId: 'tsop38238-ir-receiver' })?.option.id)
      .toBe('tsop38238-ir-receiver')
  })

  it('names the module on the manifest item it builds', () => {
    const manifest = buildHardwareManifest(
      [node('ir', 'IRRemoteInput', { pin: 13, partId: 'tsop38238-ir-receiver' })],
      [],
      'esp32:esp32:esp32s3',
    )
    const item = manifest.primaryItems.find((entry) => entry.sourceNodeType === 'IRRemoteInput')
    expect(item?.facts.partId).toBe('tsop38238-ir-receiver')
  })
})
