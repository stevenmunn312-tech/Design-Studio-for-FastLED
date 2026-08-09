import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import {
  boardPinForGpio,
  boardProfileById,
  compatibleBoardProfilesForFqbn,
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
import { buildHardwareManifest, type HardwareManifestItem, type HardwarePinUse } from '../../build/hardwareManifest'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { boardByFqbn, useUploadStore } from '../../state/uploadStore'
import PhysicalAssemblyDiagram from './PhysicalAssemblyDiagram'
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

type VisibilityFilter = 'all' | 'unfinished'
type ViewportPanState = { pointerId: number; startX: number; startY: number; startScrollLeft: number; startScrollTop: number }

const MIN_ZOOM = 0.55
const MAX_ZOOM = 1.8
const ZOOM_STEP = 0.15
const FIT_PADDING = 48
const PANEL_WIDTH_STEP = 32
const DEFAULT_SIDEBAR_WIDTH = 340
const MIN_SIDEBAR_WIDTH = 280
const MAX_SIDEBAR_WIDTH = 420
const DEFAULT_DETAIL_WIDTH = 360
const MIN_DETAIL_WIDTH = 300
const MAX_DETAIL_WIDTH = 440

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
  physicalBoardProfileId: string | undefined,
): string {
  return fingerprintValue({
    selectedFqbn,
    physicalBoardProfileId,
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

function BoardPreview({ svg, label }: { svg: string; label: string }) {
  return (
    <div
      className={styles.boardPreview}
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
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
  const nodes = useGraphStore((state) => state.nodes)
  const edges = useGraphStore((state) => state.edges)
  const storedBuildProfile = useGraphStore((state) => state.buildProfile)
  const updateBuildProfile = useGraphStore((state) => state.updateBuildProfile)
  const closeBuildDiagram = useUiStore((state) => state.closeBuildDiagram)
  const selectedFqbn = useUploadStore((state) => state.selectedFqbn)
  const manifest = useMemo(() => buildHardwareManifest(nodes, edges, selectedFqbn), [nodes, edges, selectedFqbn])
  const buildProfile = ensureBuildProfile(storedBuildProfile)
  const boardOptions = useMemo(() => compatibleBoardProfilesForFqbn(selectedFqbn), [selectedFqbn])
  const exactBoard = boardProfileById(buildProfile.physicalBoardProfileId ?? '')
  const selectedTarget = boardByFqbn(selectedFqbn)
  const [selectedItemId, setSelectedItemId] = useState<string>('controller')
  const [isolatedItemId, setIsolatedItemId] = useState<string | null>(null)
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [detailPaneCollapsed, setDetailPaneCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [detailPaneWidth, setDetailPaneWidth] = useState(DEFAULT_DETAIL_WIDTH)
  const [diagramZoom, setDiagramZoom] = useState(1)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const panStateRef = useRef<ViewportPanState | null>(null)

  const primaryItems = manifest.primaryItems
  const outputItems = useMemo(() => primaryItems.filter((item) => item.kind === 'matrix-output'), [primaryItems])
  const currentFingerprints = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of primaryItems) {
      map.set(item.id, itemFingerprint(
        item,
        selectedFqbn,
        buildProfile.physicalBoardProfileId,
      ))
    }
    return map
  }, [buildProfile.physicalBoardProfileId, primaryItems, selectedFqbn])

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

  const listedPrimaryItems = useMemo(() => {
    if (visibilityFilter === 'all') return primaryItems
    return primaryItems.filter((item) => !completedItemIds.has(item.id))
  }, [completedItemIds, primaryItems, visibilityFilter])

  const visiblePrimaryItems = useMemo(() => {
    const items = primaryItems.filter((item) =>
      buildProfile.visibility?.[item.id] !== false
      && (visibilityFilter === 'all' || !completedItemIds.has(item.id)))
    if (isolatedItemId) return items.filter((item) => item.id === isolatedItemId)
    return items
  }, [buildProfile.visibility, completedItemIds, isolatedItemId, primaryItems, visibilityFilter])

  useEffect(() => {
    const availableIds = new Set(['controller', ...visiblePrimaryItems.map((item) => item.id)])
    if (!availableIds.has(selectedItemId)) {
      setSelectedItemId(visiblePrimaryItems[0]?.id ?? 'controller')
    }
  }, [selectedItemId, visiblePrimaryItems])

  const selectedItem = selectedItemId === 'controller'
    ? manifest.controller
    : manifest.items.find((item) => item.id === selectedItemId) ?? manifest.controller
  const exportMode: BuildExportMode = buildProfile.exportMode ?? 'complete-build'

  const completedCount = primaryItems.filter((item) => {
    return isItemDone(item.id)
  }).length
  const hiddenPrimaryItemCount = primaryItems.filter((item) => buildProfile.visibility?.[item.id] === false).length
  const electricalPlan = useMemo(
    () => calculateElectricalPlan(manifest, buildProfile, exactBoard),
    [buildProfile, exactBoard, manifest],
  )
  const partsSummary = useMemo(() => {
    const lines: Array<{ id: string; quantity: string; label: string; pending?: boolean }> = []
    if (exactBoard) lines.push({ id: 'board', quantity: '1', label: exactBoard.label })
    for (const item of primaryItems) lines.push({ id: item.id, quantity: '1', label: item.title })
    if (outputItems.length > 0) {
      lines.push({ id: 'level-shifter', quantity: String(Math.max(1, Math.ceil(outputItems.length / 4))), label: '74AHCT125 level shifter' })
      lines.push({ id: 'resistors', quantity: String(outputItems.length), label: '330 ohm data resistor' })
      const feedCount = electricalPlan.outputs.reduce((sum, output) => sum + output.recommendedFeedCount, 0)
      const fuseRatings = [...new Set(electricalPlan.outputs.map((output) => output.fuse.ratingMa).filter((value): value is number => !!value))]
      lines.push({ id: 'fuses', quantity: String(feedCount), label: `${fuseRatings.map(formatCurrentMa).join(' / ') || 'Rated'} branch fuse` })
      lines.push({ id: 'capacitors', quantity: String(outputItems.length), label: '1000uF bulk capacitor' })
    }
    if (electricalPlan.totals) {
      lines.push({
        id: 'supply',
        quantity: String(electricalPlan.totals.recommendedSupplyCount),
        label: `5 V · ${formatCurrentMa(electricalPlan.totals.perSupplyCurrentMa)} continuous supply`,
      })
    }
    const conductors = [...new Set(electricalPlan.outputs.map((output) => output.conductor ? `AWG ${output.conductor.awg} / ${output.conductor.crossSectionMm2} mm2 copper` : '').filter(Boolean))]
    if (conductors.length > 0) lines.push({ id: 'wire', quantity: 'As required', label: conductors.join(' / ') })
    return lines
  }, [electricalPlan.outputs, electricalPlan.totals, exactBoard, outputItems.length, primaryItems])
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
      buildProfile.physicalBoardProfileId,
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

  const selectExactBoard = (profileId: string) => {
    patchBuildProfile((current) => ({
      ...current,
      physicalBoardProfileId: profileId,
    }))
  }

  const setExportMode = (mode: BuildExportMode) => {
    patchBuildProfile((current) => ({
      ...current,
      exportMode: mode === 'complete-build' ? undefined : mode,
    }))
  }

  const exportDiagramSvg = () => {
    const source = document.querySelector<SVGSVGElement>(`svg[data-build-export="${exportMode}"]`)
    if (!source) return
    const clone = source.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('data-export-status', exportDraftStatus)
    const metadata = document.createElementNS('http://www.w3.org/2000/svg', 'metadata')
    metadata.textContent = JSON.stringify({ exportMode, status: exportDraftStatus, boardConfidence: exactBoard?.confidence ?? 'unresolved', ruleSetVersion: electricalPlan.ruleSetVersion })
    clone.prepend(metadata)
    downloadBuildFile(new XMLSerializer().serializeToString(clone), 'fastled-build-diagram.svg', 'image/svg+xml;charset=utf-8')
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

  const setAllVisible = () => {
    setVisibilityFilter('all')
    setIsolatedItemId(null)
    patchBuildProfile((current) => ({
      ...current,
      visibility: undefined,
    }))
  }

  const hideCompletedItems = () => {
    setVisibilityFilter('all')
    setIsolatedItemId(null)
    patchBuildProfile((current) => {
      const visibility = { ...(current.visibility ?? {}) }
      for (const item of primaryItems) {
        if (isItemDone(item.id)) visibility[item.id] = false
      }
      return {
        ...current,
        visibility: Object.keys(visibility).length > 0 ? visibility : undefined,
      }
    })
  }

  const adjustSidebarWidth = (delta: number) => {
    setSidebarWidth((current) => Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, current + delta)))
  }

  const adjustDetailPaneWidth = (delta: number) => {
    setDetailPaneWidth((current) => Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, current + delta)))
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
  const visibleItemIds = useMemo(() => new Set(visiblePrimaryItems.map((item) => item.id)), [visiblePrimaryItems])
  const visibleDeviceLayouts = useMemo(
    () => allDeviceLayouts.filter((layout) => visibleItemIds.has(layout.itemId)),
    [allDeviceLayouts, visibleItemIds],
  )
  const allBounds = useMemo(() => boundsForLayouts(controllerBox, allDeviceLayouts), [allDeviceLayouts, controllerBox])
  const visibleBounds = useMemo(() => boundsForLayouts(controllerBox, visibleDeviceLayouts), [controllerBox, visibleDeviceLayouts])

  const boardAnchorsById = useMemo(() => new Map((exactBoard?.pinAnchors ?? []).map((anchor) => [anchor.id, anchor])), [exactBoard])
  const canRenderControllerPins = !!exactBoard && boardAnchorsById.size > 0 && (exactBoard.pins?.length ?? 0) > 0

  const allConnections = useMemo<DiagramConnection[]>(() => {
    const byItemId = new Map(allDeviceLayouts.map((layout) => [layout.itemId, layout]))
    return visiblePrimaryItems.flatMap((item) => {
      const layout = byItemId.get(item.id)
      if (!layout) return []
      return item.pins.map((pinUse, pinIndex) => {
        const boardPin = canRenderControllerPins ? boardPinForGpio(exactBoard, pinUse.pin) : undefined
        const boardAnchor = boardPin ? boardAnchorsById.get(boardPin.anchorId) : undefined
        const unavailableReason = boardPin?.availability === 'unavailable'
          ? `GPIO ${pinUse.pin} is exposed on the selected board header but unavailable on this module because octal PSRAM uses it.`
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
              : `GPIO ${pinUse.pin} is not mapped on the selected physical board profile.`,
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
    const boardPin = boardPinForGpio(exactBoard, pinUse.pin)
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
  const canvasHeight = 760
  const scaledCanvasWidth = canvasWidth * diagramZoom
  const scaledCanvasHeight = canvasHeight * diagramZoom

  const updateViewport = (nextZoom: number, focusRect?: { x: number; y: number; width: number; height: number }) => {
    const viewport = viewportRef.current
    const zoom = clampZoom(nextZoom)
    setDiagramZoom(zoom)
    if (!viewport) return
    window.requestAnimationFrame(() => {
      if (focusRect) {
        const targetWidth = focusRect.width * zoom
        const targetHeight = focusRect.height * zoom
        const targetLeft = (focusRect.x * zoom) - ((viewport.clientWidth - targetWidth) / 2)
        const targetTop = (focusRect.y * zoom) - ((viewport.clientHeight - targetHeight) / 2)
        viewport.scrollLeft = Math.max(0, targetLeft)
        viewport.scrollTop = Math.max(0, targetTop)
        return
      }
      const centerX = ((viewport.scrollLeft + (viewport.clientWidth / 2)) / Math.max(diagramZoom, 0.001)) * zoom
      const centerY = ((viewport.scrollTop + (viewport.clientHeight / 2)) / Math.max(diagramZoom, 0.001)) * zoom
      viewport.scrollLeft = Math.max(0, centerX - (viewport.clientWidth / 2))
      viewport.scrollTop = Math.max(0, centerY - (viewport.clientHeight / 2))
    })
  }

  const fitAll = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    if (viewport.clientWidth < FIT_PADDING || viewport.clientHeight < FIT_PADDING) return
    const widthZoom = (viewport.clientWidth - FIT_PADDING) / allBounds.width
    const heightZoom = (viewport.clientHeight - FIT_PADDING) / allBounds.height
    const fitZoom = clampZoom(Math.min(widthZoom, heightZoom, 1))
    updateViewport(fitZoom, allBounds)
  }

  const fitVisible = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    if (viewport.clientWidth < FIT_PADDING || viewport.clientHeight < FIT_PADDING) return
    const widthZoom = (viewport.clientWidth - FIT_PADDING) / visibleBounds.width
    const heightZoom = (viewport.clientHeight - FIT_PADDING) / visibleBounds.height
    const fitZoom = clampZoom(Math.min(widthZoom, heightZoom, 1))
    updateViewport(fitZoom, visibleBounds)
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
    const viewport = viewportRef.current
    setDiagramZoom(1)
    if (!viewport) return
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = 0
      viewport.scrollTop = 0
    })
  }

  const startViewportPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('button')) return
    const viewport = viewportRef.current
    if (!viewport) return
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
    }
    viewport.setPointerCapture(event.pointerId)
  }

  const handleViewportPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    const panState = panStateRef.current
    if (!viewport || !panState || panState.pointerId !== event.pointerId) return
    viewport.scrollLeft = panState.startScrollLeft - (event.clientX - panState.startX)
    viewport.scrollTop = panState.startScrollTop - (event.clientY - panState.startY)
  }

  const stopViewportPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    const panState = panStateRef.current
    if (!viewport || !panState || panState.pointerId !== event.pointerId) return
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
    panStateRef.current = null
  }

  useEffect(() => {
    if (!exactBoard) {
      setDiagramZoom(1)
      return
    }
    fitVisible()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exactBoard?.id, canvasWidth, canvasHeight])

  const workspaceStyle = {
    '--build-sidebar-width': `${sidebarWidth}px`,
    '--build-detail-width': `${detailPaneWidth}px`,
  } as CSSProperties

  return (
    <section
      className={[
        styles.workspace,
        sidebarCollapsed ? styles.workspaceSidebarCollapsed : '',
        detailPaneCollapsed ? styles.workspaceDetailCollapsed : '',
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
              <div>
                <h2 className={styles.panelTitle}>Build Diagram</h2>
                <p className={styles.panelSubtitle}>Graph hardware in, complete recommended wiring out.</p>
              </div>
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
                <button type="button" className={styles.backButton} onClick={closeBuildDiagram}>
                  <span aria-hidden="true">Design</span><span className={styles.visuallyHidden}>Back to Design</span>
                </button>
              </div>
            </div>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Controller target</h3>
              <p className={styles.copy}>
                {selectedTarget?.label ?? 'No board target selected'}{selectedFqbn ? ` · ${selectedFqbn}` : ''}
              </p>
              <p className={styles.copyMuted}>
                Exact physical board profiles stay separate from the compile target. Build Diagram needs the exact board before it can trust physical wiring.
              </p>
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Exact board</h3>
              {boardOptions.length === 0 ? (
                <p className={styles.warningText}>
                  Diagram profile unavailable for this target family. Build Diagram will stay in planning-only mode until a reviewed physical board profile exists.
                </p>
              ) : (
                <div className={styles.optionList}>
                  {boardOptions.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className={`${styles.optionCard} ${buildProfile.physicalBoardProfileId === profile.id ? styles.optionCardActive : ''}`}
                      onClick={() => selectExactBoard(profile.id)}
                    >
                      <div className={styles.optionPreviewWrap}>
                        <BoardPreview svg={profile.previewSvg} label={`${profile.label} preview`} />
                      </div>
                      <span className={styles.optionTitle}>{profile.label}</span>
                      <span className={styles.optionMeta}>
                        {profile.manufacturer} · {profile.dimensionsMm.width}×{profile.dimensionsMm.height} mm · {profile.confidence.replace(/-/g, ' ')}
                      </span>
                      {profile.confidence !== 'manufacturer-verified' && (
                        <span className={`${styles.confidenceBadge} ${styles.confidenceBadgeCaution}`}>
                          {confidenceSummary(profile)}
                        </span>
                      )}
                      <span className={styles.optionHint}>{profile.sourceSummary}</span>
                      {profile.caveats[0] && <span className={styles.optionHint}>{profile.caveats[0]}</span>}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.card}>
              <div className={styles.rowBetween}>
                <h3 className={styles.cardTitle}>Hardware items</h3>
                <span className={styles.progressPill}>{completedCount}/{primaryItems.length} done</span>
              </div>
              <div className={styles.filterRow}>
                <button type="button" className={styles.smallButton} onClick={setAllVisible}>
                  Show all
                </button>
                <button type="button" className={styles.smallButton} onClick={hideCompletedItems}>
                  Hide completed
                </button>
                <button
                  type="button"
                  className={`${styles.smallButton} ${visibilityFilter === 'unfinished' ? styles.smallButtonDone : ''}`}
                  onClick={() => {
                    setIsolatedItemId(null)
                    setVisibilityFilter((current) => current === 'unfinished' ? 'all' : 'unfinished')
                  }}
                >
                  {visibilityFilter === 'unfinished' ? 'Showing unfinished' : 'Show unfinished only'}
                </button>
              </div>
              <div className={styles.hardwareList}>
                {primaryItems.length === 0 ? (
                  <p className={styles.copyMuted}>Add Matrix Output routes or supported hardware-input nodes to populate the build list.</p>
                ) : listedPrimaryItems.length === 0 ? (
                  <p className={styles.copyMuted}>All hardware items are complete under the current filter.</p>
                ) : listedPrimaryItems.map((item) => {
                  const isVisible = buildProfile.visibility?.[item.id] !== false
                  const done = buildProfile.done?.[item.id]
                  const isDone = isItemDone(item.id)
                  const isStale = !!done && !isDone
                  return (
                    <div key={item.id} className={`${styles.hardwareRow} ${selectedItemId === item.id ? styles.hardwareRowActive : ''}`}>
                      <button type="button" className={styles.hardwareMain} onClick={() => setSelectedItemId(item.id)}>
                        <span className={styles.hardwareTitle}>{item.title}</span>
                        <span className={styles.hardwareSubtitle}>{item.subtitle}</span>
                        {isStale && <span className={styles.staleNotice}>Wiring changed—recheck this connection.</span>}
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
                  <span className={styles.powerSummaryValue}>{formatCurrentMa(electricalPlan.totals.designCurrentMa)}</span>
                  <span className={styles.powerSummaryMeta}>
                    design load @ {formatVoltage(electricalPlan.totals.nominalVoltage)}
                  </span>
                  <span className={styles.powerSummaryBudget}>
                    Supply budget {formatCurrentMa(electricalPlan.totals.recommendedSupplyCurrentMa)} / {formatWattage(electricalPlan.totals.recommendedSupplyWattage)}
                  </span>
                </>
              ) : (
                <p className={styles.copyMuted}>Add the missing installation facts to calculate the conservative supply budget.</p>
              )}
            </section>

            <section className={`${styles.card} ${signalReady ? styles.readinessCardReady : styles.readinessCardPending}`}>
              <span className={styles.readinessMark}>{signalReady ? 'OK' : '!'}</span>
              <div>
                <h3 className={styles.cardTitle}>{signalReady ? 'No pin conflicts' : 'Signal review needed'}</h3>
                <p className={styles.copyMuted}>{readinessText}</p>
              </div>
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Generated from the graph</h3>
              <p className={styles.copyMuted}>
                Confirm the exact controller board once. Build Diagram then chooses the controller power method,
                signal conditioning, supply capacity, fused distribution, conductor size, and LED feed count for you.
              </p>
              <ol className={styles.generatedSteps}>
                <li>Buy the parts listed in the generated BOM.</li>
                <li>Wire each labelled terminal exactly as shown in the centre diagram.</li>
                <li>Use the calculated fused-feed count; never power the LED load through the controller.</li>
              </ol>
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
          </>
        )}
      </aside>

      <main className={styles.diagramPane}>
        <div className={styles.diagramHeader}>
          <div>
            <h2 className={styles.panelTitle}>Diagram</h2>
            <p className={styles.panelSubtitle}>
              {!exactBoard
                ? 'Select an exact board profile to unlock controller-aware wiring details.'
                : !canRenderControllerPins
                  ? `${exactBoard.label} selected. This profile still needs a reviewed physical pin map before controller-side wiring can be drawn.`
                  : `${exactBoard.label} selected. Connections now resolve against that exact board's pin map.`}
            </p>
          </div>
          <div className={styles.diagramToolbar}>
            <span className={styles.zoomPill}>Zoom {Math.round(diagramZoom * 100)}%</span>
            <button type="button" className={styles.smallButton} aria-label="Zoom out" title="Zoom out" onClick={() => updateViewport(diagramZoom - ZOOM_STEP)}>
              <span aria-hidden="true">-</span><i className={styles.visuallyHidden}>Zoom out</i>
            </button>
            <button type="button" className={styles.smallButton} aria-label="Zoom in" title="Zoom in" onClick={() => updateViewport(diagramZoom + ZOOM_STEP)}>
              <span aria-hidden="true">+</span><i className={styles.visuallyHidden}>Zoom in</i>
            </button>
            <button type="button" className={styles.smallButton} onClick={fitAll} disabled={!exactBoard}>
              <span aria-hidden="true">Fit</span><span className={styles.visuallyHidden}>Fit all</span>
            </button>
            <button type="button" className={styles.smallButton} onClick={fitVisible} disabled={!exactBoard}>
              <span aria-hidden="true">Visible</span><span className={styles.visuallyHidden}>Fit visible</span>
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

        {!exactBoard ? (
          <div className={styles.emptyState}>
            <h3 className={styles.emptyTitle}>Exact board required</h3>
            <p className={styles.copy}>
              The graph already defines logical GPIO numbers and hardware roles. Build Diagram now needs the exact physical controller board before it can show trustworthy physical references.
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
          >
            <div className={styles.diagramSurface} style={{ minWidth: `${scaledCanvasWidth}px`, minHeight: `${scaledCanvasHeight}px` }}>
              <div
                className={styles.diagramCanvas}
                style={{
                  width: `${canvasWidth}px`,
                  height: `${canvasHeight}px`,
                  transform: `scale(${diagramZoom})`,
                }}
                data-pan-surface="true"
              >
                <PhysicalAssemblyDiagram
                  boardLabel={exactBoard.label}
                  items={visiblePrimaryItems}
                  plan={electricalPlan}
                  exportScope="current-view"
                  selectedItemId={selectedItemId}
                  onSelectItem={setSelectedItemId}
                  connections={allConnections.map((connection) => ({
                    id: connection.id,
                    itemId: connection.itemId,
                    pinLabel: connection.boardPin?.label ?? `GPIO ${connection.pinUse.pin}`,
                    useLabel: connection.pinUse.label,
                  }))}
                />
              </div>
            </div>
          </div>
        )}
        {exactBoard && (
          <div className={styles.exportDiagramHidden} aria-hidden="true">
            <PhysicalAssemblyDiagram
              boardLabel={exactBoard.label}
              items={primaryItems}
              plan={electricalPlan}
              exportScope="complete-build"
              selectedItemId="controller"
              onSelectItem={() => undefined}
              connections={primaryItems.flatMap((item) => item.pins.map((pin) => ({
                id: `${item.id}:${pin.propertyKey}`,
                itemId: item.id,
                pinLabel: `GPIO ${pin.pin}`,
                useLabel: pin.label,
              })))}
            />
          </div>
        )}
      </main>

      <aside className={styles.detailPane}>
        {detailPaneCollapsed ? (
          <button type="button" className={styles.collapsedRail} onClick={() => setDetailPaneCollapsed(false)}>
            Show details
          </button>
        ) : (
          <>
            <div className={styles.detailHeader}>
              <div>
                <h2 className={styles.panelTitle}>Details</h2>
                <p className={styles.panelSubtitle}>Readiness, connections, board notes, and export state.</p>
              </div>
              <div className={styles.headerActions}>
                <div className={styles.panelSizeControls}>
                  <button
                    type="button"
                    className={styles.smallButton}
                    onClick={() => adjustDetailPaneWidth(-PANEL_WIDTH_STEP)}
                    disabled={detailPaneWidth <= MIN_DETAIL_WIDTH}
                    aria-label="Narrow details panel"
                    title="Narrow details panel"
                  >
                    <span aria-hidden="true">-</span><span className={styles.visuallyHidden}>Narrow details</span>
                  </button>
                  <button
                    type="button"
                    className={styles.smallButton}
                    onClick={() => adjustDetailPaneWidth(PANEL_WIDTH_STEP)}
                    disabled={detailPaneWidth >= MAX_DETAIL_WIDTH}
                    aria-label="Widen details panel"
                    title="Widen details panel"
                  >
                    <span aria-hidden="true">+</span><span className={styles.visuallyHidden}>Widen details</span>
                  </button>
                </div>
                <button type="button" className={styles.smallButton} onClick={() => setDetailPaneCollapsed(true)}>
                  <span aria-hidden="true">&gt;&gt;</span><span className={styles.visuallyHidden}>Hide details</span>
                </button>
              </div>
            </div>

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
                        <strong>{connection.boardPin?.label ?? `GPIO ${connection.pinUse.pin}`}</strong> · {connection.pinUse.label}
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
                      <span>{row.boardPin?.label ?? `GPIO ${row.pinUse.pin}`} → {row.pinUse.label}</span>
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
                      <li>Total design load: {formatCurrentMa(electricalPlan.totals.designCurrentMa)} @ {electricalPlan.totals.nominalVoltage} V</li>
                      {electricalPlan.totals.operatingCurrentCapMa != null && (
                        <li>Configured operating cap: {formatCurrentMa(electricalPlan.totals.operatingCurrentCapMa)}</li>
                      )}
                      <li>
                        Buy {electricalPlan.totals.recommendedSupplyCount} × {electricalPlan.totals.nominalVoltage} V supply,
                        {' '}at least {formatCurrentMa(electricalPlan.totals.perSupplyCurrentMa)} continuous each
                        {' '}({formatWattage(electricalPlan.totals.recommendedSupplyWattage)} total capacity with {electricalPlan.totals.headroomPercent}% headroom)
                      </li>
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
                          <span className={styles.progressPill}>{formatCurrentMa(output.designCurrentMa)}</span>
                        </div>
                        <ul className={styles.flatList}>
                          <li>Power feeds: {output.recommendedFeedCount} fused feeds, distributed evenly across the matrix</li>
                          <li>Feed grouping: no more than approximately {output.pixelsPerFeed} pixels / {formatCurrentMa(output.branchDesignCurrentMa)} design load per feed</li>
                          <li>Output supply budget: {formatCurrentMa(output.recommendedSupplyCurrentMa)} @ {output.nominalVoltage} V ({formatWattage(output.recommendedSupplyWattage)})</li>
                          {output.conductor && (
                            <li>Each feed conductor: AWG {output.conductor.awg} / {output.conductor.crossSectionMm2} mm2 {output.conductor.material} minimum</li>
                          )}
                          {output.connectorMinimumMa && <li>Connector minimum: {formatCurrentMa(output.connectorMinimumMa)} continuous</li>}
                          {output.fuse.ratingMa && <li>Each feed fuse: {formatCurrentMa(output.fuse.ratingMa)}</li>}
                          {output.operatingCurrentCapMa != null && <li>Configured operating cap: {formatCurrentMa(output.operatingCurrentCapMa)}</li>}
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
                  ? hiddenPrimaryItemCount > 0 || !!isolatedItemId
                    ? 'Complete build is selected. Hidden or isolated hardware will still be included.'
                    : 'Complete build is selected. Exports will include every configured hardware item by default.'
                  : 'Current view is selected. Exports will follow the hardware currently visible under the eye/filter/isolation state.'}
              </p>
              <p className={styles.warningText}>{exportDraftStatus}</p>
              <p className={styles.copyMuted}>
                {exportDraftReason}
              </p>
              <div className={styles.exportActionGrid}>
                <button type="button" className={styles.exportModeButton} disabled={!exactBoard} onClick={exportDiagramSvg}>Export SVG</button>
                <button type="button" className={styles.exportModeButton} disabled={!exactBoard} onClick={() => window.print()}>Print / PDF</button>
                <button type="button" className={styles.exportModeButton} disabled={!exactBoard} onClick={exportConnectionsCsv}>Connections CSV</button>
                <button type="button" className={styles.exportModeButton} disabled={!exactBoard} onClick={exportBomCsv}>BOM CSV</button>
              </div>
            </section>
          </>
        )}
      </aside>
    </section>
  )
}
