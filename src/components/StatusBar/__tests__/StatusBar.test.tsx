import { describe, expect, it, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import StatusBar from '../StatusBar'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/uploadStore'
import { useAudioStore } from '../../../state/audioStore'
import { useCapacityStore } from '../../../state/capacityStore'

describe('StatusBar accessibility', () => {
  beforeEach(() => {
    useUiStore.setState({
      statusText: 'Ready',
      statusLevel: 'idle',
      fps: 0,
      performanceMode: false,
      stageMode: false,
    })
    useGraphStore.setState({
      nodes: [],
      edges: [],
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
    useUploadStore.setState({ selectedFqbn: '', selectedPort: '', ports: [] })
    useCapacityStore.getState().clear()
  })

  it('counts one module and one patch in the singular', () => {
    useGraphStore.setState({
      nodes: [{ id: 'a', type: 'studioNode', position: { x: 0, y: 0 }, data: { label: 'A', nodeType: 'SolidColor', category: 'pattern', properties: {}, inputs: [], outputs: [] } }] as never[],
      edges: [{ id: 'e', source: 'a', target: 'a' }] as never[],
    })
    const { getByText, rerender } = render(<StatusBar />)
    expect(getByText('1 module')).toBeTruthy()
    expect(getByText('1 patch')).toBeTruthy()

    useGraphStore.setState({ nodes: [], edges: [] })
    rerender(<StatusBar />)
    expect(getByText('0 modules')).toBeTruthy()
    expect(getByText('0 patches')).toBeTruthy()
  })

  it('announces normal status updates politely', () => {
    useUiStore.setState({ statusText: 'Graph JSON exported', statusLevel: 'success' })

    const { getByRole } = render(<StatusBar />)
    const status = getByRole('status')

    expect(status.textContent).toBe('Graph JSON exported')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.getAttribute('aria-atomic')).toBe('true')
  })

  it('announces error status updates assertively', () => {
    useUiStore.setState({ statusText: 'Upload helper offline', statusLevel: 'error' })

    const { getByRole } = render(<StatusBar />)
    const alert = getByRole('alert')

    expect(alert.textContent).toBe('Upload helper offline')
    expect(alert.getAttribute('aria-live')).toBe('assertive')
    expect(alert.getAttribute('aria-atomic')).toBe('true')
  })
})

describe('StatusBar hardware readiness', () => {
  beforeEach(() => {
    useUiStore.setState({ statusText: 'Ready', statusLevel: 'idle', fps: 0, performanceMode: false, stageMode: false })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3', selectedPort: '', ports: [] })
    useCapacityStore.getState().clear()
    useGraphStore.setState({
      nodes: [{
        id: 'matrix',
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'LED Matrix', nodeType: 'MatrixOutput', category: 'output',
          properties: { form: 'matrix', width: 16, height: 16, chipset: 'WS2812B', dataPin: 5 },
          inputs: [], outputs: [],
        },
      }] as never[],
      edges: [] as never[],
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
  })

  it('places hardware diagnostics in the persistent status rail', () => {
    const { getByLabelText, getByText } = render(<StatusBar />)

    expect(getByLabelText('Hardware readiness')).toBeTruthy()
    expect(getByText('Power')).toBeTruthy()
    expect(getByText('Pins')).toBeTruthy()
  })
})

describe('StatusBar port chip', () => {
  beforeEach(() => {
    useUiStore.setState({ statusText: 'Ready', statusLevel: 'idle', fps: 0, performanceMode: false, stageMode: false })
    useGraphStore.setState({ nodes: [], edges: [], graphData: {}, graphs: { root: { id: 'root', name: 'Main' } }, activeGraphId: 'root' })
  })

  it('keeps a remembered port and says it is disconnected rather than "Not detected"', () => {
    useUploadStore.setState({ helper: { ok: true } as never, selectedPort: 'COM6', ports: [], portsScanned: true })
    const { getByText } = render(<StatusBar />)
    expect(getByText('Port: COM6 selected · disconnected')).toBeTruthy()
  })

  it('reads connected once the port is present', () => {
    useUploadStore.setState({
      helper: { ok: true } as never,
      selectedPort: 'COM6',
      ports: [{ address: 'COM6', label: 'COM6', protocol: 'serial', boards: [] }],
      portsScanned: true,
    })
    const { getByText } = render(<StatusBar />)
    expect(getByText('Port: COM6 · connected')).toBeTruthy()
  })
})

describe('StatusBar audio chip', () => {
  beforeEach(() => {
    useUiStore.setState({ statusText: 'Ready', statusLevel: 'idle', fps: 0, performanceMode: false, stageMode: false })
    useUploadStore.setState({ selectedFqbn: '', selectedPort: '', ports: [] })
    useGraphStore.setState({
      nodes: [{
        id: 'fft',
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: { label: 'FFT', nodeType: 'FFTAnalyzer', category: 'audio', properties: {}, inputs: [], outputs: [] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any],
      edges: [],
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
  })

  it('reads idle while audio nodes exist but the microphone is not running', () => {
    useAudioStore.setState({ micActive: false })
    const { getByText } = render(<StatusBar />)
    expect(getByText('Audio idle')).toBeTruthy()
  })

  it('reads live only once the microphone is actually running', () => {
    useAudioStore.setState({ micActive: true })
    const { getByText } = render(<StatusBar />)
    expect(getByText('Audio live')).toBeTruthy()
  })
})
