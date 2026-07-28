import { useEffect } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { useDmxStore } from '../../state/dmxStore'
import { useNetworkCredentialsStore, EMPTY_CREDENTIALS } from '../../state/networkCredentials'
import { clampDmxUniverse } from '../../state/dmx'
import styles from './DmxInputBody.module.css'

function statusLabel(helperOnline: boolean, listening: boolean, live: boolean, error: string): string {
  if (!helperOnline) return 'HELPER OFFLINE'
  if (error) return 'LISTENER ERROR'
  if (!listening) return 'NOT LISTENING'
  return live ? 'ART-NET LIVE' : 'LISTENING'
}

export default function DmxInputBody({ nodeId }: { nodeId: string }) {
  const props = useGraphStore((s) =>
    s.nodes.find((node) => node.id === nodeId)?.data.properties ?? {}
  )
  const helperOnline = useDmxStore((s) => s.helperOnline)
  const listening = useDmxStore((s) => s.listening)
  const live = useDmxStore((s) => s.live)
  const packetRate = useDmxStore((s) => s.packetRate)
  const error = useDmxStore((s) => s.error)
  const snapshot = useDmxStore((s) => s.snapshot)
  const configure = useDmxStore((s) => s.configure)
  const stop = useDmxStore((s) => s.stop)
  const credentials = useNetworkCredentialsStore((s) => s.byNodeId[nodeId] ?? EMPTY_CREDENTIALS)
  const setCredentials = useNetworkCredentialsStore((s) => s.setCredentials)

  const universe = clampDmxUniverse(props.universe ?? 0)
  const listenPort = Math.max(1, Math.min(65535, Math.round(Number(props.previewPort ?? 6454) || 6454)))
  const mode = String(props.inputMode ?? 'Art-Net')

  useEffect(() => {
    if (mode !== 'Art-Net') return
    void configure({ listenPort, universe })
    return () => {
      void stop()
    }
  }, [configure, listenPort, mode, stop, universe])

  const label = statusLabel(helperOnline, listening, live, error)
  const liveValues = snapshot.channels.slice(0, 4)

  return (
    <div className={styles.body}>
      <div className={styles.status} data-active={live}>
        <span />
        {mode === 'Art-Net' ? label : 'DMX512 FIRMWARE MODE'}
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
      {mode !== 'Art-Net' && (
        <div className={styles.note}>Preview listens for Art-Net only; firmware uses the selected DMX512 pins.</div>
      )}
      {mode === 'Art-Net' && (
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
            <input
              id={`${nodeId}-dmx-password`}
              className={`nodrag ${styles.fieldInput}`}
              type="password"
              autoComplete="off"
              value={credentials.password}
              onChange={(e) => setCredentials(nodeId, { password: e.target.value })}
              placeholder="password"
            />
          </div>
          <div className={styles.note}>Stored in this browser only — never saved in the project file or share links.</div>
        </>
      )}
    </div>
  )
}
