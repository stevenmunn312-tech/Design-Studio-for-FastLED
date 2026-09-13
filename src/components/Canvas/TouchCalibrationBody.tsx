import { createPortal } from 'react-dom'
import { useModalFocus } from '../../hooks/useModalFocus'
import { useGraphStore } from '../../state/graphStore'
import { useTouchCalibrationStore } from '../../state/touchCalibrationStore'
import {
  TOUCH_CALIBRATION_CORNERS,
  TOUCH_CALIBRATION_SAMPLES_PER_CORNER,
  type RawTouchPoint,
} from '../../state/transportTouch'
import { useUploadStore } from '../../state/uploadStore'
import styles from './TouchCalibrationBody.module.css'

function representative(points: readonly RawTouchPoint[]): RawTouchPoint | null {
  if (points.length === 0) return null
  const middle = Math.floor(points.length / 2)
  return {
    x: [...points].sort((a, b) => a.x - b.x)[middle].x,
    y: [...points].sort((a, b) => a.y - b.y)[middle].y,
  }
}

function CornerMap({ activeIndex, completed }: { activeIndex: number; completed: number }) {
  return (
    <div className={styles.cornerMap} aria-hidden="true">
      {TOUCH_CALIBRATION_CORNERS.map((corner, index) => (
        <span
          key={corner.id}
          className={`${styles.cornerTarget} ${styles[corner.id]} ${index === activeIndex ? styles.cornerActive : ''} ${index < completed ? styles.cornerDone : ''}`}
        >
          {index < completed ? '✓' : index + 1}
        </span>
      ))}
      <span className={styles.glassLabel}>Touch glass</span>
    </div>
  )
}

