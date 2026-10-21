import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore, useRootEdges, useRootNodes } from '../../state/graphStore'
import { boardByFqbn, boardHasUsbCdc, engineReady, useUploadStore } from '../../state/upload/uploadStore'
import { useCapacityStore } from '../../state/upload/capacityStore'
import { bakeBrowserThumbnails } from '../../utils/browserThumbnails'
import { collectionPatternNames } from '../../utils/patternNames'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch } from '../../codegen/showGenerator'
import { analysedShows, buildShowPlayerForMeasurement } from '../../utils/showUpload'
import { useMusicStore } from '../../state/player/musicStore'
import { codegenSignature, registrySignature, useCodegenGraph } from '../../utils/codegenGraph'
import { controllerSettings } from '../../build/controllerSettings'
import { selectedBoardFlashMb, selectedPhysicalBoardProfile } from '../../build/boards/boardProfiles'
import { resolveUsbCdcOnBoot } from '../../state/upload/serialRouting'
import { useProjectStore } from '../../state/projectStore'
import { useCustomDisplayAssets } from '../../hooks/useCustomDisplayAssets'
import { resolveBuildMode } from '../../state/upload/buildMode'
import { findFirmwareRamBudgetIssue } from '../../utils/validateGraph'

/**
 * Keeps the capacity store pointed at what an Upload would actually build.
 * Renders nothing, and — since the check became user-initiated — compiles
 * nothing: it publishes the target, and pressing Check is what runs it.
 *
 * Still mounted at the app rather than in a panel. The target has to stay
 * current wherever you are, because that is what tells an existing reading it
 * has gone out of date; hosting it in the hardware pane would freeze the
 * staleness test exactly when someone collapses the bench for more canvas, and
 * leave an old number looking current.
 *
 * Headless because it is not a view: several places read the result — the
 * hardware readiness strip, the deploy popup, the pattern collection's delta
 * readout — and none of them should have to be on screen for the target to
 * track the graph.
 */
// Stable small ids for inputs that are compared by identity in the key.
const identities = new WeakMap<object, number>()
let nextIdentity = 0
function identityToken(value: object | undefined): string {
  if (!value) return 'none'
  let id = identities.get(value)
  if (id === undefined) { id = ++nextIdentity; identities.set(value, id) }
  return String(id)
}

