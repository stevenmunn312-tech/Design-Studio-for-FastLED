import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { getGroupRegistry, useGraphStore, useRootEdges, useRootNodes } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { trustCurrentProject } from '../../utils/trustPrompt'
import { useUploadStore, boardByFqbn, engineReady } from '../../state/uploadStore'
import { useStreamStore } from '../../state/streamStore'
import { useMusicStore } from '../../state/musicStore'
import { useProjectStore } from '../../state/projectStore'
import { useCapacityStore } from '../../state/capacityStore'
import { bakeBrowserThumbnails } from '../../utils/browserThumbnails'
import { collectionPatternNames } from '../../utils/patternNames'
import { bakeDisplayArtworks } from '../../utils/transportArtworks'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch } from '../../codegen/showGenerator'
import { generateStreamReceiverSketch, streamLayoutForGraph, streamReceiverCapabilityNotes } from '../../codegen/streamReceiverGenerator'
import { generateWiringDiagnosticSketch } from '../../codegen/wiringDiagnosticGenerator'
import { readySongCount, buildShowPayload, buildShowPlayerForMeasurement, showPackagingIssues } from '../../utils/showUpload'
import { buildGraphDiagnostics, findDeployBlockingErrors, findMirroredOutputMismatches, findHub75TopologyDiagnosticErrors, findFirmwareRamBudgetIssue } from '../../utils/validateGraph'
import { summarizeCapacity } from '../../utils/capacityFormat'
import { useCodegenGraph } from '../../utils/codegenGraph'
import { useModalFocus } from '../../hooks/useModalFocus'
import { useCustomDisplayAssets } from '../../hooks/useCustomDisplayAssets'
import {
  buildHardwareValidationProfile,
  suggestedValidationAction,
  type HardwareValidationAction,
} from '../../utils/hardwareValidation'
import CodeViewPopup from './CodeViewPopup'
import HardwareValidationPopup from './HardwareValidationPopup'
import OutputConsole from './OutputConsole'
import DeviceTelemetryCard from './DeviceTelemetryCard'
import { useDeviceTelemetryStore } from '../../state/deviceTelemetryStore'
import styles from './Upload.module.css'
import { controllerSettings } from '../../state/controllerSettings'
import { selectedPhysicalBoardProfile } from '../../build/boardProfiles'
import { resolveBuildMode } from '../../state/buildMode'
import { describePort } from '../../utils/portStatus'
import { graphDrivesOutput, readinessLayers } from '../../utils/readinessLayers'
import ReadinessLayers from './ReadinessLayers'

type ReadinessState = 'ready' | 'checking' | 'missing'

const CAPACITY_LEVEL_CLASS = {
  ok: 'capacityOk', warn: 'capacityWarn', error: 'capacityError', pending: 'capacityPending',
} as const

/**
 * The upload tools.
 *
 * `inline` drops the modal shell so the same body can sit in the hardware
 * pane's Upload tab, where these tools now live — uploading is a bench
 * activity, and the bench is drawn right there. The floating dialog remains
 * for the times the pane is collapsed to nothing, which it is allowed to be.
 *
 * `controlsHost` moves the controls column into the workspace sidebar, which
 * on the Upload tab holds these tools rather than the node library — there is
 * no graph to add nodes to while flashing — leaving the console the rest of
 * the pane. With no host (the sidebar collapsed to nothing, or a test
 * rendering this on its own) the controls fall back to their own column
 * beside the console, so the tools are never merely absent.
 */
interface MatrixOutputDeployPopupProps {
  inline?: boolean
  leftInset?: number
  rightInset?: number
  controlsHost?: HTMLElement | null
}

