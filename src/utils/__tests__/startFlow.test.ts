import { beforeEach, describe, expect, it } from 'vitest'
import { startBlankCanvas, startTemplateById } from '../startFlow'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'

describe('startFlow', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([], [])
    useUiStore.getState().setHardwareShelfCategory('displays')
  })

  /*
   * The shelf remembers which category you had open, because it unmounts on
   * every trip to another workspace. A blank sketch is the one moment that
   * memory means nothing: there is nothing on the bench, so no section of the
   * shelf is the one you were working in.
   */
  it('closes every hardware shelf category for a blank sketch', () => {
    startBlankCanvas()
    expect(useUiStore.getState().hardwareShelfCategory).toBeNull()
    // The Board survives a blank canvas; it describes the bench, not the patch.
    expect(useGraphStore.getState().nodes.filter((node) => node.data.nodeType !== 'Board')).toEqual([])
  })

  it('leaves the shelf as the user had it when a starter is loaded', () => {
    // A starter arrives with parts on the bench, so the section they were
    // last in is still a reasonable guess at where they are working.
    startTemplateById('juggle')
    expect(useUiStore.getState().hardwareShelfCategory).toBe('displays')
  })
})
