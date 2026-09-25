import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPatternContentTrustForTests } from '../patternTrust'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'
import { useDeviceTelemetryStore } from '../deviceTelemetryStore'
import { useIrLearnStore } from '../irLearnStore'
import { useUploadStore } from '../uploadStore'
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
      serialConnected: false,
      runUpload, startSerial, stopSerial,
    } as never)
  })
  afterEach(() => vi.useRealTimers())

  it('uploads an uncached sketch, keeps the first real frame, and saves it in one undo step', async () => {
    useIrLearnStore.getState().start('ir', 'Power')
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

    useIrLearnStore.getState().confirm()
    vi.advanceTimersByTime(400)
    const buttons = useGraphStore.getState().nodes[0].data.properties.buttons as Array<{ id: string; label: string; command: number }>
    expect(buttons).toMatchObject([{ label: 'Power', protocol: 'NEC', address: 0, command: 0x45, repeat: 'once' }])
    expect(useGraphStore.getState().nodes[0].data.outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: irRemoteButtonHandle(buttons[0].id), label: 'Power' }),
    ]))
    expect(stopSerial).toHaveBeenCalled()
    expect(useGraphStore.temporal.getState().pastStates).toHaveLength(1)
    useGraphStore.temporal.getState().undo()
    expect(useGraphStore.getState().nodes[0].data.properties.buttons).toEqual([])
  })

  it('does not flash or open the port when the workspace is untrusted', async () => {
    // Untrusted means it holds code this machine has not seen.
    clearPatternContentTrustForTests()
    useGraphStore.setState({ trusted: false, nodes: [...useGraphStore.getState().nodes, { id: 'untrusted-code', type: 'studioNode', position: { x: 0, y: 0 }, data: { label: 'Code', nodeType: 'Code', category: 'logic', properties: { code: 'from elsewhere' }, inputs: [], outputs: [] } }] } as never)
    useIrLearnStore.getState().start('ir', 'Power')
    await useIrLearnStore.getState().prepare()
    expect(runUpload).not.toHaveBeenCalled()
    expect(startSerial).not.toHaveBeenCalled()
    expect(useIrLearnStore.getState().session?.error).toMatch(/Trust/)
  })

  it('gives the serial port back on cancel and does not keep a key', async () => {
    useIrLearnStore.getState().start('ir', 'Power')
    await useIrLearnStore.getState().prepare()
    useIrLearnStore.getState().cancel()
    expect(stopSerial).toHaveBeenCalled()
    expect(useIrLearnStore.getState().session).toBeNull()
    expect(useGraphStore.getState().nodes[0].data.properties.buttons).toEqual([])
  })
})
