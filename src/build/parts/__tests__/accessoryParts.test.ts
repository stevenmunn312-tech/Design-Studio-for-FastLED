import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PhysicalAssemblyDiagram from '../../../components/BuildDiagram/PhysicalAssemblyDiagram'
import {
  diagramContentBottom, itemLayouts, levelShifterGeometry, levelShifterSupplyPoint, levelShifterTerminalPoint,
  physicalAssemblyDiagramHeight,
} from '../../../components/BuildDiagram/physicalDiagramLayout'
import { libraryDefaults, NODE_LIBRARY, propertyOptions, selectOptionLabel } from '../../../state/nodeLibrary'
import type { StudioNode } from '../../../state/graphStore'
import { DEFAULT_LEVEL_SHIFTER_PART_ID, levelShifterFor, levelShifterPartIdFor, levelShifterPartIds, levelShifterSpec } from '../../../state/peripherals/levelShifter'
import { boardPinForUse, boardPinLabelForUse, buildHardwareManifest } from '../../hardwareManifest'
import { boardProfileById } from '../../boards/boardProfiles'
import { bomCsv, buildBomRows, buildConnectionRows, connectionsCsv } from '../../buildExports'
import { ensureBuildProfile } from '../../buildProfile'
import { calculateElectricalPlan } from '../../power/electricalPlan'
import { PART_CATALOGUE_DATA } from '../../generated/partCatalogueData'
import { registerParts, resetRegisteredPartsForTests } from '../partCatalogue'
import { validatePartManifest } from '../manifest/partManifest'
import type { PartManifest } from '../manifest/partManifest'

/*
 * The two LED-output accessories are parts, not code: the data link an output
 * names (`dataLinkPartId`) and the level shifter the Board names
 * (`levelShifterPartId`). A copy of either under a fresh id must draw, list and
 * wire exactly as the bundled part does, which is the claim that nothing in
 * the app branches on a bundled id. (The type is still closed to downloads; the
 * copies register as bundled, which a test may do.)
 */

const SHIFTER = 'sn74ahct125n-dip14'
const NLED = 'nled-pixel-data-extender-pair'
const S3 = 'esp32:esp32:esp32s3'
const BOARD = boardProfileById('espressif-esp32-s3-devkitc-1')!

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as unknown as StudioNode
}

function copyOf(partId: string, fresh: string): PartManifest {
  const copy = JSON.parse(JSON.stringify(PART_CATALOGUE_DATA[partId])) as PartManifest
  return { ...copy, partId: fresh }
}

/** Everything the sheet and exports say about a build, for equality between a part and its copy. */
function everything(boardProps: Record<string, unknown>, outputs: Array<Record<string, unknown>>): string {
  const nodes = [
    node('board', 'Board', boardProps),
    ...outputs.map((props, index) => node(`out${index}`, 'MatrixOutput', { form: 'matrix', width: 8, height: 8, dataPin: 5 + index, ...props })),
  ]
  const manifest = buildHardwareManifest(nodes, [], S3)
  const items = manifest.primaryItems
  const buildProfile = ensureBuildProfile({ version: 1 } as never)
  const plan = calculateElectricalPlan(manifest, buildProfile, BOARD)
  const connections = items.flatMap((item) => item.pins.map((pin) => ({
    id: `${item.id}:${pin.propertyKey}`, itemId: item.id, pinLabel: boardPinLabelForUse(BOARD, pin),
    useLabel: pin.label, boardAnchorId: boardPinForUse(BOARD, pin)?.anchorId,
  })))
  const svg = renderToStaticMarkup(createElement(PhysicalAssemblyDiagram, {
    boardProfile: BOARD, items, plan, connections, selectedItemId: 'controller', onSelectItem: () => undefined,
    exportScope: 'complete-build',
  }))
  return JSON.stringify({
    layouts: itemLayouts(items).map((layout) => [layout.item.id, layout.x, layout.y, layout.width, layout.height]),
    bottom: [diagramContentBottom(items), physicalAssemblyDiagramHeight(items, plan)],
    rows: connectionsCsv(buildConnectionRows(items, plan, BOARD)),
    bom: bomCsv(buildBomRows(manifest, plan, buildProfile, BOARD)),
    svg,
  })
}

afterEach(() => resetRegisteredPartsForTests())

