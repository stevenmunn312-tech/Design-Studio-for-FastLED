// The first-launch showcase: what a first visit sees before the workspace.
//
// A new person met every panel at once and did not know where to look. This
// shows one thing instead, lights, and only then the tools that made them:
//
//   opener   Opaline Sunset, live, with a Play button. Drawn by the evaluator
//            on its own, so the open workspace is not touched.
//   starting a fade to black while the show is set up underneath.
//   show     the Music Player starter running to its demo track, shown as
//            bare lights. The workspace underneath is the real project.
//   ended    the way into the studio, over the song's last seconds.
//
// Both pictures are drawn by the preview's own LED renderer, so a light here
// is the same light as in the LED Output pane and on Stage. Master brightness
// is left out on purpose: this is the show at full, whatever the Board says.
//
// App mounts it for a first visit; File > Watch the Intro opens it again.
import { useEffect, useRef, useState } from 'react'
import { evaluateGraph, type Frame } from '../../state/graphEvaluator'
import { BUNDLED_PATTERNS } from '../../state/patterns/bundledPatterns'
import { LED_OUTPUT_GAMMA_DEFAULT, applyLedOutputRuntime } from '../../state/output/ledOutputRuntime'
import { playerPositionMs, usePlayerTransport } from '../../state/player/playerTransport'
import { useEscapeLayer } from '../../hooks/useEscapeLayer'
import { WebGLLEDRenderer } from '../Preview/webglRenderer'
import { terminalFrameTap } from '../Preview/terminalFrameTap'
import styles from './FirstLaunchShowcase.module.css'

const OPENER = 'Opaline Sunset'
const OPENER_GRID = 32
/** Matches the opacity transition in the stylesheet. */
const FADE_MS = 600
const BLACK: Frame = [[{ r: 0, g: 0, b: 0 }]]
const FULL = { enabled: true, brightness: 1 }

/** The closing screen comes in over the song's last moments, not after a
 *  silence: this long before the end, or this soon after the player stops. */
const ENDING_LEAD_MS = 3000
const STOPPED_MS = 300

type Phase = 'opener' | 'starting' | 'show' | 'ended'

interface Props {
  /** Play: start the Music Player show underneath. Resolves false if it did not start. */
  onPlay: () => Promise<boolean>
  /** Leave the opener for the Start Gallery. */
  onSkip: () => void
  /** Leave the running show for the studio, with the show still open in it. */
  onOpenStudio: () => void
}

