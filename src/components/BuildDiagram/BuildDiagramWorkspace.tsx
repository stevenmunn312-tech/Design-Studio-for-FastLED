import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { createPortal, flushSync } from 'react-dom'
import {
  boardProfileById,
  isBoardProfileCompatibleWithFqbn,
  selectedPhysicalBoardProfile,
  type PhysicalBoardPinAnchor,
  type PhysicalBoardProfile,
  type PhysicalBoardPinProfile,
} from '../../build/boardProfiles'
import {
  ensureBuildProfile,
  fingerprintValue,
  type BuildExportMode,
} from '../../build/buildProfile'
import { calculateElectricalPlan } from '../../build/electricalPlan'
import { bomCsv, buildBomRows, buildConnectionRows, connectionsCsv } from '../../build/buildExports'
import { boardPinForUse, boardPinLabelForUse, buildHardwareManifest, type HardwareManifestItem, type HardwarePinUse } from '../../build/hardwareManifest'
import { fuseBlockAllocations } from '../../build/powerDistribution'
import { rootGraphNodes, useGraphStore, useRootEdges, useRootNodes } from '../../state/graphStore'
import { useProjectStore } from '../../state/projectStore'
import { boardByFqbn, useUploadStore } from '../../state/uploadStore'
import PhysicalAssemblyDiagram from './PhysicalAssemblyDiagram'
import BuildPrintSheets from './BuildPrintSheets'
import {
  availableSections,
  buildSectionById,
  DEFAULT_SECTION_ID,
  sectionIncludesItem,
  type BuildSectionId,
} from './diagramSections'
import {
  COMMON_NET_CALLOUT_GAP,
  COMMON_NET_CALLOUT_HEIGHT,
  DIAGRAM_LEGEND_BAND,
  diagramContentBottom,
  physicalAssemblyDiagramHeight,
} from './physicalDiagramLayout'
import { inlineSvgImages } from './svgExport'
import { panOffsetForPointerZoom } from './viewportZoom'
import styles from './BuildDiagramWorkspace.module.css'

interface DiagramConnection {
  id: string
  itemId: string
  itemTitle: string
  itemSubtitle: string
  pinUse: HardwarePinUse
  boardPin?: PhysicalBoardPinProfile
  boardAnchor?: PhysicalBoardPinAnchor
  controllerX?: number
  controllerY?: number
  deviceX: number
  deviceY: number
  unresolvedReason?: string
}

type DiagramPan = { x: number; y: number }
type ViewportPanState = { pointerId: number; startX: number; startY: number; startPan: DiagramPan }

const MIN_ZOOM = 0.55
/** Fit may go lower so a tall sheet (a 13-wire shield, a PSU stack) still frames. */
const FIT_MIN_ZOOM = 0.2
const MAX_ZOOM = 1.8
const ZOOM_STEP = 0.15
const FIT_PADDING = 48
const PANEL_WIDTH_STEP = 32
const DEFAULT_SIDEBAR_WIDTH = 340
const MIN_SIDEBAR_WIDTH = 280
const MAX_SIDEBAR_WIDTH = 420

function downloadBuildFile(contents: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function formatFactValue(value: unknown): string {
  if (value == null) return 'Unknown'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function formatFactLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (char) => char.toUpperCase())
}

function formatCurrentMa(value: number): string {
  if (!Number.isFinite(value)) return 'Unknown'
  if (value >= 1000) return `${(value / 1000).toFixed(2).replace(/\.?0+$/, '')} A`
  return `${Math.round(value)} mA`
}

function formatWattage(value: number): string {
  if (!Number.isFinite(value)) return 'Unknown'
  return `${value.toFixed(1).replace(/\.0$/, '')} W`
}

function formatVoltage(value: number): string {
  if (!Number.isFinite(value)) return 'Unknown'
  return `${value.toFixed(2).replace(/\.?0+$/, '')} V`
}

function confidenceSummary(profile: PhysicalBoardProfile): string {
  if (profile.confidence === 'manufacturer-verified') return 'Manufacturer verified'
  if (profile.confidence === 'pinout-verified') return 'Pinout verified only - power-path review still pending.'
  return 'Visual match only - wiring guidance stays disabled.'
}

function itemFingerprint(
  item: HardwareManifestItem,
  selectedFqbn: string,
  exactBoardProfileId: string | undefined,
): string {
  return fingerprintValue({
    selectedFqbn,
    exactBoardProfileId,
    item: {
      id: item.id,
      kind: item.kind,
      supported: item.supported,
      facts: item.facts,
      pins: item.pins.map((pin) => ({
        propertyKey: pin.propertyKey,
        pin: pin.pin,
        requirement: pin.requirement,
      })),
    },
  })
}

function EyeIcon({ crossed = false }: { crossed?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.7" />
      {crossed && <path d="M4 4l16 16" />}
    </svg>
  )
}

function IsolateIcon({ active = false }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" className={active ? styles.iconFill : undefined} />
      <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
    </svg>
  )
}

function DoneIcon({ active = false }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" className={active ? styles.iconFill : undefined} />
      <path d="m7.5 12 3 3 6-7" />
    </svg>
  )
}

function controllerBoxSize(anchors: PhysicalBoardPinAnchor[] | undefined) {
  const maxX = Math.max(280, ...(anchors ?? []).map((anchor) => anchor.x))
  const maxY = Math.max(280, ...(anchors ?? []).map((anchor) => anchor.y))
  return {
    width: maxX + 36,
    height: maxY + 44,
  }
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))))
}

function clampFitZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(FIT_MIN_ZOOM, Number(value.toFixed(2))))
}

function boundsForLayouts(
  controllerBox: { x: number; y: number; width: number; height: number },
  layouts: Array<{ x: number; y: number; width: number; height: number }>,
) {
  const right = layouts.length > 0
    ? Math.max(controllerBox.x + controllerBox.width, ...layouts.map((layout) => layout.x + layout.width))
    : controllerBox.x + controllerBox.width
  const bottom = layouts.length > 0
    ? Math.max(controllerBox.y + controllerBox.height, ...layouts.map((layout) => layout.y + layout.height))
    : controllerBox.y + controllerBox.height
  return {
    x: 0,
    y: 0,
    width: right + 40,
    height: bottom + 40,
  }
}

