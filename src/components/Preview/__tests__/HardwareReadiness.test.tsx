import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import HardwareReadiness from '../HardwareReadiness'
import { useGraphStore } from '../../../state/graphStore'
import { useUploadStore } from '../../../state/uploadStore'
import { useCapacityStore } from '../../../state/capacityStore'

// The strip only renders once something drives LEDs, so every test needs a
// real output on the bench.
function setGraph() {
  useGraphStore.setState({
    nodes: [{
      id: 'matrix',
      type: 'studioNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'LED Matrix', nodeType: 'MatrixOutput', category: 'output',
        properties: { form: 'matrix', width: 16, height: 16, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5 },
        inputs: [], outputs: [],
      },
    }] as never[],
    edges: [] as never[],
    selectedNodeId: null,
    graphData: {},
    graphs: { root: { id: 'root', name: 'Main' } },
    activeGraphId: 'root',
  })
}

const TARGET = { code: '// sketch', fqbn: 'esp32:esp32:esp32s3', toolchainReady: true, subject: 'sketch' } as const

describe('HardwareReadiness — the Fits chip', () => {
  beforeEach(() => {
    localStorage.clear()
    setGraph()
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3', openConsole: vi.fn() })
    useCapacityStore.getState().clear()
  })

  it('offers the check rather than implying one is coming', () => {
    // Checks compile the design for real and so are user-initiated. The chip is
    // where you press, and it must not read as "a number is on its way".
    useCapacityStore.getState().setTarget(TARGET)
    const check = vi.spyOn(useCapacityStore.getState(), 'check')

    const { getByRole, getByText } = render(<HardwareReadiness />)
    expect(getByText(/not checked/)).toBeTruthy()

    fireEvent.click(getByRole('button', { name: /Fits/ }))
    expect(check).toHaveBeenCalled()
    check.mockRestore()
  })

  it('stays a plain readout when there is nothing it could measure', () => {
    useCapacityStore.getState().setTarget({ ...TARGET, code: null })
    const { queryByRole } = render(<HardwareReadiness />)
    expect(queryByRole('button', { name: /Fits/ })).toBeNull()
  })

  it('shows active compile feedback while a capacity check is running', () => {
    useCapacityStore.getState().setTarget(TARGET)
    useCapacityStore.setState({ status: 'checking' })

    const { getByLabelText, getByText } = render(<HardwareReadiness compact />)

    expect(getByLabelText(/Fits: compiling capacity/)).toBeTruthy()
    expect(getByText(/compiling/)).toBeTruthy()
  })

  it('leads to the compiler output after a failed check, not to another check', () => {
    // The failure text says "see helper log", and this chip is the furthest
    // point in the workbench from it. Re-running a compile that just failed is
    // not the next useful move; reading the error is.
    const openConsole = vi.fn()
    useUploadStore.setState({ openConsole })
    useCapacityStore.getState().setTarget(TARGET)
    useCapacityStore.setState({
      status: 'measured',
      result: {
        ok: false, overflow: false, target: 'esp32:esp32:esp32s3', flash: null, ram: null,
        error: 'Compile failed — see helper log',
      },
    })
    const check = vi.spyOn(useCapacityStore.getState(), 'check')

    const { getByRole } = render(<HardwareReadiness />)
    fireEvent.click(getByRole('button', { name: /Fits/ }))

    expect(openConsole).toHaveBeenCalled()
    expect(check).not.toHaveBeenCalled()
    check.mockRestore()
  })
})
