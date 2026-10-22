import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import BoardSelector from '../BoardSelector'
import { boardOrdinalLabel, boardProfileLabel, defaultBoardHostname, resolveActiveBoardId } from '../boardSelection'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { DEFAULT_BOARD_PROFILE_ID, ROOT_BOARD_NODE_ID } from '../../../build/hardware'
import { boardProfileById } from '../../../build/boards/boardProfiles'
import { CUSTOM_BOARD_PROFILE_ID } from '../../../build/boards/customBoard'

const S3_PROFILE_ID = 'espressif-esp32-s3-devkitc-1'

function board(id: string, properties: Record<string, unknown>): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    hidden: true,
    data: { label: 'Board', nodeType: 'Board', category: 'output', properties, inputs: [], outputs: [] },
  } as StudioNode
}

function setBoards(...boards: StudioNode[]) {
  useGraphStore.setState({
    nodes: boards as never[],
    edges: [],
    activeGraphId: ROOT_GRAPH_ID,
    graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
    graphData: {},
  })
}

describe('BoardSelector', () => {
  beforeEach(() => {
    useUiStore.setState({ activeBoardId: ROOT_BOARD_NODE_ID })
  })

  it('draws nothing for a one-board project', () => {
    setBoards(board(ROOT_BOARD_NODE_ID, { profileId: DEFAULT_BOARD_PROFILE_ID }))
    const { container } = render(<BoardSelector />)
    expect(container.innerHTML).toBe('')
  })

  it('offers one tab per board, in root order, naming each controller', () => {
    setBoards(
      board(ROOT_BOARD_NODE_ID, { profileId: DEFAULT_BOARD_PROFILE_ID }),
      board('board-2', { profileId: S3_PROFILE_ID }),
    )
    const { getAllByRole, getByRole } = render(<BoardSelector />)

    expect(getByRole('tablist', { name: 'Boards' })).toBeTruthy()
    const tabs = getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      `Board 1${boardProfileById(DEFAULT_BOARD_PROFILE_ID)?.label}`,
      `Board 2${boardProfileById(S3_PROFILE_ID)?.label}`,
    ])
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false'])

    fireEvent.click(tabs[1])

    expect(useUiStore.getState().activeBoardId).toBe('board-2')
    expect(getAllByRole('tab').map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true'])
  })

  it('puts the primary first whatever its position in the root graph', () => {
    setBoards(
      board('board-2', { profileId: S3_PROFILE_ID }),
      board(ROOT_BOARD_NODE_ID, { profileId: DEFAULT_BOARD_PROFILE_ID }),
    )
    const { getAllByRole } = render(<BoardSelector />)
    expect(getAllByRole('tab')[0].textContent).toContain(boardProfileById(DEFAULT_BOARD_PROFILE_ID)!.label)
  })

  it('highlights the primary when the active id names a board that is gone', () => {
    setBoards(
      board(ROOT_BOARD_NODE_ID, { profileId: DEFAULT_BOARD_PROFILE_ID }),
      board('board-2', { profileId: S3_PROFILE_ID }),
    )
    useUiStore.setState({ activeBoardId: 'board-3' })
    const { getAllByRole } = render(<BoardSelector />)
    expect(getAllByRole('tab').map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false'])
  })

  it('labels boards by ordinal and by what they resolve to', () => {
    const boards = [
      board(ROOT_BOARD_NODE_ID, { profileId: DEFAULT_BOARD_PROFILE_ID }),
      board('board-2', { profileId: CUSTOM_BOARD_PROFILE_ID }),
      board('board-3', { profileId: '' }),
    ]
    expect(boardOrdinalLabel(boards, 'board-2')).toBe('Board 2')
    expect(boardOrdinalLabel(boards, 'missing')).toBe('Board 1')
    expect(boardProfileLabel(boards[0])).toBe(boardProfileById(DEFAULT_BOARD_PROFILE_ID)?.label)
    expect(boardProfileLabel(boards[1])).toBe('Custom board')
    expect(boardProfileLabel(boards[2])).toBe('No board chosen')
    expect(resolveActiveBoardId(boards, 'board-3')).toBe('board-3')
    expect(resolveActiveBoardId(boards, 'board-9')).toBe(ROOT_BOARD_NODE_ID)
    expect(defaultBoardHostname(1)).toBe('fastled-board-2')
  })
})
