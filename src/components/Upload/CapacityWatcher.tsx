import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getGroupRegistry, useGraphStore, useRootEdges, useRootNodes } from '../../state/graphStore'
import { boardByFqbn, boardHasUsbCdc, engineReady, useUploadStore } from '../../state/uploadStore'
import { useCapacityStore } from '../../state/capacityStore'
import { bakeBrowserThumbnails } from '../../utils/browserThumbnails'
import { bakeDisplayArtworks } from '../../utils/transportArtworks'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch, isPatternShow } from '../../codegen/showGenerator'
import { buildShowPlayerForMeasurement, sdShowConnected } from '../../utils/showUpload'
import { useCodegenGraph } from '../../utils/codegenGraph'
import { controllerSettings } from '../../state/controllerSettings'
import { selectedBoardFlashMb, selectedPhysicalBoardProfile } from '../../build/boardProfiles'
import { resolveUsbCdcOnBoot } from '../../state/serialRouting'

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
  const isShow = useMemo(() => sdShowConnected(nodes, edges), [nodes, edges])
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
  const hasFrameInput = useMemo(
    () => edges.some((edge) => (edge.targetHandle ?? '') === 'frame'
      && nodes.some((node) => node.id === edge.target && node.data.nodeType === 'MatrixOutput')),
    [edges, nodes],
  )

  // Keyed on the codegen-relevant graph rather than the raw arrays: React Flow
  // hands a fresh `nodes` array on every pointer move of a drag, which would
  // otherwise re-run the whole sketch generator ~60x/sec for output that node
  // positions cannot affect.
  const codegenGraph = useCodegenGraph(nodes, edges)
  const capacityCode = useMemo(() => {
    const groups = getGroupRegistry()
    if (isShow) {
      return buildShowPlayerForMeasurement(codegenGraph.nodes, codegenGraph.edges, groups, selectedFqbn, psramSupported)
    }
    if (!hasFrameInput) return null
    // Thumbnails are flash, and this is the thing that measures flash — leaving
    // them out understates a Pattern Browser build, which is exactly the build
    // most likely to be near the ceiling.
    const opts = {
      psramAllowed: psramSupported,
      thumbnails: bakeBrowserThumbnails(
        codegenGraph.nodes, codegenGraph.edges, groups,
        useGraphStore.getState().trusted, useGraphStore.getState().graphs,
      ),
      artworks: bakeDisplayArtworks(
        codegenGraph.nodes, codegenGraph.edges, groups,
        useGraphStore.getState().trusted,
      ),
    }
    return isPatternShow(codegenGraph.nodes, codegenGraph.edges)
      ? generateShowSketch(codegenGraph.nodes, codegenGraph.edges, groups, opts)
      : generateCpp(codegenGraph.nodes, codegenGraph.edges, groups, opts)
  }, [codegenGraph, psramSupported, hasFrameInput, isShow, selectedFqbn])

  // Published even with nothing to build: a skipped call would leave the
  // previous reading on screen describing a graph that no longer exists.
  useEffect(() => {
    setCapacityTarget({
      code: capacityCode,
      fqbn: fqbnWithOpt,
      toolchainReady,
      engineTag: helper?.engine,
      subject: isShow ? 'player' : 'sketch',
      flashMb,
      usbCdcOnBoot,
    })
  }, [capacityCode, fqbnWithOpt, toolchainReady, helper?.engine, isShow, flashMb, usbCdcOnBoot, setCapacityTarget])

  return null
}
