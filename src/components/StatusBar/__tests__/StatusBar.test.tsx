import { describe, expect, it, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import StatusBar from '../StatusBar'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/uploadStore'
import { useAudioStore } from '../../../state/audioStore'

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