export default function CapacityWatcher() {
  const nodes = useRootNodes()
  const edges = useRootEdges()
  const { helper, installedCores, selectedFqbn, selectedPort, ports } = useUploadStore(useShallow((s) => ({
    helper: s.helper,
    installedCores: s.installedCores,
    selectedFqbn: s.selectedFqbn,
    selectedPort: s.selectedPort,
    ports: s.ports,
  })))
  const setCapacityTarget = useCapacityStore((s) => s.setTarget)
  const projectName = useProjectStore((s) =>
    s.projects.find((project) => project.id === s.currentProjectId)?.name ?? '')

  const board = boardByFqbn(selectedFqbn)
  const usingFbuild = helper?.engine === 'fbuild'
  const coreReady = !!board && (usingFbuild || installedCores.includes(board.core))
  const toolchainReady = !!helper && engineReady(helper) && coreReady

  /*
   * An SD show flashes the *player*, not the sketch these generators produce —
   * a different binary with the audio and SD libraries, showA/showB, and a
   * buffer per collected pattern, always larger. Measuring the sketch while
   * Upload flashes the player reported comfortable headroom for designs that
   * could not link, so the subject is chosen with the same predicate the
   * Upload button uses.
   */
  const build = useMemo(() => resolveBuildMode(nodes, edges), [nodes, edges])
  const isShow = build.mode === 'player'
  // Measured against the module's own flash, not the generic board id's.
  const flashMb = useMemo(() => selectedBoardFlashMb(nodes), [nodes])

  /* PSRAM is a controller setting. The player, capacity check, and upload all
   * use this same option so the measured internal-DRAM figure describes the
   * binary that will actually be flashed. */
  const psramOptions = board?.psram
  const physicalProfile = selectedPhysicalBoardProfile(nodes)
  const psramSupported = !!psramOptions || !!physicalProfile?.psramMode
  const controller = controllerSettings(nodes)
  // Which socket `Serial` uses is part of the build, so the check must measure
  // the same env the upload would flash.
  const serialPort = ports.find((port) => port.address === selectedPort)
  const usbCdcOnBoot = boardHasUsbCdc(selectedFqbn)
    && resolveUsbCdcOnBoot(controller.serialRoute, serialPort)
  const psramChoice = psramOptions?.find((option) => option.id === controller.psramMode) ?? psramOptions?.[0]
  const fqbnWithOpt = controller.usePsram && psramChoice ? `${selectedFqbn}:${psramChoice.opt}` : selectedFqbn

  // Nothing reaches the LEDs until a frame does, and a sketch with no frame
  // measures a design nobody is building. A show is exempt: its LEDs are
  // driven by the player's own pattern dispatch, not by a wired frame.
  // Keyed on the codegen-relevant graph rather than the raw arrays: React Flow
  // hands a fresh `nodes` array on every pointer move of a drag, which would
  // otherwise re-run the whole sketch generator ~60x/sec for output that node
  // positions cannot affect.
  const codegenGraph = useCodegenGraph(nodes, edges)
  const codegenBuild = useMemo(
    () => resolveBuildMode(codegenGraph.nodes, codegenGraph.edges),
    [codegenGraph],
  )
  // A performance player compiles the transitions its shows name.
  const shows = useMusicStore(useShallow((s) => analysedShows(s.entries)))
  const customAssets = useCustomDisplayAssets(codegenGraph.nodes,
    build.capabilities.buildable, codegenGraph.edges)
  const ramBudgetIssue = useMemo(
    () => findFirmwareRamBudgetIssue(codegenGraph.nodes, codegenGraph.edges, customAssets.documents),
    [codegenGraph, customAssets.documents],
  )
  // The registry the assets hook already holds: its identity changes only when
  // a subgraph does, so a click anywhere leaves this memo alone.
  const groups = customAssets.groups
  const graphs = useGraphStore((s) => s.graphs)
  /*
   * What a check would compile, as a generator and the fingerprint of its
   * inputs — not the sketch itself. Generating it walks every collected
   * pattern and bakes their thumbnails, seconds of main-thread work for a
   * large collection; doing that on each edit just to keep the staleness key
   * current froze the editor on every change. The check generates it once,
   * when pressed.
   */
  const capacityInput = useMemo(() => {
    if (customAssets.pending || customAssets.errors.length > 0
      || customAssets.routingErrors.length > 0 || ramBudgetIssue) return null
    if (codegenBuild.mode !== 'player' && !codegenBuild.capabilities.buildable) return null
    const inputKey = [
      codegenBuild.mode, selectedFqbn, String(psramSupported), projectName, String(customAssets.trusted),
      codegenSignature(codegenGraph.nodes, codegenGraph.edges),
      registrySignature(groups),
      JSON.stringify(Object.values(graphs).map((graph) => [graph.id, graph.name])),
      identityToken(shows), identityToken(customAssets.documents), identityToken(customAssets.assets),
    ].join('\u0000')
    // Thumbnails are flash, and this is the thing that measures flash — leaving
    // them out understates a Pattern Browser build, which is exactly the build
    // most likely to be near the ceiling.
    const generate = (): string => {
      if (codegenBuild.mode === 'player') {
        const sketch = buildShowPlayerForMeasurement(
          codegenGraph.nodes, codegenGraph.edges, groups, selectedFqbn, psramSupported, projectName,
          { displayDocuments: customAssets.documents, customDisplayAssets: customAssets.assets, shows },
        )
        // Null only for a non-player build, which this branch has ruled out.
        if (sketch === null) throw new Error('the design is no longer a player build')
        return sketch
      }
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
          codegenGraph.nodes, codegenGraph.edges, graphs,
          codegenBuild.templateDisplaySourceIds ?? undefined,
        ),
        displayDocuments: customAssets.documents,
        customDisplayAssets: customAssets.assets,
      }
      return codegenBuild.mode === 'show'
        ? generateShowSketch(codegenGraph.nodes, codegenGraph.edges, groups, opts)
        : generateCpp(codegenGraph.nodes, codegenGraph.edges, groups, opts)
    }
    return { generate, inputKey }
  }, [codegenGraph, codegenBuild, groups, graphs, psramSupported, selectedFqbn, projectName, ramBudgetIssue, shows,
    customAssets.pending, customAssets.errors, customAssets.routingErrors,
    customAssets.documents, customAssets.assets, customAssets.trusted])

  // Published even with nothing to build: a skipped call would leave the
  // previous reading on screen describing a graph that no longer exists.
  useEffect(() => {
    setCapacityTarget({
      generate: capacityInput?.generate ?? null,
      inputKey: capacityInput?.inputKey ?? '',
      preparing: customAssets.pending,
      awaitingTrust: !customAssets.trusted && customAssets.errors.length > 0,
      // Only what asset preparation itself could not do. A routing error is
      // reported as `blockedByGraph` instead, so the meter can point at Graph
      // Health rather than recite a sentence Graph Health already carries.
      preparationError: [
        ...customAssets.errors.filter((message) => !customAssets.routingErrors.includes(message)),
        ...(ramBudgetIssue ? [ramBudgetIssue.message] : []),
      ].join('\n'),
      blockedByGraph: customAssets.routingErrors.length > 0,
      fqbn: fqbnWithOpt,
      toolchainReady,
      engineTag: helper?.engine,
      subject: isShow ? 'player' : 'sketch',
      flashMb,
      usbCdcOnBoot,
    })
  }, [capacityInput, customAssets.pending, customAssets.trusted, customAssets.errors, customAssets.routingErrors, ramBudgetIssue, fqbnWithOpt, toolchainReady, helper?.engine, isShow, flashMb, usbCdcOnBoot, setCapacityTarget])

  return null
}
