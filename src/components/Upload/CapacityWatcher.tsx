import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getGroupRegistry, useGraphStore } from '../../state/graphStore'
import { boardByFqbn, engineReady, useUploadStore } from '../../state/uploadStore'
import { useCapacityStore } from '../../state/capacityStore'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch, isPatternShow } from '../../codegen/showGenerator'
import { useCodegenGraph } from '../../utils/codegenGraph'

/**
 * Drives the live controller-capacity check. Renders nothing.
 *
 * It used to live in the LED output's node body, which was always mounted and
 * so kept the check running while you composed — that ambient "will it fit"
 * signal is the whole point of the meter. Upload has moved to the hardware
 * pane, and a pane can be collapsed to nothing on purpose, so hosting it there
 * would silently stop the check exactly when someone hides the bench to get
 * more canvas. Mounted at the app instead, where nothing can turn it off.
 *
 * Headless because it is not a view: several places read the result — the
 * upload tab, the pattern collection's delta readout — and none of them should
 * have to be on screen for the measurement to happen.
 */
export default function CapacityWatcher() {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const { helper, installedCores, selectedFqbn } = useUploadStore(useShallow((s) => ({
    helper: s.helper,
    installedCores: s.installedCores,
    selectedFqbn: s.selectedFqbn,
  })))
  const requestCapacityCheck = useCapacityStore((s) => s.request)

  const board = boardByFqbn(selectedFqbn)
  const usingFbuild = helper?.engine === 'fbuild'
  const coreReady = !!board && (usingFbuild || installedCores.includes(board.core))
  const toolchainReady = !!helper && engineReady(helper) && coreReady

  /*
   * PSRAM is read from whichever output asks for it rather than from one
   * chosen node: the sketch is per *board*, and `generateCpp` already turns it
   * on when any output does. Measuring a different FQBN option than the one an
   * upload would use is the one way this meter could quietly lie.
   */
  const psramOptions = board?.psram
  const psramNode = nodes.find((node) =>
    node.data.nodeType === 'MatrixOutput'
    && (node.data.properties as Record<string, unknown>).usePsram === true)
  const psramMode = (psramNode?.data.properties as Record<string, unknown> | undefined)?.psramMode
  const psramChoice = psramOptions?.find((option) => option.id === psramMode) ?? psramOptions?.[0]
  const fqbnWithOpt = psramNode && psramChoice ? `${selectedFqbn}:${psramChoice.opt}` : selectedFqbn

  // Nothing reaches the LEDs until a frame does, and a sketch with no frame
  // measures a design nobody is building.
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
    if (!hasFrameInput) return null
    const groups = getGroupRegistry()
    const opts = { psramAllowed: !!psramOptions }
    return isPatternShow(codegenGraph.nodes, codegenGraph.edges)
      ? generateShowSketch(codegenGraph.nodes, codegenGraph.edges, groups, opts)
      : generateCpp(codegenGraph.nodes, codegenGraph.edges, groups, opts)
  }, [codegenGraph, psramOptions, hasFrameInput])

  useEffect(() => {
    if (!capacityCode) return
    requestCapacityCheck(capacityCode, fqbnWithOpt, toolchainReady, helper?.engine)
  }, [capacityCode, fqbnWithOpt, toolchainReady, helper?.engine, requestCapacityCheck])

  return null
}
