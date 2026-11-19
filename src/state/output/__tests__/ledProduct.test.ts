import { beforeEach, describe, expect, it } from 'vitest'
import { PART_CATALOGUE } from '../../../build/parts/partCatalogue'
import { unresolvedNodes, withoutUnresolved } from '../../../build/parts/partResolution'
import { resolvePartIdentity } from '../../../build/parts/partOptions'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../graphStore'
import { isPropertyEnabled, NODE_LIBRARY } from '../../nodeLibrary'
import {
  applyLedProductEdit,
  clampLedCount,
  ledCountBounds,
  lockedLedKeys,
  makeLedOutputCustom,
  reconcileLedProduct,
  resolveLedProduct,
  stampedLedKeys,
  stampLedProduct,
} from '../ledProduct'

const LED_PARTS = Object.values(PART_CATALOGUE).filter((entry) => entry.ledOutput)
const base = { form: 'strip', ledCount: 60, chipset: 'APA102', colorOrder: 'BGR', width: 16, height: 16 }

describe('LED products', () => {
  it('are the eight bundled LED parts', () => {
    expect(LED_PARTS.map((entry) => entry.partId).sort()).toEqual([
      'hub75-panel-64x64-p4', 'ws2812b-matrix-16x16', 'ws2812b-ring-12', 'ws2812b-ring-16',
      'ws2812b-ring-24', 'ws2812b-ring-60', 'ws2812b-ring-8', 'ws2812b-strip',
    ])
  })

  it('stamp every locked key, for each form and tile count', () => {
    for (const { partId, ledOutput } of LED_PARTS) {
      for (const props of [{ ...base }, { ...base, layout: 'panels', tilesX: 2, tilesY: 3 }]) {
        const stamped = stampLedProduct(props, partId)!
        const keys = stampedLedKeys(ledOutput!, props)
        for (const key of lockedLedKeys(ledOutput!)) {
          expect(keys, `${partId} ${key}`).toContain(key)
          expect(stamped, `${partId} ${key}`).toHaveProperty(key)
        }
      }
    }
  })

  it('never lock the installer\'s two choices', () => {
    for (const { ledOutput } of LED_PARTS) {
      expect(lockedLedKeys(ledOutput!)).not.toContain('colorOrder')
      expect(lockedLedKeys(ledOutput!)).not.toContain('form')
    }
    expect(lockedLedKeys(resolveLedProduct('ws2812b-strip')!.spec)).not.toContain('ledCount')
    expect(lockedLedKeys(resolveLedProduct('ws2812b-ring-24')!.spec)).toContain('ledCount')
  })

  it('stamp a ring: form, chipset, colour order and its fixed count', () => {
    expect(stampLedProduct(base, 'ws2812b-ring-24')).toMatchObject({
      partId: 'ws2812b-ring-24', form: 'ring', chipset: 'WS2812B', colorOrder: 'GRB', ledCount: 24,
    })
  })

  it('clamp a cut strip to its reel and its cut unit', () => {
    const { spec } = resolveLedProduct('ws2812b-strip')!
    expect(ledCountBounds(spec)).toEqual({ min: 1, max: 240, step: 1 })
    expect(stampLedProduct({ ...base, ledCount: 500 }, 'ws2812b-strip')!.ledCount).toBe(240)
    expect(stampLedProduct({ ...base, ledCount: 90 }, 'ws2812b-strip')!.ledCount).toBe(90)
    expect(clampLedCount(spec, 0)).toBe(1)
    const cut3 = { ...spec, cutEvery: 3, maxCount: 240 }
    expect(clampLedCount(cut3, 100)).toBe(99)
    expect(clampLedCount(cut3, 1)).toBe(3)
    expect(clampLedCount(cut3, 1000)).toBe(240)
  })

  it('stamp a matrix as tile size times the node\'s tile count, and keep the count when the part changes', () => {
    const tiled = { ...base, form: 'matrix', layout: 'panels', tilesX: 2, tilesY: 3 }
    const matrix = stampLedProduct(tiled, 'ws2812b-matrix-16x16')!
    expect(matrix).toMatchObject({ form: 'matrix', width: 32, height: 48, tilesX: 2, tilesY: 3 })
    const panel = stampLedProduct(matrix, 'hub75-panel-64x64-p4')!
    expect(panel).toMatchObject({ form: 'hub75', chipset: 'HUB75', width: 64 * 2, height: 64 * 3, tilesX: 2, tilesY: 3 })
    // Editing the tile count re-derives the size from the part.
    expect(applyLedProductEdit({ ...matrix, tilesX: 4 }, { tilesX: 4 })).toMatchObject({ width: 64, height: 48 })
    // An untiled node is one tile.
    expect(stampLedProduct({ ...base, form: 'matrix', tilesX: 4 }, 'ws2812b-matrix-16x16')).toMatchObject({ width: 16, height: 16 })
  })

  it('stamp a HUB75 panel with the scan its source gives', () => {
    expect(stampLedProduct(base, 'hub75-panel-64x64-p4')).toMatchObject({ form: 'hub75', hub75WideScan: false, width: 64, height: 64 })
  })

  it('leave a corkscrew a corkscrew over a strip part', () => {
    const stamped = stampLedProduct({ ...base, form: 'corkscrew' }, 'ws2812b-strip')!
    expect(stamped.form).toBe('corkscrew')
    expect(applyLedProductEdit({ ...stamped, form: 'ring' }, { form: 'ring' })).not.toHaveProperty('partId')
    expect(applyLedProductEdit({ ...stamped, form: 'strip' }, { form: 'strip' })).toHaveProperty('partId', 'ws2812b-strip')
  })
})

