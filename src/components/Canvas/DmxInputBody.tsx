import { useEffect } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { useDmxStore } from '../../state/dmxStore'
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
    </div>
  )
}
