import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import HardwareReadiness from '../HardwareReadiness'
import { useGraphStore } from '../../../state/graphStore'
import { useUploadStore } from '../../../state/uploadStore'
import { useCapacityStore } from '../../../state/capacityStore'
import { useUiStore } from '../../../state/uiStore'

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

describe('HardwareReadiness — the capacity chip', () => {
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

    const { getByRole, getByText, queryByText } = render(<HardwareReadiness />)
    expect(getByText(/not checked/)).toBeTruthy()
    // An unmeasured design has no verdict, so the chip must not say it fits.
    expect(queryByText(/^Fits$/)).toBeNull()

    fireEvent.click(getByRole('button', { name: /Capacity.*not checked/ }))
    expect(check).toHaveBeenCalled()
    check.mockRestore()
  })

  it('stays a plain readout when there is nothing it could measure', () => {
    useCapacityStore.getState().setTarget({ ...TARGET, code: null })
    const { queryByRole } = render(<HardwareReadiness />)
    expect(queryByRole('button', { name: /Capacity/ })).toBeNull()
  })

  it('shows active compile feedback while a capacity check is running', () => {
    useCapacityStore.getState().setTarget(TARGET)
    useCapacityStore.setState({ status: 'checking' })

    const { getByLabelText, getByText } = render(<HardwareReadiness compact />)

    expect(getByLabelText(/Capacity check: compiling/)).toBeTruthy()
    expect(getByText(/compiling/)).toBeTruthy()
  })

  it('names a bake failure and opens the upload controls to review it', () => {
    useCapacityStore.getState().setTarget({ ...TARGET, code: null,
      preparationError: 'Touch panel: Could not bake Power at 24x24: decoder failed' })
    const setHardwarePaneTab = vi.spyOn(useUiStore.getState(), 'setHardwarePaneTab')
    const { getByRole } = render(<HardwareReadiness />)
    fireEvent.click(getByRole('button', { name: /Check failed.*Touch panel: Could not bake Power/ }))
    expect(setHardwarePaneTab).toHaveBeenCalledWith('upload')
    expect(useUploadStore.getState().openConsole).not.toHaveBeenCalled()
    setHardwarePaneTab.mockRestore()
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
    fireEvent.click(getByRole('button', { name: /Check failed/ }))

    expect(openConsole).toHaveBeenCalled()
    expect(check).not.toHaveBeenCalled()
    check.mockRestore()
  })

  it('says Fits only for a current measurement, and names every other outcome', () => {
    const measure = (status: 'measured' | 'stale', result: object) => {
      useCapacityStore.getState().setTarget(TARGET)
      useCapacityStore.setState({ status, result: { target: 'esp32:esp32:esp32s3', error: null, ...result } as never })
      const view = render(<HardwareReadiness />)
      const chip = view.getByRole('button', { name: /flash/ })
      const reading = { name: chip.querySelector('em')?.textContent, level: chip.getAttribute('data-level') }
      view.unmount()
      return reading
    }
    const figures = { flash: { usedBytes: 1, limitBytes: 10, percent: 40 }, ram: { usedBytes: 1, limitBytes: 10, percent: 20 } }

    expect(measure('measured', { ok: true, overflow: false, ...figures })).toEqual({ name: 'Fits', level: 'ok' })
    expect(measure('stale', { ok: true, overflow: false, ...figures })).toEqual({ name: 'Last check', level: 'pending' })
    expect(measure('measured', {
      ok: true, overflow: false, ...figures, flash: { usedBytes: 9, limitBytes: 10, percent: 95 },
    })).toEqual({ name: 'Tight', level: 'warn' })
  })

  it('names an overflow as too big, not as a failed check', () => {
    useCapacityStore.getState().setTarget(TARGET)
    useCapacityStore.setState({
      status: 'measured',
      result: {
        ok: false, overflow: true, target: 'esp32:esp32:esp32s3',
        flash: { usedBytes: 12, limitBytes: 10, percent: 122 }, ram: null, error: 'Design is too large for this board',
      },
    })
    const { getByRole } = render(<HardwareReadiness />)
    expect(getByRole('button', { name: /Too big.*flash 122%/ }).getAttribute('data-level')).toBe('bad')
  })

  it('keeps an unmeasured reading visibly neutral', () => {
    useCapacityStore.getState().setTarget({ ...TARGET, toolchainReady: false })
    useCapacityStore.setState({ status: 'toolchain-missing' })
    const { getByTitle, queryByText } = render(<HardwareReadiness />)
    const chip = getByTitle(/install toolchain to check/)
    expect(chip.getAttribute('data-level')).toBe('pending')
    expect(chip.querySelector('em')?.textContent).toBe('Capacity')
    expect(queryByText(/^Fits$/)).toBeNull()
  })
})