describe('reconcile', () => {
  const ring = stampLedProduct(base, 'ws2812b-ring-24')!

  it('repairs a tampered locked value and keeps the installer\'s colour order', () => {
    const tampered = { ...ring, chipset: 'APA102', ledCount: 5, colorOrder: 'RGB' }
    expect(reconcileLedProduct(tampered)).toMatchObject({ chipset: 'WS2812B', ledCount: 24, colorOrder: 'RGB', form: 'ring' })
    const grid = stampLedProduct(base, 'ws2812b-matrix-16x16')!
    expect(reconcileLedProduct({ ...grid, width: 3, height: 3 })).toMatchObject({ width: 16, height: 16 })
  })

  it('returns the same object when nothing drifted, and for a Custom node', () => {
    expect(reconcileLedProduct(ring)).toBe(ring)
    expect(reconcileLedProduct(base)).toBe(base)
    expect(makeLedOutputCustom(base)).toBe(base)
  })

  it('leaves a part this version does not have exactly as saved', () => {
    const unknown = { ...base, partId: 'acme-led-ring-99' }
    expect(reconcileLedProduct(unknown)).toBe(unknown)
  })

  it('makes custom without touching a value', () => {
    const custom = makeLedOutputCustom(ring)
    expect(custom).not.toHaveProperty('partId')
    // Every other value is kept (toEqual treats the dropped key as undefined).
    expect(custom).toEqual({ ...ring, partId: undefined })
    expect(resolveLedProduct(custom.partId)).toBeNull()
  })
})

describe('locks in isPropertyEnabled', () => {
  it('lock the part\'s facts but not the colour order or a cuttable count', () => {
    const strip = stampLedProduct({ ...base }, 'ws2812b-strip')!
    expect(isPropertyEnabled('MatrixOutput', 'chipset', strip)).toBe(false)
    expect(isPropertyEnabled('MatrixOutput', 'colorOrder', strip)).toBe(true)
    expect(isPropertyEnabled('MatrixOutput', 'ledCount', strip)).toBe(true)
    const ring = stampLedProduct({ ...base }, 'ws2812b-ring-12')!
    expect(isPropertyEnabled('MatrixOutput', 'ledCount', ring)).toBe(false)
    expect(isPropertyEnabled('MatrixOutput', 'colorOrder', ring)).toBe(true)
    const matrix = stampLedProduct({ ...base }, 'ws2812b-matrix-16x16')!
    expect(isPropertyEnabled('MatrixOutput', 'width', matrix)).toBe(false)
    const hub = stampLedProduct({ ...base }, 'hub75-panel-64x64-p4')!
    expect(isPropertyEnabled('MatrixOutput', 'hub75WideScan', hub)).toBe(false)
  })

  it('leave a Custom node exactly as it was', () => {
    const custom = { ...base, form: 'strip' }
    expect(isPropertyEnabled('MatrixOutput', 'chipset', custom)).toBe(true)
    expect(isPropertyEnabled('MatrixOutput', 'ledCount', custom)).toBe(true)
    expect(isPropertyEnabled('MatrixOutput', 'chipset', { ...custom, partId: '' })).toBe(true)
    // A part this version lacks locks nothing: it is held, not stamped.
    expect(isPropertyEnabled('MatrixOutput', 'chipset', { ...custom, partId: 'acme-led-ring-99' })).toBe(true)
  })
})

