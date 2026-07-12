import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../../state/uiStore'
import { useGraphStore, useTemporalStore } from '../../state/graphStore'
import { useAudioStore } from '../../state/audioStore'
import { useShowPlayback } from '../../state/showPlayback'
import { useProjectStore } from '../../state/projectStore'
import type { StudioNode, StudioEdge, WorkspaceExtras } from '../../state/graphStore'
import { captureWorkspace, blankWorkspace } from '../../state/workspacePersistence'
import {
  buildProjectSnapshot,
  nextDefaultProjectName,
  openProjectWithNativePicker,
  parseProjectFile,
  projectFileBaseName,
  saveProjectWithNativePicker,
  serializeProject,
  suggestProjectFileName,
} from '../../utils/projectFileIO'
import { openProjectDialog, saveProjectWithDialog } from '../../utils/backendClient'
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
    requestNewProjectDecision,
  } = useUiStore()

  const THEME_ICON: Record<string, string> = { dark: '☾', solarized: '✦', light: '☀' }
  const THEME_LABEL: Record<string, string> = { dark: 'Dark', solarized: 'Solarized', light: 'Light' }
  const importInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const fileMenuRef = useRef<HTMLDivElement>(null)
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const hasMicNode = useGraphStore((s) =>
    s.nodes.some((n) => (n.data as { nodeType?: string }).nodeType === 'MicInput')
  )
  const micActive = useAudioStore((s) => s.micActive)
  const startAudio = useAudioStore((s) => s.startAudio)
  const stopAudio = useAudioStore((s) => s.stopAudio)
  const showPlaying = useShowPlayback((s) => s.playing)

  const { undo, redo, pastStates, futureStates } = useTemporalStore((s) => s)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const projects = useProjectStore((s) => s.projects)
  const recentProjectIds = useProjectStore((s) => s.recentProjectIds)
  const currentProject = projects.find((project) => project.id === currentProjectId) ?? projects[0]
  const recentProjects = recentProjectIds
    .map((projectId) => projects.find((project) => project.id === projectId))
    .filter((project): project is NonNullable<typeof project> => !!project)
  const canUndo = pastStates.length > 0
  const canRedo = futureStates.length > 0
  const effectiveReducedMotion = reducedMotion || !uiEffectsEnabled
  const effectivePreview3d = uiEffectsEnabled && preview3d
  const effectivePreviewStyle = uiEffectsEnabled ? previewStyle : 'standard'

  useEffect(() => {
    if (!fileMenuOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFileMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [fileMenuOpen])

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

  const handleLoadJSON = () => importInputRef.current?.click()
  const handleOpenProjectFallback = () => projectInputRef.current?.click()

  const saveIntoCurrentProject = () => {
    if (!currentProject) {
      setStatus('No project open — use New Project or Save As first', 'info')
      return false
    }
    useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
    setStatus(`Saved project "${currentProject.name}"`, 'success')
    return true
  }

  const confirmReplaceUnsavedWorkspace = (message: string) => {
    if (currentProject) return true
    if (useGraphStore.getState().nodes.length === 0) return true
    return window.confirm(message)
  }

  const loadProjectWorkspace = (projectId: string) => {
    const next = useProjectStore.getState().switchProject(projectId)
    if (!next) return false
    const { nodes, edges, graphData, graphs, activeGraphId } = next.workspace
    useGraphStore.getState().loadGraph(nodes, edges, { graphData, graphs, activeGraphId })
    useGraphStore.temporal.getState().clear()
    setStatus(`Opened project "${next.name}"`, 'success')
    return true
  }

  const createNewProjectWithFileDialog = async (saveCurrentFirst: boolean) => {
    const defaultName = nextDefaultProjectName(projects.map((project) => project.name))
    const draft = buildProjectSnapshot(blankWorkspace(), { name: defaultName })
    try {
      const saved = await saveProjectWithNativePicker(draft) ?? await saveProjectWithDialog(draft)
      if (!saved) throw new Error('Native picker unavailable')
      if (saveCurrentFirst && currentProject) {
        useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
      }
      const project = useProjectStore.getState().upsertProject(saved)
      useGraphStore.getState().loadGraph([], [])
      useGraphStore.temporal.getState().clear()
      setStatus(`Created project "${project.name}"`, 'success')
      return true
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false
      const blob = new Blob([serializeProject(draft)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = suggestProjectFileName(draft.name)
      a.click()
      URL.revokeObjectURL(url)
      if (saveCurrentFirst && currentProject) {
        useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
      }
      const project = useProjectStore.getState().upsertProject(draft)
      useGraphStore.getState().loadGraph([], [])
      useGraphStore.temporal.getState().clear()
      setStatus(`Created project "${project.name}"`, 'success')
      return true
    }
  }

  const openParsedProject = async (projectText: string, fallbackName: string) => {
    const project = parseProjectFile(projectText, fallbackName)
    if (!currentProject && !confirmReplaceUnsavedWorkspace('Open a project file? The current unsaved graph will be replaced.')) {
      return false
    }
    if (currentProject) useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
    const opened = useProjectStore.getState().upsertProject(project)
    const { nodes, edges, graphData, graphs, activeGraphId } = opened.workspace
    useGraphStore.getState().loadGraph(nodes, edges, { graphData, graphs, activeGraphId })
    useGraphStore.temporal.getState().clear()
    setStatus(`Opened project "${opened.name}"`, 'success')
    return true
  }

  const handleNewProject = () => {
    setFileMenuOpen(false)
    void (async () => {
      const decision = currentProject ? await requestNewProjectDecision(currentProject.name) : 'no'
      if (decision === 'cancel') return
      await createNewProjectWithFileDialog(decision === 'yes')
    })()
  }

  const handleSaveAs = () => {
    setFileMenuOpen(false)
    const workspace = captureWorkspace(useGraphStore.getState())
    if (currentProject) useProjectStore.getState().saveCurrentWorkspace(workspace)
    const draft = buildProjectSnapshot(workspace, {
      sourceProject: currentProject,
      name: currentProject ? `${currentProject.name} Copy` : `Project ${projects.length + 1}`,
      duplicate: true,
    })
    void (async () => {
      try {
        const saved = await saveProjectWithNativePicker(draft) ?? await saveProjectWithDialog(draft)
        if (!saved) throw new Error('Native picker unavailable')
        const project = useProjectStore.getState().upsertProject(saved)
        setStatus(`Saved as "${project.name}"`, 'success')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        const blob = new Blob([serializeProject(draft)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = suggestProjectFileName(draft.name)
        a.click()
        URL.revokeObjectURL(url)
        const project = useProjectStore.getState().upsertProject(draft)
        setStatus(`Saved as "${project.name}"`, 'success')
      }
    })()
  }

  const handleOpenProject = () => {
    setFileMenuOpen(false)
    void (async () => {
      try {
        const picked = await openProjectWithNativePicker()
        if (picked) {
          try {
            await openParsedProject(await picked.file.text(), picked.fallbackName)
          } catch {
            setStatus('Failed to open project — invalid file', 'error')
          }
          return
        }
        const backendPicked = await openProjectDialog()
        if (backendPicked) {
          try {
            await openParsedProject(backendPicked.text, projectFileBaseName(backendPicked.name))
          } catch {
            setStatus('Failed to open project — invalid file', 'error')
          }
          return
        }
        handleOpenProjectFallback()
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        handleOpenProjectFallback()
      }
    })()
  }

  const handleOpenRecentProject = (projectId: string) => {
    setFileMenuOpen(false)
    if (projectId === currentProjectId) return
    if (!currentProject && !confirmReplaceUnsavedWorkspace('Open a saved project? The current unsaved graph will be replaced.')) return
    if (currentProject) useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
    loadProjectWorkspace(projectId)
  }

  const handleProjectFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    void (async () => {
      try {
        await openParsedProject(await file.text(), projectFileBaseName(file.name))
      } catch {
        setStatus('Failed to open project — invalid file', 'error')
      } finally {
        e.target.value = ''
      }
    })()
  }

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
      <div className={styles.menuWrap} ref={fileMenuRef}>
        <button
          className={`${styles.btn} ${fileMenuOpen ? styles.btnActive : ''}`}
          onClick={() => setFileMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={fileMenuOpen}
          aria-label="File menu"
          title="File menu"
        >
          File
        </button>
        {fileMenuOpen && (
          <>
            <button
              type="button"
              className={styles.menuBackdrop}
              aria-label="Close file menu"
              onClick={() => setFileMenuOpen(false)}
            />
            <div className={styles.menu} role="menu" aria-label="File">
              <button className={styles.menuItem} role="menuitem" onClick={handleNewProject}>
                New Project
              </button>
              <button className={styles.menuItem} role="menuitem" onClick={handleOpenProject}>
                Open Project…
              </button>
              <button className={styles.menuItem} role="menuitem" onClick={() => { setFileMenuOpen(false); saveIntoCurrentProject() }} disabled={!currentProject}>
                Save
              </button>
              <button className={styles.menuItem} role="menuitem" onClick={handleSaveAs}>
                Save As…
              </button>
              <div className={styles.menuDivider} />
              <div className={styles.menuLabel}>Recent Projects</div>
              {recentProjects.length > 0 ? recentProjects.map((project) => (
                <button
                  key={project.id}
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => handleOpenRecentProject(project.id)}
                  title={`Open ${project.name}`}
                >
                  {project.name}
                </button>
              )) : (
                <div className={styles.menuEmpty}>No recent projects yet</div>
              )}
              <div className={styles.menuDivider} />
              <button className={styles.menuItem} role="menuitem" onClick={() => { setFileMenuOpen(false); handleLoadJSON() }}>
                Import JSON…
              </button>
              <button className={styles.menuItem} role="menuitem" onClick={() => { setFileMenuOpen(false); handleSaveJSON() }}>
                Export JSON…
              </button>
              <button className={styles.menuItem} role="menuitem" onClick={() => { setFileMenuOpen(false); openTemplates() }}>
                Starter Templates…
              </button>
              <button className={styles.menuItem} role="menuitem" onClick={() => { setFileMenuOpen(false); handleShare() }}>
                Copy Share Link
              </button>
              <button className={styles.menuItem} role="menuitem" onClick={() => { setFileMenuOpen(false); openRecover() }}>
                Recover Workspace…
              </button>
            </div>
          </>
        )}
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
        <input
          ref={projectInputRef}
          type="file"
          accept=".json,.fastled-project.json"
          style={{ display: 'none' }}
          onChange={handleProjectFileChange}
        />
        <input
          ref={importInputRef}
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
