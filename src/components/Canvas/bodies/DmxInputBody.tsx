import { useEffect } from 'react'
import { useGraphStore, useNodeProperties } from '../../../state/graphStore'
import { useDmxStore } from '../../../state/peripherals/dmxStore'
import { dmxListenPort, dmxListenUniverse, dmxNetworkProtocol } from '../../../state/peripherals/dmxTransceiver'
import styles from './DmxInputBody.module.css'
import BoardNetworkNote from './BoardNetworkNote'
import BenchPartAction from './BenchPartAction'

function statusLabel(helperOnline: boolean, listening: boolean, live: boolean, error: string, protocol: string): string {
  if (!helperOnline) return 'HELPER OFFLINE'
  if (error) return 'LISTENER ERROR'
  if (!listening) return 'NOT LISTENING'
  return live ? `${protocol.toUpperCase()} LIVE` : 'LISTENING'
}

export default function DmxInputBody({ nodeId }: { nodeId: string }) {
  const props = useNodeProperties(nodeId)
  const helperOnline = useDmxStore((s) => s.helperOnline)
  const listening = useDmxStore((s) => s.listening)
  const live = useDmxStore((s) => s.live)
  const packetRate = useDmxStore((s) => s.packetRate)
  const error = useDmxStore((s) => s.error)
  const snapshot = useDmxStore((s) => s.snapshot)
  const configure = useDmxStore((s) => s.configure)
  const stop = useDmxStore((s) => s.stop)
  const trusted = useGraphStore((s) => s.trusted)

  const universe = dmxListenUniverse(props)
  // Art-Net or sACN; null is the wired DMX512 receiver, which the preview
  // cannot hear. The helper parses both protocols on whichever port it binds,
  // so the protocol decides the default port and the sACN multicast join.
  const protocol = dmxNetworkProtocol(props)
  const listenPort = dmxListenPort(props)
  const network = protocol !== null

  // Opening the listener is a real network side effect performed by the local
  // helper — it binds a UDP socket on every interface, on a port this node's
  // own `udpPort` property chooses. That property travels inside a shared
  // graph, so merely opening someone else's project used to expose a
  // LAN-reachable socket on a port they picked, before the user had decided
  // anything. Hold it until the workspace is trusted, the same gate the
  // formula/Code nodes use (fixed 2026-08-14).
  useEffect(() => {
    if (protocol === null) return
    if (!trusted) return
    void configure({ listenPort, universe, protocol })
    return () => {
      void stop()
    }
  }, [configure, listenPort, protocol, stop, trusted, universe])

  const label = !trusted ? 'LISTENER HELD — UNTRUSTED' : statusLabel(helperOnline, listening, live, error, protocol ?? 'Art-Net')
  const liveValues = snapshot.channels.slice(0, 4)

  return (
    <div className={styles.body}>
      <div className={styles.status} data-active={live}>
        <span />
        {network ? label : 'DMX512 FIRMWARE MODE'}
      </div>
      <div className={styles.readout}>
        <span>universe {universe} · udp {listenPort}</span>
        <span>{packetRate > 0 ? `${packetRate.toFixed(1)} fps` : 'idle'}</span>
      </div>
      <div className={styles.readout}>
        <span>ch 1-4</span>
        <span>{liveValues.map((value) => String(value).padStart(3, ' ')).join(' ')}</span>
      </div>
      {error && <div className={styles.note}>{error}</div>}
      {network && !trusted && (
        <div className={styles.note}>
          This listener came with a project made on another computer, so it stays closed until you say so. Choose <strong>Run it</strong> in the bar above the canvas to start receiving {protocol}.
        </div>
      )}
      {!network && (
        <div className={styles.note}>Preview listens for Art-Net or sACN only; firmware reads the DMX transceiver on the bench, on a UART Studio allocates.</div>
      )}
      {!network && <BenchPartAction nodeId={nodeId} nodeType="DmxTransceiver" />}
      {network && <BoardNetworkNote nodeId={nodeId} />}
    </div>
  )
}
