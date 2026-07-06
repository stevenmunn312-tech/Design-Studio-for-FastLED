import { useEffect } from 'react'
import {
  ensurePerfObserver,
  FRAME_BUDGET_MS,
  resetPerfMonitor,
  togglePerfHud,
  usePerfSnapshot,
  type PerfSnapshot,
} from '../../dev/perfMonitor'
import styles from './DevPerformanceHud.module.css'

function percent(part: number, total: number): string {
  if (total <= 0) return '0%'
  return `${Math.round((part / total) * 100)}%`
}

function fmtMs(value: number): string {
  return `${value.toFixed(1)} ms`
}

function diagnosis(snapshot: PerfSnapshot): string {
  const { bottleneck, metrics } = snapshot
  const outsideGap = metrics.gap.avg - metrics.frame.avg
  if (snapshot.musicAnalysis.fallbackRuns > 0) {
    return 'Music analysis has fallen back to the main thread, which is a likely source of the stalls.'
  }
  if (snapshot.tasks.musicDecode.max > 24) return 'Audio decoding on the main thread is taking noticeable time during analysis.'
  if (snapshot.tasks.musicAnalyze.max > 24) return 'Music analysis work is expensive right now; the new task timings should help confirm whether the worker is insulating the UI.'
  if (snapshot.tasks.musicShow.max > 12) return 'Show generation is taking noticeable time after each song analysis.'
  if (outsideGap > 6) return 'Frame gaps are larger than preview work, so another main-thread task is likely blocking the app.'
  if (bottleneck === 'eval') return 'Graph evaluation is the biggest cost right now.'
  if (bottleneck === 'draw') return 'Preview drawing is the biggest cost right now.'
  if (bottleneck === 'show') return 'Show playback compositing is the biggest cost right now.'
  if (bottleneck === 'publish') return 'React/store publish work is spiking right now.'
  return 'No single phase dominates yet. Watch for spikes while reproducing the lag.'
}

function PhaseRow({ label, latest, avg, p95, max }: { label: string; latest: number; avg: number; p95: number; max: number }) {
  return (
    <div className={styles.phaseRow}>
      <span className={styles.phaseLabel}>{label}</span>
      <span>{fmtMs(latest)}</span>
      <span>{fmtMs(avg)}</span>
      <span>{fmtMs(p95)}</span>
      <span>{fmtMs(max)}</span>
    </div>
  )
}

function TaskRow({ label, latest, avg, p95, max, count }: { label: string; latest: number; avg: number; p95: number; max: number; count: number }) {
  return (
    <div className={styles.phaseRow}>
      <span className={styles.phaseLabel}>{label}</span>
      <span>{count ? fmtMs(latest) : '—'}</span>
      <span>{count ? fmtMs(avg) : '—'}</span>
      <span>{count ? fmtMs(p95) : '—'}</span>
      <span>{count ? fmtMs(max) : '—'}</span>
    </div>
  )
}

export function DevPerformanceHudToggle() {
  const { visible } = usePerfSnapshot()
  if (!import.meta.env.DEV) return null
  return (
    <button
      type="button"
      className={`${styles.toggleBtn} ${visible ? styles.toggleActive : ''}`}
      onClick={togglePerfHud}
      title={visible ? 'Hide performance monitor' : 'Show performance monitor'}
      aria-pressed={visible}
    >
      Perf
    </button>
  )
}

export default function DevPerformanceHud() {
  const snapshot = usePerfSnapshot()

  useEffect(() => {
    ensurePerfObserver()
  }, [])

  if (!import.meta.env.DEV || !snapshot.visible) return null

  return (
    <aside className={styles.hud}>
      <div className={styles.topRow}>
        <strong className={styles.title}>Dev Performance</strong>
        <div className={styles.actions}>
          <button type="button" className={styles.actionBtn} onClick={resetPerfMonitor}>Reset</button>
          <button type="button" className={styles.actionBtn} onClick={togglePerfHud}>Hide</button>
        </div>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Frames over budget</span>
          <strong>{snapshot.overBudgetFrames} / {snapshot.sampleCount || 0}</strong>
          <small>{percent(snapshot.overBudgetFrames, Math.max(1, snapshot.sampleCount))} above {FRAME_BUDGET_MS.toFixed(1)} ms</small>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Stall frames</span>
          <strong>{snapshot.stallFrames}</strong>
          <small>{fmtMs(snapshot.metrics.gap.p95)} p95 frame gap</small>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Long tasks</span>
          <strong>{snapshot.longTasks.count}</strong>
          <small>
            {snapshot.longTasks.supported
              ? `latest ${fmtMs(snapshot.longTasks.latestMs)} · worst ${fmtMs(snapshot.longTasks.worstMs)}`
              : 'browser does not expose long tasks'}
          </small>
        </div>
      </div>

      <div className={styles.table}>
        <div className={styles.phaseHeader}>
          <span>Phase</span>
          <span>Latest</span>
          <span>Avg</span>
          <span>P95</span>
          <span>Max</span>
        </div>
        <PhaseRow label="Frame gap" {...snapshot.metrics.gap} />
        <PhaseRow label="Total frame" {...snapshot.metrics.frame} />
        <PhaseRow label="Evaluate" {...snapshot.metrics.eval} />
        <PhaseRow label="Show mix" {...snapshot.metrics.show} />
        <PhaseRow label="Draw" {...snapshot.metrics.draw} />
        <PhaseRow label="Publish" {...snapshot.metrics.publish} />
      </div>

      <div className={styles.table}>
        <div className={styles.phaseHeader}>
          <span>Music Task</span>
          <span>Latest</span>
          <span>Avg</span>
          <span>P95</span>
          <span>Max</span>
        </div>
        <TaskRow label="Decode" {...snapshot.tasks.musicDecode} />
        <TaskRow label="Analyze" {...snapshot.tasks.musicAnalyze} />
        <TaskRow label="Show gen" {...snapshot.tasks.musicShow} />
      </div>

      <div className={styles.contextGrid}>
        <span>Graph {snapshot.context.nodes}n / {snapshot.context.edges}e / {snapshot.context.groups} groups</span>
        <span>Matrix {snapshot.context.gridW}×{snapshot.context.gridH} ({snapshot.context.canvasW}×{snapshot.context.canvasH})</span>
        <span>Renderer {snapshot.context.renderer} · {snapshot.context.previewStyle}</span>
        <span>Outputs {snapshot.context.outputs} · signal {snapshot.context.hasSignal ? 'live' : 'idle'}</span>
        <span>Audio {snapshot.context.micActive ? 'mic on' : 'mic off'} · {snapshot.context.audioReactive ? 'reactive' : 'static'}</span>
        <span>View {snapshot.context.stageMode ? 'stage' : 'studio'} · {snapshot.context.preview3d ? '3D' : '2D'} · {snapshot.context.hidden ? 'hidden tab' : 'visible tab'}</span>
        <span>Music worker {snapshot.musicAnalysis.workerRuns} · fallback {snapshot.musicAnalysis.fallbackRuns} · last {snapshot.musicAnalysis.lastMode}</span>
      </div>

      <p className={styles.note}>{diagnosis(snapshot)}</p>
    </aside>
  )
}
