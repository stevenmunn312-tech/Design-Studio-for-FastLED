import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBenchParts } from '../useBenchParts'
import { boardScreensFor } from '../benchScreenGeometry'
import { boardProfileById } from '../../../build/boards/boardProfiles'
import type { StudioNode } from '../../../state/graphStore'
import { CYD_TOUCH_DISPLAY, INTEGRATED_BOARD_PROFILE_KEY } from '../../../build/boards/integratedBoardHardware'
import { libraryDefaults, NODE_LIBRARY } from '../../../state/nodeLibrary'

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

const CYD = CYD_TOUCH_DISPLAY.boardProfileId

describe("a controller board's own panel on the bench", () => {
  it('has the CYD glass on the board render, at the panel aspect', () => {
    const screens = boardScreensFor(boardProfileById(CYD)?.render)
    expect(screens?.screens).toHaveLength(1)
    const glass = screens!.screens[0]
    expect(glass.width / glass.height).toBeCloseTo(240 / 320, 2)
    expect(glass.x + glass.width).toBeLessThanOrEqual(screens!.renderWidth)
    expect(glass.y + glass.height).toBeLessThanOrEqual(screens!.renderHeight)
  })

  it('draws the fitted panel on the board instead of as a second module', () => {
    const panel = node('panel', 'TransportDisplay', {
      ...CYD_TOUCH_DISPLAY.panelProperties,
      [INTEGRATED_BOARD_PROFILE_KEY]: CYD,
    })
    const { result } = renderHook(() => useBenchParts({
      nodes: [panel],
      edges: [],
      selectedBoard: boardProfileById(CYD),
    }))
    expect(result.current.fixtureParts.map((part) => part.node.id)).not.toContain('panel')
    expect(result.current.boardPanels.map((entry) => entry.node.id)).toEqual(['panel'])
    expect(result.current.boardPanels[0].modulePartId).toBe(CYD_TOUCH_DISPLAY.panelProperties.partId)
  })

  it('keeps a wired panel, or a panel fitted to another board, as a module', () => {
    const wired = node('wired', 'TransportDisplay', { partId: CYD_TOUCH_DISPLAY.panelProperties.partId })
    const stale = node('stale', 'TransportDisplay', {
      ...CYD_TOUCH_DISPLAY.panelProperties,
      [INTEGRATED_BOARD_PROFILE_KEY]: CYD,
    })
    const { result } = renderHook(() => useBenchParts({
      nodes: [wired, stale],
      edges: [],
      selectedBoard: boardProfileById('esp32-generic-devkit-38pin'),
    }))
    expect(result.current.fixtureParts.map((part) => part.node.id)).toEqual(['wired', 'stale'])
    expect(result.current.boardPanels).toEqual([])
  })
})
