import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPatternContentTrustForTests } from '../../patterns/patternTrust'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../nodeLibrary'
import { useDeviceTelemetryStore } from '../../upload/deviceTelemetryStore'
import { useIrLearnStore } from '../irLearnStore'
import { useUploadStore } from '../../upload/uploadStore'
import { irRemoteButtonHandle } from '../irRemote'

function receiver(): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === 'IRRemoteInput')!
  return {
    id: 'ir', type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def.label, nodeType: def.type, category: def.category,
      properties: { ...libraryDefaults('IRRemoteInput'), pin: 13, buttons: [] },
      inputs: def.inputs, outputs: def.outputs,
    },
  } as unknown as StudioNode
}

describe('IR learn run', () => {
  let runUpload: ReturnType<typeof vi.fn>
  let startSerial: ReturnType<typeof vi.fn>
  let stopSerial: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    useGraphStore.setState({
      nodes: [receiver()], edges: [], activeGraphId: ROOT_GRAPH_ID, trusted: true,
      graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } }, graphData: {},
    } as never)
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().clear()
    useDeviceTelemetryStore.getState().reset()
    useIrLearnStore.getState().cancel()
    runUpload = vi.fn(async () => {})
    startSerial = vi.fn(() => {
      useUploadStore.setState({ serialConnected: true } as never)
      return new Promise(() => {})
    })
    stopSerial = vi.fn(() => { useUploadStore.setState({ serialConnected: false } as never) })
    useUploadStore.setState({
      status: { phase: 'idle', message: '' },
      log: '',
      serialConnected: false,
      runUpload, startSerial, stopSerial,
    } as never)
  })
  afterEach(() => vi.useRealTimers())

  it('uploads an uncached sketch, keeps the first real frame, and saves it in one undo step', async () => {
    useIrLearnStore.getState().start('ir')
    await useIrLearnStore.getState().prepare()
    expect(runUpload).toHaveBeenCalledTimes(1)
    expect(runUpload.mock.calls[0][2]).toMatchObject({ cache: false })
    expect(String(runUpload.mock.calls[0][0])).toContain('IR_LEARN_PIN = 13')
    expect(startSerial).toHaveBeenCalledTimes(1)

    useDeviceTelemetryStore.getState().ingest('FLS_IR v=1 protocol=NEC address=0x00 command=0x45 repeat=1\n')
    expect(useIrLearnStore.getState().session?.captured).toBeNull()
    useDeviceTelemetryStore.getState().ingest('FLS_IR v=1 protocol=NEC address=0x00 command=0x45 repeat=0\n')
    useDeviceTelemetryStore.getState().ingest('FLS_IR v=1 protocol=NEC address=0x1 command=0x2 repeat=0\n')
    expect(useIrLearnStore.getState().session?.captured).toEqual({ protocol: 'NEC', address: 0, command: 0x45 })

    useIrLearnStore.getState().confirm('Power')
    vi.advanceTimersByTime(400)
    const buttons = useGraphStore.getState().nodes[0].data.properties.buttons as Array<{ id: string; label: string; command: number }>
    expect(buttons).toMatchObject([{ label: 'Power', protocol: 'NEC', address: 0, command: 0x45, repeat: 'once' }])
    expect(useGraphStore.getState().nodes[0].data.outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: irRemoteButtonHandle(buttons[0].id), label: 'Power' }),
    ]))
    expect(stopSerial).not.toHaveBeenCalled()
    expect(useIrLearnStore.getState().session?.phase).toBe('listening')
    expect(useGraphStore.temporal.getState().pastStates).toHaveLength(1)
    useGraphStore.temporal.getState().undo()
    expect(useGraphStore.getState().nodes[0].data.properties.buttons).toEqual([])
  })

  it('maps several buttons with one upload and keeps saved keys when finished', async () => {
    useIrLearnStore.getState().start('ir')
    await useIrLearnStore.getState().prepare()
    useIrLearnStore.getState().ingestLine('FLS_IR v=1 protocol=NEC address=0 command=69 repeat=0')
    useIrLearnStore.getState().confirm('Power')
    useIrLearnStore.getState().ingestLine('FLS_IR v=1 protocol=NEC address=0 command=70 repeat=0')
    useIrLearnStore.getState().confirm('Brightness up')
    expect(runUpload).toHaveBeenCalledOnce()
    expect(startSerial).toHaveBeenCalledOnce()
    expect(stopSerial).not.toHaveBeenCalled()
    useIrLearnStore.getState().cancel()
    expect(stopSerial).toHaveBeenCalledOnce()
    expect(useIrLearnStore.getState().session).toBeNull()
    expect(useGraphStore.getState().nodes[0].data.properties.buttons).toMatchObject([
      { label: 'Power', command: 69 }, { label: 'Brightness up', command: 70 },
    ])
  })

  it('keeps a rejected capture for correction and can skip duplicate codes', async () => {
    useIrLearnStore.getState().start('ir')
    await useIrLearnStore.getState().prepare()
    const frame = 'FLS_IR v=1 protocol=NEC address=0 command=69 repeat=0'
    useIrLearnStore.getState().ingestLine(frame)
    useIrLearnStore.getState().confirm('')
    expect(useIrLearnStore.getState().session?.error).toMatch(/Name/)
    useIrLearnStore.getState().confirm('Power')
    useIrLearnStore.getState().ingestLine(frame)
    useIrLearnStore.getState().confirm('Duplicate')
    expect(useIrLearnStore.getState().session?.error).toMatch(/already uses/)
    useIrLearnStore.getState().listenAgain()
    expect(useIrLearnStore.getState().session).toMatchObject({ phase: 'listening', captured: null, error: null })
    expect(runUpload).toHaveBeenCalledOnce()
  })

  it('does not listen after a failed or cancelled upload', async () => {
    runUpload.mockImplementation(async () => {
      useUploadStore.setState({ status: { phase: 'cancelled', message: 'Cancelled' } })
    })
    useIrLearnStore.getState().start('ir')
    await useIrLearnStore.getState().prepare()
    expect(startSerial).not.toHaveBeenCalled()
    expect(useIrLearnStore.getState().session).toMatchObject({ phase: 'prepare', preparing: false, sketchUploaded: false })
  })

  it('retries a failed flash using the existing compiled firmware', async () => {
    runUpload.mockImplementationOnce(async () => {
      useUploadStore.setState({
        log: '[compiled] firmware ready for upload\n*** FAILED ***\n',
        status: { phase: 'error', message: 'Upload failed' },
      })
    })
    useIrLearnStore.getState().start('ir')
    await useIrLearnStore.getState().prepare()
    expect(useIrLearnStore.getState().session?.compiled).toBe(true)
    runUpload.mockImplementationOnce(async () => {
      useUploadStore.setState({ status: { phase: 'done', message: 'Done' } })
    })
    await useIrLearnStore.getState().prepare()
    expect(runUpload.mock.calls[0][2]).toEqual({ cache: false, reuseCompiled: false })
    expect(runUpload.mock.calls[1][2]).toEqual({ cache: false, reuseCompiled: true })
    expect(runUpload.mock.calls[1][0]).toBe(runUpload.mock.calls[0][0])
    expect(useIrLearnStore.getState().session?.phase).toBe('listening')
  })

  it('retries compilation when no firmware was successfully built', async () => {
    runUpload.mockImplementationOnce(async () => {
      useUploadStore.setState({ log: '*** FAILED ***\n', status: { phase: 'error', message: 'Compile failed' } })
    })
    useIrLearnStore.getState().start('ir')
    await useIrLearnStore.getState().prepare()
    await useIrLearnStore.getState().prepare()
    expect(runUpload.mock.calls[1][2]).toEqual({ cache: false, reuseCompiled: false })
  })

  it('stops accepting captures at the 32-button limit', async () => {
    useIrLearnStore.getState().start('ir')
    await useIrLearnStore.getState().prepare()
    for (let command = 0; command < 32; command++) {
      useIrLearnStore.getState().ingestLine(`FLS_IR v=1 protocol=NEC address=0 command=${command} repeat=0`)
      useIrLearnStore.getState().confirm(`Key ${command}`)
    }
    useIrLearnStore.getState().ingestLine('FLS_IR v=1 protocol=NEC address=0 command=32 repeat=0')
    expect(useIrLearnStore.getState().session?.captured).toBeNull()
    expect(useGraphStore.getState().nodes[0].data.properties.buttons).toHaveLength(32)
    expect(runUpload).toHaveBeenCalledOnce()
  })

  it('does not flash or open the port when the workspace is untrusted', async () => {
    // Untrusted means it holds code this machine has not seen.
    clearPatternContentTrustForTests()
    useGraphStore.setState({ trusted: false, nodes: [...useGraphStore.getState().nodes, { id: 'untrusted-code', type: 'studioNode', position: { x: 0, y: 0 }, data: { label: 'Code', nodeType: 'Code', category: 'logic', properties: { code: 'from elsewhere' }, inputs: [], outputs: [] } }] } as never)
    useIrLearnStore.getState().start('ir')
    await useIrLearnStore.getState().prepare()
    expect(runUpload).not.toHaveBeenCalled()
    expect(startSerial).not.toHaveBeenCalled()
    expect(useIrLearnStore.getState().session?.error).toMatch(/Trust/)
  })

  it('gives the serial port back on cancel and does not keep a key', async () => {
    useIrLearnStore.getState().start('ir')
    await useIrLearnStore.getState().prepare()
    useIrLearnStore.getState().cancel()
    expect(stopSerial).toHaveBeenCalled()
    expect(useIrLearnStore.getState().session).toBeNull()
    expect(useGraphStore.getState().nodes[0].data.properties.buttons).toEqual([])
  })
})
