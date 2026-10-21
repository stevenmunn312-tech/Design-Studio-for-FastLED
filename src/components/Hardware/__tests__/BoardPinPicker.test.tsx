import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import BoardPinPicker from '../BoardPinPicker'
import { NO_PIN } from '../../../build/boards/boardGpio'
import { ROOT_GRAPH_ID, useGraphStore, type StudioEdge, type StudioNode } from '../../../state/graphStore'
import { libraryDefaults, NODE_LIBRARY } from '../../../state/nodeLibrary'
import { VL53L0X_PART_ID } from '../../../state/peripherals/distanceSensor'
import { useUploadStore } from '../../../state/upload/uploadStore'
import HardwarePartBody from '../../Canvas/bodies/HardwarePartBody'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}

describe('an unwired GPIO in the pin picker', () => {
  it('offers No GPIO and does not call two unwired shutdown pins a clash', () => {
    const near = node('near', 'DistanceInput', { partId: VL53L0X_PART_ID, xshutPin: NO_PIN })
    const far = node('far', 'DistanceInput', { partId: VL53L0X_PART_ID, xshutPin: NO_PIN })
    useGraphStore.setState({ nodes: [near, far], edges: [], activeGraphId: ROOT_GRAPH_ID })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32' })
    render(
      <BoardPinPicker
        nodeId="near"
        nodeType="DistanceInput"
        propertyKey="xshutPin"
        properties={near.data.properties as Record<string, unknown>}
        value={NO_PIN}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'SHDN' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'No GPIO' })).toBeTruthy()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByText(/Also assigned/)).toBeNull()
    expect(screen.queryByText(/not listed/)).toBeNull()
    expect(screen.getByText('This line is not driven.')).toBeTruthy()
  })

  it('offers No GPIO for a panel reset that the board ties off the header', () => {
    useGraphStore.setState({ nodes: [], edges: [], activeGraphId: ROOT_GRAPH_ID })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32' })
    render(
      <BoardPinPicker
        nodeId="panel"
        nodeType="TransportDisplay"
        propertyKey="resetPin"
        properties={{ resetPin: NO_PIN }}
        value={NO_PIN}
        ariaLabel="Reset"
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Reset' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'No GPIO' })).toBeTruthy()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })
})

describe('occupied GPIOs in the pin picker', () => {
  beforeEach(() => {
    useGraphStore.setState({ nodes: [], edges: [], activeGraphId: ROOT_GRAPH_ID })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3' })
  })

  function showPicker(part: StudioNode, propertyKey: string, others: StudioNode[] = [], edges: StudioEdge[] = []) {
    useGraphStore.setState({ nodes: [part, ...others], edges })
    const onChange = vi.fn()
    render(<BoardPinPicker
      nodeId={part.id} nodeType={part.data.nodeType} propertyKey={propertyKey}
      properties={part.data.properties} value={Number(part.data.properties[propertyKey])}
      ariaLabel="Pin" onChange={onChange}
    />)
    return onChange
  }

  function option(pin: number) {
    return screen.getByRole('combobox', { name: 'Pin' }).querySelector(`option[value="${pin}"]`) as HTMLOptionElement
  }

  it('disables GPIO 18 occupied by the amplifier, retains its selected value, and allows a free replacement', () => {
    const output = node('led', 'MatrixOutput', { dataPin: 18 })
    const amp = node('amp', 'Amplifier', { i2sLrc: 18, i2sBclk: 17, i2sDout: 16 })
    amp.data.label = 'MAX98357A stereo pair'
    const onChange = showPicker(output, 'dataPin', [amp])
    expect(option(18).disabled).toBe(true)
    expect(option(18).textContent).toContain('Pin used by MAX98357A stereo pair')
    expect(option(18).selected).toBe(true)
    expect(option(4).disabled).toBe(false)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '18' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '4' } })
    expect(onChange).toHaveBeenCalledWith(4)
    act(() => { useGraphStore.setState({ nodes: [output] }) })
    expect(option(18).disabled).toBe(false)
    expect(option(18).textContent).not.toContain('Pin used by')
  })

  it('allows matching I2C lines and rejects clock/data crossovers', () => {
    const rtc = node('rtc', 'RTCInput', { sdaPin: 8, sclPin: 9 })
    const sensor = node('sensor', 'DistanceInput', { partId: VL53L0X_PART_ID, sdaPin: 8, sclPin: 9, xshutPin: NO_PIN })
    showPicker(rtc, 'sdaPin', [sensor])
    expect(option(8).disabled).toBe(false)
    expect(option(9).disabled).toBe(true)
    expect(screen.queryByText(/Also assigned/)).toBeNull()
  })

  it('allows SPI clock sharing but blocks MOSI and chip select pins', () => {
    const card = node('card', 'SDCard', { sdSckPin: 12, sdMosiPin: 11, sdMisoPin: 13, sdCsPin: 10 })
    const panel = node('panel', 'TransportDisplay', {
      sckPin: 12, mosiPin: 11, csPin: 14, dcPin: 15, resetPin: 16, backlightPin: 17,
    })
    showPicker(card, 'sdSckPin', [panel])
    expect(option(12).disabled).toBe(false)
    expect(option(11).disabled).toBe(true)
    expect(option(14).disabled).toBe(true)
    expect(screen.queryByText(/Also assigned/)).toBeNull()
  })

  it('keeps I2S pins exclusive and includes other pins on the same part', () => {
    const amp = node('amp', 'Amplifier', { i2sBclk: 17, i2sLrc: 18, i2sDout: 16 })
    const mic = node('mic', 'MicInput', { i2sSck: 12, i2sWs: 13, i2sSd: 14 })
    showPicker(amp, 'i2sBclk', [mic])
    expect(option(17).disabled).toBe(false)
    expect(option(18).disabled).toBe(true)
    expect(option(12).disabled).toBe(true)
  })

  it.each([
    ['esp32:esp32:esp32c3', false],
    ['esp32:esp32:esp32s3', true],
  ])('uses the %s firmware bus policy for Ethernet pins', (fqbn, blocked) => {
    useUploadStore.setState({ selectedFqbn: fqbn })
    const ethernet = node('ethernet', 'EthernetModule', {
      sckPin: 4, mosiPin: 6, misoPin: 5, csPin: 7, intPin: 10, resetPin: 3,
    })
    const panel = node('panel', 'TransportDisplay', {
      sckPin: 4, mosiPin: 6, csPin: 1, dcPin: 0, resetPin: 9, backlightPin: 8,
    })
    showPicker(ethernet, 'sckPin', [panel])
    expect(option(4).disabled).toBe(blocked)
    expect(option(1).disabled).toBe(true)
  })

  it('allows a proposed mirrored LED pin but still blocks unrelated hardware on that pin', () => {
    const output = node('led', 'MatrixOutput', { dataPin: 4 })
    const mirror = node('mirror', 'MatrixOutput', { dataPin: 18 })
    const pattern = node('pattern', 'Color')
    const edges = ['led', 'mirror'].map((target) => ({
      id: target, source: 'pattern', sourceHandle: 'frame', target, targetHandle: 'frame',
    })) as StudioEdge[]
    showPicker(output, 'dataPin', [mirror, pattern], edges)
    expect(option(18).disabled).toBe(false)
    const amp = node('amp', 'Amplifier', { i2sLrc: 18, i2sBclk: 17, i2sDout: 16 })
    act(() => { useGraphStore.setState({ nodes: [output, mirror, pattern, amp] }) })
    expect(option(18).disabled).toBe(true)
    expect(option(18).textContent).toContain(`Pin used by ${amp.data.label}`)
  })

  it('blocks independent LED outputs and additional data lanes', () => {
    const output = node('led', 'MatrixOutput', { dataPin: 4, dataLanes: 2, lanePins: [5] })
    showPicker(output, 'dataPin', [node('other', 'MatrixOutput', { dataPin: 18 })])
    expect(option(4).disabled).toBe(false)
    expect(option(5).disabled).toBe(true)
    expect(option(18).disabled).toBe(true)
  })

  it('uses button entry identities so only other button pins are blocked', () => {
    const bank = node('bank', 'ButtonBank', { buttons: [
      { id: 'first', label: 'First', pin: 4, pullup: true },
      { id: 'second', label: 'Second', pin: 5, pullup: true },
    ] })
    useGraphStore.setState({ nodes: [bank] })
    render(<HardwarePartBody nodeId="bank" nodeType="ButtonBank" />)
    const picker = screen.getByRole('combobox', { name: 'First GPIO' })
    expect((picker.querySelector('option[value="4"]') as HTMLOptionElement).disabled).toBe(false)
    expect((picker.querySelector('option[value="5"]') as HTMLOptionElement).disabled).toBe(true)
    expect(picker.textContent).toContain('Pin used by Second pin')
  })

  it('ignores claims on another board', () => {
    const first = node('board-a', 'Board')
    const second = node('board-b', 'Board')
    const output = node('led', 'MatrixOutput', { boardId: 'board-b', dataPin: 18 })
    const amp = node('amp', 'Amplifier', { boardId: 'board-a', i2sLrc: 18 })
    showPicker(output, 'dataPin', [first, second, amp])
    expect(option(18).disabled).toBe(false)
    expect(screen.queryByText(/Also assigned/)).toBeNull()
  })
})
