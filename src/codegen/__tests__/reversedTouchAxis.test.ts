import { describe, it, expect } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { playerDisplaysFromGraph } from '../playerDisplays'
import { customDisplayPanelFromProps } from '../customDisplayPanelCpp'
import { TFT_TOUCH_CPP_HELPERS } from '../tftTouchCpp'
import { emittedTouchBounds } from '../../state/transportTouch'
import { libraryDefaults } from '../../state/nodeLibrary'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

const TOUCH_PANEL = 'st7789v-xpt2046-touch-240x320'

/** The repository's CYD: raw X counts right-to-left, raw Y top-to-bottom. */
const REVERSED = {
  touchXMin: 290, touchXMax: 3850, touchYMin: 100, touchYMax: 3640,
  touchFlipX: true, touchFlipY: false,
}

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: [], outputs: [],
    },
  } as unknown as StudioNode
}

describe('a reversed touch axis reaches the firmware', () => {
  /*
   * The stored property keeps the honest name and the emitted argument carries
   * the direction: flipping a linear map is the same as swapping its
   * endpoints, so a reversed axis leaves as a descending span rather than as a
   * flag every generator would have to branch on.
   */
  it('emits a descending span for the flipped axis and an ascending one for the other', () => {
    expect(emittedTouchBounds(REVERSED)).toEqual({
      xFrom: 3850, xTo: 290, yFrom: 100, yTo: 3640,
    })
  })

  it('leaves an unflipped calibration ascending', () => {
    expect(emittedTouchBounds({ ...REVERSED, touchFlipX: false }))
      .toEqual({ xFrom: 290, xTo: 3850, yFrom: 100, yTo: 3640 })
  })

  // The one place the maths happens. A descending span has to map rather than
  // be refused, or the emitted arguments would silently disable touch.
  it('maps a descending span rather than refusing it', () => {
    expect(TFT_TOUCH_CPP_HELPERS).toContain('if (rawXTo == rawXFrom || rawYTo == rawYFrom) return false;')
    expect(TFT_TOUCH_CPP_HELPERS).not.toContain('rawXMax <= rawXMin')
  })

  // All three generators read the same helper, so none of them can be the one
  // that forgets — asserted per generator because each builds its own emit.
  it('carries the direction into a normal sketch', () => {
    const panel = node('panel', 'TransportDisplay', {
      partId: TOUCH_PANEL, tftLayout: 'Diagnostics', tftRotation: '0',
    })
    const touch = node('touch', 'TouchInput', { panelId: 'panel', ...REVERSED })
    const sketch = generateCpp([panel, touch, node('out', 'MatrixOutput', {})], [])
    expect(sketch).toContain('3850, 290, 100, 3640')
  })

  it('carries the direction into the player template', () => {
    const panel = node('panel', 'TransportDisplay', {
      partId: TOUCH_PANEL, tftLayout: 'Fixed Transport', tftRotation: '0',
    })
    const touch = node('touch', 'TouchInput', { panelId: 'panel', ...REVERSED })
    const player = node('player', 'PatternMaster', {})
    const edges: StudioEdge[] = [
      { id: 'e1', source: 'player', sourceHandle: 'display', target: 'panel', targetHandle: 'display' },
      { id: 'e2', source: 'touch', sourceHandle: 'controls', target: 'player', targetHandle: 'controls' },
    ] as unknown as StudioEdge[]
    const resolved = playerDisplaysFromGraph([panel, touch, player], edges)
    expect(resolved.tft[0].touch).toMatchObject({ xFrom: 3850, xTo: 290, yFrom: 100, yTo: 3640 })
  })

  it('carries the direction into an LVGL screen', () => {
    const emit = customDisplayPanelFromProps(
      'panel',
      { ...libraryDefaults('TransportDisplay'), partId: TOUCH_PANEL, tftRotation: '0' },
      REVERSED,
    )
    expect(emit.touch).toMatchObject({ xFrom: 3850, xTo: 290, yFrom: 100, yTo: 3640 })
  })
})