export default function MatrixOutputDeployPopup({
  inline = false,
  leftInset = 0,
  rightInset = 0,
  controlsHost = null,
}: MatrixOutputDeployPopupProps = {}) {
  const [readinessOpen, setReadinessOpen] = useState(false)
  const [validationAction, setValidationAction] = useState<HardwareValidationAction | null>(null)
  const nodes = useRootNodes()
  const projectTrusted = useGraphStore((state) => state.trusted)
  const telemetryRun = useDeviceTelemetryStore((state) => state.run)
  const edges = useRootEdges()
  const entries = useMusicStore((s) => s.entries)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const projectName = useProjectStore((s) =>
    s.projects.find((project) => project.id === s.currentProjectId)?.name ?? '')
  const {
    helper, installedCores, selectedFqbn, selectedPort, ports, portsScanned, busy, status, codeViewOpen,
    refreshHelper, refreshPorts, installCore, activeOutputNodeId,
    openBoardPopup, openCliPopup, openCodeView, closeDeployPopup, openSetupWizard, runUpload, runLastUpload, runShowUpload, exportIno,
    exportBinary,
    cancelUpload, setEngine,
    cardReader, setCardReader,
  } = useUploadStore()
  const hasLastSketch = useUploadStore((s) => !!(currentProjectId && s.lastSketchByProject[currentProjectId]))
  const { streaming, fps: streamFps, error: streamError, start: startStreaming, stop: stopStreaming } = useStreamStore()
  const dialogRef = useModalFocus<HTMLDivElement>(closeDeployPopup)

  const outputNode = nodes.find((n) => n.id === activeOutputNodeId && n.data.nodeType === 'MatrixOutput')
    ?? nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  const ownProps = ((outputNode?.data.properties ?? {}) as Record<string, unknown>)
  const nodeId = outputNode?.id ?? ''
  const isHub75 = String(ownProps.chipset ?? 'WS2812B') === 'HUB75'
  const build = useMemo(() => resolveBuildMode(nodes, edges), [nodes, edges])
  const hasBuildOutput = build.capabilities.buildable
  // A card is ordinary storage hardware until a connected engine selects the
  // player build. SD selection wins over a simultaneous slideshow path.
  const hasSdShow = build.mode === 'player'
  const hasMusicPlayer = build.engineKind === 'music-player'

  const board = boardByFqbn(selectedFqbn)
  const usingFbuild = helper?.engine === 'fbuild'
  const activeEngineReady = engineReady(helper)
  const psramOptions = board?.psram
  const physicalProfile = selectedPhysicalBoardProfile(nodes)
  const psramSupported = !!psramOptions || !!physicalProfile?.psramMode
  const controller = controllerSettings(nodes)
  const usePsram = psramSupported && controller.usePsram
  const psramChoice = psramOptions?.find((o) => o.id === controller.psramMode) ?? psramOptions?.[0]

  // See CapacityWatcher: keyed on the codegen-relevant graph so a node drag
  // behind this popup doesn't re-run the sketch generator every frame.
  const codegenGraph = useCodegenGraph(nodes, edges)
  const codegenBuild = useMemo(
    () => resolveBuildMode(codegenGraph.nodes, codegenGraph.edges),
    [codegenGraph],
  )
  const customAssets = useCustomDisplayAssets(codegenGraph.nodes,
    true, codegenGraph.edges)
  function generateCurrentCode() {
    if (customAssets.pending || customAssets.errors.length > 0) return ''
    // A confirmation dialog may have been open while the document changed.
    if (customAssets.documents !== useGraphStore.getState().displayDocuments
      || customAssets.trusted !== useGraphStore.getState().trusted) return ''
    const groups = getGroupRegistry()
    if (codegenBuild.mode === 'player') return buildShowPlayerForMeasurement(codegenGraph.nodes, codegenGraph.edges, groups,
      selectedFqbn, psramSupported, projectName,
      { displayDocuments: customAssets.documents, customDisplayAssets: customAssets.assets }) ?? ''
    // Baked here rather than inside the generator: baking evaluates patterns,
    // and only this side knows whether the workspace has been trusted.
    const opts = {
      psramAllowed: psramSupported,
      bootLabel: projectName,
      thumbnails: bakeBrowserThumbnails(
        codegenGraph.nodes, codegenGraph.edges, groups, customAssets.trusted,
        codegenBuild.templateDisplaySourceIds ?? undefined,
      ),
      // Names are not baked: they cost no evaluation and no trust decision, so
      // a panel keeps naming patterns even where the pictures could not be made.
      patternNames: collectionPatternNames(
        codegenGraph.nodes, codegenGraph.edges, useGraphStore.getState().graphs,
        codegenBuild.templateDisplaySourceIds ?? undefined,
      ),
      artworks: bakeDisplayArtworks(
        codegenGraph.nodes, codegenGraph.edges, groups,
        customAssets.trusted,
        codegenBuild.templateDisplaySourceIds ?? undefined,
      ),
      displayDocuments: customAssets.documents,
      customDisplayAssets: customAssets.assets,
    }
    return codegenBuild.mode === 'show'
      ? generateShowSketch(codegenGraph.nodes, codegenGraph.edges, groups, opts)
      : generateCpp(codegenGraph.nodes, codegenGraph.edges, groups, opts)
  }
  const code = useMemo(generateCurrentCode, [codegenGraph, codegenBuild, psramSupported, projectName, selectedFqbn,
    customAssets.pending, customAssets.errors, customAssets.documents, customAssets.assets, customAssets.trusted])

  const port = useMemo(
    () => describePort({ helper, selectedPort, ports, portsScanned }),
    [helper, selectedPort, ports, portsScanned],
  )
  const target = `${board?.label ?? 'No board'} · ${port.text}`
  const portDetected = port.state === 'connected'
  const helperReady = !!helper
  const coreReady = !!board && (usingFbuild || installedCores.includes(board.core))
  const uploadReady = helperReady && activeEngineReady && coreReady && portDetected

  // Every graph rule that blocks a build, in the one list validateGraph and
  // Graph Health read too. Assembling it here is what let rules go missing from
  // the buttons while the drawer called them errors; see
  // findDeployBlockingErrors. The prepared documents are passed because a custom
  // screen's bindings cannot be resolved without them.
  const graphBlockers = useMemo(
    () => findDeployBlockingErrors(nodes, edges, selectedFqbn, customAssets.documents),
    [nodes, edges, selectedFqbn, customAssets.documents],
  )
  // Uneven parallel runs are worth saying and never worth blocking — a star
  // with half-length arms is a real build, not a misconfiguration.
  const mirrorNotes = useMemo(() => findMirroredOutputMismatches(nodes, edges), [nodes, edges])
  const liveStreamNotes = useMemo(() => streamReceiverCapabilityNotes(nodes), [nodes])
  const hub75TopologyErrors = useMemo(
    () => findHub75TopologyDiagnosticErrors(nodes, nodeId),
    [nodes, nodeId],
  )
  const ramBudgetIssue = useMemo(
    () => findFirmwareRamBudgetIssue(nodes, edges, customAssets.documents),
    [nodes, edges, customAssets.documents],
  )

  // Live controller-capacity meter (see CapacityWatcher.tsx, which drives
  // the actual debounced compile-check) — the measured result is the
  // authority here: only a *confirmed* overflow blocks Upload, so editing is
  // never blocked just because a check hasn't completed yet.
  const {
    status: capacityStatus, result: capacityResult, subject: capacitySubject,
    target: capacityTarget, check: runCapacityCheck,
  } = useCapacityStore()
  const capacitySummary = useMemo(
    () => summarizeCapacity(board, capacityStatus, capacityResult, capacitySubject, capacityTarget?.preparationError),
    [board, capacityStatus, capacityResult, capacitySubject, capacityTarget?.preparationError],
  )
  const canCheckCapacity = !!capacityTarget?.code && capacityTarget.toolchainReady && capacityStatus !== 'checking'
  // Only a *current* measurement blocks. 'measured' means the reading was taken
  // against the graph and board as they stand; a 'stale' overflow describes a
  // design the user may already have shrunk, and blocking on it would trap them
  // behind a number they have no obligation to refresh.
  const capacityOverflow = capacityStatus === 'measured'
    && capacityResult?.target === (usePsram && psramChoice ? `${selectedFqbn}:${psramChoice.opt}` : selectedFqbn)
    && !capacityResult.ok && capacityResult.overflow

  // Deduped because two of these sources legitimately name the same problem: a
  // control-routing error blocks an asset bake (so the hook reports it, itself
  // deduped for the same reason) and is also an output-runtime error in the
  // deploy gate. The list is rendered one line per entry, keyed by the message.
  const blockingErrors = [...new Set([
    ...customAssets.errors,
    ...(customAssets.pending ? ['Preparing display images…'] : []),
    ...graphBlockers,
    ...(ramBudgetIssue ? [ramBudgetIssue.message] : []),
    ...(capacityOverflow ? [`${board?.label ?? 'This board'}: design is too large to fit (live capacity check)`] : []),
  ])]
  // What the list under the buttons says: each blocker once. Graph problems
  // live in Graph Health, which explains and repairs them, so here they are one
  // line that opens it; waiting on trust has its own row with the button.
  const trustMessages = new Set(projectTrusted ? [] : customAssets.errors)
  const listedBlockers = blockingErrors.filter((message) =>
    !graphBlockers.includes(message) && !trustMessages.has(message))
  const showGraphHealth = () => {
    if (!useUiStore.getState().graphHealthOpen) useUiStore.getState().toggleGraphHealth()
  }
  const canBuild = hasBuildOutput && blockingErrors.length === 0
  const canShowUpload = hasSdShow && blockingErrors.length === 0
  const suggestedAction = useMemo(() => suggestedValidationAction(nodes, edges), [nodes, edges])
  const readiness = useMemo(() => {
    const helperRow = helper === undefined
      ? { label: 'Helper', state: 'checking' as ReadinessState, detail: 'Checking for the local upload helper…' }
      : !helper
        ? {
            label: 'Helper',
            state: 'missing' as ReadinessState,
            detail: 'Browser uploads need the local helper running on this machine.',
            actionLabel: 'Retry helper',
            action: () => { void refreshHelper() },
          }
        : {
            label: 'Helper',
            state: 'ready' as ReadinessState,
            detail: `Online${helper.engine ? ` · ${helper.engine}` : ''}`,
          }

    const engineRow = helper === undefined
      ? { label: 'Engine', state: 'checking' as ReadinessState, detail: 'Waiting for helper status…' }
      : !helper
        ? {
            label: 'Engine',
            state: 'missing' as ReadinessState,
            detail: 'Start the helper first so Studio can discover a usable build engine.',
            actionLabel: 'Retry helper',
            action: () => { void refreshHelper() },
          }
        : !activeEngineReady
          ? {
              label: 'Engine',
              state: 'missing' as ReadinessState,
              detail: 'No usable build engine is configured yet.',
              actionLabel: 'Fix engine',
              action: openCliPopup,
            }
          : usingFbuild
            ? { label: 'Engine', state: 'ready' as ReadinessState, detail: `Using fbuild${helper.fbuildVersion ? ` ${helper.fbuildVersion}` : ''}` }
            : { label: 'Engine', state: 'ready' as ReadinessState, detail: `Using arduino-cli${helper.version ? ` ${helper.version}` : ''}` }

    const coreRow = helper === undefined
      ? { label: 'Toolchain', state: 'checking' as ReadinessState, detail: 'Checking board toolchain…' }
      : !helper
        ? {
            label: 'Toolchain',
            state: 'missing' as ReadinessState,
            detail: 'The helper must be online before Studio can verify board toolchains.',
            actionLabel: 'Retry helper',
            action: () => { void refreshHelper() },
          }
        : !activeEngineReady
          ? {
              label: 'Toolchain',
              state: 'missing' as ReadinessState,
              detail: 'Choose a working engine before toolchain checks can pass.',
              actionLabel: 'Fix engine',
              action: openCliPopup,
            }
          : usingFbuild
            ? { label: 'Toolchain', state: 'ready' as ReadinessState, detail: `${board?.label ?? 'Selected board'} toolchain downloads on first fbuild compile.` }
            : !board
              ? {
                  label: 'Toolchain',
                  state: 'missing' as ReadinessState,
                  detail: 'Choose a board first.',
                  actionLabel: 'Choose board',
                  action: openBoardPopup,
                }
              : !coreReady
                ? {
                    label: 'Toolchain',
                    state: 'missing' as ReadinessState,
                    detail: `${board.label} needs the ${board.core} core installed.`,
                    actionLabel: 'Install core',
                    action: () => { void installCore(board.core) },
                  }
                : { label: 'Toolchain', state: 'ready' as ReadinessState, detail: `${board.label} core is installed.` }

    // The row's detail is the shared port sentence, so the heading, this row
    // and the footer cannot describe one port two ways.
    const connectionRow = port.state === 'checking'
      ? { label: 'Connection', state: 'checking' as ReadinessState, detail: port.detail }
      : port.state === 'offline'
        ? {
            label: 'Connection',
            state: 'missing' as ReadinessState,
            detail: port.detail,
            actionLabel: 'Retry helper',
            action: () => { void refreshHelper() },
          }
        : port.state === 'none'
          ? {
              label: 'Connection',
              state: 'missing' as ReadinessState,
              detail: port.detail,
              actionLabel: 'Choose port',
              action: openBoardPopup,
            }
          : port.state === 'disconnected'
            ? {
                label: 'Connection',
                state: 'missing' as ReadinessState,
                detail: port.detail,
                actionLabel: 'Refresh ports',
                action: () => { void refreshPorts() },
              }
            : streaming
              ? {
                  label: 'Connection',
                  state: 'ready' as ReadinessState,
                  detail: 'Live Stream owns the port now; Upload will stop it automatically first.',
                }
              : { label: 'Connection', state: 'ready' as ReadinessState, detail: port.detail }

    return [helperRow, engineRow, coreRow, connectionRow]
  }, [
    helper,
    activeEngineReady,
    usingFbuild,
    board,
    coreReady,
    port,
    streaming,
    refreshHelper,
    openCliPopup,
    installCore,
    openBoardPopup,
    refreshPorts,
  ])

  // Warnings only: the error count is the deploy gate's own list above, which
  // validateGraph and Graph Health agree with exactly (deployGates.test.ts).
  const graphWarnings = useMemo(
    () => buildGraphDiagnostics(nodes, edges, {
      selectedFqbn, target: 'matrix', capabilityNodes: nodes, displayDocuments: customAssets.documents,
    }).filter((issue) => issue.severity === 'warning').length,
    [nodes, edges, selectedFqbn, customAssets.documents],
  )
  const layers = useMemo(() => readinessLayers({
    previewLive: graphDrivesOutput(nodes, edges),
    graphErrors: graphBlockers.length,
    graphWarnings,
    capacity: capacitySummary,
    port,
  }), [nodes, edges, graphBlockers.length, graphWarnings, capacitySummary, port])

  const readinessIssues = readiness.filter((row) => row.state !== 'ready').map((row) => `${row.label}: ${row.detail}`)
  const hasReadinessIssues = readinessIssues.length > 0

  const streamLayout = useMemo(() => streamLayoutForGraph(nodes, nodeId), [nodes, nodeId])
  async function offerValidationAfter(action: HardwareValidationAction, operation: Promise<void> | void) {
    await operation
    if (useUploadStore.getState().status.phase !== 'done') return
    const profile = buildHardwareValidationProfile({
      nodes,
      edges,
      selectedFqbn,
      helper,
      capacityResult,
      action,
    })
    // An invitation, not a form: most setups are new to the tested list, and
    // a dialog after every upload would be a chore rather than a thank-you.
    if (profile.gaps.length > 0) {
      useUiStore.getState().setStatus(
        'Uploaded. If you try it out, Share a report… on the Upload tab helps grow the list of tested builds.',
        'success',
      )
    }
  }

  function handleFlashReceiver() {
    const sketch = generateStreamReceiverSketch(nodes, nodeId)
    if (sketch) runUpload(sketch, usePsram ? psramChoice?.opt : undefined, { cache: false })
  }
  function handleFlashWiringTest() {
    const sketch = generateWiringDiagnosticSketch(nodes, nodeId)
    if (sketch) void offerValidationAfter('wiring-test', runUpload(sketch, undefined, { cache: false }))
  }
  function handleFlashHub75Topology() {
    const sketch = generateWiringDiagnosticSketch(nodes, nodeId, 'hub75-panel-topology')
    if (sketch) void offerValidationAfter('wiring-test', runUpload(sketch, undefined, { cache: false }))
  }
  function handleToggleStream() {
    if (streaming) { stopStreaming(); return }
    if (!selectedPort || !streamLayout) return
    void (async () => {
      await startStreaming(selectedPort, streamLayout)
      if (useStreamStore.getState().streaming) setValidationAction('live-stream')
    })()
  }

  const readySongs = readySongCount(entries)
  const cardReaderTip = cardReader
    ? 'The studio will pause and ask you to move the card to a reader, write the files, then ask for it back before flashing.'
    : 'Songs go to the card over serial — reliable everywhere, but minutes per song.'

  function handleShowUpload() {
    void (async () => {
      // Said before the trust prompt, because it is not a decision to make —
      // a drifted show plays the wrong patterns in time with the music, which
      // looks like a broken feature rather than a file that needs rebuilding.
      const stale = showPackagingIssues(nodes, edges, entries, getGroupRegistry())
      if (stale.length > 0) {
        useUiStore.getState().setStatus(stale[0].message, 'error')
        return
      }
      if (!(await confirmUploadIfUntrusted())) return
      // A trust dialog can outlive the document/asset snapshot it opened with.
      if (customAssets.pending || customAssets.errors.length > 0
        || customAssets.documents !== useGraphStore.getState().displayDocuments
        || customAssets.trusted !== useGraphStore.getState().trusted) return
      const payload = buildShowPayload(nodes, edges, entries, getGroupRegistry(), {
        fqbn: selectedFqbn,
        psramAllowed: !!psramOptions,
        fqbnOpt: usePsram ? psramChoice?.opt : undefined,
        projectName,
        displayDocuments: customAssets.documents,
        customDisplayAssets: customAssets.assets,
      })
      if (payload) await offerValidationAfter('sd-show', runShowUpload(payload))
    })()
  }

  function confirmUploadIfUntrusted(): Promise<boolean> {
    if (useGraphStore.getState().trusted) return Promise.resolve(true)
    return useUiStore.getState().requestConfirm({
      title: 'Upload code made on another computer?',
      message: 'Part of this project was made elsewhere and hasn’t been trusted on this computer yet. If you don’t know where it came from, have a look at it first with ‹/› View Code.',
      confirmLabel: 'Upload anyway',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
  }
  function handleUpload() {
    void (async () => {
      if (!(await confirmUploadIfUntrusted())) return
      // Generate again at the irreversible boundary. The memo above keeps View
      // Code cheap while nodes are dragged, but it can retain a pre-HMR sketch
      // in a local development session. Upload must always compile what the
      // current generator says now; only "Re-upload last sketch" intentionally
      // sends an older cached source unchanged.
      const uploadCode = generateCurrentCode()
      if (!uploadCode) return
      await offerValidationAfter(suggestedAction, runUpload(uploadCode, usePsram ? psramChoice?.opt : undefined))
    })()
  }

  function handleLastUpload() {
    void offerValidationAfter(suggestedAction, runLastUpload())
  }
  function handleExportIno() {
    void (async () => {
      if (!(await confirmUploadIfUntrusted())) return
      const exportCode = generateCurrentCode()
      if (exportCode) exportIno(exportCode)
    })()
  }

  /* The same compile an upload runs, stopping at the image instead of the
     board — so it asks the same trust question and generates the sketch at
     the same point Upload does, rather than exporting whatever View Code
     happens to be memoizing. */
  function handleExportBinary() {
    void (async () => {
      if (!(await confirmUploadIfUntrusted())) return
      const exportCode = generateCurrentCode()
      if (!exportCode) return
      await exportBinary(exportCode, usePsram ? psramChoice?.opt : undefined)
    })()
  }

  const phaseClass =
    status.phase === 'error' ? styles.stError
    : status.phase === 'done' ? styles.stDone
    : status.phase === 'idle' ? ''
    : styles.stBusy

  // One Upload button, whatever shape the graph is.
  //
  // A Performance Generator plus SD Card runs the music-sync player rather
  // than a normal sketch, so uploading provisions the card and flashes that
  // player. A standalone SD Card remains on the normal sketch path.
  const isShowUpload = hasSdShow
  const canUploadNow = isShowUpload
    ? canShowUpload && (readySongs > 0 || hasMusicPlayer)
    : canBuild

  const uploadTitle =
    busy ? status.message
    : isShowUpload
      ? readySongs === 0 && !hasMusicPlayer
        ? 'Add a Music Player pattern collection, or analyse at least one song first'
        : blockingErrors.length > 0 ? blockingErrors.join('\n')
        : readinessIssues.length > 0 ? readinessIssues.join('\n')
        : cardReader
          ? `Write ${readySongs} song${readySongs === 1 ? '' : 's'} to a card in your reader, then flash the player`
          : `Write ${readySongs} song${readySongs === 1 ? '' : 's'} to the SD card over serial, then flash the player`
      : !hasBuildOutput ? 'Connect a frame to enable upload'
        : blockingErrors.length > 0 ? blockingErrors.join('\n')
        : readinessIssues.length > 0 ? readinessIssues.join('\n')
        : 'Compile & upload to the board'

  const uploadLabel =
    status.phase === 'idle' ? (isShowUpload ? (hasMusicPlayer ? '♪ Flash Music Player' : `♪ Upload show (${readySongs})`) : '↑ Upload')
    : status.phase === 'done' ? '✓ Done'
    : status.phase === 'error' ? '✗ Error'
    : status.message

  /*
   * The bench instrument appears when it was asked for, and stays while it has
   * something to say. Keyed on the Board's own property rather than on the
   * serial connection, so it is visible *before* the upload that makes it
   * report — and kept visible while a run exists, so turning the property off
   * mid-soak cannot take the evidence off screen with it.
   */
  const telemetryAsked = useMemo(() => nodes.some((node) => node.data.nodeType === 'Board'
    && node.data.properties?.reportTelemetry === true), [nodes])
  const showTelemetry = telemetryAsked || telemetryRun !== null

  const controls = (
    <div className={styles.deployControls}>
        <div className={styles.popupHeader}>
          <div>
            <div className={styles.wizardKicker}>Upload</div>
            <div className={styles.wizardTitle}>Deploy to hardware</div>
          </div>
          {/* Nothing to close when this *is* the pane — the tab strip is how
              you leave, and an × that dismissed the whole bottom half would be
              a different action wearing the same button. */}
          {!inline && (
            <button className={styles.closeBtn} onClick={closeDeployPopup} title="Close" aria-label="Close upload tools">×</button>
          )}
        </div>

        <div className={`${styles.targetBig} ${styles.deployTarget}`}>{target}</div>
        <div className={styles.targetActionRow}>
          {/* The guided setup used to hang off the output node's strip, which
              was its only way in. Moving upload here without it would have
              quietly removed the wizard from the app. */}
          <button
            className={styles.setupBtn}
            disabled={!outputNode}
            onClick={() => { if (outputNode) openSetupWizard(outputNode.id) }}
            title={outputNode
              ? 'Open the guided LED-output setup wizard'
              : 'Add an LED output to use its setup wizard'}
          >
            ✦ Setup…
          </button>

          <div className={styles.uploadEnginePicker} role="group" aria-label="Upload engine">
            <span className={styles.uploadEngineLabel}>Engine</span>
            <div className={styles.consoleTabs}>
              <button
                type="button"
                className={usingFbuild ? styles.consoleTabActive : styles.consoleTab}
                disabled={busy || !helper?.fbuild}
                onClick={() => { void setEngine('fbuild') }}
                title={helper?.fbuild
                  ? 'Use fbuild for compiling and uploading'
                  : 'fbuild is not available on this machine'}
              >
                fbuild
              </button>
              <button
                type="button"
                className={!usingFbuild && helper ? styles.consoleTabActive : styles.consoleTab}
                disabled={busy || !helper?.arduinoCli}
                onClick={() => { void setEngine('arduino-cli') }}
                title={helper?.arduinoCli
                  ? 'Use arduino-cli for compiling and uploading'
                  : 'arduino-cli is not available on this machine'}
              >
                arduino-cli
              </button>
            </div>
          </div>
        </div>
        {hasBuildOutput && (
          /* The check compiles the whole design against the board, so it runs
           * only when asked — see capacityStore. This is the deliberate place
           * to ask: you are about to flash, which is exactly when "does it
           * fit" is worth a real build. */
          <button
            type="button"
            className={`${styles.capacityLine} ${styles.capacityButton} ${styles[CAPACITY_LEVEL_CLASS[capacitySummary.tone]]}`}
            onClick={runCapacityCheck}
            disabled={!canCheckCapacity}
            title={`${capacitySummary.line}\n\n${
              capacityResult && !capacityResult.ok && capacityResult.log
                ? `Controller-capacity check failed:\n${capacityResult.log.slice(-1500)}`
                : 'Compile this design against the selected board to measure flash/SRAM. Nothing is flashed.'
            }`}
          >
            {capacitySummary.line}
            {canCheckCapacity && (
              <span className={styles.capacityAction}>{capacityStatus === 'measured' ? ' · recheck' : ' · check'}</span>
            )}
          </button>
        )}

        <ReadinessLayers layers={layers} />

        <button
          className={`${styles.wizardButtonBase} ${styles.readinessToggle}`}
          onClick={() => setReadinessOpen((open) => !open)}
          aria-expanded={readinessOpen}
        >
          {/* Only the tools and the port: "Ready to upload" here once sat
              beside a graph with errors and a design nobody had measured. */}
          <span className={styles.readinessTitle}>Build tools &amp; port</span>
          <span className={`${styles.readinessSummary} ${hasReadinessIssues ? styles.missingBadge : styles.readyBadge}`}>
            {hasReadinessIssues ? 'Action needed' : 'Ready'}
          </span>
        </button>

        {readinessOpen && (
          <div className={styles.readinessPanel} aria-label="Build tools and port">
            {readiness.map((row) => (
              <div key={row.label} className={styles.readinessRow}>
                <div className={styles.readinessText}>
                  <div className={styles.readinessLabelRow}>
                    <span className={styles.readinessLabel}>{row.label}</span>
                    <span
                      className={
                        row.state === 'ready' ? `${styles.readinessBadge} ${styles.readyBadge}`
                        : row.state === 'checking' ? `${styles.readinessBadge} ${styles.checkingBadge}`
                        : `${styles.readinessBadge} ${styles.missingBadge}`
                      }
                    >
                      {row.state === 'ready' ? 'Ready' : row.state === 'checking' ? 'Checking' : 'Fix'}
                    </span>
                  </div>
                  <div className={styles.readinessDetail}>{row.detail}</div>
                </div>
                {row.state === 'missing' && row.actionLabel && row.action && (
                  <button
                    className={styles.readinessAction}
                    aria-label={`${row.actionLabel}: ${row.label}`}
                    onClick={row.action}
                    disabled={busy}
                    title={`${row.actionLabel}: ${row.label}`}
                  >
                    {row.actionLabel}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Only on the show path: it changes how the songs reach the card,
            and a normal sketch upload never touches one. Persisted, because it
            describes the user's desk rather than this particular upload. */}
        {isShowUpload && (
          <label className={styles.cardReaderRow} title={cardReaderTip}>
            <input
              type="checkbox"
              checked={cardReader}
              disabled={busy}
              onChange={(e) => setCardReader(e.target.checked)}
            />
            <span>
              Card reader available
              <em> — much faster song transfers</em>
            </span>
          </label>
        )}

        <div className={styles.primaryActionDock}>
          <button
            className={`${styles.wizardButtonBase} ${styles.uploadBtn} ${phaseClass}`}
            disabled={!canUploadNow || !uploadReady || busy}
            aria-busy={busy}
            onClick={isShowUpload ? handleShowUpload : handleUpload}
            title={uploadTitle}
          >
            <span className={busy ? styles.busyText : undefined}>{uploadLabel}</span>
          </button>

          {/* Only while something is running. A board compile is minutes long,
            * and the commonest reason to want out is noticing the wrong board. */}
          {busy && (
            <button
              className={`${styles.wizardButtonBase} ${styles.cancelBuildBtn}`}
              onClick={() => { void cancelUpload() }}
              disabled={status.phase === 'cancelled'}
              title="Stop the running build. Nothing is sent to the board."
            >
              {status.phase === 'cancelled' ? 'Cancelling…' : '✕ Cancel'}
            </button>
          )}
        </div>

        {graphBlockers.length > 0 && (
          <div className={styles.trustRow}>
            <span>
              {graphBlockers.length === 1 ? '1 thing' : `${graphBlockers.length} things`} to fix before uploading. Graph Health shows what, and fixes some for you.
            </span>
            <button type="button" className={styles.wizardButtonBase} onClick={showGraphHealth}>
              Show me
            </button>
          </div>
        )}
        {listedBlockers.length > 0 && (
          <div className={styles.streamError}>
            {listedBlockers.map((c) => <div key={c}>{c}</div>)}
          </div>
        )}
        {!projectTrusted && (
          <div className={styles.trustRow}>
            <span>Part of this project was made on another computer. Trust it to prepare and upload it.</span>
            <button type="button" className={styles.wizardButtonBase} onClick={trustCurrentProject}>
              Trust it
            </button>
          </div>
        )}
        {customAssets.errors.length > 0 && customAssets.trusted && (
          <button className={styles.wizardButtonBase} onClick={customAssets.retry}>
            Retry display images
          </button>
        )}

        {mirrorNotes.length > 0 && (
          <div className={styles.streamNote}>
            {mirrorNotes.map((note) => <div key={note}>{note}</div>)}
          </div>
        )}

        <section className={styles.actionGroup} aria-labelledby="firmware-actions-title">
          <div className={styles.actionGroupHeader}>
            <strong id="firmware-actions-title">Firmware</strong>
            <span>Reuse, inspect, or export the generated sketch</span>
          </div>
          <div className={styles.deployActions}>
          <button
            className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
            disabled={busy || !hasLastSketch}
            onClick={handleLastUpload}
            title={hasLastSketch ? 'Re-send the most recently uploaded sketch for this project without regenerating it' : 'Upload once to cache a quick re-upload target for this project'}
          >
            ↻ Re-upload last sketch
          </button>

          <button
            className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
            disabled={!hasBuildOutput || blockingErrors.length > 0}
            onClick={handleExportIno}
            title={!hasBuildOutput ? 'Connect a frame to enable export' : blockingErrors.length > 0 ? blockingErrors.join('\n') : 'Download the generated .ino sketch'}
          >
            ↓ Export .ino
          </button>

          <button
            className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
            disabled={busy || !hasBuildOutput || blockingErrors.length > 0 || !activeEngineReady}
            onClick={handleExportBinary}
            title={
              !hasBuildOutput ? 'Connect a frame to enable export'
              : blockingErrors.length > 0 ? blockingErrors.join('\n')
              : !activeEngineReady ? 'Start the local helper to compile a firmware image'
              : busy ? status.message
              : 'Compile this design and download the firmware image (nothing is sent to the board)'
            }
          >
            ↓ Export Binary
          </button>

          <button
            className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
            disabled={!hasBuildOutput || !code}
            onClick={openCodeView}
            title={hasBuildOutput ? 'View the generated .ino sketch' : 'Connect a frame to view the generated .ino sketch'}
          >
            {'</>'} View Code
          </button>
          </div>
        </section>

        <section className={styles.actionGroup} aria-labelledby="diagnostic-actions-title">
          <div className={styles.actionGroupHeader}>
            <strong id="diagnostic-actions-title">Diagnostics</strong>
            <span>Flash focused tests before trusting the full design</span>
          </div>
          <div className={styles.deployActions}>
          <button
            className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
            disabled={!outputNode || !uploadReady || blockingErrors.length > 0 || busy}
            onClick={handleFlashWiringTest}
            title={
              !outputNode
                ? 'Add an LED output to flash its wiring test'
                : blockingErrors.length > 0
                ? blockingErrors.join('\n')
                : readinessIssues.length > 0
                  ? readinessIssues.join('\n')
                  : 'Flash a standalone wiring diagnostic sketch using the current Board controller settings plus this output’s pins, color order, and layout'
            }
          >
            🧪 Flash Wiring Test
          </button>

          {isHub75 && (
            <button
              className={`${styles.wizardButtonBase} ${styles.exportBtn} ${styles.topologyBtn}`}
              disabled={!uploadReady || busy || streaming || blockingErrors.length > 0 || hub75TopologyErrors.length > 0}
              onClick={handleFlashHub75Topology}
              title={
                hub75TopologyErrors.length > 0
                  ? hub75TopologyErrors.join('\n')
                  : blockingErrors.length > 0
                    ? blockingErrors.join('\n')
                  : readinessIssues.length > 0
                    ? readinessIssues.join('\n')
                    : 'Hold a dedicated per-panel HUB75 topology pattern using the current panel grid, serpentine chain, and tile-rotation settings'
              }
            >
              🧭 Flash HUB75 Topology
            </button>
          )}
          </div>

          <div className={styles.validationCard}>
            <div className={styles.validationCardText}>
              <strong>Tried it on your hardware?</strong>
              <span>A quick report of what worked helps grow the list of tested builds.</span>
            </div>
            <button className={styles.validationCardButton} onClick={() => setValidationAction(suggestedAction)}>
              Share a report…
            </button>
          </div>
        </section>

        <section className={styles.actionGroup} aria-labelledby="live-actions-title">
          <div className={styles.actionGroupHeader}>
            <strong id="live-actions-title">Live control</strong>
            <span>Prepare the receiver, then stream preview frames</span>
          </div>
          <div className={styles.deployActions}>
          <button
            className={`${styles.wizardButtonBase} ${styles.exportBtn}`}
            disabled={!outputNode || !canBuild || !uploadReady || busy || streaming}
            onClick={handleFlashReceiver}
            title={!outputNode
              ? 'Add an LED output to use live frame streaming'
              : readinessIssues.length > 0
                ? readinessIssues.join('\n')
                : 'Flash a tiny generic receiver sketch once — after that, Live Stream pushes preview frames straight to the board without recompiling'}
          >
            ⚡ Flash Stream Receiver
          </button>

          <button
            className={`${styles.wizardButtonBase} ${styles.exportBtn} ${streaming ? styles.streamBtnActive : ''}`}
            disabled={!outputNode || !canBuild || busy || !helperReady || !portDetected}
            onClick={handleToggleStream}
            title={
              !outputNode
                ? 'Add an LED output to use live frame streaming'
                : streaming
                ? 'Stop pushing live preview frames to the board'
                : !helperReady
                  ? 'Start the local helper to enable live streaming'
                  : !portDetected
                    ? port.detail
                    : 'Push live preview frames to a board already running the Stream Receiver sketch'
            }
          >
            {streaming ? `⏹ Streaming — ${streamFps} fps` : '📡 Live Stream'}
          </button>
          </div>
          {liveStreamNotes.length > 0 && (
            <div className={styles.streamNote}>
              {liveStreamNotes.map((note) => <div key={note}>{note}</div>)}
            </div>
          )}
        </section>

        {streamError && <div className={styles.streamError}>{streamError}</div>}
    </div>
  )

  /* Both of these paint a fixed-position overlay, so they are deliberately not
     part of `controls`: portaled into the sidebar they would sit under its
     `will-change: transform`, which makes that panel the containing block and
     would confine a full-screen dialog to the sidebar's own width. */
  const modals = (
    <>
      {codeViewOpen && (
        <CodeViewPopup
          code={code}
          onUpload={handleUpload}
          uploadDisabled={!canBuild || !uploadReady || busy}
          uploadTitle={
            busy ? status.message
            : !hasBuildOutput ? 'Connect a frame to enable upload'
            : blockingErrors.length > 0 ? blockingErrors.join('\n')
            : readinessIssues.length > 0 ? readinessIssues.join('\n')
            : 'Compile & upload to the board'
          }
          busy={busy}
        />
      )}
      {validationAction && (
        <HardwareValidationPopup
          nodes={nodes}
          edges={edges}
          selectedFqbn={selectedFqbn}
          helper={helper}
          capacityResult={capacityResult}
          initialAction={validationAction}
          onClose={() => setValidationAction(null)}
        />
      )}
    </>
  )

  /* The card reads the console's one serial connection, so it travels with the
     console rather than with `controls` — the docked branch below renders the
     console alone, and the card has to follow it there too. */
  const consolePane = (
    <>
      <OutputConsole embedded />
      {showTelemetry && <DeviceTelemetryCard />}
    </>
  )

  const body = (
    <div className={styles.deployWorkbench}>
      {controls}
      {consolePane}
    </div>
  )

  if (inline) {
    const docked = controlsHost !== null
    return (
      <>
        {docked && createPortal(
          <div className={styles.deployDock}>{controls}</div>,
          controlsHost,
        )}
        <div
          className={styles.inlineDeploy}
          style={{ marginLeft: leftInset, marginRight: rightInset }}
        >
          {docked ? consolePane : body}
          {modals}
        </div>
      </>
    )
  }

  return (
    <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) closeDeployPopup() }}>
      <div
        ref={dialogRef}
        className={`${styles.popup} ${styles.deployPopup}`}
        role="dialog"
        aria-modal="true"
        aria-label="Upload tools"
        tabIndex={-1}
      >
        {body}
        {modals}
      </div>
    </div>
  )
}
