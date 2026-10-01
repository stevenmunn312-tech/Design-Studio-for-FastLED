import { describe, it, expect } from 'vitest'
import { useGraphStore } from '../graphStore'
import { ROOT_BOARD_NODE_ID } from '../hardware'

const S3 = 'generic-esp32-s3-n16r8-44pin-dual-usbc'

describe('selectBoardProfile', () => {
  it('restores a missing Board node instead of silently doing nothing', () => {
    useGraphStore.getState().loadGraph([], [])
    useGraphStore.setState({
      nodes: useGraphStore.getState().nodes.filter((n) => n.data.nodeType !== 'Board'),
    })

    useGraphStore.getState().selectBoardProfile(ROOT_BOARD_NODE_ID, S3)

    const boards = useGraphStore.getState().nodes.filter((n) => n.data.nodeType === 'Board')
    expect(boards).toHaveLength(1)
    expect(boards[0].data.properties.profileId).toBe(S3)
  })
})
