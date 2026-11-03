import { useMemo, useState } from 'react'
import { useGraphStore, useRootEdges, useRootNodes } from '../../state/graphStore'
import { boardByFqbn, engineReady, useUploadStore } from '../../state/upload/uploadStore'
import { SPI_CHIPSETS } from '../../state/nodeLibrary'
import { validateMatrixLayout } from '../../state/output/xyLayout'
import { generateWiringDiagnosticSketch } from '../../codegen/sketches/wiringDiagnosticGenerator'
import { estimatePowerLoad, findHub75TopologyDiagnosticErrors } from '../../utils/validateGraph'
import { useModalFocus } from '../../hooks/useModalFocus'
import { describePort } from '../../utils/portStatus'
import { buildToolsOfflineHint } from '../../utils/buildTools'
import styles from './Upload.module.css'
import { Icon } from '../icons/Icon'
import { controllerSettings } from '../../build/controllerSettings'
import { useUiStore } from '../../state/uiStore'
import {
  isLinearForm,
  LED_OUTPUT_FORM_LABELS,
  outputForm,
  outputSizeLabel,
} from '../../state/output/ledOutputForm'
import { selectedPhysicalBoardProfile } from '../../build/boards/boardProfiles'

// A guided *review* of one LED output on its way to a board. Every value it
// shows has exactly one editor elsewhere — the board on the Hardware bench,
// the output's count, form, chipset and colour order on its node, its pins in
// the Hardware wiring inspector — and each step links there. The wizard used
// to carry editors of its own for the board and the LED fields, and the
// board one silently lost: `App.tsx` mirrors the Board node's profile into
// `selectedFqbn` and snapped the wizard's pick straight back.
const STEPS = [
  { key: 'controller', title: 'Controller', blurb: 'Check the board, port, and build path.' },
  { key: 'geometry', title: 'Geometry', blurb: 'Check the physical form and size of the LEDs you want to drive.' },
  { key: 'leds', title: 'LEDs', blurb: 'Check the strip type, color order, and wiring pins.' },
  { key: 'upload', title: 'Upload', blurb: 'Review the setup, then run a wiring test or open the upload tools.' },
] as const

