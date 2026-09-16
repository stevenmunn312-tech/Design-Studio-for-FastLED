import { beforeEach, describe, expect, it } from 'vitest'
import { landOnStartingWorkspace, startBlankCanvas, startTemplateById } from '../startFlow'
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

  /*
   * Where a freshly installed workspace lands. Blank goes to Hardware because
   * naming a board is the only work available; a blank Graph canvas asks for
   * wiring against hardware nobody has chosen.
   */
  it('lands a blank sketch on Hardware', () => {
    useUiStore.setState({ workspaceMode: 'build' })
    startBlankCanvas()
    expect(useUiStore.getState().workspaceMode).toBe('hardware')
  })

  it('leaves a workspace with content where it is', () => {
    startTemplateById('juggle')
    useUiStore.setState({ workspaceMode: 'graph' })
    landOnStartingWorkspace()
    expect(useUiStore.getState().workspaceMode).toBe('graph')
  })

  it('counts emptiness without the Board node every root graph carries', () => {
    // A node count would never read zero, so the rule would never fire.
    useGraphStore.getState().loadGraph([], [])
    expect(useGraphStore.getState().nodes.some((node) => node.data.nodeType === 'Board')).toBe(true)
    useUiStore.setState({ workspaceMode: 'graph' })
    landOnStartingWorkspace()
    expect(useUiStore.getState().workspaceMode).toBe('hardware')
  })

  it('leaves the shelf as the user had it when a starter is loaded', () => {
    // A starter arrives with parts on the bench, so the section they were
    // last in is still a reasonable guess at where they are working.
    startTemplateById('juggle')
    expect(useUiStore.getState().hardwareShelfCategory).toBe('displays')
  })
})
