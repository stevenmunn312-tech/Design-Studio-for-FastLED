import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { outputRoutes } from '../../state/outputRouting'
import { latestStreamFrameCopy } from '../../state/streamStore'
import { GifEncoder } from '../../utils/gifEncoder'
import { captureSequence, drawCapturedFrame, loopBlendFrames, yieldToUi, type RecordStyle } from './recordCapture'
import { graphConsumesAudio } from './previewAudioUsage'
import styles from './RecordPopup.module.css'

// Record & export dialog for the LED preview: PNG snapshot of the live frame,
// or an offline-rendered GIF/WebM clip with duration, FPS, scale, and
// seamless-loop options. Opened from the preview header's Record button.

type RecordFormat = 'png' | 'gif' | 'webm'
type Phase = 'idle' | 'rendering' | 'encoding' | 'recording' | 'done' | 'error'

const FPS_CHOICES = [10, 15, 20, 25, 30, 50]
const MAX_OUTPUT_PX = 2048
const MAX_DURATION_SEC = 30

function pickWebmMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const mime of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return null
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportFilename(ext: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `led-preview-${stamp}.${ext}`
}

export default function RecordPopup({ onClose }: { onClose: () => void }) {
  const previewOutputId = useUiStore((s) => s.previewOutputId)
  const routeKey = useGraphStore((s) => JSON.stringify(outputRoutes(s.nodes).map((route) => ({ id: route.id, width: route.width, height: route.height }))))
  const routes = JSON.parse(routeKey) as Array<{ id: string; width: number; height: number }>
  const route = routes.find((candidate) => candidate.id === previewOutputId) ?? routes[0]
  const gridW = Math.max(2, Math.min(64, route?.width ?? 16))
  const gridH = Math.max(2, Math.min(64, route?.height ?? 16))
  const audioReactive = useGraphStore((s) => graphConsumesAudio(s.nodes, s.edges))

  const [format, setFormat] = useState<RecordFormat>('gif')
  const [style, setStyle] = useState<RecordStyle>('leds')
  const [durationSec, setDurationSec] = useState(6)
  const [fps, setFps] = useState(30)
  const [scale, setScale] = useState(12)
  const [loop, setLoop] = useState(true)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 1 })
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  // Abandon any in-flight capture when the dialog unmounts.
  useEffect(() => () => { cancelRef.current = true }, [])

  const webmMime = pickWebmMime()
  const maxScale = Math.max(2, Math.floor(MAX_OUTPUT_PX / Math.max(gridW, gridH)))
  const effScale = Math.min(scale, maxScale)
  const outW = gridW * effScale
  const outH = gridH * effScale
  const totalFrames = Math.max(1, Math.round(durationSec * fps))
  const animated = format !== 'png'
  const busy = phase === 'rendering' || phase === 'encoding' || phase === 'recording'

  const makeCanvas = (): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create an export canvas')
    return { canvas, ctx }
  }

  const captureFrames = async () => {
    setPhase('rendering')
    const { nodes, edges, trusted } = useGraphStore.getState()
    return captureSequence({
      nodes,
      edges,
      groups: getGroupRegistry(),
      trusted,
      gridW,
      gridH,
      outputId: route?.id,
      fps,
      durationSec,
      seamlessLoop: loop,
      onProgress: (done, total) => setProgress({ done, total }),
      isCancelled: () => cancelRef.current,
    })
  }

  const exportPng = async () => {
    // Snapshot exactly what the preview is showing right now (the render loop
    // publishes every displayed frame, post-brightness and post-show-overlay).
    // If no frame has been published yet — e.g. the tab was hidden since load,
    // suspending the render loop — render one offline instead.
    let live = latestStreamFrameCopy()
    if (!live) {
      const { nodes, edges, trusted } = useGraphStore.getState()
      const frames = await captureSequence({
        nodes, edges, groups: getGroupRegistry(), trusted,
        gridW, gridH, outputId: route?.id, fps: 1, durationSec: 1, seamlessLoop: false,
        isCancelled: () => cancelRef.current,
      })
      if (!frames) return
      live = { bytes: frames[0], width: gridW, height: gridH }
    }
    const scale = Math.min(effScale, Math.max(2, Math.floor(MAX_OUTPUT_PX / Math.max(live.width, live.height))))
    const canvas = document.createElement('canvas')
    canvas.width = live.width * scale
    canvas.height = live.height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create an export canvas')
    drawCapturedFrame(ctx, live.bytes, live.width, live.height, scale, style)
    canvas.toBlob((blob) => {
      if (!blob) { setPhase('error'); setError('PNG encoding failed in this browser.'); return }
      downloadBlob(blob, exportFilename('png'))
      setPhase('done')
    }, 'image/png')
  }

  const exportGif = async () => {
    const frames = await captureFrames()
    if (!frames) return
    setPhase('encoding')
    const { ctx } = makeCanvas()
    const encoder = new GifEncoder(outW, outH, Math.round(100 / fps))
    for (let i = 0; i < frames.length; i++) {
      if (cancelRef.current) return
      drawCapturedFrame(ctx, frames[i], gridW, gridH, effScale, style)
      encoder.addFrame(ctx.getImageData(0, 0, outW, outH).data)
      setProgress({ done: i + 1, total: frames.length })
      if ((i + 1) % 8 === 0) await yieldToUi()
    }
    const gif = encoder.finish()
    downloadBlob(new Blob([gif.buffer as ArrayBuffer], { type: 'image/gif' }), exportFilename('gif'))
    setPhase('done')
  }

  const exportWebm = async () => {
    if (!webmMime) throw new Error('This browser cannot record WebM video (MediaRecorder unavailable).')
    const frames = await captureFrames()
    if (!frames) return
    setPhase('recording')
    const { canvas, ctx } = makeCanvas()
    // MediaRecorder timestamps frames by wall-clock arrival, so play the
    // pre-rendered frames back in real time while it records the canvas.
    const stream = canvas.captureStream(fps)
    const recorder = new MediaRecorder(stream, { mimeType: webmMime, videoBitsPerSecond: 8_000_000 })
    const chunks: BlobPart[] = []
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data) }

    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => resolve(cancelRef.current ? null : new Blob(chunks, { type: 'video/webm' }))
      recorder.onerror = () => resolve(null)
      drawCapturedFrame(ctx, frames[0], gridW, gridH, effScale, style)
      recorder.start()
      const started = performance.now()
      let drawn = 1
      const tick = () => {
        if (cancelRef.current) { recorder.stop(); return }
        const due = Math.min(frames.length, Math.floor(((performance.now() - started) / 1000) * fps) + 1)
        while (drawn < due) {
          drawCapturedFrame(ctx, frames[drawn], gridW, gridH, effScale, style)
          drawn++
        }
        setProgress({ done: drawn, total: frames.length })
        if (drawn >= frames.length) {
          // Small tail so the encoder captures the final frame's full dwell.
          setTimeout(() => recorder.stop(), 1000 / fps + 120)
          return
        }
        setTimeout(tick, 1000 / fps / 2)
      }
      setTimeout(tick, 1000 / fps / 2)
    })

    if (!blob) {
      if (!cancelRef.current) throw new Error('WebM recording failed in this browser.')
      return
    }
    downloadBlob(blob, exportFilename('webm'))
    setPhase('done')
  }

  const runExport = async () => {
    cancelRef.current = false
    setError(null)
    setProgress({ done: 0, total: totalFrames })
    try {
      if (format === 'png') await exportPng()
      else if (format === 'gif') await exportGif()
      else await exportWebm()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
    if (cancelRef.current) setPhase('idle')
  }

  const cancelExport = () => {
    cancelRef.current = true
    setPhase('idle')
  }

  const phaseLabel = phase === 'rendering'
    ? `Rendering frames… ${progress.done}/${progress.total}`
    : phase === 'encoding'
      ? `Encoding GIF… ${progress.done}/${progress.total}`
      : phase === 'recording'
        ? `Recording video… ${progress.done}/${progress.total}`
        : null
  const progressPct = Math.round((progress.done / Math.max(1, progress.total)) * 100)
  const loopNote = loop && animated
    ? `Loop blend crossfades the first ${loopBlendFrames(totalFrames, fps)} frames over the end.`
    : null

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={styles.popup} role="dialog" aria-label="Record and export the preview">
        <div className={styles.header}>
          <span>Record &amp; Export</span>
          <button className={styles.closeBtn} onClick={() => { cancelRef.current = true; onClose() }} title="Close">×</button>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Format</span>
          <div className={styles.segmented}>
            {(['png', 'gif', 'webm'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`${styles.segment} ${format === f ? styles.segmentActive : ''}`}
                onClick={() => setFormat(f)}
                disabled={busy || (f === 'webm' && !webmMime)}
                title={f === 'png' ? 'Snapshot of the current frame' : f === 'gif' ? 'Animated GIF clip' : webmMime ? 'WebM video clip' : 'WebM recording is not supported by this browser'}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Style</span>
          <div className={styles.segmented}>
            <button
              type="button"
              className={`${styles.segment} ${style === 'leds' ? styles.segmentActive : ''}`}
              onClick={() => setStyle('leds')}
              disabled={busy}
              title="The preview's LED-disc look with glow"
            >
              LED look
            </button>
            <button
              type="button"
              className={`${styles.segment} ${style === 'pixels' ? styles.segmentActive : ''}`}
              onClick={() => setStyle('pixels')}
              disabled={busy}
              title="Crisp flat pixels with exact LED colours — best for documentation and bug reports"
            >
              Flat pixels
            </button>
          </div>
        </div>

        {animated && (
          <>
            <div className={styles.row}>
              <span className={styles.label}>Duration</span>
              <input
                className={styles.slider}
                type="range"
                min={1}
                max={MAX_DURATION_SEC}
                step={1}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                disabled={busy}
                aria-label="Capture duration in seconds"
              />
              <span className={styles.value}>{durationSec}s</span>
            </div>

            <div className={styles.row}>
              <span className={styles.label}>Frame rate</span>
              <div className={styles.segmented}>
                {FPS_CHOICES.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className={`${styles.segment} ${fps === choice ? styles.segmentActive : ''}`}
                    onClick={() => setFps(choice)}
                    disabled={busy}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className={styles.row}>
          <span className={styles.label}>Scale</span>
          <input
            className={styles.slider}
            type="range"
            min={2}
            max={maxScale}
            step={1}
            value={effScale}
            onChange={(e) => setScale(Number(e.target.value))}
            disabled={busy}
            aria-label="Output scale in pixels per LED"
          />
          <span className={styles.value}>{effScale} px/LED</span>
        </div>

        {animated && (
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
              disabled={busy}
            />
            Seamless loop
            <span className={styles.hint}>crossfade the ends so the clip wraps cleanly</span>
          </label>
        )}

        <div className={styles.meta}>
          {outW}×{outH}px{animated ? ` · ${totalFrames} frames @ ${fps} fps` : ' · current frame'}
          {format === 'gif' && fps > 50 ? ' · GIF timing rounds to 10 ms steps' : ''}
        </div>
        {audioReactive && animated && (
          <div className={styles.meta}>
            ♪ Audio-reactive nodes are captured with the microphone levels at render time — for a synced clip, keep the music playing while exporting.
          </div>
        )}
        {loopNote && <div className={styles.meta}>{loopNote}</div>}

        {phaseLabel && (
          <div className={styles.progressWrap}>
            <div className={styles.progressBar}><i style={{ width: `${progressPct}%` }} /></div>
            <span className={styles.progressLabel}>{phaseLabel}</span>
          </div>
        )}
        {phase === 'done' && <div className={styles.success} role="status">✓ Exported — check your downloads.</div>}
        {phase === 'error' && error && <div className={styles.error} role="alert">✗ {error}</div>}

        <div className={styles.actions}>
          {busy ? (
            <button type="button" className={styles.secondaryBtn} onClick={cancelExport}>Cancel</button>
          ) : (
            <button type="button" className={styles.secondaryBtn} onClick={onClose}>Close</button>
          )}
          <button type="button" className={styles.primaryBtn} onClick={runExport} disabled={busy}>
            {format === 'png' ? 'Export PNG' : format === 'gif' ? 'Export GIF' : 'Export WebM'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