describe('the level shifter part', () => {
  it('is a catalogue part with a block and measured pads, and no code names it but the Board default', () => {
    const spec = levelShifterSpec(SHIFTER)
    expect(spec).toMatchObject({ device: '74AHCT125', packageName: 'DIP-14', channels: 4, vccPad: 'VCC', gndPad: 'GND' })
    expect(levelShifterPartIds()).toContain(SHIFTER)
    expect(DEFAULT_LEVEL_SHIFTER_PART_ID).toBe(SHIFTER)
    expect(validatePartManifest(PART_CATALOGUE_DATA[SHIFTER], 'bundled').status).toBe('ok')
  })

  it('places its terminals where the retired constants did', () => {
    const geometry = levelShifterGeometry(levelShifterFor(SHIFTER))!
    expect(geometry.leftPinX).toBe(35)
    expect(geometry.rightPinX).toBe(147)
    expect(geometry.pinRows).toEqual([41, 66, 91, 116, 141, 166, 191])
    expect(geometry.frameHeight).toBe(230)
    const scale = 25 / 85
    expect(geometry.render.width).toBeCloseTo(400 * scale, 9)
    expect(geometry.render.height).toBeCloseTo(654 * scale, 9)
    expect(geometry.render.y).toBeCloseTo(41 - (71.5 * scale), 9)
    expect(geometry.render.x).toBeCloseTo(((35 + 147) - (400 * scale)) / 2, 9)
    // The per-channel pin table the diagram hard-coded: [side, row] for A, Y and /OE.
    const legacy = [
      { a: ['left', 1], y: ['left', 2], oe: ['left', 0] },
      { a: ['left', 4], y: ['left', 5], oe: ['left', 3] },
      { a: ['right', 5], y: ['right', 6], oe: ['right', 4] },
      { a: ['right', 2], y: ['right', 3], oe: ['right', 1] },
    ] as const
    legacy.forEach((channel, index) => {
      for (const terminal of ['a', 'y', 'oe'] as const) {
        const point = levelShifterTerminalPoint(geometry, index, terminal)
        expect([point.side, (point.y - 276 - 41) / 25]).toEqual(channel[terminal])
        expect(point.x).toBe(430 + (channel[terminal][0] === 'left' ? 35 : 147))
      }
    })
    expect(levelShifterSupplyPoint(geometry, 0, 'vcc')).toEqual({ x: 430 + 147, y: 276 + 41, side: 'right' })
    expect(levelShifterSupplyPoint(geometry, 0, 'gnd')).toEqual({ x: 430 + 35, y: 276 + 41 + (6 * 25), side: 'left' })
    expect(geometry.pinNumbers.get('VCC')).toBe(14)
    expect(geometry.pinNumbers.get('GND')).toBe(7)
  })

  it('is the Board default, and an unknown part resolves to nothing rather than to another part', () => {
    expect(levelShifterPartIdFor(undefined)).toBe(SHIFTER)
    expect(levelShifterPartIdFor({ levelShifterPartId: '' })).toBe(SHIFTER)
    expect(levelShifterPartIdFor({ levelShifterPartId: 'no-such-shifter' })).toBe('no-such-shifter')
    expect(levelShifterFor('no-such-shifter')).toBeNull()
    expect(levelShifterSpec(NLED)).toBeNull()
    expect(libraryDefaults('Board').levelShifterPartId).toBe(SHIFTER)
    expect(propertyOptions('Board', 'levelShifterPartId', {})).toContain(SHIFTER)
    expect(selectOptionLabel('Board', 'levelShifterPartId', SHIFTER)).toBe('74AHCT125 level shifter (DIP-14)')
  })

  it('holds the output for a shifter this version cannot read: no chip drawn, no output drawn straight to the panel', () => {
    const svg = everything({ levelShifterPartId: 'no-such-shifter' }, [{}])
    expect(svg).not.toContain('level-shifter-1-a1')
    expect(svg).not.toContain('level shifter 1')
    expect(JSON.parse(svg).rows).not.toContain('74AHCT125')
  })

  it('draws, wires and lists a copy under a fresh id exactly as the bundled part', () => {
    const outputs = [{}, { form: 'strip', ledCount: 12 }, {}, {}, {}, {}]
    const original = everything({ levelShifterPartId: SHIFTER }, outputs)
    expect(original).toContain('level shifter 2')
    registerParts([copyOf(SHIFTER, 'fresh-level-shifter')], 'bundled')
    const copy = everything({ levelShifterPartId: 'fresh-level-shifter' }, outputs)
    expect(copy.split('fresh-level-shifter').join(SHIFTER)).toBe(original)
  })

  it('takes its channel count from the block: a two-channel part makes the sheet draw more chips', () => {
    const twoChannel = copyOf(SHIFTER, 'two-channel-shifter')
    const block = twoChannel.levelShifter!
    twoChannel.levelShifter = { ...block, channels: 2, channelPads: block.channelPads.slice(0, 2) }
    expect(registerParts([twoChannel], 'bundled')[0].status).toBe('added')
    const sheet = everything({ levelShifterPartId: 'two-channel-shifter' }, [{}, {}, {}])
    expect(sheet).toContain('level shifter 2')
    expect(sheet).not.toContain('level shifter 3')
  })

  describe('manifest block checks', () => {
    const base = () => JSON.parse(JSON.stringify(PART_CATALOGUE_DATA[SHIFTER])) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

    it('refuses a pad label the part does not measure', () => {
      const manifest = base()
      manifest.levelShifter.vccPad = 'VDD'
      const result = validatePartManifest(manifest, 'bundled')
      expect(result.status).toBe('invalid')
      expect(JSON.stringify(result)).toContain('names a pad that is not measured: VDD')
    })

    it('refuses a channel list that disagrees with the channel count, and a block with no pads', () => {
      const short = base()
      short.levelShifter.channelPads = short.levelShifter.channelPads.slice(0, 3)
      expect(validatePartManifest(short, 'bundled').status).toBe('invalid')
      const bare = base()
      delete bare.pads
      expect(JSON.stringify(validatePartManifest(bare, 'bundled'))).toContain('needs measured pads')
    })

    it('refuses more channels than the sheet routes, and unevenly spaced rows', () => {
      const wide = base()
      wide.levelShifter.channels = 5
      expect(validatePartManifest(wide, 'bundled').status).toBe('invalid')
      const uneven = base()
      uneven.pads[3].yPx += 3
      uneven.pads[10].yPx += 3
      expect(JSON.stringify(validatePartManifest(uneven, 'bundled'))).toContain('evenly spaced rows')
    })
  })
})