describe('an unresolved LED part', () => {
  function outputNode(properties: Record<string, unknown>): StudioNode {
    const def = NODE_LIBRARY.find((n) => n.type === 'MatrixOutput')!
    return {
      id: 'out', type: 'studioNode', position: { x: 0, y: 0 },
      data: { label: def.label, nodeType: 'MatrixOutput', category: def.category, properties: { ...def.defaultProperties, ...properties }, inputs: def.inputs, outputs: def.outputs },
    } as unknown as StudioNode
  }

  it('is held and kept out of the graph codegen reads', () => {
    const held = outputNode({ partId: 'acme-led-ring-99' })
    expect(unresolvedNodes([held])).toHaveLength(1)
    expect(withoutUnresolved([held], []).nodes).toEqual([])
    expect(resolvePartIdentity('MatrixOutput', { partId: 'acme-led-ring-99' })?.unresolved).toBe(true)
  })

  it('is not reported for a Custom output, nor for a bundled part', () => {
    expect(unresolvedNodes([outputNode({}), outputNode({ partId: '' }), outputNode({ partId: 'ws2812b-ring-8' })])).toEqual([])
    expect(resolvePartIdentity('MatrixOutput', {})).toBeNull()
  })
})

describe('the store', () => {
  beforeEach(() => {
    const def = NODE_LIBRARY.find((n) => n.type === 'MatrixOutput')!
    useGraphStore.setState({
      nodes: [{
        id: 'out', type: 'studioNode', position: { x: 0, y: 0 },
        data: { label: def.label, nodeType: 'MatrixOutput', category: def.category, properties: { ...def.defaultProperties, form: 'strip', ledCount: 60 }, inputs: def.inputs, outputs: def.outputs },
      } as unknown as StudioNode],
      edges: [], activeGraphId: ROOT_GRAPH_ID, graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } }, graphData: {},
    })
  })
  const props = () => useGraphStore.getState().nodes[0].data.properties as Record<string, unknown>

  it('stamps a chosen part, holds a locked key, and detaches on Make custom', () => {
    const store = useGraphStore.getState()
    store.setLedOutputPart('out', 'ws2812b-ring-24')
    expect(props()).toMatchObject({ partId: 'ws2812b-ring-24', form: 'ring', chipset: 'WS2812B', ledCount: 24 })
    useGraphStore.getState().updateNodeProperty('out', 'chipset', 'APA102')
    expect(props().chipset).toBe('WS2812B')
    useGraphStore.getState().updateNodeProperty('out', 'colorOrder', 'RGB')
    expect(props().colorOrder).toBe('RGB')
    useGraphStore.getState().makeLedOutputCustom('out')
    expect(props()).not.toHaveProperty('partId')
    expect(props()).toMatchObject({ form: 'ring', chipset: 'WS2812B', ledCount: 24, colorOrder: 'RGB' })
    useGraphStore.getState().updateNodeProperty('out', 'chipset', 'APA102')
    expect(props().chipset).toBe('APA102')
  })

  it('detaches when the form is changed by hand', () => {
    useGraphStore.getState().setLedOutputPart('out', 'ws2812b-strip')
    useGraphStore.getState().updateNodeProperty('out', 'form', 'matrix')
    expect(props()).not.toHaveProperty('partId')
    expect(props().form).toBe('matrix')
  })

  it('reconciles on load', () => {
    const def = NODE_LIBRARY.find((n) => n.type === 'MatrixOutput')!
    const tampered = {
      id: 'out', type: 'studioNode', position: { x: 0, y: 0 },
      data: { label: def.label, nodeType: 'MatrixOutput', category: def.category, properties: { ...def.defaultProperties, partId: 'ws2812b-ring-12', form: 'strip', chipset: 'WS2811', ledCount: 99 }, inputs: def.inputs, outputs: def.outputs },
    } as unknown as StudioNode
    useGraphStore.getState().loadGraph([tampered], [])
    expect(props()).toMatchObject({ partId: 'ws2812b-ring-12', form: 'ring', chipset: 'WS2812B', ledCount: 12 })
  })
})
