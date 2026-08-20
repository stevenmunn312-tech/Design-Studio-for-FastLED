import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useUiStore } from './state/uiStore'
import { useGraphStore } from './state/graphStore'
import { useAudioStore } from './state/audioStore'
import { useShowPlayback } from './state/showPlayback'
import { AudioEngine } from './audio/audioEngine'
import { MIC_DEFAULTS } from './audio/micAnalysis'
import MenuBar from './components/MenuBar/MenuBar'
import Sidebar from './components/Sidebar/Sidebar'
import NodeGraphCanvas from './components/Canvas/NodeGraphCanvas'
import LEDPreview from './components/Preview/LEDPreview'
import StatusBar from './components/StatusBar/StatusBar'
import { useUploadStore } from './state/uploadStore'
import { inmp441SupportedForBoardProfile } from './state/micPinDefaults'
import { selectedPhysicalBoardProfile } from './build/boardProfiles'
import { usePatternLibrary } from './state/patternLibrary'
import { useProjectStore } from './state/projectStore'
import { readSharedWorkspace, clearShareHash } from './utils/shareGraph'
import { pushSnapshot } from './state/snapshotHistory'
import { blankWorkspace, captureWorkspace } from './state/workspacePersistence'
import { nextDefaultProjectName } from './utils/projectFileIO'
import { promptTrustIfNeeded } from './utils/trustPrompt'
import TrustBanner from './components/TrustBanner/TrustBanner'
import GraphHealthDrawer from './components/GraphHealth/GraphHealthDrawer'
import PerformanceDeckMidiBridge from './components/PerformanceDeck/PerformanceDeckMidiBridge'
import { usePerformanceDeckSession } from './state/performanceDeckSessionStore'
import { serializeKeyCombo } from './state/performanceDeck'
import { dispatchDeckAction } from './state/performanceDeckActions'
import { PanelResizeHandle } from './components/Layout/PanelResizeHandle'
import { HorizontalResizeHandle } from './components/Layout/HorizontalResizeHandle'
import { DEFAULT_PREVIEW_WIDTH, DEFAULT_SIDEBAR_WIDTH, MAX_PREVIEW_WIDTH, MAX_SIDEBAR_WIDTH, MIN_PREVIEW_WIDTH, MIN_SIDEBAR_WIDTH } from './state/layoutPresets'
import { enterStagePresentation, exitStagePresentation } from './utils/stagePresentation'
import HardwarePane from './components/Hardware/HardwarePane'
import styles from './App.module.css'

const PerformanceDeck = lazy(() => import('./components/PerformanceDeck/PerformanceDeck'))

const BoardPopup = lazy(() => import('./components/Upload/BoardPopup'))
const BoardPinoutPopup = lazy(() => import('./components/Upload/BoardPinoutPopup'))
const MatrixOutputSetupWizard = lazy(() => import('./components/Upload/MatrixOutputSetupWizard'))
const CapacityWatcher = lazy(() => import('./components/Upload/CapacityWatcher'))
const MatrixOutputDeployPopup = lazy(() => import('./components/Upload/MatrixOutputDeployPopup'))
const ArduinoCliPopup = lazy(() => import('./components/Upload/ArduinoCliPopup'))
const OutputConsole = lazy(() => import('./components/Upload/OutputConsole'))
const SdCardPrompt = lazy(() => import('./components/Upload/SdCardPrompt'))
const AppDialogHost = lazy(() => import('./components/AppDialog/AppDialogHost'))
const HelpModal = lazy(() => import('./components/HelpModal/HelpModal'))
const NewProjectPrompt = lazy(() => import('./components/NewProjectPrompt/NewProjectPrompt'))
const RecoverPopup = lazy(() => import('./components/Recover/RecoverPopup'))
const TemplatesPopup = lazy(() => import('./components/Templates/TemplatesPopup'))
const PatternRatingsPopup = lazy(() => import('./components/PatternRatings/PatternRatingsPopup'))
const ProjectsPopup = lazy(() => import('./components/Projects/ProjectsPopup'))
const BuildDiagramWorkspace = lazy(() => import('./components/BuildDiagram/BuildDiagramWorkspace'))
const AUTOSAVE_INTERVAL = 10_000
const AUTOSAVE_IDLE_TIMEOUT = 2_000
const SNAPSHOT_INTERVAL = 120_000
const STAGE_CURSOR_IDLE_MS = 2_000
const MIN_GRAPH_PANE_HEIGHT = 180
const MIN_HARDWARE_PANE_HEIGHT = 0