export default function BuildDiagramWorkspace() {
  // The whole diagram describes physical hardware, which lives in the root
  // graph — so it reads the root graph even while a pattern group is open on
  // the canvas, rather than showing an empty bench with no board.
  const nodes = useRootNodes()
  const edges = useRootEdges()
  const storedBuildProfile = useGraphStore((state) => state.buildProfile)
  const updateBuildProfile = useGraphStore((state) => state.updateBuildProfile)
  const selectedFqbn = useUploadStore((state) => state.selectedFqbn)
  const manifest = useMemo(() => buildHardwareManifest(nodes, edges, selectedFqbn), [nodes, edges, selectedFqbn])
  const buildProfile = ensureBuildProfile(storedBuildProfile)
  // The Board node is where the user says which controller is on the bench, so
  // it is the only place this view may read that from. Keeping a second exact
  // board selection in the build profile once let the two views disagree.
  const benchBoardProfileId = useGraphStore((state) => selectedPhysicalBoardProfile(rootGraphNodes(state))?.id)
  // A chosen exact board only applies while it still matches the upload target.
  // Switching FQBN used to leave the old board's render and pin map in place —
  // an ESP32 wiring diagram presented as if it were for the newly selected S3.
  // Dropping back to the empty state sends the user to the Hardware tab rather
  // than quietly showing wiring for hardware that is no longer selected. The id
  // stays on the Board node, so switching the target back restores it.
  const exactBoard = isBoardProfileCompatibleWithFqbn(benchBoardProfileId, selectedFqbn)
    ? boardProfileById(benchBoardProfileId ?? '')
    : undefined
  const selectedTarget = boardByFqbn(selectedFqbn)
  const [selectedItemId, setSelectedItemId] = useState<string>(() => exactBoard ? 'controller' : '')
  const [isolatedItemId, setIsolatedItemId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [diagramZoom, setDiagramZoom] = useState(1)
  const [diagramPan, setDiagramPan] = useState<DiagramPan>({ x: 0, y: 0 })
  const [printSheetsMounted, setPrintSheetsMounted] = useState(false)
  const [sectionId, setSectionId] = useState<BuildSectionId>(DEFAULT_SECTION_ID)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const diagramCanvasRef = useRef<HTMLDivElement | null>(null)
  const panStateRef = useRef<ViewportPanState | null>(null)

  const primaryItems = manifest.primaryItems
  const outputItems = useMemo(() => primaryItems.filter((item) => item.kind === 'matrix-output'), [primaryItems])
  const sections = useMemo(() => availableSections(primaryItems), [primaryItems])
  const activeSection = buildSectionById(
    sections.some((section) => section.id === sectionId) ? sectionId : DEFAULT_SECTION_ID,
  )
  const currentFingerprints = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of primaryItems) {
      map.set(item.id, itemFingerprint(
        item,
        selectedFqbn,
        benchBoardProfileId,
      ))
    }
    return map
  }, [benchBoardProfileId, primaryItems, selectedFqbn])

  const completedItemIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of primaryItems) {
      const done = buildProfile.done?.[item.id]
      const fingerprint = currentFingerprints.get(item.id)
      if (done && done.fingerprint === fingerprint) ids.add(item.id)
    }
    return ids
  }, [buildProfile.done, currentFingerprints, primaryItems])

  const isItemDone = (itemId: string) => {
    return completedItemIds.has(itemId)
  }

  const visiblePrimaryItems = useMemo(() => {
    const items = primaryItems.filter((item) =>
      buildProfile.visibility?.[item.id] !== false && sectionIncludesItem(activeSection, item))
    if (isolatedItemId) return items.filter((item) => item.id === isolatedItemId)
    return items
  }, [activeSection, buildProfile.visibility, isolatedItemId, primaryItems])

  useEffect(() => {
    const availableIds = new Set(['controller', ...visiblePrimaryItems.map((item) => item.id)])
    if (selectedItemId && !availableIds.has(selectedItemId)) {
      setSelectedItemId('')
    }
  }, [selectedItemId, visiblePrimaryItems])

  /**
   * The printed sheets are several full copies of the diagram, so they are only
   * built for the print itself rather than kept mounted while the user edits.
   * `flushSync` is what makes that safe: the browser snapshots the page as soon
   * as the beforeprint handler returns, so the render has to have happened by
   * then. Ctrl+P and the Print button both land here.
   */
  useEffect(() => {
    const mount = () => flushSync(() => setPrintSheetsMounted(true))
    const unmount = () => setPrintSheetsMounted(false)
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null
    const onMediaChange = (event: MediaQueryListEvent) => (event.matches ? mount() : unmount())
    window.addEventListener('beforeprint', mount)
    window.addEventListener('afterprint', unmount)
    media?.addEventListener?.('change', onMediaChange)
    return () => {
      window.removeEventListener('beforeprint', mount)
      window.removeEventListener('afterprint', unmount)
      media?.removeEventListener?.('change', onMediaChange)
    }
  }, [])

  const selectedItem = selectedItemId === 'controller'
    ? manifest.controller
    : manifest.items.find((item) => item.id === selectedItemId) ?? manifest.controller
  const exportMode: BuildExportMode = buildProfile.exportMode ?? 'complete-build'

  const hiddenPrimaryItemCount = primaryItems.filter((item) => buildProfile.visibility?.[item.id] === false).length
  const electricalPlan = useMemo(
    () => calculateElectricalPlan(manifest, buildProfile, exactBoard),
    [buildProfile, exactBoard, manifest],
  )
  const visibleElectricalPlan = useMemo(() => {
    const visibleIds = new Set(visiblePrimaryItems.map((item) => item.id))
    return calculateElectricalPlan({
      ...manifest,
      items: manifest.items.filter((item) => visibleIds.has(item.id)),
      primaryItems: visiblePrimaryItems,
      unsupportedItems: [],
    }, buildProfile, exactBoard)
  }, [buildProfile, exactBoard, manifest, visiblePrimaryItems])
  const extenderOutputCount = outputItems.filter((item) => typeof item.facts.dataLinkPartId === 'string').length
  const partsSummary = useMemo(() => {
    const lines: Array<{ id: string; quantity: string; label: string; pending?: boolean }> = []
    if (exactBoard) lines.push({ id: 'board', quantity: '1', label: exactBoard.label })
    for (const item of primaryItems) lines.push({ id: item.id, quantity: '1', label: item.title })
    if (outputItems.length > 0) {
      lines.push({ id: 'level-shifter', quantity: String(Math.max(1, Math.ceil(outputItems.length / 4))), label: '74AHCT125 level shifter' })
      lines.push({ id: 'resistors', quantity: String(outputItems.length), label: '330 ohm data resistor' })
      const feedCount = electricalPlan.outputs.reduce((sum, output) => sum + output.recommendedFeedCount, 0)
      const fuseRatings = [...new Set(electricalPlan.outputs.flatMap((output) => output.injections.map((injection) => injection.fuse.ratingMa)).filter((value): value is number => !!value))]
      lines.push({ id: 'fuses', quantity: String(feedCount), label: `${fuseRatings.map(formatCurrentMa).join(' / ') || 'Rated'} branch fuse` })
      lines.push({ id: 'power-output-capacitors', quantity: String(feedCount), label: '1000uF 6.3 V low-ESR electrolytic capacitor' })
      if (extenderOutputCount > 0) {
        lines.push({ id: 'nled-pixel-data-extender', quantity: String(extenderOutputCount), label: 'NLED Pixel Data Extender TX/RX pair' })
        lines.push({ id: 'nled-pixel-data-cable', quantity: 'As required', label: '3-conductor twisted cable for A, B and common ground' })
      }
    }
    if (electricalPlan.totals) {
      for (const supply of electricalPlan.totals.supplies) {
        lines.push({ id: supply.id, quantity: '1', label: `5 V · ${formatCurrentMa(supply.recommendedCurrentMa)} / ${formatWattage(supply.recommendedWattage)} PSU` })
        fuseBlockAllocations(supply.injectionIds.length).forEach((block, index) => {
          lines.push({
            id: `${supply.id}-fuse-block-${index + 1}`,
            quantity: '1',
            label: `${block.circuitCount}-circuit fixed fuse block (${block.assignedFeedCount} used)`,
          })
        })
      }
    }
    const conductors = [...new Set(electricalPlan.outputs.map((output) => output.conductor ? `AWG ${output.conductor.awg} / ${output.conductor.crossSectionMm2} mm2 copper` : '').filter(Boolean))]
    if (conductors.length > 0) lines.push({ id: 'wire', quantity: 'As required', label: conductors.join(' / ') })
    return lines
  }, [electricalPlan.outputs, electricalPlan.totals, exactBoard, extenderOutputCount, outputItems.length, primaryItems])
  const exportItems = exportMode === 'complete-build' ? primaryItems : visiblePrimaryItems
  const exportItemIds = useMemo(() => new Set(exportItems.map((item) => item.id)), [exportItems])
  const exportConnectionRows = useMemo(
    () => buildConnectionRows(exportItems, electricalPlan, exactBoard),
    [electricalPlan, exactBoard, exportItems],
  )
  const exportBomRows = useMemo(
    () => buildBomRows(manifest, electricalPlan, buildProfile, exactBoard, exportItemIds),
    [buildProfile, electricalPlan, exactBoard, exportItemIds, manifest],
  )
  const exportPlan = exportMode === 'complete-build' ? electricalPlan : visibleElectricalPlan
  const exportDiagramConnections = useMemo(() => exportItems.flatMap((item) => item.pins.map((pin) => {
    const boardPin = boardPinForUse(exactBoard, pin)
    return {
      id: `${item.id}:${pin.propertyKey}`,
      itemId: item.id,
      pinLabel: boardPinLabelForUse(exactBoard, pin),
      useLabel: pin.label,
      boardAnchorId: boardPin?.anchorId,
    }
  })), [exactBoard, exportItems])
  const projectName = useProjectStore((state) =>
    state.projects.find((project) => project.id === state.currentProjectId)?.name)
  const patchBuildProfile = (recipe: (current: ReturnType<typeof ensureBuildProfile>) => ReturnType<typeof ensureBuildProfile>) => {
    updateBuildProfile((current) => recipe(ensureBuildProfile(current)))
  }

  const toggleVisibility = (itemId: string) => {
    patchBuildProfile((current) => {
      const visibility = { ...(current.visibility ?? {}) }
      if (visibility[itemId] === false) delete visibility[itemId]
      else visibility[itemId] = false
      return {
        ...current,
        visibility: Object.keys(visibility).length > 0 ? visibility : undefined,
      }
    })
    if (isolatedItemId === itemId) setIsolatedItemId(null)
  }

  const toggleDone = (item: HardwareManifestItem) => {
    const fingerprint = itemFingerprint(
      item,
      selectedFqbn,
      benchBoardProfileId,
    )
    patchBuildProfile((current) => {
      const done = { ...(current.done ?? {}) }
      if (done[item.id]?.fingerprint === fingerprint) delete done[item.id]
      else done[item.id] = { fingerprint, completedAt: Date.now() }
      return {
        ...current,
        done: Object.keys(done).length > 0 ? done : undefined,
      }
    })
  }

  const setExportMode = (mode: BuildExportMode) => {
    patchBuildProfile((current) => ({
      ...current,
      exportMode: mode === 'complete-build' ? undefined : mode,
    }))
  }

  const exportDiagramSvg = async () => {
    // Scoped to the export roots: the print sheets are diagrams too, and they
    // are in the document whenever a print is in flight.
    const source = document.querySelector<SVGSVGElement>(`[data-build-export-root="${exportMode}"] svg[data-build-export]`)
    if (!source) return
    const clone = source.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('data-export-status', exportDraftStatus)
    const metadata = document.createElementNS('http://www.w3.org/2000/svg', 'metadata')
    metadata.textContent = JSON.stringify({ exportMode, status: exportDraftStatus, boardConfidence: exactBoard?.confidence ?? 'unresolved', ruleSetVersion: electricalPlan.ruleSetVersion })
    clone.prepend(metadata)
    await inlineSvgImages(clone)
    downloadBuildFile(new XMLSerializer().serializeToString(clone), 'fastled-build-diagram.svg', 'image/svg+xml;charset=utf-8')
  }

  /** Mounts the sheets even where `beforeprint` is not supported, then prints. */
  const printBuildSheets = () => {
    flushSync(() => setPrintSheetsMounted(true))
    window.print()
  }

  const exportConnectionsCsv = () => {
    downloadBuildFile(connectionsCsv(exportConnectionRows, {
      status: exportDraftStatus,
      ruleSetVersion: electricalPlan.ruleSetVersion,
    }), 'fastled-build-connections.csv', 'text/csv;charset=utf-8')
  }

  const exportBomCsv = () => {
    downloadBuildFile(bomCsv(exportBomRows, {
      status: exportDraftStatus,
      ruleSetVersion: electricalPlan.ruleSetVersion,
    }), 'fastled-build-bom.csv', 'text/csv;charset=utf-8')
  }

  const adjustSidebarWidth = (delta: number) => {
    setSidebarWidth((current) => Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, current + delta)))
  }

  const controllerBox = useMemo(() => {
    const size = controllerBoxSize(exactBoard?.pinAnchors)
    return {
      x: 40,
      y: 44,
      width: size.width,
      height: size.height,
    }
  }, [exactBoard])

  const allDeviceLayouts = useMemo(() => {
    let y = 72
    return primaryItems.map((item) => {
      const height = Math.max(92, 58 + (item.pins.length * 24))
      const layout = {
        itemId: item.id,
        x: controllerBox.x + controllerBox.width + 164,
        y,
        width: 320,
        height,
      }
      y += height + 26
      return layout
    })
  }, [controllerBox.width, controllerBox.x, primaryItems])
  const canvasHeight = physicalAssemblyDiagramHeight(visiblePrimaryItems, visibleElectricalPlan, activeSection.layers)
  const allBounds = useMemo(() => {
    const bounds = boundsForLayouts(controllerBox, allDeviceLayouts)
    return { ...bounds, height: Math.max(bounds.height, canvasHeight - bounds.y) }
  }, [allDeviceLayouts, canvasHeight, controllerBox])
  /*
   * Opening fit frames the controller and parts, not the PSU stack. A 13-wire
   * shield plus a 64×64 feed plan is taller than the pane at the manual zoom
   * floor, and centering on that whole sheet parked the shield above the clip
   * until Reset restored identity. Power has its own section for the stack.
   */
  const hardwareFitBounds = useMemo(() => {
    if (activeSection.layers.powerDistribution && !activeSection.layers.signalWires) {
      return { x: 0, y: 0, width: 1120, height: canvasHeight }
    }
    const bottom = diagramContentBottom(visiblePrimaryItems, activeSection.layers)
    return {
      x: 0,
      y: 0,
      width: 1120,
      height: Math.max(400, bottom
        + COMMON_NET_CALLOUT_GAP + COMMON_NET_CALLOUT_HEIGHT + DIAGRAM_LEGEND_BAND),
    }
  }, [activeSection.layers, canvasHeight, visiblePrimaryItems])

  const boardAnchorsById = useMemo(() => new Map((exactBoard?.pinAnchors ?? []).map((anchor) => [anchor.id, anchor])), [exactBoard])
  const canRenderControllerPins = !!exactBoard && boardAnchorsById.size > 0 && (exactBoard.pins?.length ?? 0) > 0

  const allConnections = useMemo<DiagramConnection[]>(() => {
    const byItemId = new Map(allDeviceLayouts.map((layout) => [layout.itemId, layout]))
    return visiblePrimaryItems.flatMap((item) => {
      const layout = byItemId.get(item.id)
      if (!layout) return []
      return item.pins.map((pinUse, pinIndex) => {
        const boardPin = canRenderControllerPins ? boardPinForUse(exactBoard, pinUse) : undefined
        const boardAnchor = boardPin ? boardAnchorsById.get(boardPin.anchorId) : undefined
        const pinLabel = boardPinLabelForUse(exactBoard, pinUse)
        const unavailableReason = boardPin?.availability === 'unavailable'
          ? `${pinLabel} is exposed on the selected board header but unavailable on this module because octal PSRAM uses it.`
          : undefined
        const deviceY = layout.y + 52 + (pinIndex * 24)
        const controllerX = boardAnchor && !unavailableReason ? controllerBox.x + boardAnchor.x : undefined
        const controllerY = boardAnchor && !unavailableReason ? controllerBox.y + boardAnchor.y : undefined
        return {
          id: `${item.id}:${pinUse.propertyKey}`,
          itemId: item.id,
          itemTitle: item.title,
          itemSubtitle: item.subtitle,
          pinUse,
          boardPin,
          boardAnchor,
          controllerX,
          controllerY,
          deviceX: layout.x,
          deviceY,
          unresolvedReason: !canRenderControllerPins
            ? 'This exact board profile does not yet have a reviewed physical pin map.'
            : unavailableReason
              ? unavailableReason
            : boardPin
              ? undefined
              : `${pinLabel} is not mapped on the selected physical board profile.`,
        }
      })
    })
  }, [
    boardAnchorsById,
    canRenderControllerPins,
    controllerBox.x,
    controllerBox.y,
    allDeviceLayouts,
    exactBoard,
    visiblePrimaryItems,
  ])

  const selectedConnections = useMemo(() => {
    if (selectedItemId === 'controller') return allConnections
    return allConnections.filter((connection) => connection.itemId === selectedItemId)
  }, [allConnections, selectedItemId])

  const unresolvedConnections = allConnections.filter((connection) => connection.unresolvedReason)
  const connectionRows = canRenderControllerPins
    ? selectedConnections
    : []

  const unresolvedSignalMappingCount = primaryItems.reduce((count, item) => count + item.pins.reduce((pinCount, pinUse) => {
    if (!canRenderControllerPins) return pinCount + 1
    const boardPin = boardPinForUse(exactBoard, pinUse)
    return pinCount + (!boardPin || boardPin.availability === 'unavailable' ? 1 : 0)
  }, 0), 0)
  const signalReady = !!exactBoard
    && canRenderControllerPins
    && unresolvedSignalMappingCount === 0
  const readinessText = !exactBoard
    ? 'blocked by exact-board selection'
    : !canRenderControllerPins
      ? 'blocked because this exact board profile is still missing a reviewed physical pin map'
      : unresolvedSignalMappingCount > 0
        ? `needs review: ${unresolvedSignalMappingCount} controller pin mapping${unresolvedSignalMappingCount === 1 ? '' : 's'} unresolved`
        : 'all graph hardware maps cleanly; required signal conditioning is included automatically'
  const requirementsCalculatedText = electricalPlan.requirementsCalculatedText
  const buildReadyText = signalReady && electricalPlan.powerReadyPasses
    ? 'ready'
    : !signalReady
      ? 'blocked by Signal ready'
      : 'blocked by generated power-plan support'
  const exportDraftStatus = !signalReady || !electricalPlan.powerReadyPasses
    ? 'Draft — unresolved build requirements'
    : 'Build reference — Signal and Power ready'
  const exportDraftReason = !signalReady
      ? 'Exports stay draft because controller-side signal mapping still needs review before the build reference is trustworthy.'
      : !electricalPlan.powerReadyPasses
        ? 'Exports stay draft only when the graph contains an electrical route the generated planner does not support.'
        : 'The exported reference includes the selected board confidence, calculation ruleset, connections, and parts plan.'

  const canvasWidth = 1120
  const updateViewport = (
    nextZoom: number,
    focusRect?: { x: number; y: number; width: number; height: number },
    fit = false,
  ) => {
    const viewport = viewportRef.current
    const canvas = diagramCanvasRef.current
    const zoom = fit ? clampFitZoom(nextZoom) : clampZoom(nextZoom)
    setDiagramZoom(zoom)
    if (!viewport || !canvas) return
    if (focusRect) {
      setDiagramPan({
        x: (viewport.clientWidth / 2) - canvas.offsetLeft - ((focusRect.x + (focusRect.width / 2)) * zoom),
        y: (viewport.clientHeight / 2) - canvas.offsetTop - ((focusRect.y + (focusRect.height / 2)) * zoom),
      })
      return
    }
    setDiagramPan({
      x: panOffsetForPointerZoom({
        panOffset: diagramPan.x,
        pointerOffset: viewport.clientWidth / 2,
        contentOrigin: canvas.offsetLeft,
      }, diagramZoom, zoom),
      y: panOffsetForPointerZoom({
        panOffset: diagramPan.y,
        pointerOffset: viewport.clientHeight / 2,
        contentOrigin: canvas.offsetTop,
      }, diagramZoom, zoom),
    })
  }

  const fitAll = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    if (viewport.clientWidth < FIT_PADDING || viewport.clientHeight < FIT_PADDING) return
    const widthZoom = (viewport.clientWidth - FIT_PADDING) / allBounds.width
    const heightZoom = (viewport.clientHeight - FIT_PADDING) / allBounds.height
    const fitZoom = clampFitZoom(Math.min(widthZoom, heightZoom, 1))
    updateViewport(fitZoom, allBounds, true)
  }

  const fitVisible = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    if (viewport.clientWidth < FIT_PADDING || viewport.clientHeight < FIT_PADDING) return
    const widthZoom = (viewport.clientWidth - FIT_PADDING) / hardwareFitBounds.width
    const heightZoom = (viewport.clientHeight - FIT_PADDING) / hardwareFitBounds.height
    const fitZoom = clampFitZoom(Math.min(widthZoom, heightZoom, 1))
    updateViewport(fitZoom, hardwareFitBounds, true)
  }

  const focusSelected = () => {
    const layout = allDeviceLayouts.find((entry) => entry.itemId === selectedItemId)
    if (selectedItemId === 'controller' || !layout) {
      updateViewport(diagramZoom, controllerBox)
      return
    }
    const bounds = {
      x: controllerBox.x,
      y: Math.min(controllerBox.y, layout.y),
      width: (layout.x + layout.width) - controllerBox.x,
      height: Math.max(controllerBox.y + controllerBox.height, layout.y + layout.height) - Math.min(controllerBox.y, layout.y),
    }
    updateViewport(diagramZoom, bounds)
  }

  const resetView = () => {
    setDiagramZoom(1)
    setDiagramPan({ x: 0, y: 0 })
  }

  const startViewportPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const viewport = viewportRef.current
    if (!viewport) return
    const target = event.target as Element
    const isEmptyDiagramArea = target === viewport
      || target.getAttribute('data-pan-background') === 'true'
      || target.getAttribute('data-pan-surface') === 'true'
    if (!isEmptyDiagramArea) return
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPan: diagramPan,
    }
    viewport.setPointerCapture(event.pointerId)
  }

  const handleViewportPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    const panState = panStateRef.current
    if (!viewport || !panState || panState.pointerId !== event.pointerId) return
    setDiagramPan({
      x: panState.startPan.x + (event.clientX - panState.startX),
      y: panState.startPan.y + (event.clientY - panState.startY),
    })
  }

  const stopViewportPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    const panState = panStateRef.current
    if (!viewport || !panState || panState.pointerId !== event.pointerId) return
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
    panStateRef.current = null
  }

  const handleViewportWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0) return
    event.preventDefault()
    const viewport = viewportRef.current
    const canvas = diagramCanvasRef.current
    if (!viewport || !canvas) return

    const viewportRect = viewport.getBoundingClientRect()
    // Client coordinates include the viewport border. Convert to its inner
    // coordinate system, then preserve the diagram point beneath that cursor.
    const pointerX = event.clientX - viewportRect.left - viewport.clientLeft
    const pointerY = event.clientY - viewportRect.top - viewport.clientTop
    const nextZoom = clampZoom(diagramZoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
    const nextPanX = panOffsetForPointerZoom({
      panOffset: diagramPan.x,
      pointerOffset: pointerX,
      contentOrigin: canvas.offsetLeft,
    }, diagramZoom, nextZoom)
    const nextPanY = panOffsetForPointerZoom({
      panOffset: diagramPan.y,
      pointerOffset: pointerY,
      contentOrigin: canvas.offsetTop,
    }, diagramZoom, nextZoom)
    setDiagramZoom(nextZoom)
    setDiagramPan({ x: nextPanX, y: nextPanY })
  }

  useEffect(() => {
    if (!exactBoard) {
      setDiagramZoom(1)
      setDiagramPan({ x: 0, y: 0 })
      return
    }
    fitVisible()
  // Section changes swap which hardware is on the sheet, so the view refits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exactBoard?.id, canvasWidth, canvasHeight, activeSection.id])

  const workspaceStyle = {
    '--build-sidebar-width': `${sidebarWidth}px`,
  } as CSSProperties

  return (
    <section
      className={[
        styles.workspace,
        sidebarCollapsed ? styles.workspaceSidebarCollapsed : '',
        exportMode === 'complete-build' ? styles.exportCompleteMode : '',
      ].join(' ').trim()}
      aria-label="Build Diagram workspace"
      style={workspaceStyle}
    >
      <aside className={styles.sidebar}>
        {sidebarCollapsed ? (
          <button type="button" className={styles.collapsedRail} onClick={() => setSidebarCollapsed(false)}>
            Show build panel
          </button>
        ) : (
          <>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Build Diagram</h2>
              <div className={styles.headerActions}>
                <div className={styles.panelSizeControls}>
                  <button
                    type="button"
                    className={styles.smallButton}
                    onClick={() => adjustSidebarWidth(-PANEL_WIDTH_STEP)}
                    disabled={sidebarWidth <= MIN_SIDEBAR_WIDTH}
                    aria-label="Narrow build panel"
                    title="Narrow build panel"
                  >
                    <span aria-hidden="true">-</span><span className={styles.visuallyHidden}>Narrow build panel</span>
                  </button>
                  <button
                    type="button"
                    className={styles.smallButton}
                    onClick={() => adjustSidebarWidth(PANEL_WIDTH_STEP)}
                    disabled={sidebarWidth >= MAX_SIDEBAR_WIDTH}
                    aria-label="Widen build panel"
                    title="Widen build panel"
                  >
                    <span aria-hidden="true">+</span><span className={styles.visuallyHidden}>Widen build panel</span>
                  </button>
                </div>
                <button type="button" className={styles.smallButton} onClick={() => setSidebarCollapsed(true)}>
                  <span aria-hidden="true">&lt;&lt;</span><span className={styles.visuallyHidden}>Hide build panel</span>
                </button>
              </div>
            </div>

            <section className={`${styles.card} ${styles.compactHardwareCard}`}>
              <h3 className={styles.cardTitle}>Graph hardware</h3>
              <div className={styles.hardwareList}>
                {primaryItems.length === 0 ? (
                  <p className={styles.copyMuted}>No additional hardware is present in the graph.</p>
                ) : primaryItems.map((item) => {
                  const isVisible = buildProfile.visibility?.[item.id] !== false
                  const done = buildProfile.done?.[item.id]
                  const isDone = isItemDone(item.id)
                  const isStale = !!done && !isDone
                  return (
                    <div key={item.id} className={`${styles.hardwareRow} ${selectedItemId === item.id ? styles.hardwareRowActive : ''}`}>
                      <button type="button" className={styles.hardwareMain} onClick={() => setSelectedItemId(item.id)}>
                        <span className={styles.hardwareTitle}>{item.title}</span>
                        {isStale && <span className={styles.staleNotice}>Recheck</span>}
                      </button>
                      <div className={styles.hardwareActions}>
                        <button type="button" className={styles.iconButton} aria-label={isVisible ? `Hide ${item.title}` : `Show ${item.title}`} title={isVisible ? 'Hide' : 'Show'} onClick={() => toggleVisibility(item.id)}>
                          <EyeIcon crossed={!isVisible} />
                        </button>
                        <button type="button" className={`${styles.iconButton} ${isolatedItemId === item.id ? styles.iconButtonActive : ''}`} aria-label={isolatedItemId === item.id ? `Show all hardware around ${item.title}` : `Isolate ${item.title}`} title={isolatedItemId === item.id ? 'Show all' : 'Isolate'} onClick={() => setIsolatedItemId(isolatedItemId === item.id ? null : item.id)}>
                          <IsolateIcon active={isolatedItemId === item.id} />
                        </button>
                        <button type="button" className={`${styles.iconButton} ${isDone ? styles.iconButtonDone : ''}`} aria-label={isDone ? `Mark ${item.title} unfinished` : `Mark ${item.title} done`} title={isDone ? 'Done' : 'Mark done'} onClick={() => toggleDone(item)}>
                          <DoneIcon active={isDone} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className={`${styles.card} ${styles.powerSummaryCard}`}>
              <h3 className={styles.cardTitle}>Power summary</h3>
              {electricalPlan.totals ? (
                <>
                  <span className={styles.powerSummaryValue}>{formatCurrentMa(electricalPlan.totals.psuSizingCurrentMa)}</span>
                  <span className={styles.powerSummaryMeta}>
                    {electricalPlan.totals.operatingCurrentCapMa != null ? 'PSU sizing operating budget' : 'uncapped design load'} @ {formatVoltage(electricalPlan.totals.nominalVoltage)}
                  </span>
                  {electricalPlan.totals.operatingCurrentCapMa != null && <>
                    <span className={styles.powerSummaryLimit}>
                      {electricalPlan.outputs
                        .filter((output) => output.operatingCurrentCapMa != null)
                        .map((output) => `${output.title}: ${formatCurrentMa(output.operatingCurrentCapMa ?? 0)} limit`)
                        .join(' · ')}
                    </span>
                    <span className={styles.powerSummaryCeiling}>Uncapped full-white ceiling {formatCurrentMa(electricalPlan.totals.designCurrentMa)}</span>
                  </>}
                  <span className={styles.powerSummaryBudget}>
                    Supply budget {formatCurrentMa(electricalPlan.totals.recommendedSupplyCurrentMa)} / {formatWattage(electricalPlan.totals.recommendedSupplyWattage)}
                  </span>
                </>
              ) : (
                <p className={styles.copyMuted}>Add the missing installation facts to calculate the conservative supply budget.</p>
              )}
            </section>

            {manifest.unsupportedItems.length > 0 && (
              <section className={styles.card}>
                <h3 className={styles.cardTitle}>Not yet supported</h3>
                <ul className={styles.flatList}>
                  {manifest.unsupportedItems.map((item) => (
                    <li key={item.id}>{item.title}: {item.subtitle}</li>
                  ))}
                </ul>
              </section>
            )}

            {selectedItemId ? <>
            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Selected item</h3>
              <p className={styles.copy}><strong>{selectedItem.title}</strong></p>
              <p className={styles.copyMuted}>{selectedItem.subtitle}</p>
              {selectedItemId === 'controller' && exactBoard && (
                <>
                  <p className={styles.copyMuted}>{exactBoard.sourceSummary}</p>
                  {exactBoard.confidence !== 'manufacturer-verified' && (
                    <p className={`${styles.warningText} ${styles.confidenceCallout}`}>{confidenceSummary(exactBoard)}</p>
                  )}
                  {exactBoard.notes.length > 0 && (
                    <>
                      <h4 className={styles.subTitle}>Board notes</h4>
                      <ul className={styles.flatList}>
                        {exactBoard.notes.map((note) => <li key={note}>{note}</li>)}
                      </ul>
                    </>
                  )}
                  {exactBoard.caveats.length > 0 && (
                    <>
                      <h4 className={styles.subTitle}>Caveats</h4>
                      <ul className={styles.flatList}>
                        {exactBoard.caveats.map((note) => <li key={note}>{note}</li>)}
                      </ul>
                    </>
                  )}
                </>
              )}
              {selectedItemId !== 'controller' && !exactBoard && (
                <p className={styles.warningText}>Select an exact board profile before pin definitions or controller-side connections appear here.</p>
              )}
              {selectedConnections.length > 0 && canRenderControllerPins && (
                <>
                  <h4 className={styles.subTitle}>Controller pins</h4>
                  <ul className={styles.flatList}>
                    {selectedConnections.map((connection) => (
                      <li key={connection.id} className={styles.pinRow}>
                        <strong>{boardPinLabelForUse(exactBoard, connection.pinUse)}</strong> · {connection.pinUse.label}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {selectedConnections.some((connection) => connection.unresolvedReason) && (
                <>
                  <h4 className={styles.subTitle}>Needs review</h4>
                  <ul className={styles.flatList}>
                    {selectedConnections
                      .filter((connection) => connection.unresolvedReason)
                      .map((connection) => (
                        <li key={connection.id}>{connection.unresolvedReason}</li>
                      ))}
                  </ul>
                </>
              )}
              {Object.keys(selectedItem.facts).length > 0 && (
                <dl className={styles.factList}>
                  {Object.entries(selectedItem.facts).map(([key, value]) => (
                    <div key={key} className={styles.factRow}>
                      <dt>{formatFactLabel(key)}</dt>
                      <dd>{formatFactValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Readiness</h3>
              <ul className={styles.flatList}>
                <li>Graph hardware: captured automatically</li>
                <li>Exact board: {exactBoard ? 'confirmed' : 'select one board profile'}</li>
                <li>Wiring plan: {requirementsCalculatedText}</li>
                <li>Signal plan: {readinessText}</li>
                <li>Power plan: {electricalPlan.powerReadyText}</li>
                <li>Build reference: {buildReadyText}</li>
              </ul>
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Connections</h3>
              {connectionRows.length === 0 ? (
                <p className={styles.copyMuted}>Controller-side connections appear here after an exact board with a reviewed pin map is selected.</p>
              ) : (
                <div className={styles.connectionList}>
                  {connectionRows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className={`${styles.connectionRow} ${selectedItemId === row.itemId ? styles.connectionRowActive : ''}`}
                      onClick={() => setSelectedItemId(row.itemId)}
                    >
                      <strong>{row.itemTitle}</strong>
                      <span>{boardPinLabelForUse(exactBoard, row.pinUse)} → {row.pinUse.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {unresolvedConnections.length > 0 && (
                <>
                  <h4 className={styles.subTitle}>Unresolved</h4>
                  <ul className={styles.flatList}>
                    {unresolvedConnections.map((connection) => (
                      <li key={connection.id}>
                        <strong>{connection.itemTitle}</strong>: {connection.unresolvedReason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className={styles.card}>
              <div className={styles.rowBetween}>
                <h3 className={styles.cardTitle}>Parts</h3>
                <span className={styles.progressPill}>{partsSummary.length} lines</span>
              </div>
              <div className={styles.partsTable}>
                {partsSummary.map((part) => (
                  <div key={part.id} className={styles.partsRow}>
                    <span className={styles.partsQuantity}>{part.quantity}</span>
                    <span>{part.label}</span>
                    <span className={part.pending ? styles.partPending : styles.partReady} title={part.pending ? 'Rating or exact part still pending' : 'Configured'}>
                      {part.pending ? '?' : 'OK'}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Calculated requirements</h3>
              {electricalPlan.outputs.length === 0 ? (
                <p className={styles.copyMuted}>
                  The graph has no supported 5 V LED output requiring an external power plan.
                </p>
              ) : (
                <>
                  <p className={styles.copyMuted}>
                    This is the hardware to use, calculated automatically from the graph. Ratings are conservative full-white design values, not questions for the user to answer.
                  </p>
                  {electricalPlan.totals && (
                    <ul className={styles.flatList}>
                      {electricalPlan.totals.operatingCurrentCapMa != null && (
                        <li>PSU sizing operating budget: {formatCurrentMa(electricalPlan.totals.psuSizingCurrentMa)} @ {electricalPlan.totals.nominalVoltage} V</li>
                      )}
                      <li>{electricalPlan.totals.operatingCurrentCapMa != null ? 'Uncapped full-white ceiling' : 'Total design load'}: {formatCurrentMa(electricalPlan.totals.designCurrentMa)} @ {electricalPlan.totals.nominalVoltage} V</li>
                      {electricalPlan.totals.supplies.map((supply, index) => (
                        <li key={supply.id}>
                          PSU {index + 1}: {electricalPlan.totals?.nominalVoltage} V, at least {formatCurrentMa(supply.recommendedCurrentMa)} / {formatWattage(supply.recommendedWattage)} continuous
                          {' '}for {supply.outputTitles.join(', ')} ({electricalPlan.totals?.headroomPercent}% headroom)
                        </li>
                      ))}
                      {electricalPlan.totals.supplies.length > 1 && <li>Keep separate PSU +5 V zones isolated; join grounds for the shared controller data reference.</li>}
                      {electricalPlan.controllerPowerPath && <li>Controller branch: {electricalPlan.controllerPowerPath}</li>}
                    </ul>
                  )}
                  <div className={styles.outputFactList}>
                    {electricalPlan.outputs.map((output) => (
                      <section key={output.itemId} className={styles.outputFactCard}>
                        <div className={styles.rowBetween}>
                          <div>
                            <h4 className={styles.subTitle}>{output.title}</h4>
                            <p className={styles.copyMuted}>{output.pixelCount} px · {output.topology} · generated distributed power</p>
                          </div>
                          <span className={styles.progressPill}>{formatCurrentMa(output.operatingCurrentCapMa ?? output.designCurrentMa)}{output.operatingCurrentCapMa != null ? ' limit' : ''}</span>
                        </div>
                        <ul className={styles.flatList}>
                          {output.operatingCurrentCapMa != null && <li>Configured FastLED operating limit: {formatCurrentMa(output.operatingCurrentCapMa)}</li>}
                          {output.operatingCurrentCapMa != null && <li>Uncapped full-white ceiling: {formatCurrentMa(output.designCurrentMa)}</li>}
                          <li>Power feeds: {output.recommendedFeedCount} individually fused feeds from the assigned PSU distribution zone</li>
                          {output.injections.map((injection) => (
                            <li key={injection.id}>
                              {injection.role} @ {injection.positionMm} mm: {formatCurrentMa(injection.designCurrentMa)} / {injection.pixelCount} px,
                              {' '}{injection.conductor ? `AWG ${injection.conductor.awg}` : 'wire unresolved'},
                              {' '}{injection.fuse.ratingMa ? `${formatCurrentMa(injection.fuse.ratingMa)} fuse` : 'fuse unresolved'},
                              {' '}{injection.supplyId?.replace('supply-', 'PSU ') ?? 'PSU unresolved'}
                            </li>
                          ))}
                          <li>{output.operatingCurrentCapMa != null ? 'Cap-aware output supply budget' : 'Output supply budget'}: {formatCurrentMa(output.recommendedSupplyCurrentMa)} @ {output.nominalVoltage} V ({formatWattage(output.recommendedSupplyWattage)})</li>
                          {output.conductor && (
                            <li>Each feed conductor: AWG {output.conductor.awg} / {output.conductor.crossSectionMm2} mm2 {output.conductor.material} minimum</li>
                          )}
                          {output.connectorMinimumMa && <li>Connector minimum: {formatCurrentMa(output.connectorMinimumMa)} continuous</li>}
                          {output.fuse.ratingMa && <li>Each feed fuse: {formatCurrentMa(output.fuse.ratingMa)}</li>}
                        </ul>
                      </section>
                    ))}
                  </div>
                </>
              )}
              {electricalPlan.recommendations.length > 0 && (
                <>
                  <h4 className={styles.subTitle}>Recommendations</h4>
                  <ul className={styles.flatList}>
                    {electricalPlan.recommendations.map((entry) => <li key={entry}>{entry}</li>)}
                  </ul>
                </>
              )}
              {electricalPlan.unresolved.length > 0 && (
                <>
                  <h4 className={styles.subTitle}>Still unresolved</h4>
                  <ul className={styles.flatList}>
                    {electricalPlan.unresolved.map((entry) => <li key={entry}>{entry}</li>)}
                  </ul>
                </>
              )}
              {electricalPlan.assumptionsUsed.length > 0 && (
                <>
                  <h4 className={styles.subTitle}>Assumptions used</h4>
                  <ul className={styles.flatList}>
                    {electricalPlan.assumptionsUsed.map((entry) => <li key={entry}>{entry}</li>)}
                  </ul>
                </>
              )}
              {electricalPlan.warnings.length > 0 && (
                <>
                  <h4 className={styles.subTitle}>Planner warnings</h4>
                  <ul className={styles.flatList}>
                    {electricalPlan.warnings.map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.title}</strong>: {entry.detail}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Exports</h3>
              <div className={styles.exportModeRow} role="radiogroup" aria-label="Build Diagram export mode">
                <button
                  type="button"
                  className={`${styles.exportModeButton} ${exportMode === 'complete-build' ? styles.exportModeButtonActive : ''}`}
                  aria-pressed={exportMode === 'complete-build'}
                  onClick={() => setExportMode('complete-build')}
                >
                  Complete build
                </button>
                <button
                  type="button"
                  className={`${styles.exportModeButton} ${exportMode === 'current-view' ? styles.exportModeButtonActive : ''}`}
                  aria-pressed={exportMode === 'current-view'}
                  onClick={() => setExportMode('current-view')}
                >
                  Current view
                </button>
              </div>
              <p className={styles.copyMuted}>
                {exportMode === 'complete-build'
                  ? hiddenPrimaryItemCount > 0 || !!isolatedItemId || activeSection.id !== 'all'
                    ? 'Complete build is selected. Hardware hidden by the eye, isolation, or the current section will still be included.'
                    : 'Complete build is selected. Exports will include every configured hardware item by default.'
                  : `Current view is selected. Exports will follow the hardware currently visible under the eye/filter/isolation state and the ${activeSection.label} section.`}
              </p>
              <p className={styles.warningText}>{exportDraftStatus}</p>
              <p className={styles.copyMuted}>
                {exportDraftReason}
              </p>
              <div className={styles.exportActionGrid}>
                <button type="button" className={styles.exportModeButton} disabled={!exactBoard} onClick={exportDiagramSvg}>Export SVG</button>
                <button type="button" className={styles.exportModeButton} disabled={!exactBoard} onClick={printBuildSheets}>Print / PDF</button>
                <button type="button" className={styles.exportModeButton} disabled={!exactBoard} onClick={exportConnectionsCsv}>Connections CSV</button>
                <button type="button" className={styles.exportModeButton} disabled={!exactBoard} onClick={exportBomCsv}>BOM CSV</button>
              </div>
            </section>
            </> : (
              <p className={styles.detailIdle}>Select the controller or graph hardware to see its build details.</p>
            )}
          </>
        )}
      </aside>

      <main className={styles.diagramPane}>
        <div className={styles.diagramHeader}>
          <div>
            <h2 className={styles.panelTitle}>Wiring Diagram</h2>
            <p className={styles.panelSubtitle}>
              {!exactBoard
                ? 'Select an exact board profile to unlock controller-aware wiring details.'
                : !canRenderControllerPins
                  ? `${exactBoard.label} selected. This profile still needs a reviewed physical pin map before controller-side wiring can be drawn.`
                  : activeSection.id === 'all'
                    ? `${exactBoard.label} selected. Connections now resolve against that exact board's pin map.`
                    : activeSection.summary}
            </p>
          </div>
          <div className={styles.diagramToolbar}>
            <span
              className={styles.zoomPill}
              title="Drag empty space with the left mouse button to move. Scroll to zoom at the cursor."
            >
              Zoom {Math.round(diagramZoom * 100)}%
            </span>
            <button type="button" className={styles.smallButton} aria-label="Zoom out" title="Zoom out" onClick={() => updateViewport(diagramZoom - ZOOM_STEP)}>
              <span aria-hidden="true">-</span><i className={styles.visuallyHidden}>Zoom out</i>
            </button>
            <button type="button" className={styles.smallButton} aria-label="Zoom in" title="Zoom in" onClick={() => updateViewport(diagramZoom + ZOOM_STEP)}>
              <span aria-hidden="true">+</span><i className={styles.visuallyHidden}>Zoom in</i>
            </button>
            <button type="button" className={styles.smallButton} onClick={fitAll} disabled={!exactBoard}>
              <span aria-hidden="true">Fit</span><span className={styles.visuallyHidden}>Fit all</span>
            </button>
            <button type="button" className={styles.smallButton} onClick={focusSelected} disabled={!exactBoard}>
              <span aria-hidden="true">Focus</span><span className={styles.visuallyHidden}>Focus selected</span>
            </button>
            <button type="button" className={styles.smallButton} onClick={resetView} disabled={!exactBoard}>
              <span aria-hidden="true">Reset</span><span className={styles.visuallyHidden}>Reset view</span>
            </button>
            <button type="button" className={styles.resetButton} onClick={() => setIsolatedItemId(null)} disabled={!isolatedItemId}>
              All
            </button>
          </div>
        </div>

        {exactBoard && sections.length > 1 && (
          <div className={styles.sectionTabs} role="tablist" aria-label="Wiring diagram sections">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={section.id === activeSection.id}
                title={section.summary}
                className={`${styles.sectionTab} ${section.id === activeSection.id ? styles.sectionTabActive : ''}`}
                onClick={() => setSectionId(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
        )}

        {!exactBoard ? (
          <div className={styles.emptyState}>
            <h3 className={styles.emptyTitle}>Exact board required</h3>
            <p className={styles.copy}>
              The graph already defines logical GPIO numbers and hardware roles. Build Diagram now needs the exact physical controller board before it can show trustworthy physical references. Choose it on the Hardware tab.
            </p>
          </div>
        ) : (
          <div
            ref={viewportRef}
            className={styles.diagramViewport}
            onPointerDown={startViewportPan}
            onPointerMove={handleViewportPan}
            onPointerUp={stopViewportPan}
            onPointerCancel={stopViewportPan}
            onWheel={handleViewportWheel}
          >
            <div className={styles.diagramSurface}>
              <div
                ref={diagramCanvasRef}
                className={styles.diagramCanvas}
                style={{
                  width: `${canvasWidth}px`,
                  height: `${canvasHeight}px`,
                  transform: `translate(${diagramPan.x}px, ${diagramPan.y}px) scale(${diagramZoom})`,
                }}
                data-pan-surface="true"
                data-build-export-root="current-view"
              >
                <PhysicalAssemblyDiagram
                  boardProfile={exactBoard}
                  items={visiblePrimaryItems}
                  plan={visibleElectricalPlan}
                  layers={activeSection.layers}
                  exportScope="current-view"
                  selectedItemId={selectedItemId}
                  onSelectItem={setSelectedItemId}
                  connections={allConnections.map((connection) => ({
                    id: connection.id,
                    itemId: connection.itemId,
                    pinLabel: boardPinLabelForUse(exactBoard, connection.pinUse),
                    useLabel: connection.pinUse.label,
                    boardAnchorId: connection.boardPin?.anchorId,
                  }))}
                />
              </div>
            </div>
          </div>
        )}
        {exactBoard && (
          <div className={styles.exportDiagramHidden} aria-hidden="true" data-build-export-root="complete-build">
            <PhysicalAssemblyDiagram
              boardProfile={exactBoard}
              items={primaryItems}
              plan={electricalPlan}
              exportScope="complete-build"
              selectedItemId="controller"
              onSelectItem={() => undefined}
              connections={primaryItems.flatMap((item) => item.pins.map((pin) => {
                const boardPin = boardPinForUse(exactBoard, pin)
                return {
                  id: `${item.id}:${pin.propertyKey}`,
                  itemId: item.id,
                  pinLabel: boardPinLabelForUse(exactBoard, pin),
                  useLabel: pin.label,
                  boardAnchorId: boardPin?.anchorId,
                }
              }))}
            />
          </div>
        )}
      </main>

      {/* Printed straight onto the body: the workspace is a fixed, clipped,
          three-column viewport, and the sheets must not inherit any of it. */}
      {exactBoard && printSheetsMounted && createPortal(
        <BuildPrintSheets
          boardProfile={exactBoard}
          items={exportItems}
          plan={exportPlan}
          connections={exportDiagramConnections}
          connectionRows={exportConnectionRows}
          bomRows={exportBomRows}
          projectName={projectName}
          targetLabel={selectedTarget?.label ?? selectedFqbn}
          exportScope={exportMode}
          exportScopeLabel={exportMode === 'complete-build'
            ? 'Complete build — every configured hardware item'
            : `Current view — ${activeSection.label} section, visible hardware only`}
          status={exportDraftStatus}
          readiness={[
            { label: 'Exact board', value: exactBoard.label },
            { label: 'Wiring plan', value: requirementsCalculatedText },
            { label: 'Signal plan', value: readinessText },
            { label: 'Power plan', value: electricalPlan.powerReadyText },
            { label: 'Build reference', value: buildReadyText },
          ]}
          powerSummary={electricalPlan.totals ? [
            {
              label: electricalPlan.totals.operatingCurrentCapMa != null ? 'PSU sizing budget' : 'Design load',
              value: `${formatCurrentMa(electricalPlan.totals.psuSizingCurrentMa)} @ ${formatVoltage(electricalPlan.totals.nominalVoltage)}`,
            },
            {
              label: 'Full-white ceiling',
              value: formatCurrentMa(electricalPlan.totals.designCurrentMa),
            },
            {
              label: 'Supply budget',
              value: `${formatCurrentMa(electricalPlan.totals.recommendedSupplyCurrentMa)} / ${formatWattage(electricalPlan.totals.recommendedSupplyWattage)}`,
            },
            ...electricalPlan.totals.supplies.map((supply, index) => ({
              label: `PSU ${index + 1}`,
              value: `5 V · ${formatCurrentMa(supply.recommendedCurrentMa)} / ${formatWattage(supply.recommendedWattage)} · ${supply.outputTitles.join(', ')}`,
            })),
          ] : []}
        />,
        document.body,
      )}
    </section>
  )
}
