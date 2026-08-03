import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { useShowPlayback } from '../../state/showPlayback'
import { outputRoutes } from '../../state/outputRouting'
import { latestStreamFrameCopy } from '../../state/streamStore'
import { encodeGifInWorker } from '../../utils/gifWorkerClient'
import { createRecordRenderer, type RecordRasterStyle } from './recordRenderer'
import { previewStyleLabel, type PreviewStyle } from './previewStyles'
import { captureSequence, gifScaleLimit, loopBlendFrames } from './recordCapture'
import { liveAudioAvailable, recordAudioTimeline, type RecordedAudioFrame } from './recordAudio'
import { graphConsumesAudio } from './previewAudioUsage'
import styles from './RecordPopup.module.css'

// Record & export dialog for the LED preview: PNG snapshot of the live frame,
// or an offline-rendered GIF/WebM clip with duration, FPS, scale, and
// seamless-loop options. Opened from the preview header's Record button.

type RecordFormat = 'png' | 'gif' | 'webm'
type Phase = 'idle' | 'listening' | 'rendering' | 'encoding' | 'finalizing' | 'recording' | 'done' | 'error'

const FPS_CHOICES = [10, 15, 20, 25, 30, 50]
const MAX_OUTPUT_PX = 2048
const MAX_DURATION_SEC = 30
// Enough for the slowest settling simulations (Reaction-Diffusion, Game of
// Life, long Trails decays) to leave their blank boot state, without making a
// short clip feel like it hangs before the progress bar moves.
const WARMUP_SEC = 2

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
  // Clamp to 1, not 2, exactly as LEDPreview does: a strip layout is a real
  // 1-row frame, and padding the grid to 2 here appended a permanently black
  // phantom row to every export (the same clamped-vs-actual dimension mistake
  // that once silently broke live streaming to 1-row strips).
  const gridW = Math.max(1, Math.min(64, route?.width ?? 16))
  const gridH = Math.max(1, Math.min(64, route?.height ?? 16))
  const audioReactive = useGraphStore((s) => graphConsumesAudio(s.nodes, s.edges))
  // The recorder renders through the preview's own renderers, so it needs the
  // same effective style the canvas is using — including UI FX being off.
  const uiEffectsEnabled = useUiStore((s) => s.uiEffectsEnabled)
  const rawPreviewStyle = useUiStore((s) => s.previewStyle)
  const previewStyle: PreviewStyle = uiEffectsEnabled ? rawPreviewStyle : 'standard'

  const [format, setFormat] = useState<RecordFormat>('gif')
  const [style, setStyle] = useState<RecordRasterStyle>('preview')
  const [durationSec, setDurationSec] = useState(6)
  const [fps, setFps] = useState(30)
  const [scale, setScale] = useState(12)
  const [loop, setLoop] = useState(true)
  const [warmup, setWarmup] = useState(true)
  const [captureAudio, setCaptureAudio] = useState(true)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 1 })
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  // Abandon any in-flight capture when the dialog unmounts.
  useEffect(() => () => { cancelRef.current = true }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { cancelRef.current = true; onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const webmMime = pickWebmMime()
  const totalFrames = Math.max(1, Math.round(durationSec * fps))
  const dimensionMaxScale = Math.max(2, Math.floor(MAX_OUTPUT_PX / Math.max(gridW, gridH)))
  const maxScale = format === 'gif'
    ? gifScaleLimit(gridW, gridH, totalFrames, MAX_OUTPUT_PX)
    : dimensionMaxScale
  const effScale = Math.min(scale, maxScale)
  const outW = gridW * effScale
  const outH = gridH * effScale
  const animated = format !== 'png'
  const busy = phase === 'listening' || phase === 'rendering' || phase === 'encoding' || phase === 'finalizing' || phase === 'recording'
  // Listening only makes sense for an animated clip whose graph reacts to audio
  // that is actually coming in. With the mic off, the evaluator's silent /
  // test-signal fallbacks are already deterministic, so there is nothing to
  // record and no reason to make the user wait for it.
  const canCaptureAudio = animated && audioReactive && liveAudioAvailable()
  const listenSec = Math.round(((totalFrames + (loop ? loopBlendFrames(totalFrames, fps) : 0)) / fps) * 10) / 10

  const makeCanvas = (): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create an export canvas')
    return { canvas, ctx }
  }

  const makeRenderer = (rasterScale = effScale, w = gridW, h = gridH) =>
    createRecordRenderer({ gridW: w, gridH: h, scale: rasterScale, style, previewStyle })

  /** Listen in real time first, so the offline render has a live-audio track to
   *  replay instead of resampling one frozen instant for every frame. */
  const listenForAudio = async (): Promise<RecordedAudioFrame[] | null | undefined> => {
    if (!canCaptureAudio || !captureAudio) return undefined
    setPhase('listening')
    const frameCount = totalFrames + (loop ? loopBlendFrames(totalFrames, fps) : 0)
    return recordAudioTimeline({
      fps,
      frameCount,
      onProgress: (elapsedMs, totalMs) => setProgress({ done: Math.round(elapsedMs), total: Math.round(totalMs) }),
      isCancelled: () => cancelRef.current,
    })
  }

  const captureFrames = async () => {
    const audioTimeline = await listenForAudio()
    // A cancelled listen returns null; undefined just means we never listened.
    if (audioTimeline === null) return null
    setPhase('rendering')
    const { nodes, edges, trusted } = useGraphStore.getState()
    const playback = useShowPlayback.getState()
    return captureSequence({
      audioTimeline,
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
      warmupSec: warmup ? WARMUP_SEC : 0,
      showPlayback: playback.show ? playback : null,
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
      const playback = useShowPlayback.getState()
      const frames = await captureSequence({
        nodes, edges, groups: getGroupRegistry(), trusted,
        gridW, gridH, outputId: route?.id, fps: 1, durationSec: 1, seamlessLoop: false,
        warmupSec: warmup ? WARMUP_SEC : 0,
        showPlayback: playback.show ? playback : null,
        isCancelled: () => cancelRef.current,
      })
      if (!frames) return
      live = { bytes: frames[0], width: gridW, height: gridH }
    }
    const pngScale = Math.min(effScale, Math.max(1, Math.floor(MAX_OUTPUT_PX / Math.max(live.width, live.height))))
    setPhase('finalizing')
    const renderer = makeRenderer(pngScale, live.width, live.height)
    let rgba: Uint8ClampedArray
    try {
      rgba = renderer.render(live.bytes)
    } finally {
      renderer.dispose()
    }
    const canvas = document.createElement('canvas')
    canvas.width = live.width * pngScale
    canvas.height = live.height * pngScale
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create an export canvas')
    ctx.putImageData(new ImageData(rgba, canvas.width, canvas.height), 0, 0)
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
    const renderer = makeRenderer()
    let gif: Blob | null
    try {
      gif = await encodeGifInWorker({
        width: outW,
        height: outH,
        delayCs: Math.round(100 / fps),
        frameCount: frames.length,
        frameAt: (index) => renderer.render(frames[index]),
        onProgress: (done, total) => setProgress({ done, total }),
        onFinalizing: () => setPhase('finalizing'),
        isCancelled: () => cancelRef.current,
      })
    } finally {
      renderer.dispose()
    }
    if (!gif) return
    downloadBlob(gif, exportFilename('gif'))
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
    const renderer = makeRenderer()
    const drawWebmFrame = (frame: Uint8ClampedArray) => {
      ctx.putImageData(new ImageData(renderer.render(frame), outW, outH), 0, 0)
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => resolve(cancelRef.current ? null : new Blob(chunks, { type: 'video/webm' }))
      recorder.onerror = () => resolve(null)
      drawWebmFrame(frames[0])
      recorder.start()
      const started = performance.now()
      let drawn = 1
      const tick = () => {
        if (cancelRef.current) { recorder.stop(); return }
        const due = Math.min(frames.length, Math.floor(((performance.now() - started) / 1000) * fps) + 1)
        if (drawn < due) {
          // MediaRecorder samples the canvas on wall-clock time. If the tab
          // was paused or one render ran long, drawing every overdue frame in
          // this same task cannot put them back into the video; it only blocks
          // the page in a large catch-up burst. Draw the newest due frame and
          // continue from the current recording position instead.
          drawWebmFrame(frames[due - 1])
          drawn = due
        }
        setProgress({ done: drawn, total: frames.length })
        if (drawn >= frames.length) {
          // Small tail so the encoder captures the final frame's full dwell.
          setPhase('finalizing')
          setTimeout(() => recorder.stop(), 1000 / fps + 120)
          return
        }
        setTimeout(tick, 1000 / fps / 2)
      }
      setTimeout(tick, 1000 / fps / 2)
    })
    renderer.dispose()

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

  const phaseLabel = phase === 'listening'
    ? `Listening to audio… ${Math.max(0, Math.ceil((progress.total - progress.done) / 1000))}s left — keep the music playing`
    : phase === 'rendering'
    ? `Rendering frames… ${progress.done}/${progress.total}`
    : phase === 'encoding'
      ? `Encoding GIF… ${progress.done}/${progress.total}`
      : phase === 'finalizing'
        ? `Finalizing ${format === 'gif' ? 'GIF' : format === 'webm' ? 'WebM' : 'PNG'} download…`
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
              className={`${styles.segment} ${style === 'preview' ? styles.segmentActive : ''}`}
              onClick={() => setStyle('preview')}
              disabled={busy}
              title={`Rendered through the live preview's own renderer — currently ${previewStyleLabel(previewStyle)}`}
            >
              Match preview
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

        {style === 'preview' && (
          <div className={styles.meta}>
            Using the preview style <strong>{previewStyleLabel(previewStyle)}</strong>
            {!uiEffectsEnabled ? ' (UI FX are off)' : ''} — change it in the preview header to change the export.
          </div>
        )}

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

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={warmup}
            onChange={(e) => setWarmup(e.target.checked)}
            disabled={busy}
          />
          Warm up simulations
          <span className={styles.hint}>
            render {WARMUP_SEC}s first so fire, trails and particles start settled, not blank
          </span>
        </label>

        {canCaptureAudio && (
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={captureAudio}
              onChange={(e) => setCaptureAudio(e.target.checked)}
              disabled={busy}
            />
            Capture live audio
            <span className={styles.hint}>
              listen for {listenSec}s first, then render against that — without it every frame
              samples the same instant and the reaction comes out frozen
            </span>
          </label>
        )}

        <div className={styles.meta}>
          {outW}×{outH}px{animated ? ` · ${totalFrames} frames @ ${fps} fps` : ' · current frame'}
          {format === 'gif' && fps > 50 ? ' · GIF timing rounds to 10 ms steps' : ''}
        </div>
        {format === 'gif' && maxScale < dimensionMaxScale && (
          <div className={styles.meta}>GIF scale is capped for this frame count to keep finalization reliable.</div>
        )}
        {audioReactive && animated && !canCaptureAudio && (
          <div className={styles.meta}>
            ♪ This graph reacts to audio, but no live input is running — start the mic before
            exporting, or the clip records the silent / test-signal fallback.
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
