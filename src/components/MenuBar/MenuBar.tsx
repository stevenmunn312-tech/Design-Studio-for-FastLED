import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
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
import { promptTrustIfNeeded } from '../../utils/trustPrompt'
import { DevPerformanceHudToggle } from '../Preview/DevPerformanceHud'
import { isDiffusedStyle, previewStyleLabel } from '../Preview/previewStyles'
import styles from './MenuBar.module.css'

const MIC_BLOCKED_MESSAGE = 'Microphone is disabled while a performance is playing music. Stop the player to enable the microphone.'
const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"]'

const menuItems = (menu: HTMLElement) =>
  Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR))
    .filter((item) => !item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true')

const focusMenuItem = (menu: HTMLElement, direction: 'first' | 'last' | 'next' | 'previous') => {
  const items = menuItems(menu)
  if (items.length === 0) return
  const activeIndex = items.findIndex((item) => item === document.activeElement)
  if (direction === 'first') {
    items[0].focus()
  } else if (direction === 'last') {
    items[items.length - 1].focus()
  } else {
    const offset = direction === 'next' ? 1 : -1
    const currentIndex = activeIndex >= 0 ? activeIndex : direction === 'next' ? -1 : 0
    items[(currentIndex + offset + items.length) % items.length].focus()
  }
}

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
    requestAlert,
    requestConfirm,
    requestNewProjectDecision,
    requestPrompt,
  } = useUiStore()
  const lastStartChoice = useUiStore((s) => s.lastStartChoice)

  const THEME_ICON: Record<string, string> = { dark: '☾', solarized: '✦', light: '☀' }
  const THEME_LABEL: Record<string, string> = { dark: 'Dark', solarized: 'Solarized', light: 'Light' }
  const importInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const fileMenuRef = useRef<HTMLDivElement>(null)
  const viewMenuRef = useRef<HTMLDivElement>(null)
  const fileButtonRef = useRef<HTMLButtonElement>(null)
  const viewButtonRef = useRef<HTMLButtonElement>(null)
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
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
  const startTitle = lastStartChoice === 'blank'
    ? 'Open the start gallery — blank canvas was your last choice'
    : 'Open the start gallery with starter patches and blank canvas'
  const closeMenus = () => {
    setFileMenuOpen(false)
    setViewMenuOpen(false)
  }

  const handleMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>, trigger: RefObject<HTMLButtonElement | null>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Tab'].includes(e.key)) return
    if (e.key === 'Tab') {
      closeMenus()
      return
    }
    e.preventDefault()
    if (e.key === 'Escape') {
      closeMenus()
      trigger.current?.focus()
      return
    }
    if (e.key === 'Home') focusMenuItem(e.currentTarget, 'first')
    else if (e.key === 'End') focusMenuItem(e.currentTarget, 'last')
    else focusMenuItem(e.currentTarget, e.key === 'ArrowDown' ? 'next' : 'previous')
  }

  useEffect(() => {
    if (fileMenuOpen) {
      requestAnimationFrame(() => {
        const menu = fileMenuRef.current?.querySelector<HTMLElement>('[role="menu"]')
        if (menu) focusMenuItem(menu, 'first')
      })
    }
  }, [fileMenuOpen])

  useEffect(() => {
    if (viewMenuOpen) {
      requestAnimationFrame(() => {
        const menu = viewMenuRef.current?.querySelector<HTMLElement>('[role="menu"]')
        if (menu) focusMenuItem(menu, 'first')
      })
    }
  }, [viewMenuOpen])

  useEffect(() => {
    if (!fileMenuOpen && !viewMenuOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [fileMenuOpen, viewMenuOpen])

  const toggleMic = () => {
    if (!micActive && showPlaying) {
      void requestAlert({
        title: 'Microphone unavailable',
        message: MIC_BLOCKED_MESSAGE,
      })
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
    setStatus('Graph JSON exported', 'success')
  }

  const handleShare = async () => {
    const { nodes, edges, graphData, graphs, activeGraphId } = useGraphStore.getState()
    const url = buildShareUrl({ nodes, edges, graphData, graphs, activeGraphId })
    try {
      await navigator.clipboard.writeText(url)
      setStatus('Share link copied to clipboard', 'success')
    } catch {
      await requestPrompt({
        title: 'Share link',
        message: 'Copy this share link:',
        inputLabel: 'Share URL',
        initialValue: url,
        readOnly: true,
        selectText: true,
        monospace: true,
        confirmLabel: 'Close',
        cancelLabel: null,
      })
    }
  }

  const handleLoadJSON = () => importInputRef.current?.click()
  const handleOpenProjectFallback = () => projectInputRef.current?.click()

  const saveIntoCurrentProject = () => {
    if (!currentProject) {
      setStatus('No project open — use New Project or Save Project File As first', 'info')
      return false
    }
    useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
    setStatus(`Saved project "${currentProject.name}"`, 'success')
    return true
  }

  const confirmReplaceUnsavedWorkspace = async (message: string) => {
    if (currentProject) return true
    if (useGraphStore.getState().nodes.length === 0) return true
    return requestConfirm({
      title: 'Replace current workspace?',
      message,
      confirmLabel: 'Replace workspace',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
  }

  const confirmProjectChange = async (destinationLabel: string) => {
    if (currentProject) {
      return requestNewProjectDecision(currentProject.name, 'continuing', destinationLabel)
    }
    const ok = await confirmReplaceUnsavedWorkspace(`Open ${destinationLabel}? The current unsaved graph will be replaced.`)
    return ok ? 'no' : 'cancel'
  }

  const loadProjectWorkspace = (projectId: string, saveCurrentFirst = false) => {
    if (saveCurrentFirst && currentProject) {
      useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
    }
    const next = useProjectStore.getState().switchProject(projectId)
    if (!next) return false
    const { nodes, edges, graphData, graphs, activeGraphId, trusted } = next.workspace
    useGraphStore.getState().loadGraph(nodes, edges, { graphData, graphs, activeGraphId, trusted })
    useGraphStore.temporal.getState().clear()
    setStatus(`Opened project "${next.name}"`, 'success')
    return true
  }

  const createNewProjectWithFileDialog = async (saveCurrentFirst: boolean) => {
    const defaultName = nextDefaultProjectName(projects.map((project) => project.name))
    const draft = buildProjectSnapshot(blankWorkspace(), { name: defaultName })
    try {
      // After the yes/no/cancel prompt resolves, browsers may drop the user
      // activation needed for showSaveFilePicker(). The helper-backed dialog
      // does not have that limitation, so prefer it for new-project creation.
      const saved = await saveProjectWithDialog(draft) ?? await saveProjectWithNativePicker(draft)
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

  const openParsedProject = async (
    projectText: string,
    fallbackName: string,
    options?: { saveCurrentFirst?: boolean; confirmedReplace?: boolean },
  ) => {
    const project = parseProjectFile(projectText, fallbackName)
    if (!options?.confirmedReplace && !currentProject && !await confirmReplaceUnsavedWorkspace('Open a project file? The current unsaved graph will be replaced.')) {
      return false
    }
    if (options?.saveCurrentFirst && currentProject) {
      useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
    }
    const opened = useProjectStore.getState().upsertProject(project)
    const { nodes, edges, graphData, graphs, activeGraphId, trusted } = opened.workspace
    useGraphStore.getState().loadGraph(nodes, edges, { graphData, graphs, activeGraphId, trusted })
    useGraphStore.temporal.getState().clear()
    setStatus(`Opened project "${opened.name}"`, 'success')
    void promptTrustIfNeeded()
    return true
  }

  const handleNewProject = () => {
    closeMenus()
    void (async () => {
      const decision = currentProject
        ? await requestNewProjectDecision(currentProject.name, 'creating a new project', 'a new blank project')
        : 'no'
      if (decision === 'cancel') return
      await createNewProjectWithFileDialog(decision === 'yes')
    })()
  }

  const handleSaveAs = () => {
    closeMenus()
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
    closeMenus()
    void (async () => {
      try {
        const picked = await openProjectWithNativePicker()
        if (picked) {
          const decision = await confirmProjectChange(`project "${picked.fallbackName}"`)
          if (decision === 'cancel') return
          try {
            await openParsedProject(await picked.file.text(), picked.fallbackName, {
              saveCurrentFirst: decision === 'yes',
              confirmedReplace: true,
            })
          } catch {
            setStatus('Failed to open project file — invalid file', 'error')
          }
          return
        }
        const backendPicked = await openProjectDialog()
        if (backendPicked) {
          const decision = await confirmProjectChange(`project "${projectFileBaseName(backendPicked.name)}"`)
          if (decision === 'cancel') return
          try {
            await openParsedProject(backendPicked.text, projectFileBaseName(backendPicked.name), {
              saveCurrentFirst: decision === 'yes',
              confirmedReplace: true,
            })
          } catch {
            setStatus('Failed to open project file — invalid file', 'error')
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
    closeMenus()
    void (async () => {
      if (projectId === currentProjectId) return
      const projectName = projects.find((project) => project.id === projectId)?.name ?? 'selected project'
      const decision = await confirmProjectChange(`project "${projectName}"`)
      if (decision === 'cancel') return
      loadProjectWorkspace(projectId, decision === 'yes')
    })()
  }

  const handleProjectFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    void (async () => {
      try {
        const decision = await confirmProjectChange(`project "${projectFileBaseName(file.name)}"`)
        if (decision === 'cancel') return
        await openParsedProject(await file.text(), projectFileBaseName(file.name), {
          saveCurrentFirst: decision === 'yes',
          confirmedReplace: true,
        })
      } catch {
        setStatus('Failed to open project file — invalid file', 'error')
      } finally {
        e.target.value = ''
      }
    })()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    void (async () => {
      if (useGraphStore.getState().nodes.length > 0) {
        const ok = await requestConfirm({
          title: 'Replace current workspace?',
          message: 'Importing Graph JSON replaces your current project workspace. Any unsaved work will be lost. Continue?',
          confirmLabel: 'Import Graph JSON',
          cancelLabel: 'Cancel',
          tone: 'danger',
        })
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
          // Never trust an imported file's own `trusted` claim — force it
          // false regardless of what the JSON says (todo.md's P0 trust item).
          useGraphStore.getState().loadGraph(nodes, edges, { graphData, graphs, activeGraphId, trusted: false })
          useGraphStore.temporal.getState().clear()
          setStatus('Graph JSON imported', 'success')
          void promptTrustIfNeeded()
        } catch {
          setStatus('Failed to import Graph JSON — invalid file', 'error')
        }
      }
      reader.readAsText(file)
      e.target.value = ''
    })()
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
          ref={fileButtonRef}
          className={`${styles.btn} ${fileMenuOpen ? styles.btnActive : ''}`}
          onClick={() => {
            setViewMenuOpen(false)
            setFileMenuOpen((open) => !open)
          }}
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
              onClick={closeMenus}
            />
            <div className={styles.menu} role="menu" aria-label="File" onKeyDown={(e) => handleMenuKeyDown(e, fileButtonRef)}>
              <button className={styles.menuItem} role="menuitem" onClick={handleNewProject}>
                New Project
              </button>
              <button className={styles.menuItem} role="menuitem" onClick={handleOpenProject}>
                Open Project File…
              </button>
              <button className={styles.menuItem} role="menuitem" onClick={() => { closeMenus(); saveIntoCurrentProject() }} disabled={!currentProject}>
                Save Project
              </button>
              <button className={styles.menuItem} role="menuitem" onClick={handleSaveAs}>
                Save Project File As…
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
              <button className={styles.menuItem} role="menuitem" onClick={() => { closeMenus(); handleLoadJSON() }}>
                Import Graph JSON…
              </button>
              <button className={styles.menuItem} role="menuitem" onClick={() => { closeMenus(); handleSaveJSON() }}>
                Export Graph JSON…
              </button>
              <button className={styles.menuItem} role="menuitem" onClick={() => { closeMenus(); openTemplates() }}>
                Starter Templates…
              </button>
              <button className={styles.menuItem} role="menuitem" onClick={() => { closeMenus(); handleShare() }}>
                Copy Share Link
              </button>
              <button className={styles.menuItem} role="menuitem" onClick={() => { closeMenus(); openRecover() }}>
                Recover Snapshot…
              </button>
            </div>
          </>
        )}
      </div>
      <div className={styles.menuWrap} ref={viewMenuRef}>
        <button
          ref={viewButtonRef}
          className={`${styles.btn} ${viewMenuOpen ? styles.btnActive : ''}`}
          onClick={() => {
            setFileMenuOpen(false)
            setViewMenuOpen((open) => !open)
          }}
          aria-haspopup="menu"
          aria-expanded={viewMenuOpen}
          aria-label="View menu"
          title="View and preferences"
        >
          View
        </button>
        {viewMenuOpen && (
          <>
            <button
              type="button"
              className={styles.menuBackdrop}
              aria-label="Close view menu"
              onClick={closeMenus}
            />
            {/* onMouseLeave is intentionally not wired to close this menu —
                the panel should stay open while the pointer is over it so the
                user can flip through several settings in one visit. */}
            <div className={styles.menu} role="menu" aria-label="View" onKeyDown={(e) => handleMenuKeyDown(e, viewButtonRef)}>
              <div className={styles.menuLabel}>Appearance</div>
              <button
                className={styles.menuItem}
                role="menuitem"
                onClick={() => { closeMenus(); cycleTheme() }}
                title="Cycle theme"
              >
                {THEME_ICON[theme]} Theme: {THEME_LABEL[theme]}
              </button>
              <button
                className={styles.menuItem}
                role="menuitemcheckbox"
                aria-checked={effectiveReducedMotion}
                onClick={() => { closeMenus(); toggleReducedMotion() }}
                title={uiEffectsEnabled ? 'Toggle reduced motion' : 'Forced on while UI FX are off'}
                disabled={!uiEffectsEnabled}
              >
                {effectiveReducedMotion ? '✓' : '○'} Motion: {effectiveReducedMotion ? 'Reduced' : 'Full'}
              </button>
              <button
                className={styles.menuItem}
                role="menuitemcheckbox"
                aria-checked={highContrast}
                onClick={() => { closeMenus(); toggleHighContrast() }}
                title="Toggle high contrast"
              >
                {highContrast ? '✓' : '○'} Contrast: {highContrast ? 'High' : 'Standard'}
              </button>
              <div className={styles.menuDivider} />
              <div className={styles.menuLabel}>Signal Path</div>
              <button
                className={styles.menuItem}
                role="menuitemcheckbox"
                aria-checked={uiEffectsEnabled}
                onClick={() => { closeMenus(); toggleUiEffects() }}
                title={uiEffectsEnabled ? 'Disable extra UI effects' : 'Enable extra UI effects'}
              >
                {uiEffectsEnabled ? '✓' : '○'} UI FX: {uiEffectsEnabled ? 'On' : 'Off'}
              </button>
              <button
                className={styles.menuItem}
                role="menuitemcheckbox"
                aria-checked={signalPathDimEnabled}
                onClick={() => { closeMenus(); toggleSignalPathDim() }}
                title={signalPathDimEnabled ? 'Disable dimming unrelated nodes on selection' : 'Enable dimming unrelated nodes on selection'}
              >
                {signalPathDimEnabled ? '✓' : '○'} Signal dimming: {signalPathDimEnabled ? 'On' : 'Off'}
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
        <button
          className={styles.btn}
          onClick={openTemplates}
          aria-label="Open start gallery"
          title={startTitle}
        >
          ✦ Start
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
          className={`${styles.btn} ${performanceMode ? styles.btnActive : ''}`}
          onClick={togglePerformanceMode}
          aria-label="Toggle performance mode"
          aria-pressed={performanceMode}
          title="Performance mode: hush chrome and emphasize live signal flow"
        >
          {performanceMode ? '◆' : '◇'} Perform
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