export default function MatrixOutputSetupWizard() {
  const [step, setStep] = useState(0)
  const nodes = useRootNodes()
  const edges = useRootEdges()
  const {
    helper,
    ports,
    portsScanned,
    installedCores,
    selectedFqbn,
    selectedPort,
    busy,
    refreshPorts,
    refreshHelper,
    installCore,
    setSelectedPort,
    openBoardPopup,
    openCliPopup,
    closeSetupWizard,
    openDeployPopup,
    runUpload, activeOutputNodeId,
  } = useUploadStore()
  const dialogRef = useModalFocus<HTMLDivElement>(closeSetupWizard)

  const node = nodes.find((n) => n.id === activeOutputNodeId && n.data.nodeType === 'MatrixOutput')
    ?? nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  const nodeId = node?.id ?? null
  const props = ((node?.data.properties ?? {}) as Record<string, unknown>)
  const controller = controllerSettings(nodes)

  const form = outputForm(props)
  const linear = isLinearForm(form)
  const width = Number(props.width ?? 16)
  const height = Number(props.height ?? 16)
  const layout = String(props.layout ?? 'matrix')
  const tilesX = Number(props.tilesX ?? 1)
  const tilesY = Number(props.tilesY ?? 1)
  const tileSerpentine = props.tileSerpentine === true
  const tileRotations = String(props.tileRotations ?? '')
  const customXYMap = String(props.customXYMap ?? '')
  const chipset = String(props.chipset ?? 'WS2812B')
  const dataPin = Number(props.dataPin ?? 5)
  const clockPin = Number(props.clockPin ?? 6)
  const spi = SPI_CHIPSETS.has(chipset)
  const board = boardByFqbn(selectedFqbn)
  const boardLabel = selectedPhysicalBoardProfile(nodes)?.label ?? board?.label ?? 'No board chosen'
  const usingFbuild = helper?.engine === 'fbuild'
  const activeEngineReady = engineReady(helper)
  const port = describePort({ helper, selectedPort, ports, portsScanned })
  const portDetected = port.state === 'connected'
  const coreReady = !!board && (usingFbuild || installedCores.includes(board.core))
  const uploadReady = !!helper && activeEngineReady && coreReady && portDetected
  const layoutErrors = useMemo(
    () => linear ? [] : validateMatrixLayout(width, height, { layout, tilesX, tilesY, tileSerpentine, tileRotations, customXYMap }),
    [linear, width, height, layout, tilesX, tilesY, tileSerpentine, tileRotations, customXYMap],
  )
  const power = useMemo(() => estimatePowerLoad(nodes), [nodes])
  const hub75TopologyErrors = useMemo(
    () => findHub75TopologyDiagnosticErrors(nodes, nodeId ?? undefined),
    [nodes, nodeId],
  )
  const hasFrameInput = !!nodeId && edges.some((e) => e.target === nodeId && e.targetHandle === 'frame')

  if (!nodeId) return null
  const matrixNodeId = nodeId
  const openHardwareWiring = () => {
    const ui = useUiStore.getState()
    ui.setHardwarePaneTab('hardware')
    if (ui.hardwarePaneRatio < 0.32) ui.setHardwarePaneRatio(0.5)
    ui.setHardwareInspectorNodeId(matrixNodeId)
    closeSetupWizard()
  }

  /** The board is chosen on the Hardware bench; the wizard only reports it. */
  function changeBoard() {
    closeSetupWizard()
    useUiStore.getState().openHardwareBoardMenu()
  }

  /** The output's node is the one editor of what it is; frame it on the Graph. */
  function openOutputNode() {
    closeSetupWizard()
    useGraphStore.getState().focusNode(matrixNodeId)
    useUiStore.getState().revealGraphNodes([matrixNodeId])
  }

  function handleFlashWiringTest() {
    const sketch = generateWiringDiagnosticSketch(nodes, matrixNodeId)
    if (sketch) void runUpload(sketch, undefined, { cache: false })
  }

  function handleFlashHub75Topology() {
    const sketch = generateWiringDiagnosticSketch(nodes, matrixNodeId, 'hub75-panel-topology')
    if (sketch) void runUpload(sketch, undefined, { cache: false })
  }

  function openAdvancedBoardManager() {
    openBoardPopup()
  }

  function handleOpenUpload() {
    closeSetupWizard()
    openDeployPopup(matrixNodeId)
  }

  return (
    <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) closeSetupWizard() }}>
      <div
        ref={dialogRef}
        className={`${styles.popup} ${styles.wizardPopup}`}
        role="dialog"
        aria-modal="true"
        aria-label="LED output setup wizard"
        tabIndex={-1}
      >
        <div className={styles.popupHeader}>
          <div>
            <div className={styles.wizardKicker}>Setup wizard</div>
            <div className={styles.wizardTitle}>LED Output</div>
          </div>
          <button className={styles.closeBtn} onClick={closeSetupWizard} title="Close" aria-label="Close LED output setup wizard">×</button>
        </div>

        <div className={styles.wizardSteps} aria-label="Wizard steps">
          {STEPS.map((item, index) => (
            <button
              key={item.key}
              className={`${styles.wizardButtonBase} ${styles.wizardStep} ${index === step ? styles.wizardStepActive : ''}`}
              onClick={() => setStep(index)}
              aria-current={index === step ? 'step' : undefined}
            >
              <span className={styles.wizardStepIndex}>{index + 1}</span>
              <span className={styles.wizardStepText}>{item.title}</span>
            </button>
          ))}
        </div>

        <div className={styles.wizardIntro}>
          <div className={styles.sectionTitle}>{STEPS[step].title}</div>
          <div className={styles.note}>{STEPS[step].blurb}</div>
        </div>

        {step === 0 && (
          <div className={styles.wizardSection}>
            <div className={styles.targetRow}>
              <span className={styles.targetChip}>{boardLabel}</span>
              <span className={styles.targetChip}>{port.text}</span>
              <span className={`${styles.targetChip} ${uploadReady ? styles.readyBadge : styles.missingBadge}`}>
                {uploadReady ? 'Ready' : 'Needs setup'}
              </span>
            </div>

            <div className={styles.wizardChecklistRow}>
              <div>
                <div className={styles.fieldLabel}>Board</div>
                <div className={styles.note}>{boardLabel}</div>
              </div>
              <button
                type="button"
                className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
                onClick={changeBoard}
                title="Choose the board on the Hardware bench"
              >
                Change board in Hardware
              </button>
            </div>

            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Port</span>
              <div className={styles.portRow}>
                <select className={styles.select} value={selectedPort} onChange={(e) => setSelectedPort(e.target.value)} disabled={!activeEngineReady}>
                  {ports.length === 0 && <option value="">No boards detected</option>}
                  {ports.map((port) => (
                    <option key={port.address} value={port.address}>
                      {port.label}{port.boards[0]?.name ? ` · ${port.boards[0].name}` : ''}
                    </option>
                  ))}
                </select>
                <button className={styles.refreshBtn} onClick={refreshPorts} disabled={!activeEngineReady} title="Refresh ports"><Icon name="refresh" /></button>
              </div>
            </label>

            <div className={styles.wizardChecklist}>
              <div className={styles.wizardChecklistRow}>
                <span className={styles.wizardChecklistLabel}>Build tools</span>
                <span className={helper ? styles.readyBadge : styles.missingBadge}>{helper ? 'Ready' : 'Not running'}</span>
              </div>
              {!helper && (
                <>
                  <div className={styles.note}>{buildToolsOfflineHint()}</div>
                  <button className={`${styles.wizardButtonBase} ${styles.readinessAction}`} onClick={() => { void refreshHelper() }}>
                    Retry
                  </button>
                </>
              )}

              <div className={styles.wizardChecklistRow}>
                <span className={styles.wizardChecklistLabel}>Compiler</span>
                <span className={activeEngineReady ? styles.readyBadge : styles.missingBadge}>
                  {activeEngineReady ? (usingFbuild ? 'fbuild' : 'arduino-cli') : 'Not set up'}
                </span>
              </div>
              {!activeEngineReady && helper && (
                <button className={`${styles.wizardButtonBase} ${styles.readinessAction}`} onClick={openCliPopup}>
                  Set up compiler
                </button>
              )}

              <div className={styles.wizardChecklistRow}>
                <span className={styles.wizardChecklistLabel}>Board support</span>
                <span className={coreReady ? styles.readyBadge : styles.missingBadge}>
                  {coreReady ? 'Ready' : usingFbuild ? 'Downloads on first build' : 'Not installed'}
                </span>
              </div>
              {!usingFbuild && helper && board && !coreReady && (
                <button className={`${styles.wizardButtonBase} ${styles.readinessAction}`} onClick={() => { void installCore(board.core) }} disabled={busy}>
                  Install {board.label} board support
                </button>
              )}
            </div>

            <button className={`${styles.wizardButtonBase} ${styles.exportBtn}`} onClick={openAdvancedBoardManager}>
              Board manager...
            </button>
          </div>
        )}

        {step === 1 && (
          <div className={styles.wizardSection}>
            {/* Read-only on purpose: the LED output node on the Graph is the one
                editor of what the output *is*. The wizard used to carry its own
                copies of these fields, which made "where do I set my LED count?"
                a question with three answers. */}
            <div className={styles.wizardSummary}>
              <div className={styles.wizardSummaryRow}><span>Physical form</span><strong>{LED_OUTPUT_FORM_LABELS[form]}</strong></div>
              <div className={styles.wizardSummaryRow}><span>Size</span><strong>{outputSizeLabel(props)}</strong></div>
              {!linear && (
                <div className={styles.wizardSummaryRow}><span>Layout</span><strong>{layout}{props.serpentine === true ? ' · serpentine' : ''}{layout === 'panels' ? ` · ${tilesX} × ${tilesY} panels` : ''}</strong></div>
              )}
              {form === 'ring' && (
                <div className={styles.wizardSummaryRow}><span>LED 0</span><strong>{Number(props.ringStartAngle ?? 0)}° · {props.ringDirection === 'ccw' ? 'counter-clockwise' : 'clockwise'}</strong></div>
              )}
              {form === 'corkscrew' && (
                <div className={styles.wizardSummaryRow}><span>Winding</span><strong>{Number(props.corkscrewTurns ?? 6)} turns · {Number(props.corkscrewDiameterMm ?? 100)} mm across · {Number(props.corkscrewHeightMm ?? 300)} mm tall</strong></div>
              )}
            </div>

            <button type="button" className={`${styles.wizardButtonBase} ${styles.exportBtn}`} onClick={openOutputNode}>
              Edit on the Graph
            </button>

            {layoutErrors.length > 0 && (
              <div className={styles.streamError}>
                {layoutErrors.map((error) => <div key={error}>{error}</div>)}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className={styles.wizardSection}>
            <div className={styles.wizardChecklistRow}>
              <div>
                <div className={styles.fieldLabel}>LED path</div>
                <div className={styles.note}>{chipset} · {String(props.colorOrder ?? 'GRB')}</div>
              </div>
              <button
                type="button"
                className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
                onClick={openOutputNode}
                title="Chipset and colour order are set on the LED output node"
              >
                Edit on the Graph
              </button>
            </div>

            <div className={styles.wizardChecklistRow}>
              <div>
                <div className={styles.fieldLabel}>Hardware wiring</div>
                <div className={styles.note}>
                  Data GPIO {dataPin}{spi ? ` · Clock GPIO ${clockPin}` : ''}
                </div>
              </div>
              <button
                type="button"
                className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
                onClick={openHardwareWiring}
              >
                Edit in Hardware
              </button>
            </div>

            <div className={styles.note}>
              {spi
                ? 'SPI chipsets need both a data pin and a clock pin.'
                : 'Clockless chipsets only need the data pin.'}
            </div>

            <div className={styles.note}>
              Controller settings: brightness {controller.brightness} · overclock {controller.overclock.toFixed(2)}× · power cap {controller.powerLimit ? `${controller.volts} V / ${controller.milliamps} mA` : 'off'}.
              Edit these once on the Board in Hardware.
            </div>

            {power && power.ledCount > 0 && (
              <div
                className={styles.powerRow}
                title="Worst-case draw assumes every LED at full white (~60 mA/LED, the typical WS2812-class figure) — real draw is usually well under this."
              >
                {power.ledCount} LEDs · worst case ~{(power.worstCaseMa / 1000).toFixed(1)} A
                {power.configuredMa != null
                  ? ` · capped at ${(power.configuredMa / 1000).toFixed(1)} A${power.exceedsConfigured ? ' (bright scenes dim to fit)' : ''}`
                  : ` · recommended PSU ≥ ${(power.recommendedMa / 1000).toFixed(1)} A`}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className={styles.wizardSection}>
            <div className={styles.wizardSummary}>
              <div className={styles.wizardSummaryRow}><span>Target</span><strong>{board?.label ?? 'No board'} · {port.text}</strong></div>
              <div className={styles.wizardSummaryRow}><span>LED output</span><strong>{LED_OUTPUT_FORM_LABELS[form]} · {outputSizeLabel(props)}{linear ? '' : ` · ${layout}`}</strong></div>
              <div className={styles.wizardSummaryRow}><span>LED path</span><strong>{chipset} · {String(props.colorOrder ?? 'GRB')}</strong></div>
              <div className={styles.wizardSummaryRow}><span>Controller</span><strong>{controller.brightness} brightness · {controller.powerLimit ? `${controller.volts} V / ${controller.milliamps} mA cap` : 'power cap off'}</strong></div>
              <div className={styles.wizardSummaryRow}><span>Graph ready</span><strong>{hasFrameInput ? 'Frame connected' : 'Connect a pattern to the LED output'}</strong></div>
            </div>

            <button
              className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
              disabled={!uploadReady || busy || layoutErrors.length > 0}
              onClick={handleFlashWiringTest}
              title={!uploadReady ? 'Finish board and port setup first' : layoutErrors.join('\n') || 'Flash a wiring test to confirm the LED output before uploading a creative sketch'}
            >
              <Icon name="flask" /> Flash wiring test
            </button>

            {form === 'hub75' && (
              <button
                className={`${styles.wizardButtonBase} ${styles.exportBtn} ${styles.topologyBtn}`}
                disabled={!uploadReady || busy || hub75TopologyErrors.length > 0}
                onClick={handleFlashHub75Topology}
                title={hub75TopologyErrors.join('\n') || 'Hold per-panel coordinates, orientation corners, rotation labels, and chain arrows for this folded HUB75 grid'}
              >
                <Icon name="compass" /> Flash HUB75 topology
              </button>
            )}

            <button
              className={`${styles.wizardButtonBase} ${styles.uploadBtn}`}
              onClick={handleOpenUpload}
              title="Close the wizard and open the upload, export, diagnostics, and streaming tools"
            >
              <Icon name="upload" /> Open upload tools
            </button>
          </div>
        )}

        <div className={styles.wizardFooter}>
          <button className={`${styles.wizardButtonBase} ${styles.exportBtn}`} onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button className={`${styles.wizardButtonBase} ${styles.boardBtn}`} onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}>
              Next
            </button>
          ) : (
            <button className={`${styles.wizardButtonBase} ${styles.boardBtn}`} onClick={closeSetupWizard}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
