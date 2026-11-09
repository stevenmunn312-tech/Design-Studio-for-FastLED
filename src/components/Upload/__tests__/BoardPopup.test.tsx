import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import BoardPopup from '../BoardPopup'
import { useGraphStore } from '../../../state/graphStore'
import { useUploadStore } from '../../../state/upload/uploadStore'
import { useUiStore } from '../../../state/uiStore'
import { estimateFirmwareRam } from '../../../utils/validateGraph'
import { boardPartition } from '../../../build/boardPartition'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

describe('BoardPopup build-engine guidance', () => {
  beforeEach(() => {
    localStorage.clear()
    useGraphStore.setState({ nodes: [], edges: [], activeGraphId: 'root' })
    useUploadStore.setState({
      helper: { ok: true, engine: 'arduino-cli', fbuild: true, arduinoCli: true },
      installedCores: ['esp32:esp32'],
      customBoards: [],
      selectedFqbn: 'esp32:esp32:esp32s3',
      selectedPort: 'COM7',
      ports: [{ address: 'COM7', label: 'USB Serial', protocol: 'serial', boards: [] }],
      busy: false,
      checkingUpdates: false,
      availableUpdates: [],
      updatesPopupOpen: false,
      setEngine: vi.fn(),
      refreshPorts: vi.fn(),
      closeBoardPopup: vi.fn(),
    })
  })

  it('offers both engines as plain choices for ESP32, with no experimental warning', () => {
    const { getByRole, queryByText } = render(<BoardPopup />)

    expect(getByRole('button', { name: 'arduino-cli' })).toBeTruthy()
    expect(getByRole('button', { name: 'fbuild' })).toBeTruthy()
    expect(queryByText(/experimental|recommended/i)).toBeNull()

    fireEvent.click(getByRole('button', { name: 'fbuild' }))
    expect(useUploadStore.getState().setEngine).toHaveBeenCalledWith('fbuild')
  })

  // The Board node is the one place a board is chosen: `App.tsx` mirrors its
  // profile into `selectedFqbn`, so a select here only ever appeared to work.
  it('reports the board and sends a change to the Hardware bench instead of offering its own select', () => {
    useUiStore.setState({ workspaceMode: 'upload', hardwareBoardMenuRequested: false })
    const { getByRole, queryByRole, getByText } = render(<BoardPopup />)

    expect(queryByRole('combobox', { name: 'Board' })).toBeNull()
    expect(getByText('ESP32-S3')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Change board in Hardware' }))
    expect(useUploadStore.getState().closeBoardPopup).toHaveBeenCalled()
    expect(useUiStore.getState().workspaceMode).toBe('hardware')
    expect(useUiStore.getState().hardwareBoardMenuRequested).toBe(true)
  })

  it('explains the first-build download when fbuild is the engine for ESP32', () => {
    useUploadStore.setState({
      helper: { ok: true, engine: 'fbuild', fbuild: true, arduinoCli: true },
      installedCores: [],
    })

    const { getByText, queryByText } = render(<BoardPopup />)

    expect(getByText(/Using fbuild — the first build for a new board downloads/i)).toBeTruthy()
    expect(queryByText(/three minutes/i)).toBeNull()
  })

  it('reports the memory of the board being chosen for, not the whole bench', () => {
    const node = (id: string, nodeType: string, properties: Record<string, unknown> = {}) => ({
      id, type: 'studioNode', position: { x: 0, y: 0 },
      data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
    }) as unknown as StudioNode
    const edge = (source: string, target: string) =>
      ({ id: `${source}-${target}`, source, target, sourceHandle: 'frame', targetHandle: 'frame' }) as StudioEdge
    // Board 1 drives 4096 LEDs, Board 2 sixty-four.
    const nodes = [
      node('board-root', 'Board'), node('board-2', 'Board'),
      node('big', 'Rainbow'), node('out1', 'MatrixOutput', { width: 64, height: 64 }),
      node('small', 'Rainbow'), node('out2', 'MatrixOutput', { width: 8, height: 8, boardId: 'board-2' }),
    ]
    const edges = [edge('big', 'out1'), edge('small', 'out2')]
    useGraphStore.setState({ nodes, edges, activeGraphId: 'root' })
    useUiStore.setState({ activeBoardId: 'board-2' })
    const two = boardPartition(nodes, edges, 'board-2')
    const expected = estimateFirmwareRam(two.nodes, two.edges, {}, {})!
    expect(expected.ledCount).toBe(64)

    const { getByText } = render(<BoardPopup />)
    expect(getByText(`~${(expected.internalBytes / 1024).toFixed(1)} KB internal`)).toBeTruthy()
    useUiStore.setState({ activeBoardId: 'board-root' })
  })
})
