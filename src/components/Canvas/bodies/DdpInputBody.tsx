import { useEffect } from 'react'
import { rootGraphNodes, useGraphStore, useNodeProperties } from '../../../state/graphStore'
import { useDdpStore, DDP_DEFAULT_PORT } from '../../../state/peripherals/ddpStore'
import { useNetworkCredentialsStore, EMPTY_CREDENTIALS } from '../../../state/peripherals/networkCredentials'
import { wiredNetworkIn, wiredNetworkPhrase } from '../../../state/peripherals/ethernetModule'
import { compositionDims } from '../../../state/output/outputRouting'
import styles from './DmxInputBody.module.css'
import WifiPasswordInput from '../WifiPasswordInput'

function statusLabel(helperOnline: boolean, listening: boolean, live: boolean, error: string): string {
  if (!helperOnline) return 'HELPER OFFLINE'
  if (error) return 'LISTENER ERROR'
  if (!listening) return 'NOT LISTENING'
  return live ? 'DDP LIVE' : 'LISTENING'
}

/**
 * Live status for the DDP Input node, on the DMX body's styles: the same
 * trust-held UDP listener, opened through the local helper only once the
 * workspace is trusted, with the matrix size it asks the helper for.
 */
export default function DdpInputBody({ nodeId }: { nodeId: string }) {
  const props = useNodeProperties(nodeId)
  const helperOnline = useDdpStore((s) => s.helperOnline)
  const listening = useDdpStore((s) => s.listening)
  const live = useDdpStore((s) => s.live)
  const packetRate = useDdpStore((s) => s.packetRate)
  const error = useDdpStore((s) => s.error)
  const configure = useDdpStore((s) => s.configure)
  const stop = useDdpStore((s) => s.stop)
  const trusted = useGraphStore((s) => s.trusted)
  const credentials = useNetworkCredentialsStore((s) => s.byNodeId[nodeId] ?? EMPTY_CREDENTIALS)
  const setCredentials = useNetworkCredentialsStore((s) => s.setCredentials)
  const wired = useGraphStore((s) => {
    const network = wiredNetworkIn(rootGraphNodes(s))
    return network ? wiredNetworkPhrase(network) : null
  })
  // The root composition's size: the pixel count the helper is asked for.
  const width = useGraphStore((s) => compositionDims(rootGraphNodes(s)).w)
  const height = useGraphStore((s) => compositionDims(rootGraphNodes(s)).h)
  const listenPort = Math.max(1, Math.min(65535, Math.round(Number(props.previewPort ?? DDP_DEFAULT_PORT) || DDP_DEFAULT_PORT)))

  useEffect(() => {
    if (!trusted) return
    void configure({ listenPort, pixelCount: width * height })
    return () => {
      void stop()
    }
  }, [configure, height, listenPort, stop, trusted, width])

  const label = !trusted ? 'LISTENER HELD — UNTRUSTED' : statusLabel(helperOnline, listening, live, error)

  return (
    <div className={styles.body}>
      <div className={styles.status} data-active={live}>
        <span />
        {label}
      </div>
      <div className={styles.readout}>
        <span>{width}×{height} px · udp {listenPort}</span>
        <span>{packetRate > 0 ? `${packetRate.toFixed(1)} pkt/s` : 'idle'}</span>
      </div>
      {error && <div className={styles.note}>{error}</div>}
      {!trusted && (
        <div className={styles.note}>
          This listener came with a project made on another computer, so it stays closed until you trust it. Choose <strong>Trust it</strong> in the banner to start receiving DDP.
        </div>
      )}
      {wired && (
        <div className={styles.note}>Firmware reaches the network through {wired}, so no Wi-Fi credentials are needed.</div>
      )}
      {!wired && (
        <>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`${nodeId}-ddp-ssid`}>Wi-Fi SSID</label>
            <input
              id={`${nodeId}-ddp-ssid`}
              className={`nodrag ${styles.fieldInput}`}
              type="text"
              autoComplete="off"
              value={credentials.ssid}
              onChange={(e) => setCredentials(nodeId, { ssid: e.target.value })}
              placeholder="network name"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`${nodeId}-ddp-password`}>Wi-Fi password</label>
            <WifiPasswordInput
              id={`${nodeId}-ddp-password`}
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
