import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BoardNodeBody from '../BoardNodeBody'
import { useGraphStore, ROOT_GRAPH_ID } from '../../../state/graphStore'
import { useUploadStore } from '../../../state/uploadStore'
import {
  BOARD_PROFILES,
  BOARD_PROFILE_FAMILIES,
  boardProfileFamilyId,
  boardProfilesForFamily,
} from '../../../build/boardProfiles'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import type { StudioNode } from '../../../state/graphStore'

// The Board node names an exact board rather than a chip target. Selecting
// "ESP32" identifies silicon and leaves the header layout ambiguous — two
// DevKit profiles claim that FQBN — which is how a pin can validate against the
// chip and still not exist on any header the user can reach.

function boardNode(id: string, profileId = ''): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === 'Board')
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Board', nodeType: 'Board', category: def?.category ?? 'output',
      properties: { profileId }, inputs: [], outputs: [],
    },
  } as unknown as StudioNode
}

function reset(nodes: StudioNode[]) {
  useGraphStore.setState({
    nodes, edges: [], selectedNodeId: null, activeGraphId: ROOT_GRAPH_ID, trusted: true,
  } as never)
}

describe('BoardNodeBody', () => {
  beforeEach(() => reset([boardNode('b1')]))

  it('starts unset and offers every populated board family', () => {
    render(<BoardNodeBody nodeId="b1" />)
    const familyPicker = screen.getByLabelText('Board family') as HTMLSelectElement
    const picker = screen.getByLabelText('Controller board') as HTMLSelectElement
    expect(familyPicker.value).toBe('')
    expect(picker.value).toBe('')
    expect(picker.disabled).toBe(true)
    // Unset is deliberate — a defaulted board would be a wrong answer stated
    // confidently, where an empty one is a question.
    expect(screen.getByText(/Pin advice stays chip-level/)).toBeTruthy()
    for (const family of BOARD_PROFILE_FAMILIES) {
      expect(screen.getByRole('option', { name: family.label })).toBeTruthy()
    }
  })

  it('filters the board selector to the chosen family', () => {
    render(<BoardNodeBody nodeId="b1" />)

    fireEvent.change(screen.getByLabelText('Board family'), { target: { value: 'teensy' } })

    const teensyBoards = boardProfilesForFamily('teensy')
    expect(teensyBoards.length).toBeGreaterThan(0)
    for (const board of teensyBoards) {
      expect(screen.getByRole('option', { name: board.label })).toBeTruthy()
    }
    for (const board of BOARD_PROFILES.filter((profile) => boardProfileFamilyId(profile) !== 'teensy')) {
      expect(screen.queryByRole('option', { name: board.label })).toBeNull()
    }
  })

  it('selects the first board when the family changes and keeps upload aligned', () => {
    render(<BoardNodeBody nodeId="b1" />)
    const firstPico = boardProfilesForFamily('rp')[0]

    fireEvent.change(screen.getByLabelText('Board family'), { target: { value: 'rp' } })

    const props = useGraphStore.getState().nodes[0].data.properties as Record<string, unknown>
    expect(props.profileId).toBe(firstPico.id)
    expect((screen.getByLabelText('Controller board') as HTMLSelectElement).value).toBe(firstPico.id)
    expect(useUploadStore.getState().selectedFqbn).toBe(firstPico.compatibleFqbns[0])
  })

  it('records the profile and mirrors its closest FQBN into the upload target', () => {
    const xiao = BOARD_PROFILES.find((p) => p.id === 'seeed-xiao-esp32s3')!
    render(<BoardNodeBody nodeId="b1" />)

    fireEvent.change(screen.getByLabelText('Board family'), { target: { value: 'esp32' } })
    fireEvent.change(screen.getByLabelText('Controller board'), { target: { value: xiao.id } })

    const props = useGraphStore.getState().nodes[0].data.properties as Record<string, unknown>
    expect(props.profileId).toBe(xiao.id)
    // Profiles list the specific FQBN first, the family fallback after, so
    // upload targets the closest match rather than the generic family.
    expect(useUploadStore.getState().selectedFqbn).toBe(xiao.compatibleFqbns[0])
  })

  it('reports header-safe pin count and peripheral starting pins', () => {
    const xiao = BOARD_PROFILES.find((p) => p.id === 'seeed-xiao-esp32s3')!
    reset([boardNode('b1', xiao.id)])
    render(<BoardNodeBody nodeId="b1" />)

    expect((screen.getByLabelText('Board family') as HTMLSelectElement).value).toBe('esp32')

    const safe = xiao.pinSafety?.safeGeneralPurpose ?? []
    expect(safe.length).toBeGreaterThan(0)
    expect(screen.getByText(`${safe.length} on the header`)).toBeTruthy()

    // The XIAO is the board this whole capability model came from: GPIO39-42
    // exist on the S3 die but reach only underside pads here, so they must
    // never appear in the header-safe allowlist.
    for (const pad of [39, 40, 41, 42]) expect(safe).not.toContain(pad)

    const mic = xiao.peripheralPins?.inmp441
    expect(mic).toBeTruthy()
    expect(screen.getByText(new RegExp(`Mic → WS ${mic!.wsLrclk}`))).toBeTruthy()
  })

  it('says outright when a board carries no pin-safety data', () => {
    // Every imported board now has safety data, so this path is exercised
    // through a profile with none rather than a real one. It still matters:
    // silence must read as "not checked yet", not "checked and fine".
    reset([boardNode('b1', 'no-such-profile')])
    render(<BoardNodeBody nodeId="b1" />)
    expect(screen.getByText(/Pin advice stays chip-level/)).toBeTruthy()
  })

  it('flags a second Board node rather than silently picking one', () => {
    reset([boardNode('b1'), boardNode('b2')])
    render(<BoardNodeBody nodeId="b1" />)
    // One sketch targets one controller; a second board has no meaning.
    expect(screen.getByText(/2 Board nodes on this canvas/)).toBeTruthy()
  })
})
