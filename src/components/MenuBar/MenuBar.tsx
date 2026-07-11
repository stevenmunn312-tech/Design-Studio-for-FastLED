import { useRef } from 'react'
import { useUiStore } from '../../state/uiStore'
import { useGraphStore, useTemporalStore } from '../../state/graphStore'
import { useAudioStore } from '../../state/audioStore'
import { useShowPlayback } from '../../state/showPlayback'
import type { StudioNode, StudioEdge, WorkspaceExtras } from '../../state/graphStore'
import { runTidy } from '../../utils/tidyGraph'
import { buildShareUrl } from '../../utils/shareGraph'
import { DevPerformanceHudToggle } from '../Preview/DevPerformanceHud'
import { isDiffusedStyle, previewStyleLabel } from '../Preview/previewStyles'
import styles from './MenuBar.module.css'

const MIC_BLOCKED_MESSAGE = 'Microphone is disabled while a performance is playing music. Stop the player to enable the microphone.'

export default function MenuBar() {
  const {
    setStatus,
    theme,
    cycleTheme,
    reducedMotion,
    toggleReducedMotion,
    highContrast,
    toggleHighContrast,
    performanceMode,
    togglePerformanceMode,
    uiEffectsEnabled,
    toggleUiEffects,
    signalPathDimEnabled,
    toggleSignalPathDim,
    stageMode,
    setStageMode,
    preview3d,
    togglePreview3d,
    previewStyle,
    cyclePreviewStyle,
    openHelp,
    openRecover,
    openTemplates,
  } = useUiStore()

  const THEME_ICON: Record<string, string> = { dark: '☾', solarized: '✦', light: '☀' }
  const THEME_LABEL: Record<string, string> = { dark: 'Dark', solarized: 'Solarized', light: 'Light' }
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasMicNode = useGraphStore((s) =>
    s.nodes.some((n) => (n.data as { nodeType?: string }).nodeType === 'MicInput')
  )
  const micActive = useAudioStore((s) => s.micActive)
  const startAudio = useAudioStore((s) => s.startAudio)
  const stopAudio = useAudioStore((s) => s.stopAudio)
  const showPlaying = useShowPlayback((s) => s.playing)

  const { undo, redo, pastStates, futureStates } = useTemporalStore((s) => s)
  const canUndo = pastStates.length > 0
  const canRedo = futureStates.length > 0
  const effectiveReducedMotion = reducedMotion || !uiEffectsEnabled
  const effectivePreview3d = uiEffectsEnabled && preview3d
  const effectivePreviewStyle = uiEffectsEnabled ? previewStyle : 'standard'

  const toggleMic = () => {
    if (!micActive && showPlaying) {
      window.alert(MIC_BLOCKED_MESSAGE)
      setStatus(MIC_BLOCKED_MESSAGE, 'info')
      return
    }
    if (micActive) stopAudio()
    else startAudio().catch(() => {})
  }

  const handleSaveJSON = () => {
    // Export the whole workspace so pattern-group subgraphs travel with the file.
    const { nodes, edges, graphData, graphs, activeGraphId } = useGraphStore.getState()
    const json = JSON.stringify({ nodes, edges, graphData, graphs, activeGraphId }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fastled-studio-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setStatus('Graph exported', 'success')
  }

  const handleShare = async () => {
    const { nodes, edges, graphData, graphs, activeGraphId } = useGraphStore.getState()
    const url = buildShareUrl({ nodes, edges, graphData, graphs, activeGraphId })
    try {
      await navigator.clipboard.writeText(url)
      setStatus('Share link copied to clipboard', 'success')
    } catch {
      window.prompt('Copy this share link:', url)
    }
  }

  const handleLoadJSON = () => fileInputRef.current?.click()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (useGraphStore.getState().nodes.length > 0) {
      const ok = window.confirm(
        'Loading a graph replaces your current workspace. Any unsaved work will be lost. Continue?'
      )
      if (!ok) {
        e.target.value = ''
        return
      }
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const { nodes, edges, graphData, graphs, activeGraphId } = JSON.parse(ev.target?.result as string) as
          { nodes: StudioNode[]; edges: StudioEdge[] } & WorkspaceExtras
        useGraphStore.getState().loadGraph(nodes, edges, { graphData, graphs, activeGraphId })
        useGraphStore.temporal.getState().clear()
        setStatus('Graph loaded', 'success')
      } catch {
        setStatus('Failed to load graph — invalid file', 'error')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <header className={styles.menubar}>
      <div className={styles.brand}>
        <span className={styles.logo}>⬡</span>
        <div className={styles.brandCopy}>
          <span className={styles.title}>FastLED Studio</span>
          <span className={styles.subtitle}>Lighting console</span>
        </div>
      </div>
      <nav className={styles.nav}>
        <button
          className={styles.btn}
          onClick={() => undo()}
          disabled={!canUndo}
          aria-label={`Undo, ${pastStates.length} step${pastStates.length !== 1 ? 's' : ''} available`}
          title={`Undo (Ctrl+Z) — ${pastStates.length} step${pastStates.length !== 1 ? 's' : ''}`}
        >
          ↩ Undo {pastStates.length > 0 ? pastStates.length : ''}
        </button>
        <button
          className={styles.btn}
          onClick={() => redo()}
          disabled={!canRedo}
          aria-label={`Redo, ${futureStates.length} step${futureStates.length !== 1 ? 's' : ''} available`}
          title={`Redo (Ctrl+Y) — ${futureStates.length} step${futureStates.length !== 1 ? 's' : ''}`}
        >
          ↪ Redo {futureStates.length > 0 ? futureStates.length : ''}
        </button>
        <button
          className={styles.btn}
          onClick={() => runTidy()}
          aria-label="Tidy graph layout"
          title="Auto-arrange nodes into tidy columns (select 2+ nodes to tidy just those)"
        >
          ▦ Tidy
        </button>
        <div className={styles.sep} />
        <button className={styles.btn} onClick={handleSaveJSON} aria-label="Export graph as JSON" title="Export graph as JSON (Ctrl+S)">
          ↓ Save
        </button>
        <button className={styles.btn} onClick={handleLoadJSON} aria-label="Import graph from JSON" title="Import graph from JSON">
          ↑ Load
        </button>
        <button className={styles.btn} onClick={openTemplates} aria-label="Load a starter template" title="Load a starter template">
          ✦ Templates
        </button>
        <button className={styles.btn} onClick={handleShare} aria-label="Copy share link" title="Copy a shareable link that reproduces this graph">
          ⇗ Share
        </button>
        <button className={styles.btn} onClick={openRecover} aria-label="Recover a previous workspace" title="Recover a previous workspace from a rolling snapshot">
          ⟲ Recover
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <div className={styles.sep} />
        <button
          className={styles.btn}
          onClick={cycleTheme}
          aria-label={`Theme: ${THEME_LABEL[theme]}. Click to cycle theme`}
          title={`Theme: ${THEME_LABEL[theme]} (click to cycle)`}
        >
          {THEME_ICON[theme]} {THEME_LABEL[theme]}
        </button>
        <button
          className={`${styles.btn} ${effectiveReducedMotion ? styles.btnActive : ''}`}
          onClick={toggleReducedMotion}
          aria-label="Toggle reduced motion"
          aria-pressed={effectiveReducedMotion}
          title={uiEffectsEnabled ? 'Toggle reduced motion' : 'Forced on while UI FX are off'}
          disabled={!uiEffectsEnabled}
        >
          {effectiveReducedMotion ? '⏸' : '▶'} Motion
        </button>
        <button
          className={`${styles.btn} ${highContrast ? styles.btnActive : ''}`}
          onClick={toggleHighContrast}
          aria-label="Toggle high contrast"
          aria-pressed={highContrast}
          title="Toggle high contrast"
        >
          ◑ Contrast
        </button>
        <button
          className={`${styles.btn} ${performanceMode ? styles.btnActive : ''}`}
          onClick={togglePerformanceMode}
          aria-label="Toggle performance mode"
          aria-pressed={performanceMode}
          title="Performance mode: hush chrome and emphasize live signal flow"
        >
          {performanceMode ? '◆' : '◇'} Perform
        </button>
        <button
          className={`${styles.btn} ${!uiEffectsEnabled ? styles.btnActive : ''}`}
          onClick={toggleUiEffects}
          aria-label="Toggle extra UI effects"
          aria-pressed={!uiEffectsEnabled}
          title={uiEffectsEnabled ? 'Disable extra UI effects' : 'Enable extra UI effects'}
        >
          {uiEffectsEnabled ? 'FX On' : 'FX Off'}
        </button>
        <button
          className={`${styles.btn} ${!signalPathDimEnabled ? styles.btnActive : ''}`}
          onClick={toggleSignalPathDim}
          aria-label="Toggle signal path dimming"
          aria-pressed={!signalPathDimEnabled}
          title={signalPathDimEnabled ? 'Disable dimming unrelated nodes on selection' : 'Enable dimming unrelated nodes on selection'}
        >
          {signalPathDimEnabled ? 'Dim On' : 'Dim Off'}
        </button>
        <div className={styles.sep} />
        <button
          className={styles.btn}
          onClick={openHelp}
          aria-label="Open help"
          title="Help (shortcuts, nodes, upload guide) — press ?"
        >
          ? Help
        </button>
      </nav>
      {!stageMode && (
        <div className={styles.previewControls}>
          {import.meta.env.DEV && <DevPerformanceHudToggle />}
          <button
            className={`${styles.btn} ${styles.stageBtn} ${stageMode ? styles.btnStageActive : ''}`}
            onClick={() => setStageMode(!stageMode)}
            aria-label="Toggle stage mode"
            aria-pressed={stageMode}
            title={stageMode ? 'Exit Stage Mode (Esc or F10)' : 'Enter Stage Mode (F10)'}
          >
            Stage
          </button>
          <button
            className={`${styles.btn} ${styles.previewBtn} ${effectivePreview3d ? styles.btnPreviewActive : ''}`}
            onClick={togglePreview3d}
            aria-label="Toggle 3D preview"
            aria-pressed={effectivePreview3d}
            title={
              !uiEffectsEnabled
                ? 'Disabled while UI FX are off'
                : effectivePreview3d ? 'Switch to 2D view' : 'Switch to 3D view (drag to orbit)'
            }
            disabled={!uiEffectsEnabled}
          >
            {effectivePreview3d ? '3D On' : '3D Off'}
          </button>
          <button
            className={`${styles.btn} ${styles.styleBtn} ${isDiffusedStyle(effectivePreviewStyle) ? styles.btnStyleActive : ''}`}
            onClick={cyclePreviewStyle}
            title={uiEffectsEnabled ? 'Cycle preview style' : 'Forced to Standard while UI FX are off'}
            disabled={!uiEffectsEnabled}
          >
            {previewStyleLabel(effectivePreviewStyle)}
          </button>
          <button
            className={`${styles.btn} ${styles.micBtn} ${micActive ? styles.btnMicActive : ''}`}
            onClick={toggleMic}
            disabled={!hasMicNode}
            aria-label="Toggle microphone preview input"
            aria-pressed={micActive}
            title={
              !hasMicNode
                ? 'Add a MicInput node to enable the microphone'
                : !micActive && showPlaying
                  ? 'Microphone is disabled while a performance is playing music'
                  : micActive ? 'Stop microphone' : 'Start microphone'
            }
          >
            {micActive ? 'Mic On' : 'Mic Off'}
          </button>
        </div>
      )}
    </header>
  )
}
