import { useEffect } from 'react'
import { rootGraphNodes, useGraphStore, useNodeProperties } from '../../../state/graphStore'
import { useDmxStore } from '../../../state/peripherals/dmxStore'
import { useNetworkCredentialsStore, EMPTY_CREDENTIALS } from '../../../state/peripherals/networkCredentials'
import { wiredNetworkIn, wiredNetworkPhrase } from '../../../state/peripherals/ethernetModule'
import { clampDmxUniverse } from '../../../state/peripherals/dmx'
import { dmxListenPort, dmxNetworkProtocol } from '../../../state/peripherals/dmxTransceiver'
import styles from './DmxInputBody.module.css'
import WifiPasswordInput from '../WifiPasswordInput'

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
  const credentials = useNetworkCredentialsStore((s) => s.byNodeId[nodeId] ?? EMPTY_CREDENTIALS)
  const setCredentials = useNetworkCredentialsStore((s) => s.setCredentials)
  // A cable carries the network instead of Wi-Fi: the board's own Ethernet
  // port, or an Ethernet module on the bench.
  const wired = useGraphStore((s) => {
    const network = wiredNetworkIn(rootGraphNodes(s))
    return network ? wiredNetworkPhrase(network) : null
  })

  const universe = clampDmxUniverse(props.universe ?? 0)
  // Art-Net or sACN; null is the wired DMX512 receiver, which the preview
  // cannot hear. The helper parses both protocols on whichever port it binds,
  // so the protocol decides the default port and the sACN multicast join.
  const protocol = dmxNetworkProtocol(props)
  const listenPort = dmxListenPort(props)
  const network = protocol !== null

  // Opening the listener is a real network side effect performed by the local
  // helper — it binds a UDP socket on every interface, on a port this node's
  // own `previewPort` property chooses. That property travels inside a shared
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
          This listener came with a project made on another computer, so it stays closed until you trust it. Choose <strong>Trust it</strong> in the banner to start receiving {protocol}.
        </div>
      )}
      {!network && (
        <div className={styles.note}>Preview listens for Art-Net or sACN only; firmware uses the selected DMX512 pins.</div>
      )}
      {network && wired && (
        <div className={styles.note}>Firmware reaches the network through {wired}, so no Wi-Fi credentials are needed.</div>
      )}
      {network && !wired && (
        <>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`${nodeId}-dmx-ssid`}>Wi-Fi SSID</label>
            <input
              id={`${nodeId}-dmx-ssid`}
              className={`nodrag ${styles.fieldInput}`}
              type="text"
              autoComplete="off"
              value={credentials.ssid}
              onChange={(e) => setCredentials(nodeId, { ssid: e.target.value })}
              placeholder="network name"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`${nodeId}-dmx-password`}>Wi-Fi password</label>
            <WifiPasswordInput
              id={`${nodeId}-dmx-password`}
              className={`nodrag ${styles.fieldInput}`}
              value={credentials.password}
              onChange={(password) => setCredentials(nodeId, { password })}
            />
          </div>
          <div className={styles.note}>Stored in this browser only — never saved in the project file or share links.</div>
        </>
      )}
    </div>
  )
}
