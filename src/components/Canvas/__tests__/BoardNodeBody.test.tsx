import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BoardNodeBody from '../BoardNodeBody'
import { useGraphStore, ROOT_GRAPH_ID } from '../../../state/graphStore'
import { controllerSettings } from '../../../state/controllerSettings'
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
// An ESP32 variant identifies silicon and leaves the header layout ambiguous —
// two DevKit profiles can claim that FQBN — which is how a pin can validate
// against the chip and still not exist on any header the user can reach.

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

function matrixNode(id: string): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'LED Matrix', nodeType: 'MatrixOutput', category: 'output',
      properties: { form: 'matrix', width: 16, height: 16 }, inputs: [], outputs: [],
    },
  } as unknown as StudioNode
}

function reset(nodes: StudioNode[]) {
  useGraphStore.setState({
    nodes, edges: [], selectedNodeId: null, activeGraphId: ROOT_GRAPH_ID, trusted: true,
  } as never)
}

describe('BoardNodeBody', () => {
  beforeEach(() => {
    reset([boardNode('b1')])
    useUploadStore.setState({ selectedFqbn: '', selectedPort: '', ports: [] } as never)
  })

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

  /*
   * The side-by-side pinout comparison, moved here when Build Diagram was
   * reduced to reporting the board rather than choosing it. Derived from the
   * family's own profiles rather than a board list, so adding a board doesn't
   * fail this — it just has to draw.
   */
  it('compares every reviewed pinout in the chosen family and picks one', () => {
    render(<BoardNodeBody nodeId="b1" />)
    const compare = screen.getByLabelText('Compare board pinouts') as HTMLButtonElement
    // Nothing to compare until a family narrows the field.
    expect(compare.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Board family'), { target: { value: 'esp32-s3' } })
    fireEvent.click(screen.getByLabelText('Compare board pinouts'))
    expect(screen.getByRole('dialog', { name: 'Choose your board' })).toBeTruthy()

    const family = boardProfilesForFamily('esp32-s3')
    expect(family.length).toBeGreaterThan(1)
    for (const profile of family) {
      expect(screen.getByRole('img', { name: `${profile.label} pinout` }), profile.id).toBeTruthy()
    }
    // Every profile stores its rails USB-down, so no preview rotates.
    for (const preview of document.querySelectorAll('svg[aria-label$=" pinout"]')) {
      expect(preview.querySelector('[data-board-usb="bottom"]')?.getAttribute('y')).toBe('370')
    }

    const devKit = screen.getByRole('img', { name: 'Espressif ESP32-S3-DevKitC-1 pinout' })
    expect(devKit.querySelector('[data-pin-id="j1-4"]')?.getAttribute('data-pin-side')).toBe('left')
    expect(devKit.querySelectorAll('[data-board-usb="bottom"]')).toHaveLength(2)
    expect(devKit.textContent).toContain('USB_D+ / GPIO20')

    // Changing family already selected its first board, so pick a different
    // one — otherwise the assertion would pass without the picker doing a thing.
    const board = screen.getByLabelText('Controller board') as HTMLSelectElement
    const other = family.find((profile) => profile.id !== board.value)!
    fireEvent.click(screen.getByText(other.label, { selector: 'strong' }))
    expect(screen.queryByRole('dialog', { name: 'Choose your board' })).toBeNull()
    expect((screen.getByLabelText('Controller board') as HTMLSelectElement).value).toBe(other.id)
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

  it('keeps the selected family visible while a pattern graph is open', () => {
    const rootBoard = boardNode('b1')
    useGraphStore.setState({
      nodes: [],
      edges: [],
      activeGraphId: 'pattern-1',
      graphData: {
        [ROOT_GRAPH_ID]: { nodes: [rootBoard], edges: [] },
      },
      trusted: true,
    } as never)
    render(<BoardNodeBody nodeId="b1" />)

    fireEvent.change(screen.getByLabelText('Board family'), { target: { value: 'esp32-s3' } })

    const firstS3 = boardProfilesForFamily('esp32-s3')[0]
    const storedRoot = useGraphStore.getState().graphData[ROOT_GRAPH_ID].nodes
    const properties = storedRoot[0].data.properties as Record<string, unknown>
    expect(properties.profileId).toBe(firstS3.id)
    expect((screen.getByLabelText('Board family') as HTMLSelectElement).value).toBe('esp32-s3')
    expect((screen.getByLabelText('Controller board') as HTMLSelectElement).value).toBe(firstS3.id)
  })

  it('records the profile and mirrors its closest FQBN into the upload target', () => {
    const xiao = BOARD_PROFILES.find((p) => p.id === 'seeed-xiao-esp32s3')!
    render(<BoardNodeBody nodeId="b1" />)

    fireEvent.change(screen.getByLabelText('Board family'), { target: { value: 'esp32-s3' } })
    fireEvent.change(screen.getByLabelText('Controller board'), { target: { value: xiao.id } })

    const props = useGraphStore.getState().nodes[0].data.properties as Record<string, unknown>
    expect(props.profileId).toBe(xiao.id)
    // Profiles list the specific FQBN first, the family fallback after, so
    // upload targets the closest match rather than the generic family.
    expect(useUploadStore.getState().selectedFqbn).toBe(xiao.compatibleFqbns[0])
  })

  it('shows Auto when retired boolean overrides are the only policy fields', () => {
    const profile = BOARD_PROFILES.find((p) => p.id === 'generic-esp32-s3-n16r8-44pin-dual-usbc')!
    const legacyBoard = boardNode('b1', profile.id)
    legacyBoard.data.properties = {
      ...legacyBoard.data.properties,
      usePsram: true,
      usbCdcOnBoot: true,
    }
    reset([legacyBoard])
    useUploadStore.setState({
      selectedFqbn: profile.compatibleFqbns[0],
      selectedPort: 'COM3',
      ports: [{ address: 'COM3', label: 'USB-Enhanced-SERIAL CH343', vid: 0x1a86 }],
    } as never)

    render(<BoardNodeBody nodeId="b1" />)

    expect((screen.getByLabelText('PSRAM policy') as HTMLSelectElement).value).toBe('auto')
    const serialPicker = screen.getByLabelText('Serial route') as HTMLSelectElement
    expect(serialPicker.value).toBe('auto')
    expect(serialPicker.title).toMatch(/Auto · UART bridge detected/)
    expect(screen.queryByText(/Auto · UART bridge detected/)).toBeNull()
  })

  it('keeps board metadata and peripheral pin summaries out of the editor', () => {
    const xiao = BOARD_PROFILES.find((p) => p.id === 'seeed-xiao-esp32s3')!
    reset([boardNode('b1', xiao.id)])
    render(<BoardNodeBody nodeId="b1" />)

    expect((screen.getByLabelText('Board family') as HTMLSelectElement).value).toBe('esp32-s3')
    expect(screen.queryByText('Made by')).toBeNull()
    expect(screen.queryByText('Source')).toBeNull()
    expect(screen.queryByText('Free pins')).toBeNull()
    expect(screen.queryByText(/^Mic →/)).toBeNull()
    expect(screen.queryByText(/^Amp →/)).toBeNull()
  })

  it('moves memory guidance into the memory dropdown tooltip', () => {
    const profile = BOARD_PROFILES.find((p) => p.id === 'generic-esp32-s3-n16r8-44pin-dual-usbc')!
    reset([boardNode('b1', profile.id)])
    useUploadStore.setState({ selectedFqbn: profile.compatibleFqbns[0] } as never)

    render(<BoardNodeBody nodeId="b1" />)

    const picker = screen.getByLabelText('PSRAM policy') as HTMLSelectElement
    expect(picker.title).toMatch(/Auto detected 8 MB OPI PSRAM/)
    expect(screen.queryByText(/Auto detected 8 MB OPI PSRAM/)).toBeNull()
  })

  it('shows the continuous power supply required by the LED load', () => {
    const board = boardNode('b1')
    board.data.properties = {
      ...board.data.properties,
      powerLimit: true,
      volts: 5,
      milliamps: 15400,
    }
    reset([board, matrixNode('out')])

    render(<BoardNodeBody nodeId="b1" />)

    expect(screen.getByLabelText('Required power supply')).toBeTruthy()
    expect(screen.getByText('5 V · at least 20 A · 100 W continuous')).toBeTruthy()
    expect(screen.getByText(/20% operating headroom/)).toBeTruthy()
  })

  it('accepts a current cap whose first digit falls below the minimum', () => {
    // Clamping a controlled number field on every keystroke rewrote "3" to the
    // 100 mA minimum before the next digit arrived, so 3000 could not be typed
    // at all. The clamp now runs on blur rather than mid-word.
    const board = boardNode('b1')
    board.data.properties = { ...board.data.properties, powerLimit: true, volts: 5, milliamps: 2000 }
    reset([board, matrixNode('out')])
    render(<BoardNodeBody nodeId="b1" />)

    const field = screen.getByLabelText('Power cap milliamps') as HTMLInputElement
    fireEvent.change(field, { target: { value: '3' } })
    expect(field.value).toBe('3')
    fireEvent.change(field, { target: { value: '30' } })
    fireEvent.change(field, { target: { value: '300' } })
    fireEvent.change(field, { target: { value: '3000' } })
    fireEvent.blur(field)

    expect(controllerSettings(useGraphStore.getState().nodes).milliamps).toBe(3000)
  })

  it('still clamps an out-of-range current cap once the field is left', () => {
    const board = boardNode('b1')
    board.data.properties = { ...board.data.properties, powerLimit: true, volts: 5, milliamps: 2000 }
    reset([board, matrixNode('out')])
    render(<BoardNodeBody nodeId="b1" />)

    const field = screen.getByLabelText('Power cap milliamps') as HTMLInputElement
    fireEvent.change(field, { target: { value: '7' } })
    fireEvent.blur(field)
    expect(controllerSettings(useGraphStore.getState().nodes).milliamps).toBe(100)
  })

  it('says outright when a board carries no pin-safety data', () => {
    // Every imported board now has safety data, so this path is exercised
    // through a profile with none rather than a real one. It still matters:
    // silence must read as "not checked yet", not "checked and fine".
    reset([boardNode('b1', 'no-such-profile')])
    render(<BoardNodeBody nodeId="b1" />)
    expect(screen.getByText(/Pin advice stays chip-level/)).toBeTruthy()
  })

  /*
   * The switch three generators read had no control anywhere: grouped property
   * controls draw on the canvas node, and Board is hidden there, so the Bench
   * group PROPERTY_GROUPS.Board declares never rendered. The Upload tab's
   * telemetry card and the Touch calibration wizard both instruct the user to
   * turn this on, which is what made its absence a dead end rather than a gap.
   */
  it('offers the telemetry switch and writes it to the Board node', () => {
    reset([boardNode('b1', 'esp32-generic-devkit-38pin')])
    render(<BoardNodeBody nodeId="b1" />)

    const toggle = screen.getByLabelText('Report telemetry') as HTMLInputElement
    expect(toggle.checked).toBe(false)
    fireEvent.click(toggle)
    const board = useGraphStore.getState().nodes.find((node) => node.id === 'b1')
    expect(board?.data.properties.reportTelemetry).toBe(true)
  })

  // Gated on exactly what the generator gates emission on, so the switch can
  // never promise Serial output an AVR build has no printf to produce.
  it('says so instead on a board that cannot report', () => {
    useUploadStore.setState({ selectedFqbn: 'arduino:avr:uno', selectedPort: '', ports: [] } as never)
    reset([boardNode('b1', 'arduino-uno-r3-dip')])
    render(<BoardNodeBody nodeId="b1" />)

    expect(screen.queryByLabelText('Report telemetry')).toBeNull()
    expect(screen.getByText(/Telemetry needs an ESP32 or ESP8266 target/)).toBeTruthy()
  })

  it('flags a second Board node rather than silently picking one', () => {
    reset([boardNode('b1'), boardNode('b2')])
    render(<BoardNodeBody nodeId="b1" />)
    // One sketch targets one controller; a second board has no meaning.
    expect(screen.getByText(/2 Board nodes on this canvas/)).toBeTruthy()
  })
})
