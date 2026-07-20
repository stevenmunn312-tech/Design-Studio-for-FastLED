import { useMemo, useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { BOARDS, boardByFqbn, engineReady, useUploadStore } from '../../state/uploadStore'
import { CHIPSET_OPTIONS, COLOR_ORDER_OPTIONS, SPI_CHIPSETS } from '../../state/nodeLibrary'
import { validateMatrixLayout } from '../../state/xyLayout'
import { generateWiringDiagnosticSketch } from '../../codegen/wiringDiagnosticGenerator'
import { estimatePowerLoad } from '../../utils/validateGraph'
import styles from './Upload.module.css'

const STEPS = [
  { key: 'controller', title: 'Controller', blurb: 'Pick the board, port, and build path.' },
  { key: 'matrix', title: 'Matrix', blurb: 'Set the shape of the LEDs you want to drive.' },
  { key: 'leds', title: 'LEDs', blurb: 'Match the strip type, color order, and wiring pins.' },
  { key: 'finish', title: 'Finish', blurb: 'Check power options, PSRAM, and run a wiring test.' },
] as const

const SIZE_PRESETS = [
  { label: '8 × 8', width: 8, height: 8 },
  { label: '16 × 16', width: 16, height: 16 },
  { label: '16 × 32', width: 16, height: 32 },
  { label: '32 × 8', width: 32, height: 8 },
  { label: '32 × 32', width: 32, height: 32 },
] as const

function clampInt(value: string, fallback: number, min = 1, max = 999) {
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function clampFloat(value: string, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export default function MatrixOutputSetupWizard() {
  const [step, setStep] = useState(0)
  const { nodes, edges, updateNodeProperty, updateNodeProperties } = useGraphStore()
  const {
    helper,
    ports,
    installedCores,
    myBoards,
    selectedFqbn,
    selectedPort,
    busy,
    refreshPorts,
    refreshHelper,
    installCore,
    setSelectedFqbn,
    setSelectedPort,
    setMyBoards,
    openBoardPopup,
    openCliPopup,
    closeSetupWizard,
    runUpload, activeOutputNodeId,
  } = useUploadStore()

  const node = nodes.find((n) => n.id === activeOutputNodeId && n.data.nodeType === 'MatrixOutput')
    ?? nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  const nodeId = node?.id ?? null
  const props = ((node?.data.properties ?? {}) as Record<string, unknown>)

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
  const usingFbuild = helper?.engine === 'fbuild'
  const activeEngineReady = engineReady(helper)
  const portLabel = ports.find((p) => p.address === selectedPort)?.label ?? selectedPort
  const portDetected = !!selectedPort && ports.some((p) => p.address === selectedPort)
  const coreReady = !!board && (usingFbuild || installedCores.includes(board.core))
  const uploadReady = !!helper && activeEngineReady && coreReady && portDetected
  const ledCount = width * height
  const layoutErrors = useMemo(
    () => validateMatrixLayout(width, height, { layout, tilesX, tilesY, tileSerpentine, tileRotations, customXYMap }),
    [width, height, layout, tilesX, tilesY, tileSerpentine, tileRotations, customXYMap],
  )
  const power = useMemo(() => estimatePowerLoad(nodes), [nodes])
  const hasFrameInput = !!nodeId && edges.some((e) => e.target === nodeId && e.targetHandle === 'frame')

  if (!nodeId) return null
  const matrixNodeId = nodeId

  function chooseBoard(fqbn: string) {
    if (!myBoards.includes(fqbn)) setMyBoards([...myBoards, fqbn])
    setSelectedFqbn(fqbn)
  }

  function applySize(nextWidth: number, nextHeight: number) {
    updateNodeProperties(matrixNodeId, { width: nextWidth, height: nextHeight })
  }

  function handleFlashWiringTest() {
    const sketch = generateWiringDiagnosticSketch(nodes, matrixNodeId)
    if (sketch) void runUpload(sketch, undefined, { cache: false })
  }

  function openAdvancedBoardManager() {
    openBoardPopup()
  }

  return (
    <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) closeSetupWizard() }}>
      <div className={`${styles.popup} ${styles.wizardPopup}`} role="dialog" aria-label="Matrix Output setup wizard">
        <div className={styles.popupHeader}>
          <div>
            <div className={styles.wizardKicker}>Setup wizard</div>
            <div className={styles.wizardTitle}>Matrix Output</div>
          </div>
          <button className={styles.closeBtn} onClick={closeSetupWizard} title="Close">×</button>
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
              <span className={styles.targetChip}>{board?.label ?? 'No board selected'}</span>
              <span className={styles.targetChip}>{portLabel || 'No port selected'}</span>
              <span className={`${styles.targetChip} ${uploadReady ? styles.readyBadge : styles.missingBadge}`}>
                {uploadReady ? 'Ready' : 'Needs setup'}
              </span>
            </div>

            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Board</span>
              <select className={styles.select} value={selectedFqbn} onChange={(e) => chooseBoard(e.target.value)}>
                {BOARDS.map((item) => <option key={item.fqbn} value={item.fqbn}>{item.label}</option>)}
              </select>
            </label>

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
                <button className={styles.refreshBtn} onClick={refreshPorts} disabled={!activeEngineReady} title="Refresh ports">↻</button>
              </div>
            </label>

            <div className={styles.wizardChecklist}>
              <div className={styles.wizardChecklistRow}>
                <span className={styles.wizardChecklistLabel}>Helper</span>
                <span className={helper ? styles.readyBadge : styles.missingBadge}>{helper ? 'Ready' : 'Missing'}</span>
              </div>
              {!helper && (
                <button className={`${styles.wizardButtonBase} ${styles.readinessAction}`} onClick={() => { void refreshHelper() }}>
                  Retry helper
                </button>
              )}

              <div className={styles.wizardChecklistRow}>
                <span className={styles.wizardChecklistLabel}>Build engine</span>
                <span className={activeEngineReady ? styles.readyBadge : styles.missingBadge}>
                  {activeEngineReady ? (usingFbuild ? 'fbuild' : 'arduino-cli') : 'Fix needed'}
                </span>
              </div>
              {!activeEngineReady && helper && (
                <button className={`${styles.wizardButtonBase} ${styles.readinessAction}`} onClick={openCliPopup}>
                  Fix engine
                </button>
              )}

              <div className={styles.wizardChecklistRow}>
                <span className={styles.wizardChecklistLabel}>Toolchain</span>
                <span className={coreReady ? styles.readyBadge : styles.missingBadge}>
                  {coreReady ? 'Ready' : usingFbuild ? 'Downloads on first build' : 'Install core'}
                </span>
              </div>
              {!usingFbuild && helper && board && !coreReady && (
                <button className={`${styles.wizardButtonBase} ${styles.readinessAction}`} onClick={() => { void installCore(board.core) }} disabled={busy}>
                  Install {board.label} core
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
            <div className={styles.wizardSummary}>
              <div className={styles.wizardSummaryRow}><span>Layout</span><strong>{width} × {height}</strong></div>
              <div className={styles.wizardSummaryRow}><span>Total LEDs</span><strong>{ledCount}</strong></div>
            </div>

            <div className={styles.presetGrid}>
              {SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  className={`${styles.wizardButtonBase} ${styles.presetBtn} ${preset.width === width && preset.height === height ? styles.presetBtnActive : ''}`}
                  onClick={() => applySize(preset.width, preset.height)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className={styles.dualFieldRow}>
              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>Width</span>
                <input
                  className={styles.textInput}
                  type="number"
                  min={1}
                  max={64}
                  value={width}
                  onChange={(e) => updateNodeProperty(matrixNodeId, 'width', clampInt(e.target.value, width, 1, 64))}
                />
              </label>
              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>Height</span>
                <input
                  className={styles.textInput}
                  type="number"
                  min={1}
                  max={64}
                  value={height}
                  onChange={(e) => updateNodeProperty(matrixNodeId, 'height', clampInt(e.target.value, height, 1, 64))}
                />
              </label>
            </div>

            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Layout</span>
              <select className={styles.select} value={layout} onChange={(e) => updateNodeProperty(matrixNodeId, 'layout', e.target.value)}>
                <option value="matrix">Matrix</option>
                <option value="strip">Strip</option>
                <option value="panels">Panels</option>
                <option value="custom">Custom map</option>
              </select>
            </label>

            <label className={styles.checkField}>
              <input
                type="checkbox"
                checked={props.serpentine === true}
                onChange={(e) => updateNodeProperty(matrixNodeId, 'serpentine', e.target.checked)}
              />
              <span>Pixels snake back and forth</span>
            </label>

            {layout === 'panels' && (
              <>
                <div className={styles.dualFieldRow}>
                  <label className={styles.fieldBlock}>
                    <span className={styles.fieldLabel}>Tiles X</span>
                    <input
                      className={styles.textInput}
                      type="number"
                      min={1}
                      max={8}
                      value={tilesX}
                      onChange={(e) => updateNodeProperty(matrixNodeId, 'tilesX', clampInt(e.target.value, tilesX, 1, 8))}
                    />
                  </label>
                  <label className={styles.fieldBlock}>
                    <span className={styles.fieldLabel}>Tiles Y</span>
                    <input
                      className={styles.textInput}
                      type="number"
                      min={1}
                      max={8}
                      value={tilesY}
                      onChange={(e) => updateNodeProperty(matrixNodeId, 'tilesY', clampInt(e.target.value, tilesY, 1, 8))}
                    />
                  </label>
                </div>
                <label className={styles.checkField}>
                  <input
                    type="checkbox"
                    checked={tileSerpentine}
                    onChange={(e) => updateNodeProperty(matrixNodeId, 'tileSerpentine', e.target.checked)}
                  />
                  <span>Panels snake as a chain</span>
                </label>
                <label className={styles.fieldBlock}>
                  <span className={styles.fieldLabel}>Panel rotations</span>
                  <input
                    className={styles.textInput}
                    value={tileRotations}
                    placeholder="0,90,180,270"
                    onChange={(e) => updateNodeProperty(matrixNodeId, 'tileRotations', e.target.value)}
                  />
                </label>
              </>
            )}

            {layout === 'custom' && (
              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>Custom XY map</span>
                <textarea
                  className={styles.textArea}
                  rows={4}
                  value={customXYMap}
                  placeholder="[0,1,2,3]"
                  onChange={(e) => updateNodeProperty(matrixNodeId, 'customXYMap', e.target.value)}
                />
              </label>
            )}

            {layoutErrors.length > 0 && (
              <div className={styles.streamError}>
                {layoutErrors.map((error) => <div key={error}>{error}</div>)}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className={styles.wizardSection}>
            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Chipset</span>
              <select className={styles.select} value={chipset} onChange={(e) => updateNodeProperty(matrixNodeId, 'chipset', e.target.value)}>
                {CHIPSET_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>

            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Color order</span>
              <select className={styles.select} value={String(props.colorOrder ?? 'GRB')} onChange={(e) => updateNodeProperty(matrixNodeId, 'colorOrder', e.target.value)}>
                {COLOR_ORDER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>

            <div className={styles.dualFieldRow}>
              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>Data pin</span>
                <input
                  className={styles.textInput}
                  type="number"
                  value={dataPin}
                  onChange={(e) => updateNodeProperty(matrixNodeId, 'dataPin', clampInt(e.target.value, dataPin, 0, 99))}
                />
              </label>
              {spi && (
                <label className={styles.fieldBlock}>
                  <span className={styles.fieldLabel}>Clock pin</span>
                  <input
                    className={styles.textInput}
                    type="number"
                    value={clockPin}
                    onChange={(e) => updateNodeProperty(matrixNodeId, 'clockPin', clampInt(e.target.value, clockPin, 0, 99))}
                  />
                </label>
              )}
            </div>

            <div className={styles.note}>
              {spi
                ? 'SPI chipsets need both a data pin and a clock pin.'
                : 'Clockless chipsets only need the data pin.'}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={styles.wizardSection}>
            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Brightness</span>
              <input
                className={styles.rangeInput}
                type="range"
                min={0}
                max={255}
                step={1}
                value={Number(props.brightness ?? 200)}
                onChange={(e) => updateNodeProperty(matrixNodeId, 'brightness', clampInt(e.target.value, Number(props.brightness ?? 200), 0, 255))}
              />
              <div className={styles.rangeValue}>{Number(props.brightness ?? 200)}</div>
            </label>

            <label className={styles.checkField}>
              <input
                type="checkbox"
                checked={props.powerLimit === true}
                onChange={(e) => updateNodeProperty(matrixNodeId, 'powerLimit', e.target.checked)}
              />
              <span>Enable a power cap</span>
            </label>

            {props.powerLimit === true && (
              <div className={styles.dualFieldRow}>
                <label className={styles.fieldBlock}>
                  <span className={styles.fieldLabel}>Volts</span>
                  <input
                    className={styles.textInput}
                    type="number"
                    min={3}
                    max={24}
                    step={1}
                    value={Number(props.volts ?? 5)}
                    onChange={(e) => updateNodeProperty(matrixNodeId, 'volts', clampFloat(e.target.value, Number(props.volts ?? 5), 3, 24))}
                  />
                </label>
                <label className={styles.fieldBlock}>
                  <span className={styles.fieldLabel}>Milliamps</span>
                  <input
                    className={styles.textInput}
                    type="number"
                    min={100}
                    max={20000}
                    step={100}
                    value={Number(props.milliamps ?? 2000)}
                    onChange={(e) => updateNodeProperty(matrixNodeId, 'milliamps', clampInt(e.target.value, Number(props.milliamps ?? 2000), 100, 20000))}
                  />
                </label>
              </div>
            )}

            {power && power.ledCount > 0 && (
              <div
                className={`${styles.powerRow} ${power.exceedsConfigured ? styles.powerWarn : ''}`}
                title="Worst-case draw assumes every LED at full white (~60 mA/LED, the typical WS2812-class figure) — real draw is usually well under this."
              >
                {power.ledCount} LEDs · worst case ~{(power.worstCaseMa / 1000).toFixed(1)} A
                {power.configuredMa != null
                  ? ` · cap ${(power.configuredMa / 1000).toFixed(1)} A${power.exceedsConfigured ? ' ⚠ may exceed cap' : ''}`
                  : ` · recommended PSU ≥ ${(power.recommendedMa / 1000).toFixed(1)} A`}
              </div>
            )}

            <div className={styles.wizardSummary}>
              <div className={styles.wizardSummaryRow}><span>Target</span><strong>{board?.label ?? 'No board'} · {portLabel || 'No port'}</strong></div>
              <div className={styles.wizardSummaryRow}><span>Matrix</span><strong>{width} × {height} · {layout}</strong></div>
              <div className={styles.wizardSummaryRow}><span>LED path</span><strong>{chipset} · {String(props.colorOrder ?? 'GRB')}</strong></div>
              <div className={styles.wizardSummaryRow}><span>Graph ready</span><strong>{hasFrameInput ? 'Frame connected' : 'Connect a frame before upload'}</strong></div>
            </div>

            <button
              className={`${styles.wizardButtonBase} ${styles.uploadBtn}`}
              disabled={!uploadReady || busy || layoutErrors.length > 0}
              onClick={handleFlashWiringTest}
              title={!uploadReady ? 'Finish board and port setup first' : layoutErrors.join('\n') || 'Flash a wiring test to confirm the matrix before uploading a creative sketch'}
            >
              🧪 Flash wiring test
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