describe('the data link part', () => {
  it('draws, wires and lists a copy under a fresh id exactly as the bundled part', () => {
    const outputs = [{ dataLinkPartId: NLED }, {}, { form: 'strip', ledCount: 20, dataLinkPartId: NLED }]
    const original = everything({}, outputs)
    expect(original).toContain('TWISTED')
    registerParts([copyOf(NLED, 'fresh-data-link')], 'bundled')
    const copy = everything({}, outputs.map((props) => (props.dataLinkPartId ? { ...props, dataLinkPartId: 'fresh-data-link' } : props)))
    // The copy's label is the original's; only the id differs.
    expect(copy.split('fresh-data-link').join(NLED)).toBe(original)
  })

  it('words its pair, supply range, conductors and distance from the block', () => {
    const custom = copyOf(NLED, 'custom-data-link') as PartManifest & { pixelDataExtender: Record<string, unknown>; label: string }
    custom.label = 'Acme Long Run pair'
    custom.pixelDataExtender = { ...custom.pixelDataExtender, pairConductors: ['P', 'N', 'GND', 'SHIELD'], maxDistanceMeters: 100, supplyMinV: 5, supplyMaxV: 24 }
    expect(registerParts([custom], 'bundled')[0].status).toBe('added')
    const sheet = JSON.parse(everything({}, [{ dataLinkPartId: 'custom-data-link' }]))
    expect(sheet.svg).toContain('P↔P · N↔N · GND↔GND · SHIELD↔SHIELD · TWISTED')
    expect(sheet.svg).toContain('328 FT MAX')
    expect(sheet.bom).toContain('Acme Long Run pair')
    expect(sheet.bom).toContain('power both ends from 5-24 V')
    expect(sheet.bom).toContain('Four twisted conductors: P, N, common ground and SHIELD')
    expect(sheet.bom).toContain('maximum 328 ft / 100 m')
  })
})