function TouchCalibrationDialog({ nodeId }: { nodeId: string }) {
  const session = useTouchCalibrationStore((state) => state.session?.nodeId === nodeId
    ? state.session
    : null)
  const start = useTouchCalibrationStore((state) => state.start)
  const beginCorner = useTouchCalibrationStore((state) => state.beginCorner)
  const retryCorner = useTouchCalibrationStore((state) => state.retryCorner)
  const cancel = useTouchCalibrationStore((state) => state.cancel)
  const updateNodeProperties = useGraphStore((state) => state.updateNodeProperties)
  const { selectedPort, serialConnected, serialError, busy, startSerial, openBoardPopup } = useUploadStore()
  const close = () => cancel()
  const dialogRef = useModalFocus<HTMLDivElement>(close)

  const current = session ? TOUCH_CALIBRATION_CORNERS[session.cornerIndex] : null
  const currentSamples = session && current ? session.samples[current.id] : []
  const currentPoint = representative(currentSamples)
  const completed = session
    ? session.cornerIndex + (session.phase === 'captured' || session.phase === 'complete' ? 1 : 0)
    : 0

  const save = () => {
    if (!session?.result) return
    updateNodeProperties(nodeId, {
      touchXMin: session.result.xMin,
      touchXMax: session.result.xMax,
      touchYMin: session.result.yMin,
      touchYMax: session.result.yMax,
    })
    cancel()
  }

  const choosePort = () => {
    cancel()
    openBoardPopup()
  }

  if (!session) return null
  return createPortal(
        <div
          className={`nodrag nowheel ${styles.overlay}`}
          onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}
        >
          <div
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="touch-calibration-title"
            tabIndex={-1}
          >
            <header className={styles.header}>
              <div>
                <div className={styles.title} id="touch-calibration-title">Calibrate touch</div>
                <div className={styles.subtitle}>Measure this panel’s raw 12-bit touch range.</div>
              </div>
              <button type="button" className={styles.closeButton} onClick={close} aria-label="Close touch calibration">×</button>
            </header>

            <div className={styles.connectionRow}>
              <span className={`${styles.connectionDot} ${serialConnected ? styles.connected : ''}`} aria-hidden="true" />
              <div className={styles.connectionText}>
                <strong>{serialConnected ? 'Serial connected' : 'Serial disconnected'}</strong>
                <span>{selectedPort || 'No port selected'}</span>
              </div>
              {!selectedPort ? (
                <button type="button" className={styles.secondaryButton} onClick={choosePort}>Choose port</button>
              ) : !serialConnected ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy}
                  onClick={() => { void startSerial() }}
                >
                  Connect
                </button>
              ) : null}
            </div>

            {serialError && <div className={styles.error} role="alert">{serialError}</div>}

            <div className={styles.captureLayout}>
              <CornerMap activeIndex={session.cornerIndex} completed={completed} />

              <section className={styles.capturePanel} aria-live="polite">
                <div className={styles.stepLine}>Corner {session.cornerIndex + 1} of {TOUCH_CALIBRATION_CORNERS.length}</div>
                {session.phase === 'ready' && current && (
                  <>
                    <h3>Start at the {current.label}</h3>
                    <p>Use a stylus or fingertip. Start capture, then press and hold the marked corner until five readings arrive.</p>
                    <button type="button" className={styles.primaryButton} disabled={!serialConnected} onClick={beginCorner}>
                      Start {current.label}
                    </button>
                  </>
                )}

                {session.phase === 'collecting' && current && (
                  <>
                    <h3>Hold the {current.label}</h3>
                    <p>Keep steady while the running sketch sends raw samples.</p>
                    <div className={styles.sampleMeter} role="progressbar" aria-label={`${current.label} samples`} aria-valuemin={0} aria-valuemax={TOUCH_CALIBRATION_SAMPLES_PER_CORNER} aria-valuenow={currentSamples.length}>
                      {Array.from({ length: TOUCH_CALIBRATION_SAMPLES_PER_CORNER }, (_, index) => (
                        <span key={index} className={index < currentSamples.length ? styles.sampleFilled : ''} />
                      ))}
                    </div>
                    <div className={styles.rawReadout}>
                      {session.latest ? `Raw X ${session.latest.x} · Y ${session.latest.y}` : 'Waiting for a raw touch reading…'}
                    </div>
                  </>
                )}

                {session.phase === 'captured' && current && (
                  <>
                    <h3>{current.label[0].toUpperCase() + current.label.slice(1)} captured</h3>
                    <p>Lift your finger before moving to the next corner.</p>
                    <div className={styles.rawReadout}>Median X {currentPoint?.x} · Y {currentPoint?.y}</div>
                    <div className={styles.actions}>
                      <button type="button" className={styles.secondaryButton} onClick={retryCorner}>Retry corner</button>
                      <button type="button" className={styles.primaryButton} onClick={beginCorner}>
                        Capture {TOUCH_CALIBRATION_CORNERS[session.cornerIndex + 1].label}
                      </button>
                    </div>
                  </>
                )}

                {session.phase === 'complete' && (
                  <>
                    <h3>Calibration ready</h3>
                    {session.result ? (
                      <>
                        <p>These bounds will replace the four values on the Touch node.</p>
                        <dl className={styles.bounds}>
                          <div><dt>X min</dt><dd>{session.result.xMin}</dd></div>
                          <div><dt>X max</dt><dd>{session.result.xMax}</dd></div>
                          <div><dt>Y min</dt><dd>{session.result.yMin}</dd></div>
                          <div><dt>Y max</dt><dd>{session.result.yMax}</dd></div>
                        </dl>
                        <div className={styles.actions}>
                          <button type="button" className={styles.secondaryButton} onClick={() => start(nodeId)}>Restart</button>
                          <button type="button" className={styles.primaryButton} onClick={save}>Save calibration</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={styles.error} role="alert">{session.error}</div>
                        <div className={styles.actions}>
                          <button type="button" className={styles.secondaryButton} onClick={() => start(nodeId)}>Restart</button>
                          <button type="button" className={styles.primaryButton} onClick={retryCorner}>Retry last corner</button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>
            </div>

            <footer className={styles.footer}>
              <span>The running device must use calibration-enabled firmware that emits raw touch samples.</span>
              <button type="button" className={styles.cancelButton} onClick={close}>Cancel</button>
            </footer>
          </div>
        </div>,
        document.body,
  )
}

export default function TouchCalibrationBody({ nodeId }: { nodeId: string }) {
  const open = useTouchCalibrationStore((state) => state.session?.nodeId === nodeId)
  const start = useTouchCalibrationStore((state) => state.start)
  return (
    <>
      <button
        type="button"
        className={`nodrag ${styles.calibrateButton}`}
        onClick={() => start(nodeId)}
      >
        Calibrate touch
      </button>
      {open && <TouchCalibrationDialog nodeId={nodeId} />}
    </>
  )
}