export default function App() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const previewPanelOpen = useUiStore((s) => s.previewPanelOpen)
  const workspaceMode = useUiStore((s) => s.workspaceMode)
  const stageMode = useUiStore((s) => s.stageMode)
  const performanceMode = useUiStore((s) => s.performanceMode)
  const deckOpen = usePerformanceDeckSession((s) => s.deckOpen)
  const uiEffectsEnabled = useUiStore((s) => s.uiEffectsEnabled)
  const setStatus = useUiStore((s) => s.setStatus)
  const theme = useUiStore((s) => s.theme)
  const reducedMotion = useUiStore((s) => s.reducedMotion)
  const highContrast = useUiStore((s) => s.highContrast)
  const helpOpen = useUiStore((s) => s.helpOpen)
  const recoverOpen = useUiStore((s) => s.recoverOpen)
  const templatesOpen = useUiStore((s) => s.templatesOpen)
  const projectsOpen = useUiStore((s) => s.projectsOpen)
  const ratingsOpen = useUiStore((s) => s.ratingsOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const togglePreviewPanel = useUiStore((s) => s.togglePreviewPanel)
  const sidebarWidth = useUiStore((s) => s.sidebarWidth)
  const previewWidth = useUiStore((s) => s.previewWidth)
  const hardwarePaneRatio = useUiStore((s) => s.hardwarePaneRatio)
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth)
  const setPreviewWidth = useUiStore((s) => s.setPreviewWidth)
  const setHardwarePaneRatio = useUiStore((s) => s.setHardwarePaneRatio)
  const startAudio = useAudioStore((s) => s.startAudio)
  const stopAudio = useAudioStore((s) => s.stopAudio)
  const micNodeProps = useGraphStore((s) => {
    const mic = s.nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MicInput')
    return (mic?.data.properties as Record<string, unknown> | undefined) ?? null
  })
  const hasMicNode = micNodeProps !== null
  const selectedBoardProfile = useGraphStore((s) => selectedPhysicalBoardProfile(s.nodes))
  const showPreviewPlaying = useShowPlayback((s) => s.playing)
  const visibleGraphNodeCount = useGraphStore((s) => s.nodes.filter((node) => node.data.nodeType !== 'Board').length)
  const boardPopupOpen = useUploadStore((s) => s.boardPopupOpen)
  const pinoutProfileId = useUploadStore((s) => s.pinoutProfileId)
  const setupWizardOpen = useUploadStore((s) => s.setupWizardOpen)
  const deployPopupOpen = useUploadStore((s) => s.deployPopupOpen)
  const cliPopupOpen = useUploadStore((s) => s.cliPopupOpen)
  const consoleOpen = useUploadStore((s) => s.consoleOpen)
  const refreshHelper = useUploadStore((s) => s.refreshHelper)
  const selectedFqbn = useUploadStore((s) => s.selectedFqbn)
  const micSupported = inmp441SupportedForBoardProfile(selectedBoardProfile)
  const hadMicNode = useRef(false)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const splitCanvasRef = useRef<HTMLDivElement | null>(null)
  const [stageCursorHidden, setStageCursorHidden] = useState(false)
  const [splitCanvasHeight, setSplitCanvasHeight] = useState(0)

  // Probe the upload helper once on mount (the Vite plugin should have spawned it).
  useEffect(() => { refreshHelper() }, [refreshHelper])

  // Apply theme + accessibility attributes to the root element
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') delete root.dataset.theme
    else root.dataset.theme = theme
    if (reducedMotion || !uiEffectsEnabled) root.dataset.reducedMotion = ''
    else delete root.dataset.reducedMotion
    if (highContrast) root.dataset.highContrast = ''
    else delete root.dataset.highContrast
    if (!uiEffectsEnabled) root.dataset.uiEffects = 'off'
    else delete root.dataset.uiEffects
  }, [theme, reducedMotion, highContrast, uiEffectsEnabled])

  // Mirror the persisted panel widths onto the CSS vars everything else reads
  // (NodeGraphCanvas's fit-view padding, the panel/handle CSS). A resize drag
  // writes these vars directly for a live feel and only calls the store
  // setter on release, so this effect is what applies presets and reloads.
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`)
  }, [sidebarWidth])
  useEffect(() => {
    document.documentElement.style.setProperty('--right-panel-width', `${previewWidth}px`)
  }, [previewWidth])
  useEffect(() => {
    const element = splitCanvasRef.current
    if (!element) return
    const update = () => setSplitCanvasHeight(element.clientHeight)
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveIdle = useRef<number | null>(null)
  const latestAutosaveState = useRef<ReturnType<typeof useGraphStore.getState> | null>(null)

  // A share link takes priority over the autosaved workspace — loading one
  // is an explicit act (someone sent you a link), so it wins over whatever
  // was left in this browser from before.
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const shared = readSharedWorkspace()
      if (shared) {
        // Never trust a share link's own `trusted` claim — force it false
        // regardless of what the payload says (see todo.md's P0 trust item).
        useGraphStore.getState().loadGraph(shared.nodes, shared.edges, {
          graphData: shared.graphData,
          graphs: shared.graphs,
          activeGraphId: shared.activeGraphId,
          buildProfile: shared.buildProfile,
          trusted: false,
          performanceDeck: shared.performanceDeck,
        })
        useProjectStore.getState().saveCurrentWorkspace({ ...shared, trusted: false })
        useGraphStore.temporal.getState().clear()
        clearShareHash()
        useUiStore.getState().setStatus('Share link opened', 'success')
        void promptTrustIfNeeded()
        return
      }
      await useProjectStore.getState().refreshFromDisk()
      if (cancelled) return
      const state = useProjectStore.getState()
      const current = state.projects.find((project) => project.id === state.currentProjectId)
        ?? state.projects[0]
        ?? useProjectStore.getState().createProject(
          nextDefaultProjectName(state.projects.map((project) => project.name)),
          blankWorkspace(),
        )
      if (!current) return
      const { nodes, edges, graphData, graphs, activeGraphId, buildProfile, trusted, performanceDeck } = current.workspace
      useGraphStore.getState().loadGraph(nodes, edges, { graphData, graphs, activeGraphId, buildProfile, trusted, performanceDeck })
      useGraphStore.temporal.getState().clear()
    }
    void init()
    return () => { cancelled = true }
  }, [])

  // Repopulate the Pattern Library from its on-disk folder (via the upload helper),
  // migrating any localStorage-only patterns up to disk. No-op when offline.
  useEffect(() => {
    void usePatternLibrary.getState().refreshFromDisk()
  }, [])

  // Autosave every 10 seconds when graph changes
  useEffect(() => {
    const cancelQueuedAutosave = () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      autosaveTimer.current = null
      if (autosaveIdle.current !== null) {
        if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(autosaveIdle.current)
        else window.clearTimeout(autosaveIdle.current)
        autosaveIdle.current = null
      }
    }

    const queueAutosave = () => {
      const run = () => {
        autosaveIdle.current = null
        const state = latestAutosaveState.current
        if (state) useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(state))
      }
      if (typeof window.requestIdleCallback === 'function') {
        autosaveIdle.current = window.requestIdleCallback(run, { timeout: AUTOSAVE_IDLE_TIMEOUT })
      } else {
        autosaveIdle.current = window.setTimeout(run, 0)
      }
    }

    const unsub = useGraphStore.subscribe((state) => {
      latestAutosaveState.current = state
      cancelQueuedAutosave()
      autosaveTimer.current = setTimeout(() => {
        autosaveTimer.current = null
        queueAutosave()
      }, AUTOSAVE_INTERVAL)
    })
    return () => {
      unsub()
      cancelQueuedAutosave()
    }
  }, [])

  // Rolling snapshots: a safety net alongside undo, which is cleared on every
  // load/reload. Skips the tick when nothing changed since the last snapshot
  // so a quiet canvas doesn't pile up identical entries.
  const lastSnapshotRef = useRef<string>('')
  useEffect(() => {
    const timer = setInterval(() => {
      const { nodes, edges, graphData, graphs, activeGraphId, buildProfile, trusted, performanceDeck } = useGraphStore.getState()
      if (nodes.length === 0) return
      const serialized = JSON.stringify({ nodes, edges, graphData, graphs, activeGraphId, buildProfile, trusted, performanceDeck })
      if (serialized === lastSnapshotRef.current) return
      lastSnapshotRef.current = serialized
      pushSnapshot({ nodes, edges, graphData, graphs, activeGraphId, buildProfile, trusted, performanceDeck })
    }, SNAPSHOT_INTERVAL)
    return () => clearInterval(timer)
  }, [])

  // Flush the autosave immediately when the page is hidden/closed, so a reload
  // right after an edit doesn't lose work waiting on the debounce.
  useEffect(() => {
    const flush = () => useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Follow every real board change by moving each part onto that board's pins:
  // the user's remembered per-board microphone wiring first, then whatever the
  // profile exposes, and never a pin the user has edited themselves. Loading a
  // project is not itself a board change.
  const retargetHardwarePins = useGraphStore((s) => s.retargetHardwarePins)
  const lastBoardKey = useRef<string | null>(null)
  useEffect(() => {
    const previous = lastBoardKey.current
    const boardFqbn = selectedBoardProfile?.compatibleFqbns[0] ?? selectedFqbn
    // Keyed on the profile: several profiles share one FQBN — `esp32:esp32:esp32`
    // belongs to both the 38-pin generic DevKit and the 30-pin DevKit v1 — so
    // watching the FQBN alone meant swapping between two boards with genuinely
    // different headers registered as no change and nothing was retargeted.
    const boardKey = selectedBoardProfile?.id ?? boardFqbn
    lastBoardKey.current = boardKey
    if (selectedBoardProfile?.compatibleFqbns[0] && selectedBoardProfile.compatibleFqbns[0] !== selectedFqbn) {
      useUploadStore.getState().setSelectedFqbn(selectedBoardProfile.compatibleFqbns[0])
    }
    if (previous === null || previous === boardKey) return
    const moved = retargetHardwarePins(boardFqbn, previous)
    if (moved > 0) {
      setStatus(`Moved ${moved} part${moved > 1 ? 's' : ''} onto this board's pins`, 'info')
    }
  }, [selectedBoardProfile, selectedFqbn, retargetHardwarePins, setStatus])

  useEffect(() => {
    if (visibleGraphNodeCount === 0) setHardwarePaneRatio(0.5)
  }, [setHardwarePaneRatio, visibleGraphNodeCount])

  // Keep FastLED's processor gain in sync with the MicInput node.
  useEffect(() => {
    const engine = AudioEngine.instance
    if (!micNodeProps) return
    engine.configureMic({
      gain: Number(micNodeProps.gain ?? MIC_DEFAULTS.gain),
    })
  }, [micNodeProps])

  // A show preview owns audio while it is playing: suspend the live mic so
  // FFT/beat-driven previews reflect the baked song envelope instead.
  useEffect(() => {
    if (showPreviewPlaying) {
      if (hadMicNode.current) stopAudio()
      return
    }
    if (hasMicNode && micSupported) {
      hadMicNode.current = true
      startAudio().catch(() => {
        setStatus('Microphone could not start. Check browser permission and the selected audio input.', 'error')
      })
      return
    }
    hadMicNode.current = false
    stopAudio()
  }, [hasMicNode, micSupported, showPreviewPlaying, startAudio, stopAudio, setStatus])

  useEffect(() => () => {
    if (hadMicNode.current) stopAudio()
  }, [stopAudio])

  // Browser chrome and Stage are one presentation session. Browser-native Esc
  // exits fullscreen first; mirror that exit into the app so the editor returns
  // instead of leaving a windowed Stage behind. A rejected/unsupported request
  // deliberately remains in windowed Stage as a graceful fallback.
  useEffect(() => {
    const onFullscreenChange = () => {
      const state = useUiStore.getState()
      if (document.fullscreenElement) {
        if (state.stageMode) state.setStageFullscreenStatus('active')
        return
      }
      if (state.stageMode && state.stageFullscreenStatus === 'active') {
        state.setStageMode(false)
        state.setStageFullscreenStatus('idle')
        state.setStageWakeLockStatus('idle')
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  // Screen wake locks are released by the browser whenever the document is
  // hidden. Reacquire on visibility return for an uninterrupted ambient show.
  useEffect(() => {
    let cancelled = false

    const requestWakeLock = async () => {
      if (cancelled || document.visibilityState !== 'visible') return
      if (!('wakeLock' in navigator)) {
        useUiStore.getState().setStageWakeLockStatus('unavailable')
        return
      }
      if (wakeLockRef.current && !wakeLockRef.current.released) return

      useUiStore.getState().setStageWakeLockStatus('requesting')
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled || !useUiStore.getState().stageMode) {
          await lock.release()
          return
        }
        wakeLockRef.current = lock
        useUiStore.getState().setStageWakeLockStatus('active')
        lock.addEventListener('release', () => {
          if (wakeLockRef.current === lock) wakeLockRef.current = null
          if (!cancelled && useUiStore.getState().stageMode) {
            useUiStore.getState().setStageWakeLockStatus('idle')
          }
        }, { once: true })
      } catch {
        if (!cancelled) useUiStore.getState().setStageWakeLockStatus('unavailable')
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void requestWakeLock()
    }

    if (stageMode) {
      void requestWakeLock()
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      const lock = wakeLockRef.current
      wakeLockRef.current = null
      if (lock && !lock.released) void lock.release()
      if (!useUiStore.getState().stageMode) {
        useUiStore.getState().setStageWakeLockStatus('idle')
      }
    }
  }, [stageMode])

  // A screensaver should disappear as an interface when nobody is touching it.
  // Pointer movement brings the cursor back immediately; two quiet seconds hide
  // it again. Keyboard focus remains visible and all controls stay operable.
  //
  // The same two seconds now take the Stage chrome with the cursor, because
  // Stage is the audience view and an audience should see lights, not a
  // telemetry strip. Published to uiStore so the preview panel can follow it.
  useEffect(() => {
    const setIdle = (idle: boolean) => {
      setStageCursorHidden(idle)
      useUiStore.getState().setStageIdle(idle)
    }
    if (!stageMode) {
      setIdle(false)
      return
    }

    let timer = window.setTimeout(() => setIdle(true), STAGE_CURSOR_IDLE_MS)
    const wakeCursor = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), STAGE_CURSOR_IDLE_MS)
    }
    window.addEventListener('pointermove', wakeCursor, { passive: true })
    window.addEventListener('pointerdown', wakeCursor, { passive: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', wakeCursor)
      window.removeEventListener('pointerdown', wakeCursor)
      useUiStore.getState().setStageIdle(false)
    }
  }, [stageMode])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Never hijack normal text editing — node property fields, the node
      // search picker, and the graph/song rename inputs all live in plain
      // <input>/<textarea> elements with no shortcut opt-out of their own.
      const el = e.target as HTMLElement | null
      const isTyping = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

      if (e.key === 'Escape' && !isTyping) {
        // The deck hosts the panic button and MIDI-learn/key-learn capture —
        // close it first so Escape can't leave a "listening…" state armed
        // mid-performance, before falling through to the existing
        // stage/perform/selection-clear priority chain.
        if (usePerformanceDeckSession.getState().deckOpen) {
          usePerformanceDeckSession.getState().setDeckOpen(false)
          return
        }
        if (useUiStore.getState().stageMode) {
          void exitStagePresentation()
          return
        }
        if (useUiStore.getState().workspaceMode === 'build') {
          useUiStore.getState().closeBuildDiagram()
          return
        }
        if (useUiStore.getState().performanceMode) {
          useUiStore.getState().setPerformanceMode(false)
          return
        }
        useGraphStore.getState().clearSelection()
        return
      }

      if (e.key === 'F10' && !isTyping) {
        e.preventDefault()
        if (useUiStore.getState().stageMode) void exitStagePresentation()
        else void enterStagePresentation()
        return
      }

      if (e.key === 'F9' && !isTyping) {
        e.preventDefault()
        useUiStore.getState().togglePerformanceMode()
        return
      }

      if (e.key === 'F8' && !isTyping) {
        e.preventDefault()
        usePerformanceDeckSession.getState().toggleDeck()
        return
      }

      if ((e.key === '?' || e.key === 'F1') && !isTyping) {
        e.preventDefault()
        useUiStore.getState().openHelp()
        return
      }

      // User-defined performance-deck key bindings — checked after every
      // hardcoded global shortcut above (so they can never be shadowed) and
      // before the Ctrl/Cmd-gated block below (so a plain unmodified key
      // like "F7" isn't swallowed by the `!mod` early return).
      if (!isTyping) {
        const combo = serializeKeyCombo(e)
        const bound = useGraphStore.getState().performanceDeck.keyBindings.find((b) => b.combo === combo)
        if (bound) {
          e.preventDefault()
          dispatchDeckAction(bound.action)
          return
        }
      }

      const mod = e.ctrlKey || e.metaKey
      if (!mod || isTyping) return

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useGraphStore.temporal.getState().undo()
      }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault()
        useGraphStore.temporal.getState().redo()
      }
      if (e.key === 's') {
        e.preventDefault()
        const { projects, currentProjectId } = useProjectStore.getState()
        if (projects.some((project) => project.id === currentProjectId)) {
          useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
          const current = projects.find((project) => project.id === currentProjectId)
          setStatus(current ? `Saved project "${current.name}"` : 'Saved project', 'success')
        } else {
          useUiStore.getState().openProjects()
          setStatus('No project open — create one to save into', 'info')
        }
      }
      if (e.key === 'a') {
        e.preventDefault()
        useGraphStore.getState().selectAllNodes()
      }
      if (e.key === 'c') {
        const store = useGraphStore.getState()
        const selectedCount = store.nodes.filter((n) => n.selected).length
        if (selectedCount > 1) {
          store.copySelection()
          setStatus(`${selectedCount} nodes copied`, 'info')
        } else if (store.selectedNodeId) {
          store.copyNode(store.selectedNodeId)
          setStatus('Node copied', 'info')
        }
      }
      if (e.key === 'd') {
        e.preventDefault()
        const store = useGraphStore.getState()
        const selectedCount = store.nodes.filter((n) => n.selected).length
        // Match Ctrl+C's reading of "the selection": duplicate all of it when
        // several nodes are selected, not just the last-clicked one.
        if (selectedCount > 1) {
          store.duplicateSelection()
          setStatus(`${selectedCount} nodes duplicated`, 'info')
        } else if (store.selectedNodeId) {
          store.duplicateNode(store.selectedNodeId)
        }
      }
      if (e.key === 'v') {
        const { clipboard, pasteNode } = useGraphStore.getState()
        const { viewCenter } = useUiStore.getState()
        if (clipboard) {
          pasteNode({
            x: viewCenter.x + (Math.random() - 0.5) * 80,
            y: viewCenter.y + (Math.random() - 0.5) * 80,
          })
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setStatus])

  const hardwarePaneHeight = useMemo(() => {
    if (splitCanvasHeight <= 0) return 0
    const ratio = Number.isFinite(hardwarePaneRatio) ? hardwarePaneRatio : 0.5
    const max = Math.max(MIN_HARDWARE_PANE_HEIGHT, splitCanvasHeight - MIN_GRAPH_PANE_HEIGHT)
    return Math.max(MIN_HARDWARE_PANE_HEIGHT, Math.min(max, splitCanvasHeight * ratio))
  }, [hardwarePaneRatio, splitCanvasHeight])

  useEffect(() => {
    document.documentElement.style.setProperty('--hardware-pane-height', `${hardwarePaneHeight}px`)
  }, [hardwarePaneHeight])

  return (
    <div className={`${styles.app} ${stageMode ? styles.appStage : ''} ${stageCursorHidden ? styles.appStageCursorHidden : ''} ${performanceMode ? styles.appPerformance : ''}`}>
      <div className={styles.menuShell}><MenuBar /></div>
      {!stageMode && <TrustBanner />}
      <div className={`${styles.workspace} ${stageMode ? styles.workspaceStage : ''} ${workspaceMode === 'build' ? styles.workspaceBuild : ''}`}>
        {workspaceMode === 'build' && !stageMode ? (
          <Suspense fallback={null}>
            <BuildDiagramWorkspace />
          </Suspense>
        ) : (
          <>
            <div className={styles.workspaceCanvas}>
              <div className={styles.mainRegion}>
                <div className={`${styles.sidebarDock} ${sidebarOpen ? '' : styles.sidebarDockClosed}`}>
                  <div
                    className={`${styles.sidebarPanel} ${sidebarOpen ? '' : styles.sidebarPanelClosed}`}
                    aria-hidden={!sidebarOpen}
                    inert={!sidebarOpen}
                  >
                    <Sidebar />
                  </div>
                </div>
                {sidebarOpen && (
                  <PanelResizeHandle
                    side="sidebar"
                    width={sidebarWidth}
                    min={MIN_SIDEBAR_WIDTH}
                    max={MAX_SIDEBAR_WIDTH}
                    defaultWidth={DEFAULT_SIDEBAR_WIDTH}
                    otherPanelWidth={previewPanelOpen ? previewWidth : 0}
                    label="Resize node library panel"
                    onCommit={setSidebarWidth}
                  />
                )}
                <button
                  className={`${styles.sidebarHandle} ${sidebarOpen ? styles.sidebarHandleOpen : styles.sidebarHandleClosed}`}
                  type="button"
                  onClick={toggleSidebar}
                  aria-label={sidebarOpen ? 'Hide node library' : 'Show node library'}
                  aria-expanded={sidebarOpen}
                  aria-controls="node-library"
                  title={sidebarOpen ? 'Hide node library' : 'Show node library'}
                >
                  <span className={styles.sidebarHandleArrow} aria-hidden="true">{sidebarOpen ? '‹' : '›'}</span>
                </button>
                <div ref={splitCanvasRef} className={styles.splitCanvas}>
                  <div className={styles.graphPane}>
                    <NodeGraphCanvas />
                  </div>
                  {splitCanvasHeight > 0 && (
                    <HorizontalResizeHandle
                      height={hardwarePaneHeight}
                      min={MIN_HARDWARE_PANE_HEIGHT}
                      max={Math.max(MIN_HARDWARE_PANE_HEIGHT, splitCanvasHeight - MIN_GRAPH_PANE_HEIGHT)}
                      containerHeight={splitCanvasHeight}
                      defaultRatio={0.5}
                      label="Resize hardware view"
                      onCommit={setHardwarePaneRatio}
                    />
                  )}
                  <div className={styles.hardwareDock}>
                    <HardwarePane />
                  </div>
                </div>
              </div>
              <div className={`${styles.previewDock} ${previewPanelOpen ? '' : styles.previewDockClosed}`}>
                <div
                  className={`${styles.previewPanel} ${previewPanelOpen ? '' : styles.previewPanelClosed}`}
                  aria-hidden={!previewPanelOpen && !stageMode}
                  inert={!previewPanelOpen && !stageMode}
                  id="preview-panel"
                >
                  <LEDPreview />
                </div>
              </div>
              {previewPanelOpen && !stageMode && (
                <PanelResizeHandle
                  side="preview"
                  width={previewWidth}
                  min={MIN_PREVIEW_WIDTH}
                  max={MAX_PREVIEW_WIDTH}
                  defaultWidth={DEFAULT_PREVIEW_WIDTH}
                  otherPanelWidth={sidebarOpen ? sidebarWidth : 0}
                  label="Resize LED preview panel"
                  onCommit={setPreviewWidth}
                />
              )}
              <button
                className={`${styles.previewHandle} ${previewPanelOpen ? styles.previewHandleOpen : styles.previewHandleClosed}`}
                type="button"
                onClick={togglePreviewPanel}
                aria-label={previewPanelOpen ? 'Hide LED preview' : 'Show LED preview'}
                aria-expanded={previewPanelOpen}
                aria-controls="preview-panel"
                title={previewPanelOpen ? 'Hide LED preview' : 'Show LED preview'}
              >
                <span className={styles.previewHandleArrow} aria-hidden="true">{previewPanelOpen ? '›' : '‹'}</span>
              </button>
              {deckOpen && (
                <Suspense fallback={null}>
                  <PerformanceDeck />
                </Suspense>
              )}
            </div>
            {!stageMode && <GraphHealthDrawer />}
          </>
        )}
      </div>
      <div className={styles.statusShell}><StatusBar /></div>
      <PerformanceDeckMidiBridge />
      <Suspense fallback={null}>
        <AppDialogHost />
        {/* Headless. Drives the live capacity check from here rather than a
            node body or the hardware pane, because both can be hidden and the
            measurement should not stop when the view does. */}
        <CapacityWatcher />
        {setupWizardOpen && <MatrixOutputSetupWizard />}
        {deployPopupOpen && <MatrixOutputDeployPopup />}
        {boardPopupOpen && <BoardPopup />}
        {pinoutProfileId && <BoardPinoutPopup />}
        {cliPopupOpen && <ArduinoCliPopup />}
        {consoleOpen && <OutputConsole />}
        {/* Renders only mid-upload, and reads its own flag — no App-level
            state to keep in step with the upload it belongs to. */}
        <SdCardPrompt />
        {helpOpen && <HelpModal />}
        <NewProjectPrompt />
        {recoverOpen && <RecoverPopup />}
        {templatesOpen && <TemplatesPopup />}
        {projectsOpen && <ProjectsPopup />}
        {ratingsOpen && <PatternRatingsPopup />}
      </Suspense>
    </div>
  )
}
