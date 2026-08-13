import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import BuildDiagramWorkspace from '../BuildDiagramWorkspace'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/uploadStore'
import { POWER_FEED_PAIR_GAP } from '../physicalDiagramLayout'

function matrixNode(dataPin = 14, width = 16, height = 16, id = 'out', extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Matrix Output',
      nodeType: 'MatrixOutput',
      category: 'output',
      properties: { width, height, chipset: 'WS2812B', dataPin, ...extra },
      inputs: [],
      outputs: [],
    },
  }
}

function microphoneNode() {
  return {
    id: 'mic',
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Microphone',
      nodeType: 'MicInput',
      category: 'input',
      properties: { i2sWs: 39, i2sSck: 40, i2sSd: 41 },
      inputs: [],
      outputs: [],
    },
  }
}

function inputNode(id: string, nodeType: 'ButtonInput' | 'PotInput' | 'EncoderInput', properties: Record<string, number>) {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType.replace('Input', ''),
      nodeType,
      category: 'input',
      properties,
      inputs: [],
      outputs: [],
    },
  }
}

function selectDevKit() {
  useGraphStore.setState({
    buildProfile: { version: 1, physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1' },
  })
}

describe('BuildDiagramWorkspace', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [matrixNode()] as never[],
      edges: [],
      buildProfile: undefined,
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
    useUiStore.setState({ workspaceMode: 'build' })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3', selectedPort: 'COM7' })
  })

  it('starts with a compact controller, graph hardware, power summary, and idle details panel', () => {
    const { getByRole, getByText, queryByLabelText, queryByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Exact board required')).toBeTruthy()
    expect(getByRole('img', { name: 'ESP32-S3 controller family' })).toBeTruthy()
    expect(getByRole('button', { name: 'Choose your board' })).toBeTruthy()
    expect(getByText('Graph hardware')).toBeTruthy()
    expect(getByText('Power summary')).toBeTruthy()
    expect(getByText('Choose a board or select graph hardware to see its build details.')).toBeTruthy()
    expect(queryByText('Selected item')).toBeNull()
    expect(queryByText('Readiness')).toBeNull()
    expect(queryByLabelText('Preferred path')).toBeNull()
    expect(queryByLabelText('Physical length (mm)')).toBeNull()
    expect(queryByLabelText('Assigned owned supply')).toBeNull()
    expect(queryByText('Owned supplies')).toBeNull()
    expect(queryByText('Power-planning blockers')).toBeNull()
  })

  it('generates a complete build reference immediately after board selection', () => {
    const { getByRole, getByText, queryByText } = render(<BuildDiagramWorkspace />)
    fireEvent.click(getByRole('button', { name: 'Choose your board' }))
    expect(getByRole('dialog', { name: 'Choose your board' })).toBeTruthy()
    fireEvent.click(getByText('Espressif ESP32-S3-DevKitC-1'))

    expect(getByText('Build reference: ready', { selector: 'li' })).toBeTruthy()
    expect(getByText('Exact board: confirmed', { selector: 'li' })).toBeTruthy()
    expect(getByText((_, node) => node?.tagName === 'LI' && node.textContent?.startsWith('Wiring plan: generated from graph with build-rules-') === true)).toBeTruthy()
    expect(getByText('Power feeds: 3 individually fused feeds from the assigned PSU distribution zone')).toBeTruthy()
    expect(getByText((_, node) => node?.tagName === 'LI' && node.textContent === 'PSU 1: 5 V, at least 20 A / 100 W continuous for Matrix Output (20% headroom)')).toBeTruthy()
    expect(getByText('Build reference — Signal and Power ready')).toBeTruthy()
    expect(queryByText('Still unresolved')).toBeNull()
  })

  it('renders controller, microphone, matrix, and every required connection from the graph', () => {
    useGraphStore.setState({ nodes: [matrixNode(), microphoneNode()] as never[] })
    selectDevKit()
    const { container, getAllByText } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')

    expect(diagram).toBeTruthy()
    expect(getAllByText('Microphone').length).toBeGreaterThan(0)
    expect(getAllByText('Matrix Output').length).toBeGreaterThan(0)
    expect(diagram?.querySelector('[data-controller-render="esp32-s3-devkitc-1"] image')).toBeTruthy()
    for (const wire of [
      'microphone-vdd',
      'microphone-ground',
      'microphone-channel-select',
      'mic-input:mic:i2sWs',
      'mic-input:mic:i2sSck',
      'mic-input:mic:i2sSd',
      'output:out-data-in',
      'output:out-level-shifter-input',
      'output:out-conditioned-data',
      'level-shifter-1-vcc',
      'level-shifter-1-ground',
      'level-shifter-1-oe-1',
      'supply-1-positive-bus',
      'supply-1-ground-bus',
      'output:out:feed-1-positive',
      'output:out:feed-1-fused-positive',
      'output:out:feed-1-ground',
      'output:out:feed-2-positive',
      'output:out:feed-2-fused-positive',
      'output:out:feed-2-ground',
      'output:out:feed-3-positive',
      'output:out:feed-3-fused-positive',
      'output:out:feed-3-ground',
      'controller-usb-power',
    ]) {
      expect(diagram?.querySelector(`[data-wire="${wire}"]`), wire).toBeTruthy()
    }
    // Shared rails resolve to a net symbol at their own terminal rather than a
    // drawn run back to the bus. The bonding rule they rely on is stated by the
    // common-net callout, which must therefore render alongside them.
    const netStub = (wire: string) => diagram?.querySelector(`[data-net-stub-for="${wire}"]`)
    expect(netStub('level-shifter-1-vcc')?.getAttribute('data-net-stub')).toBe('v5')
    expect(netStub('level-shifter-1-vcc')?.getAttribute('data-net-stub-x')).toBe('577')
    expect(netStub('level-shifter-1-vcc')?.getAttribute('data-net-stub-y')).toBe('317')
    expect(netStub('level-shifter-1-ground')?.getAttribute('data-net-stub-x')).toBe('465')
    expect(netStub('level-shifter-1-ground')?.getAttribute('data-net-stub-y')).toBe('466')
    for (const groundWire of ['level-shifter-1-ground', 'level-shifter-1-oe-1', 'controller-common-ground', 'microphone-ground']) {
      expect(netStub(groundWire)?.getAttribute('data-net-stub'), groundWire).toBe('gnd')
    }
    expect(netStub('microphone-vdd')?.getAttribute('data-net-stub')).toBe('v3v3')
    expect(diagram?.querySelector('[data-common-net-callout]')).toBeTruthy()
    const outputTerminal = diagram?.querySelector('[data-terminal="controller-output:out:dataPin"]')
    const outputTerminalCircle = outputTerminal?.querySelector('circle')
    const outputWirePath = diagram?.querySelector('[data-wire="output:out-data-in"]')?.getAttribute('d')
    expect(outputTerminal?.getAttribute('data-board-anchor')).toBe('j1-20')
    expect(outputWirePath?.startsWith(`M${outputTerminalCircle?.getAttribute('cx')} ${outputTerminalCircle?.getAttribute('cy')}`)).toBe(true)
    // Exits left of the board, drops, then rejoins the bus band (266..290) and
    // runs in to the series resistor at x=350.
    expect(outputWirePath).toMatch(/H58V542H266V342H350$/)
    expect(diagram?.querySelector('[data-component-render="330ohm-blue-axial-resistor"]')).toBeTruthy()
    expect(diagram?.querySelector('[data-component-render="sn74ahct125n-dip14"]')).toBeTruthy()
    expect(diagram?.querySelector('[data-component-render="inmp441-breakout"]')).toBeTruthy()
    expect(diagram?.querySelector('[data-terminal="level-shifter-1-vcc"] circle')?.getAttribute('cx')).toBe('147')
    expect(diagram?.querySelector('[data-terminal="level-shifter-1-vcc"] circle')?.getAttribute('cy')).toBe('41')
    expect(diagram?.querySelector('[data-terminal="level-shifter-1-gnd"] circle')?.getAttribute('cx')).toBe('35')
    expect(diagram?.querySelector('[data-terminal="level-shifter-1-gnd"] circle')?.getAttribute('cy')).toBe('190')
    expect(diagram?.querySelector('[data-terminal="level-shifter-1-a1"]')?.textContent).toContain('P2 A1')
    expect(diagram?.querySelector('[data-terminal="level-shifter-1-y1"]')?.textContent).toContain('P3 Y1')
    expect(diagram?.querySelector('[data-wire="output:out-level-shifter-input"]')?.getAttribute('d')).toMatch(/H465$/)
    expect(diagram?.querySelector('[data-wire="output:out-conditioned-data"]')?.getAttribute('d')).toMatch(/^M465 367/)
    expect(diagram?.querySelector('[data-terminal="controller-mic-input:mic:i2sSck"]')?.getAttribute('data-board-anchor')).toBe('j3-8')
    expect(diagram?.querySelector('[data-terminal="controller-mic-input:mic:i2sWs"]')?.getAttribute('data-board-anchor')).toBe('j3-9')
    expect(diagram?.querySelector('[data-terminal="controller-mic-input:mic:i2sSd"]')?.getAttribute('data-board-anchor')).toBe('j3-7')
    const microphoneRoutes = [
      ['microphone-vdd', 'vdd'],
      ['mic-input:mic:i2sSck', 'bclk'],
      ['mic-input:mic:i2sWs', 'ws'],
      ['mic-input:mic:i2sSd', 'dout'],
    ] as const
    const microphoneWireClasses = microphoneRoutes.map(([wire, role]) => {
      const route = diagram?.querySelector(`[data-wire="${wire}"]`)
      expect(route?.getAttribute('data-wire-role')).toBe(role)
      return route?.getAttribute('class')
    })
    expect(new Set(microphoneWireClasses).size).toBe(4)
    expect(diagram?.querySelector('[data-microphone-role="bclk"]')?.textContent).toContain('BCLK')
    expect(diagram?.querySelector('[data-microphone-role="ws"]')?.textContent).toContain('WS')
    expect(diagram?.querySelector('[data-microphone-role="dout"]')?.textContent).toContain('DOUT')
    expect(diagram?.querySelector('[data-microphone-role="channel"] title')?.textContent).toContain('L/R · GND')
    expect(diagram?.querySelector('[data-wire="microphone-channel-select"]')?.getAttribute('data-wire-role')).toBe('channel-select')
    // L/R selects the channel by being tied to ground, so it carries the same
    // ground symbol as the GND pad — not a drawn strap between the two, which
    // hooked over the breakout and ended up hidden beneath the board artwork.
    for (const wireId of ['microphone-channel-select', 'microphone-ground']) {
      expect(diagram?.querySelector(`[data-net-stub-for="${wireId}"]`)?.getAttribute('data-net-stub')).toBe('gnd')
    }

    // Every pad dot has to land on the pad it names. The offsets used to be
    // authored against the microphone's layout box rather than the artwork,
    // which the box letterboxes — so the dots drifted off the pad column,
    // worst at its ends. Pin them to the rendered <image> instead of to
    // literal coordinates, so the artwork and the dots can only move together.
    const micRender = diagram?.querySelector('[data-component-render="inmp441-breakout"]')
    const num = (element: Element | null | undefined, attribute: string) =>
      Number(element?.getAttribute(attribute))
    const renderTop = num(micRender, 'y')
    const renderHeight = num(micRender, 'height')
    // The artwork is drawn at its own 1100x800 aspect, not stretched to the box.
    expect(renderHeight).toBeCloseTo(num(micRender, 'width') * (800 / 1100), 4)

    const padCentres = (['bclk', 'ws', 'channel', 'dout', 'vdd', 'gnd'] as const).map((role) =>
      num(diagram?.querySelector(`[data-microphone-role="${role}"] circle`), 'cy'))
    for (const centre of padCentres) {
      expect(centre).toBeGreaterThan(renderTop)
      expect(centre).toBeLessThan(renderTop + renderHeight)
    }
    // Six pads on one evenly spaced column, top to bottom in silkscreen order.
    const pitches = padCentres.slice(1).map((centre, index) => centre - padCentres[index])
    for (const pitch of pitches) expect(pitch).toBeCloseTo(renderHeight * (114.1 / 800), 1)
    const padX = new Set((['bclk', 'ws', 'channel', 'dout', 'vdd', 'gnd'] as const).map((role) =>
      num(diagram?.querySelector(`[data-microphone-role="${role}"] circle`), 'cx')))
    expect(padX.size).toBe(1)
    for (const terminal of [
      'supply-1-positive',
      'supply-1-ground',
      'output:out:feed-1-fuse',
      'output:out:feed-1-capacitor',
      'output:out:feed-1-capacitor-positive',
      'output:out:feed-1-capacitor-negative',
      'output:out:feed-1-ground-screw',
      'output:out:feed-1-led-positive',
      'output:out:feed-1-led-ground',
    ]) {
      expect(diagram?.querySelector(`[data-terminal="${terminal}"]`), terminal).toBeTruthy()
    }
    const psuRender = diagram?.querySelector('[data-component-render="5v-psu"]')
    expect(psuRender?.getAttribute('width')).toBe('123')
    expect(psuRender?.getAttribute('height')).toBe('220')
    expect(psuRender?.getAttribute('y')).toBe('137')
    expect(diagram?.querySelector('[data-terminal="supply-1-positive"]')?.getAttribute('cy')).toBe('201')
    expect(diagram?.querySelector('[data-terminal="supply-1-ground"]')?.getAttribute('cy')).toBe('224')
    const fuseBlockRender = diagram?.querySelector('[data-component-render="fuse-block-4-circuit"]')
    // Supply and distribution sit in one header band, and the PSU hangs off the
    // height its +5 V trunk enters the block at so that run stays straight.
    expect(fuseBlockRender?.getAttribute('y')).toBe('136')
    const mainPositive = diagram?.querySelector('[data-wire="supply-1-positive-bus"]')
    const mainGround = diagram?.querySelector('[data-wire="supply-1-ground-bus"]')
    expect(mainPositive?.getAttribute('data-wire-role')).toBe('main-psu-positive')
    expect(mainGround?.getAttribute('data-wire-role')).toBe('main-psu-ground')
    expect(mainPositive?.getAttribute('d')).toMatch(/^M153 201H212V201H362V/)
    expect(mainGround?.getAttribute('d')).toMatch(/^M153 224H196V/)
    expect(mainPositive?.getAttribute('class')).not.toBe(diagram?.querySelector('[data-wire="output:out:feed-1-fused-positive"]')?.getAttribute('class'))
    expect(diagram?.querySelectorAll('[data-component-render="panasonic-eeufr0j102b-1000uf"]')).toHaveLength(3)
    // The capacitor picks up from the panel terminals on its own leads, so it
    // reads as bridging the pair rather than sitting in series with it.
    const capacitorPositive = diagram?.querySelector('[data-terminal="output:out:feed-1-capacitor-positive"]')
    const capacitorNegative = diagram?.querySelector('[data-terminal="output:out:feed-1-capacitor-negative"]')
    const ledPositive = diagram?.querySelector('[data-terminal="output:out:feed-1-led-positive"]')
    expect(Number(capacitorPositive?.getAttribute('cy'))).toBe(Number(ledPositive?.getAttribute('cy')))
    expect(Number(capacitorPositive?.getAttribute('cx'))).toBeGreaterThan(Number(ledPositive?.getAttribute('cx')))
    expect(Number(capacitorNegative?.getAttribute('cy')) - Number(capacitorPositive?.getAttribute('cy'))).toBe(26)
    // Feed 1 is the shallowest row, so it owns the outermost lane pair, and its
    // ground runs immediately inside its positive.
    expect(diagram?.querySelector('[data-wire="output:out:feed-1-fused-positive"]')?.getAttribute('d')).toContain('H742V')
    expect(diagram?.querySelector('[data-wire="output:out:feed-1-ground"]')?.getAttribute('d')).toContain('H735V')
    expect(diagram?.querySelector('[data-wire="output:out:feed-3-fused-positive"]')?.getAttribute('d')).toContain('H694V')
    // Half the feeds leave the right screw column straight out to their lane;
    // the deeper half wraps the left of the block into the comb below it.
    expect(diagram?.querySelectorAll('[data-feed-column="right"]')).toHaveLength(2)
    expect(diagram?.querySelectorAll('[data-feed-column="left"]')).toHaveLength(1)
    expect(diagram?.querySelector('[data-fuse-value-schedule="supply-1"]')?.textContent)
      .toContain('BLOCK 1 · 1: 7.5A  ·  2: 7.5A  ·  3: SPARE  ·  4: 15A')
    const ledPositives = Array.from(diagram?.querySelectorAll('[data-terminal$="-led-positive"]') ?? [])
      .map((terminal) => Number(terminal.getAttribute('cy')))
    expect(ledPositives).toEqual([229, 315, 401])
    // The shallowest feed sits level with the fuse it leaves, so its run out to
    // the panel is a straight line.
    expect(ledPositives[0]).toBe(Math.round(Number(diagram?.querySelector('[data-terminal="output:out:feed-1-fuse"] circle')?.getAttribute('cy'))))
    const groundScrews = Array.from(diagram?.querySelectorAll('[data-terminal$="-ground-screw"]') ?? [])
    expect(new Set(groundScrews.map((terminal) => terminal.getAttribute('cx'))).size).toBe(3)
    expect(Array.from(diagram?.querySelectorAll('text') ?? []).some((text) => text.textContent === '7.5A FUSE')).toBe(false)
  })

  it('fans the power feeds out into ordered lanes that never cross a shallower run', () => {
    useGraphStore.setState({ nodes: [matrixNode(14, 16, 16, 'out-a'), matrixNode(27, 16, 16, 'out-b')] as never[] })
    selectDevKit()
    const { container } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')

    // Each branch ends `...H<lane>V<row>H<panel>`: the lane it drops down, then
    // the row it runs out on.
    const drop = (wire: string) => {
      const d = diagram?.querySelector(`[data-wire="${wire}"]`)?.getAttribute('d') ?? ''
      const match = /H(-?[\d.]+)V(-?[\d.]+)H\d+$/.exec(d)
      expect(match, `${wire}: ${d}`).toBeTruthy()
      return { lane: Number(match![1]), row: Number(match![2]) }
    }
    const feeds = ['out-a', 'out-b'].flatMap((output) => [1, 2, 3].map((feed) => ({
      positive: drop(`output:${output}:feed-${feed}-fused-positive`),
      ground: drop(`output:${output}:feed-${feed}-ground`),
    })))
    expect(feeds).toHaveLength(6)

    for (const [index, feed] of feeds.entries()) {
      // A pair's ground lands lower, so it has to drop outside the positive.
      expect(feed.ground.row - feed.positive.row).toBe(POWER_FEED_PAIR_GAP)
      expect(feed.ground.lane).toBeLessThan(feed.positive.lane)
      if (index === 0) continue
      const previous = feeds[index - 1]
      // Deeper rows drop further left, which is what keeps the fan planar: a
      // lane drop always happens left of every shallower row's run.
      expect(feed.positive.row).toBeGreaterThan(previous.positive.row)
      expect(feed.positive.lane).toBeLessThan(previous.ground.lane)
    }
  })

  it('shows two 5 A output limits while retaining the uncapped safety ceiling', () => {
    useGraphStore.setState({
      nodes: [
        matrixNode(14, 16, 16, 'out-a', { powerLimit: true, milliamps: 5000 }),
        matrixNode(27, 16, 16, 'out-b', { powerLimit: true, milliamps: 5000 }),
      ] as never[],
    })
    selectDevKit()
    const { container, getByText } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')

    expect(diagram?.querySelector('[data-output-card="output:out-a"] [data-operating-current-cap="5000"]')?.textContent).toBe('CURRENT LIMIT 5A')
    expect(diagram?.querySelector('[data-output-card="output:out-b"] [data-operating-current-cap="5000"]')?.textContent).toBe('CURRENT LIMIT 5A')
    expect(diagram?.querySelector('[data-psu-recommendation="20000"]')?.textContent).toBe('5 V · 20A · 100 W')
    expect(diagram?.querySelector('[data-uncapped-current-ceiling="30720"]')?.textContent).toContain('30.7A')
    expect(getByText('Matrix Output 1: 5 A limit · Matrix Output 2: 5 A limit')).toBeTruthy()
    expect(getByText('Uncapped full-white ceiling 30.72 A')).toBeTruthy()
  })

  it('generates complete recommended wiring for supported controls from the graph', () => {
    useGraphStore.setState({
      nodes: [
        matrixNode(),
        inputNode('button', 'ButtonInput', { pin: 4 }),
        inputNode('pot', 'PotInput', { pin: 5 }),
        inputNode('encoder', 'EncoderInput', { pinA: 6, pinB: 7, pinSW: 8 }),
      ] as never[],
    })
    selectDevKit()
    const { container } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')

    for (const wire of [
      'button-input:button:pin',
      'button-input:button-ground',
      'pot-input:pot:pin',
      'pot-input:pot-3v3',
      'pot-input:pot-ground',
      'encoder-input:encoder:pinA',
      'encoder-input:encoder:pinB',
      'encoder-input:encoder:pinSW',
      'encoder-input:encoder-ground',
    ]) {
      expect(diagram?.querySelector(`[data-wire="${wire}"]`), wire).toBeTruthy()
    }
  })

  it('uses icon controls with accessible names for hardware visibility, isolation, and completion', () => {
    const { getByRole } = render(<BuildDiagramWorkspace />)

    expect(getByRole('button', { name: 'Hide Matrix Output' }).querySelector('svg')).toBeTruthy()
    expect(getByRole('button', { name: 'Isolate Matrix Output' }).querySelector('svg')).toBeTruthy()
    expect(getByRole('button', { name: 'Mark Matrix Output done' }).querySelector('svg')).toBeTruthy()

    fireEvent.click(getByRole('button', { name: 'Mark Matrix Output done' }))
    expect(getByRole('button', { name: 'Mark Matrix Output unfinished' })).toBeTruthy()
  })

  it('draws each control module from its own render with pads on the board edge', () => {
    useGraphStore.setState({
      nodes: [
        matrixNode(),
        inputNode('button', 'ButtonInput', { pin: 4 }),
        inputNode('pot', 'PotInput', { pin: 5 }),
        inputNode('encoder', 'EncoderInput', { pinA: 6, pinB: 7, pinSW: 8 }),
      ] as never[],
    })
    selectDevKit()
    const { container } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')

    for (const render of ['button-module', 'potentiometer-module', 'encoder-module']) {
      expect(diagram?.querySelector(`[data-component-render="${render}"]`), render).toBeTruthy()
    }

    // Every module render carries a VCC pad, so all three take a 3V3 stub -
    // not just the potentiometer as the old drawn-box graphic assumed.
    for (const item of ['button-input:button', 'pot-input:pot', 'encoder-input:encoder']) {
      expect(diagram?.querySelector(`[data-net-stub-for="${item}-3v3"]`), item).toBeTruthy()
      expect(diagram?.querySelector(`[data-net-stub-for="${item}-ground"]`), item).toBeTruthy()
    }

    // Pads sit on the bottom edge of the artwork, so their stubs point down.
    expect(diagram?.querySelector('[data-net-stub-for="button-input:button-ground"]')?.getAttribute('data-net-stub-direction')).toBe('down')

    // Terminals must land on the holes in the render, not near them. The pad
    // row was measured at 88.4% of board height; an earlier scanline estimate
    // was ~4px high because the corner mounting holes share that band.
    const artwork = diagram?.querySelector('[data-component-render="button-module"]')
    const boardTop = Number(artwork?.getAttribute('y'))
    const boardHeight = Number(artwork?.getAttribute('height'))
    const sigY = Number(diagram?.querySelector('[data-terminal="button-input:button-button-input:button:pin"] circle')?.getAttribute('cy'))
    expect((sigY - boardTop) / boardHeight).toBeCloseTo(0.884, 3)

    // The stub symbol has to clear the board edge instead of drawing over it.
    const stubLead = Number(/V([\d.]+)$/.exec(
      diagram?.querySelector('[data-wire="button-input:button-ground"]')?.getAttribute('d') ?? '',
    )?.[1])
    const stubAnchorY = Number(diagram?.querySelector('[data-net-stub-for="button-input:button-ground"]')?.getAttribute('data-net-stub-y'))
    expect(stubAnchorY + stubLead).toBeGreaterThan(boardTop + boardHeight)

    // Encoder exposes VCC + A/B/SW + GND; its three signals land on pads 1..3,
    // strictly between the VCC pad and the GND pad.
    const padX = (terminal: string) => Number(diagram?.querySelector(`[data-terminal="${terminal}"] circle`)?.getAttribute('cx'))
    const vccX = Number(diagram?.querySelector('[data-net-stub-for="encoder-input:encoder-3v3"]')?.getAttribute('data-net-stub-x'))
    const gndX = Number(diagram?.querySelector('[data-net-stub-for="encoder-input:encoder-ground"]')?.getAttribute('data-net-stub-x'))
    const signalXs = ['pinA', 'pinB', 'pinSW'].map((key) => padX(`encoder-input:encoder-encoder-input:encoder:${key}`))
    expect(signalXs.every((value) => Number.isFinite(value))).toBe(true)
    expect(signalXs).toEqual([...signalXs].sort((a, b) => a - b))
    expect(Math.min(...signalXs)).toBeGreaterThan(vccX)
    expect(Math.max(...signalXs)).toBeLessThan(gndX)
  })

  it('gives every control signal its own lane, ordered so no climb crosses another run', () => {
    useGraphStore.setState({
      nodes: [
        matrixNode(),
        microphoneNode(),
        inputNode('pot', 'PotInput', { pin: 5 }),
        inputNode('button', 'ButtonInput', { pin: 4 }),
        inputNode('encoder', 'EncoderInput', { pinA: 6, pinB: 7, pinSW: 8 }),
      ] as never[],
    })
    selectDevKit()
    const { container } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')

    // The two descent bands between the controller and the resistors must stay
    // disjoint. Control corridors (296..328) once sat on top of the bus lanes
    // (266..290), which put unrelated wires on the same vertical.
    const horizontals = (node: Element) =>
      [...(node.getAttribute('d') ?? '').matchAll(/H(-?[\d.]+)/g)].map((m) => Number(m[1]))
    const inBand = (v: number, lo: number, hi: number) => v >= lo && v <= hi
    const controlPaths = Array.from(diagram?.querySelectorAll('path[data-control-lane]') ?? [])
    const busPaths = ['mic-input:mic:i2sSck', 'mic-input:mic:i2sWs', 'mic-input:mic:i2sSd', 'output:out-data-in']
      .map((wire) => diagram?.querySelector(`path[data-wire="${wire}"]`))
      .filter((node): node is Element => !!node)
    expect(busPaths.length).toBeGreaterThan(0)
    expect(controlPaths.some((node) => horizontals(node).some((v) => inBand(v, 266, 290)))).toBe(false)
    expect(busPaths.some((node) => horizontals(node).some((v) => inBand(v, 296, 328)))).toBe(false)

    // Route shape is M px py H corridor V laneY H padX V padY.
    const routes = Array.from(diagram?.querySelectorAll('path[data-control-lane]') ?? []).map((node) => {
      const d = node.getAttribute('d') ?? ''
      const m = /V(-?[\d.]+)H(-?[\d.]+)V(-?[\d.]+)$/.exec(d)
      return { laneY: Number(m?.[1]), padX: Number(m?.[2]), padY: Number(m?.[3]) }
    })
    expect(routes).toHaveLength(5)
    expect(routes.every((r) => Number.isFinite(r.laneY) && Number.isFinite(r.padX))).toBe(true)

    // No two signals share a lane - an encoder's A/B/SW previously overlapped.
    expect(new Set(routes.map((r) => r.laneY)).size).toBe(5)

    // Lanes deepen left to right, so each wire climbs to its pad without
    // crossing a shallower lane that continues further right.
    const byPad = [...routes].sort((a, b) => a.padX - b.padX)
    expect(byPad.map((r) => r.laneY)).toEqual([...byPad.map((r) => r.laneY)].sort((a, b) => a - b))

    // Every lane sits below its pad, so the final segment climbs.
    expect(routes.every((r) => r.laneY > r.padY)).toBe(true)
  })

  it('wraps control modules to a second row instead of running off the sheet', () => {
    useGraphStore.setState({
      nodes: [
        matrixNode(),
        inputNode('b1', 'ButtonInput', { pin: 4 }),
        inputNode('b2', 'ButtonInput', { pin: 9 }),
        inputNode('pot', 'PotInput', { pin: 5 }),
        inputNode('encoder', 'EncoderInput', { pinA: 6, pinB: 7, pinSW: 8 }),
      ] as never[],
    })
    selectDevKit()
    const { container } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')
    const canvasWidth = Number(diagram?.getAttribute('viewBox')?.split(' ')[2])

    const renders = Array.from(diagram?.querySelectorAll('[data-component-render$="-module"]') ?? [])
    expect(renders).toHaveLength(4)
    for (const node of renders) {
      const right = Number(node.getAttribute('x')) + Number(node.getAttribute('width'))
      expect(right, node.getAttribute('data-component-render') ?? '').toBeLessThanOrEqual(canvasWidth)
    }
    // The fourth module starts a new row rather than extending the first.
    const rows = new Set(renders.map((node) => node.getAttribute('y')))
    expect(rows.size).toBe(2)
  })

  it('offers only the section sheets the build actually has hardware for', () => {
    useGraphStore.setState({ nodes: [matrixNode(), microphoneNode()] as never[] })
    selectDevKit()
    const { getAllByRole } = render(<BuildDiagramWorkspace />)

    const tabs = getAllByRole('tab').map((tab) => tab.textContent)
    expect(tabs).toEqual(['All', 'Data', 'Audio', 'Power'])
    // No button/pot/encoder in the graph, so Controls has nothing to draw.
    expect(tabs).not.toContain('Controls')
  })

  it('drops the layers and hardware a section does not cover', () => {
    useGraphStore.setState({
      nodes: [matrixNode(), microphoneNode(), inputNode('pot', 'PotInput', { pin: 5 })] as never[],
    })
    selectDevKit()
    const { container, getByRole } = render(<BuildDiagramWorkspace />)
    const diagram = () => container.querySelector('svg[data-build-export="current-view"]')

    // All: every layer present.
    expect(diagram()?.querySelector('[data-component-render="sn74ahct125n-dip14"]')).toBeTruthy()
    expect(diagram()?.querySelector('[data-common-net-callout]')).toBeTruthy()
    expect(diagram()?.querySelector('[data-component-render="inmp441-breakout"]')).toBeTruthy()

    fireEvent.click(getByRole('tab', { name: 'Audio' }))
    // The mic sheet keeps its own device and I2S runs but sheds the LED chain,
    // the level shifter, and the whole PSU plan.
    expect(diagram()?.querySelector('[data-component-render="inmp441-breakout"]')).toBeTruthy()
    expect(diagram()?.querySelector('[data-wire="mic-input:mic:i2sSck"]')).toBeTruthy()
    expect(diagram()?.querySelector('[data-component-render="sn74ahct125n-dip14"]')).toBeNull()
    expect(diagram()?.querySelector('[data-output-card="output:out"]')).toBeNull()
    expect(diagram()?.querySelector('[data-wire="pot-input:pot:pin"]')).toBeNull()
    // The sheet still draws net stubs, so it must still carry their legend.
    expect(diagram()?.querySelector('[data-net-stub-for="microphone-ground"]')).toBeTruthy()
    expect(diagram()?.querySelector('[data-common-net-callout]')).toBeTruthy()

    fireEvent.click(getByRole('tab', { name: 'Power' }))
    // The power sheet keeps the outputs as loads and the PSU plan, but carries
    // no signal runs at all.
    expect(diagram()?.querySelector('[data-common-net-callout]')).toBeTruthy()
    expect(diagram()?.querySelector('[data-output-card="output:out"]')).toBeTruthy()
    expect(diagram()?.querySelector('[data-wire="output:out-data-in"]')).toBeNull()
    expect(diagram()?.querySelector('[data-component-render="sn74ahct125n-dip14"]')).toBeNull()
    expect(diagram()?.querySelector('[data-component-render="inmp441-breakout"]')).toBeNull()
    // No signal runs means no signal pins on the controller either, but its
    // ground stub stays because the common net spans every sheet.
    expect(diagram()?.querySelector('[data-terminal="controller-output:out:dataPin"]')).toBeNull()
    expect(diagram()?.querySelector('[data-net-stub-for="controller-common-ground"]')).toBeTruthy()

    // The output card must not point down the sheet for a PSU plan that the
    // Data section does not draw.
    fireEvent.click(getByRole('tab', { name: 'Data' }))
    expect(diagram()?.querySelector('[data-output-card="output:out"]')?.textContent).toContain('SEE POWER SECTION')

    fireEvent.click(getByRole('tab', { name: 'All' }))
    expect(diagram()?.querySelector('[data-component-render="sn74ahct125n-dip14"]')).toBeTruthy()
    expect(diagram()?.querySelector('[data-output-card="output:out"]')?.textContent).toContain('PSU PLAN BELOW')
  })

  it('shrinks the sheet when a section drops the PSU zones', () => {
    useGraphStore.setState({ nodes: [matrixNode(), microphoneNode()] as never[] })
    selectDevKit()
    const { container, getByRole } = render(<BuildDiagramWorkspace />)
    const height = () => Number(container.querySelector('svg[data-build-export="current-view"]')?.getAttribute('height'))

    const fullHeight = height()
    fireEvent.click(getByRole('tab', { name: 'Audio' }))
    expect(height()).toBeLessThan(fullHeight)
  })

  it('keeps the complete-build export whole regardless of the active section', () => {
    useGraphStore.setState({ nodes: [matrixNode(), microphoneNode()] as never[] })
    selectDevKit()
    const { container, getByRole } = render(<BuildDiagramWorkspace />)

    fireEvent.click(getByRole('tab', { name: 'Audio' }))
    const exportDiagram = container.querySelector('svg[data-build-export="complete-build"]')
    expect(exportDiagram?.querySelector('[data-component-render="sn74ahct125n-dip14"]')).toBeTruthy()
    expect(exportDiagram?.querySelector('[data-output-card="output:out"]')).toBeTruthy()
    expect(exportDiagram?.querySelector('[data-common-net-callout]')).toBeTruthy()
  })

  it('keeps invalid GPIO mappings blocking even when that hardware is hidden', () => {
    useGraphStore.setState({
      nodes: [matrixNode(35)] as never[],
      buildProfile: { version: 1, physicalBoardProfileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' },
    })
    const { getByRole, getByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Signal plan: needs review: 1 controller pin mapping unresolved', { selector: 'li' })).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Hide Matrix Output' }))
    expect(getByText('Signal plan: needs review: 1 controller pin mapping unresolved', { selector: 'li' })).toBeTruthy()
  })

  it('sizes a 64x64 graph without pretending a small supply is enough', () => {
    useGraphStore.setState({ nodes: [matrixNode(14, 64, 64)] as never[] })
    selectDevKit()
    const { getByText, getAllByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Power feeds: 26 individually fused feeds from the assigned PSU distribution zone')).toBeTruthy()
    expect(getByText((_, node) => node?.tagName === 'LI' && (node.textContent?.startsWith('PSU 5: 5 V, at least') ?? false))).toBeTruthy()
    expect(getAllByText((_, node) => node?.textContent?.includes('PSU ZONE 5') ?? false).length).toBeGreaterThan(0)
    expect(getByText('Keep separate PSU +5 V zones isolated; join grounds for the shared controller data reference.')).toBeTruthy()
  })

  it('uses additional fixed fuse blocks and one electrolytic per feed when a PSU zone exceeds twelve circuits', () => {
    useGraphStore.setState({
      nodes: [matrixNode(14, 64, 64, 'out', { powerLimit: true, milliamps: 5000 })] as never[],
    })
    selectDevKit()
    const { container } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')

    expect(Array.from(diagram?.querySelectorAll('[data-fuse-block-circuits]') ?? [])
      .map((node) => Number(node.getAttribute('data-fuse-block-circuits'))))
      .toEqual([12, 12, 2])
    expect(diagram?.querySelectorAll('[data-component-render="panasonic-eeufr0j102b-1000uf"]')).toHaveLength(26)
    const laneCoordinates = (polarity: 'fused-positive' | 'ground') => Array.from(
      diagram?.querySelectorAll(`[data-wire$="-${polarity}"]`) ?? [],
      (wire) => wire.getAttribute('d')?.match(/H(\d+)V\d+(?:\.\d+)?H\d+$/)?.[1],
    ).filter((coordinate): coordinate is string => coordinate != null)
    const positiveLanes = laneCoordinates('fused-positive')
    const groundLanes = laneCoordinates('ground')
    expect(new Set(positiveLanes).size).toBe(26)
    expect(new Set(groundLanes).size).toBe(26)
    expect(positiveLanes.some((lane) => groundLanes.includes(lane))).toBe(false)
    const finalGround = Number(diagram?.querySelector('[data-terminal="output:out:feed-26-led-ground"]')?.getAttribute('cy'))
    expect(finalGround).toBeLessThan(Number(diagram?.getAttribute('height')))
  })

  it('allocates four real level-shifter channels before adding a second chip', () => {
    useGraphStore.setState({
      nodes: [4, 5, 6, 7, 8].map((pin, index) => matrixNode(pin, 4, 4, `out-${index + 1}`)) as never[],
    })
    selectDevKit()
    const { container } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')

    for (const terminal of [
      'level-shifter-1-a1', 'level-shifter-1-y1', 'level-shifter-1-oe1',
      'level-shifter-1-a4', 'level-shifter-1-y4', 'level-shifter-1-oe4',
      'level-shifter-2-a1', 'level-shifter-2-y1', 'level-shifter-2-oe1',
    ]) {
      expect(diagram?.querySelector(`[data-terminal="${terminal}"]`), terminal).toBeTruthy()
    }
    expect(diagram?.querySelector('[data-wire="level-shifter-1-oe-4"]')).toBeTruthy()
    expect(diagram?.querySelector('[data-wire="level-shifter-2-oe-1"]')).toBeTruthy()
    expect(diagram?.querySelectorAll('[data-component-render="sn74ahct125n-dip14"]')).toHaveLength(2)

    const expectedChannels = [
      { a: [465, 342], y: [465, 367], oe: [465, 317] },
      { a: [465, 416], y: [465, 441], oe: [465, 391] },
      { a: [577, 441], y: [577, 466], oe: [577, 416] },
      { a: [577, 367], y: [577, 391], oe: [577, 342] },
    ] as const
    expectedChannels.forEach((points, channelIndex) => {
      const outputId = `output:out-${channelIndex + 1}`
      expect(diagram?.querySelector(`[data-wire="${outputId}-level-shifter-input"]`)?.getAttribute('d')).toMatch(new RegExp(`H${points.a[0]}$`))
      expect(diagram?.querySelector(`[data-wire="${outputId}-conditioned-data"]`)?.getAttribute('d')).toMatch(new RegExp(`^M${points.y[0]} ${points.y[1]}`))
      // Each /OE tie is a stub on its own pin's side, not a run to the ground bus.
      const oeStub = diagram?.querySelector(`[data-net-stub-for="level-shifter-1-oe-${channelIndex + 1}"]`)
      expect(oeStub?.getAttribute('data-net-stub-x')).toBe(String(points.oe[0]))
      expect(oeStub?.getAttribute('data-net-stub-y')).toBe(String(points.oe[1]))
      expect(oeStub?.getAttribute('data-net-stub-direction')).toBe(points.oe[0] === 465 ? 'left' : 'right')
    })
  })

  it('supports zoom, isolation, and panel sizing without changing generated wiring data', () => {
    selectDevKit()
    const { container, getByLabelText, getByRole, getByText, queryByText } = render(<BuildDiagramWorkspace />)
    const workspace = getByLabelText('Build Diagram workspace')
    const viewport = container.querySelector('[data-pan-surface="true"]')?.parentElement?.parentElement
    expect(viewport).toBeTruthy()
    expect(getByRole('heading', { name: 'Wiring Diagram' })).toBeTruthy()
    expect(getByRole('button', { name: 'Back to Design' })).toBeTruthy()
    expect(queryByText('Visible')).toBeNull()
    expect(queryByText('Graph hardware in, complete recommended wiring out.')).toBeNull()

    fireEvent.wheel(viewport as Element, { deltaY: -100, clientX: 100, clientY: 100 })
    expect(getByText('Zoom 115%')).toBeTruthy()
    fireEvent.wheel(viewport as Element, { deltaY: 100, clientX: 100, clientY: 100 })
    expect(getByText('Zoom 100%')).toBeTruthy()

    fireEvent.click(getByText('Zoom in'))
    expect(getByText('Zoom 115%')).toBeTruthy()
    fireEvent.click(getByText('Reset view'))
    expect(getByText('Zoom 100%')).toBeTruthy()

    fireEvent.click(getByRole('button', { name: 'Isolate Matrix Output' }))
    expect(getByRole('button', { name: 'Show all hardware around Matrix Output' })).toBeTruthy()

    fireEvent.click(getByText('Widen build panel'))
    expect(workspace.getAttribute('style')).toContain('--build-sidebar-width: 372px')
    fireEvent.click(getByText('Narrow details'))
    expect(workspace.getAttribute('style')).toContain('--build-detail-width: 328px')
  })

  it('uses a four-by-four LED preview and labels the recommended PSU power', () => {
    const second = matrixNode(12, 16, 16, 'out-2')
    useGraphStore.setState({ nodes: [matrixNode(), second] as never[] })
    selectDevKit()
    const { container } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')

    const previews = diagram?.querySelectorAll('[data-led-preview="4x4"]') ?? []
    expect(previews).toHaveLength(2)
    expect(previews[0]?.querySelectorAll('rect')).toHaveLength(16)
    expect(diagram?.querySelector('[data-output-card="output:out"] > rect')?.getAttribute('width')).toBe('184')
    expect(diagram?.textContent).toContain('RECOMMENDED POWER SUPPLY5 V · 40A · 200 W')
    expect(diagram?.querySelector('[data-uncapped-current-ceiling]')).toBeNull()
  })

  it('preserves explicit complete-build and current-view export scope', () => {
    selectDevKit()
    const { getByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Complete build is selected. Exports will include every configured hardware item by default.')).toBeTruthy()
    fireEvent.click(getByText('Current view'))
    expect(useGraphStore.getState().buildProfile?.exportMode).toBe('current-view')
    expect(getByText('Current view is selected. Exports will follow the hardware currently visible under the eye/filter/isolation state and the All section.')).toBeTruthy()
  })

  it('builds a paginated print document only while printing, with power on its own pages', () => {
    useGraphStore.setState({ nodes: [matrixNode(14, 64, 64), microphoneNode()] as never[] })
    selectDevKit()
    const { container } = render(<BuildDiagramWorkspace />)

    // Several full copies of the sheet: built for the print, not kept mounted,
    // and portalled onto the body so the clipped workspace cannot crop them.
    expect(document.body.querySelector('[data-build-print-document]')).toBeNull()
    fireEvent(window, new Event('beforeprint'))

    const printDocument = document.body.querySelector('[data-build-print-document]')
    expect(printDocument?.parentElement).toBe(document.body)
    expect(printDocument).toBeTruthy()
    const pageTitles = Array.from(printDocument?.querySelectorAll('header strong') ?? [])
      .map((heading) => heading.textContent)
    const supplyCount = container.querySelectorAll('svg[data-build-export="current-view"] [data-power-zone]').length
    expect(supplyCount).toBeGreaterThan(1)
    expect(pageTitles).toEqual([
      'Build reference',
      'Signal wiring',
      ...Array.from({ length: supplyCount }, (_, index) => `Power — PSU zone ${index + 1} of ${supplyCount}`),
      'Connection schedule',
      'Parts list',
    ])

    // Each power page crops to exactly the band its own zone is drawn in, and
    // the bands tile: a printed zone is whole and no band prints twice.
    const printSheets = Array.from(printDocument?.querySelectorAll('svg[data-build-export]') ?? [])
    const wiring = printSheets[0]
    expect(wiring.querySelector('[data-power-zone]')).toBeNull()
    expect(wiring.querySelector('[data-component-render="sn74ahct125n-dip14"]')).toBeTruthy()
    const crops = printSheets.slice(1).map((sheet, index) => {
      const [x, y, width, height] = (sheet.getAttribute('viewBox') ?? '').split(' ').map(Number)
      expect([x, width]).toEqual([0, 1120])
      expect(sheet.querySelectorAll('[data-power-zone]')).toHaveLength(supplyCount)
      const zone = sheet.querySelectorAll('[data-power-zone]')[index]
      expect(Number(zone.getAttribute('data-power-zone-y'))).toBe(y)
      return { y, height }
    })
    expect(crops).toHaveLength(supplyCount)
    expect(crops[1].y).toBe(crops[0].y + crops[0].height)

    // The schedules a builder ticks off print too; before this they were CSV-only.
    const tables = printDocument?.querySelectorAll('table') ?? []
    expect(tables).toHaveLength(2)
    expect(tables[0].querySelectorAll('tbody tr').length).toBeGreaterThan(0)
    expect(tables[1].textContent).toContain('74AHCT125 level shifter')

    fireEvent(window, new Event('afterprint'))
    expect(document.body.querySelector('[data-build-print-document]')).toBeNull()
  })

  it('shows identifying details for all supported exact boards', () => {
    const { container, getByRole, getByText } = render(<BuildDiagramWorkspace />)
    fireEvent.click(getByRole('button', { name: 'Choose your board' }))

    expect(getByRole('img', { name: 'Generic ESP32-S3 N16R8, 44-pin dual USB-C pinout' })).toBeTruthy()
    expect(getByRole('img', { name: 'Espressif ESP32-S3-DevKitC-1 pinout' })).toBeTruthy()
    expect(getByRole('img', { name: 'Seeed Studio XIAO ESP32S3 pinout' })).toBeTruthy()
    expect(getByText('Generic ESP32-S3 N16R8, 44-pin dual USB-C')).toBeTruthy()
    expect(getByText('Espressif ESP32-S3-DevKitC-1')).toBeTruthy()
    expect(getByText('Seeed Studio XIAO ESP32S3')).toBeTruthy()
    expect(getByText('D4 / GPIO5')).toBeTruthy()
    const previews = container.querySelectorAll('svg[aria-label$=" pinout"]')
    expect(previews).toHaveLength(3)
    for (const preview of previews) {
      expect(preview.querySelector('[data-board-usb="bottom"]')?.getAttribute('y')).toBe('370')
    }
    const devKitPreview = getByRole('img', { name: 'Espressif ESP32-S3-DevKitC-1 pinout' })
    expect(devKitPreview.querySelector('[data-pin-id="j1-4"]')?.getAttribute('data-pin-side')).toBe('left')
    expect(devKitPreview.querySelectorAll('[data-board-usb="bottom"]')).toHaveLength(2)
    expect(devKitPreview.textContent).toContain('USB_D+ / GPIO20')
    expect(devKitPreview.textContent).toContain('GPIO0 / BOOT')
    const xiaoPreview = getByRole('img', { name: 'Seeed Studio XIAO ESP32S3 pinout' })
    expect(xiaoPreview.querySelector('[data-pin-id="bottom-1"]')?.getAttribute('data-pin-side')).toBe('top')
  })
})
