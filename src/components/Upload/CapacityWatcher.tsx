import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getGroupRegistry, useRootEdges, useRootNodes } from '../../state/graphStore'
import { boardByFqbn, engineReady, useUploadStore } from '../../state/uploadStore'
import { useCapacityStore } from '../../state/capacityStore'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch, isPatternShow } from '../../codegen/showGenerator'
import { buildShowPlayerForMeasurement, sdShowConnected } from '../../utils/showUpload'
import { useCodegenGraph } from '../../utils/codegenGraph'
import { controllerSettings } from '../../state/controllerSettings'

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
  const { helper, installedCores, selectedFqbn } = useUploadStore(useShallow((s) => ({
    helper: s.helper,
    installedCores: s.installedCores,
    selectedFqbn: s.selectedFqbn,
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

  /*
   * PSRAM is a controller setting. Measuring a different FQBN option than the
   * one an upload would use is the one way this meter could quietly lie.
   *
   * The show path takes none of it. `runShowUpload` flashes plain
   * `selectedFqbn`, and the player deliberately includes the no-PSRAM build of
   * ESP32-audioI2S — so measuring a PSRAM build there would understate exactly
   * the internal-DRAM figure that overflows.
   */
  const psramOptions = isShow ? undefined : board?.psram
  const controller = controllerSettings(nodes)
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
      return buildShowPlayerForMeasurement(codegenGraph.nodes, codegenGraph.edges, groups, selectedFqbn)
    }
    if (!hasFrameInput) return null
    const opts = { psramAllowed: !!psramOptions }
    return isPatternShow(codegenGraph.nodes, codegenGraph.edges)
      ? generateShowSketch(codegenGraph.nodes, codegenGraph.edges, groups, opts)
      : generateCpp(codegenGraph.nodes, codegenGraph.edges, groups, opts)
  }, [codegenGraph, psramOptions, hasFrameInput, isShow, selectedFqbn])

  // Published even with nothing to build: a skipped call would leave the
  // previous reading on screen describing a graph that no longer exists.
  useEffect(() => {
    setCapacityTarget({
      code: capacityCode,
      fqbn: fqbnWithOpt,
      toolchainReady,
      engineTag: helper?.engine,
      subject: isShow ? 'player' : 'sketch',
    })
  }, [capacityCode, fqbnWithOpt, toolchainReady, helper?.engine, isShow, setCapacityTarget])

  return null
}