export default function FirstLaunchShowcase({ onPlay, onSkip, onOpenStudio }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<WebGLLEDRenderer | null>(null)
  const [phase, setPhase] = useState<Phase>('opener')

  useEscapeLayer(phase === 'opener' ? onSkip : onOpenStudio, phase !== 'starting')

  // The song is over once the player has been stopped for a moment after
  // having played. Without this the last thing a first visit showed was a
  // black screen with one small link.
  useEffect(() => {
    if (phase !== 'show') return
    let played = false
    let stoppedAt = 0
    const timer = window.setInterval(() => {
      const transport = usePlayerTransport.getState()
      const duration = transport.localTrack?.durationMs ?? 0
      if (transport.playing) {
        played = true
        stoppedAt = 0
        if (duration > 0 && playerPositionMs(transport) >= duration - ENDING_LEAD_MS) setPhase('ended')
      } else if (played) {
        if (!stoppedAt) stoppedAt = performance.now()
        else if (performance.now() - stoppedAt >= STOPPED_MS) setPhase('ended')
      }
    }, 150)
    return () => window.clearInterval(timer)
  }, [phase])

  const playAgain = () => {
    // The closing screen can arrive while the last seconds still play: then
    // "again" is back to the start, not a pause.
    const stillPlaying = usePlayerTransport.getState().playing
    usePlayerTransport.getState().dispatchControls({
      sourceId: 'showcase', playPause: !stillPlaying, previous: stillPlaying, next: false,
    })
    setPhase('show')
  }

  /** Draw one frame of LED values, filling the canvas's square. */
  const paint = (frame: Frame) => {
    const canvas = canvasRef.current
    const renderer = rendererRef.current
    if (!canvas || !renderer) return
    const rows = frame.length
    const columns = frame[0]?.length ?? 0
    if (!rows || !columns) return
    const size = Math.min(canvas.clientWidth, canvas.clientHeight) * window.devicePixelRatio
    renderer.render(frame, columns, rows, size / Math.max(rows, columns), 'standard')
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      rendererRef.current = new WebGLLEDRenderer(canvas)
    } catch {
      // No WebGL: the mock shows the caption and the Play button over black.
      rendererRef.current = null
    }
    return () => {
      rendererRef.current?.destroy()
      rendererRef.current = null
    }
  }, [])

  const play = async () => {
    // Fade to black, start the show behind the black, then fade the lights in.
    // The overlay stays opaque throughout, so the app never shows through; it
    // sits below the app's dialogs, so a save prompt would still be seen.
    setPhase('starting')
    await new Promise((resolve) => setTimeout(resolve, FADE_MS))
    // Drawing stops while the show starts, so the canvas still holds the last
    // sunset frame. Wipe it, or that frame fades back in ahead of the show.
    paint(BLACK)
    const started = await onPlay()
    setPhase(started ? 'show' : 'opener')
  }

  useEffect(() => {
    const pattern = BUNDLED_PATTERNS.find((entry) => entry.name === OPENER)
    if (!pattern || phase === 'starting' || phase === 'ended') return
    const { nodes, edges } = pattern.subgraph
    const groups = pattern.groups ?? {}
    const started = performance.now()
    let raf = 0
    const draw = () => {
      if (phase === 'show') {
        // The show's own frame, straight from the preview's evaluation: LED
        // values, after its output's Gamma.
        if (terminalFrameTap.frame) paint(terminalFrameTap.frame)
      } else {
        // The evaluator's clock counts 60 steps a second, as the preview's
        // does. A pattern's frame holds screen colours; the output's default
        // Gamma turns them into the LED values the renderer draws.
        const colours = evaluateGraph(nodes, edges, (performance.now() - started) / (1000 / 60), OPENER_GRID, OPENER_GRID, groups, 'showcase/opener/')
        if (colours) paint(applyLedOutputRuntime(colours, FULL, LED_OUTPUT_GAMMA_DEFAULT))
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  return (
    <div
      className={`${styles.showcase} ${phase === 'starting' ? styles.starting : ''} ${phase === 'ended' ? styles.ended : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Design Studio for FastLED"
    >
      <div className={styles.stageWrap}>
        <canvas ref={canvasRef} className={styles.stage} aria-hidden="true" />
        {phase === 'opener' && (
          <button type="button" className={styles.play} aria-label="Play the show" onClick={() => void play()} autoFocus>
            <span className={styles.playIcon} aria-hidden="true" />
          </button>
        )}
      </div>
      {phase === 'opener' ? (
        <div className={styles.caption}>
          <h1 className={styles.name}>Design Studio for FastLED</h1>
          <p className={styles.summary}>Press play: a full light show, moving to music, made with the nodes you are about to meet.</p>
          <button type="button" className={styles.secondary} onClick={onSkip}>Skip to the studio</button>
        </div>
      ) : phase === 'ended' ? (
        <div className={styles.ending}>
          <h1 className={styles.name}>Now make your own.</h1>
          <p className={styles.summary}>That show is open in the studio: every pattern, the music player and the board it runs on.</p>
          <button type="button" className={styles.enter} onClick={onOpenStudio} autoFocus>Enter the Studio</button>
          <button type="button" className={styles.secondary} onClick={playAgain}>Play it again</button>
        </div>
      ) : (
        <div className={styles.caption}>
          <button type="button" className={styles.secondary} onClick={onOpenStudio}>See how it is made</button>
        </div>
      )}
    </div>
  )
}
