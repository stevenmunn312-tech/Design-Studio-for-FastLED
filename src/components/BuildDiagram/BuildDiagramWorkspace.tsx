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
  type BuildAssumptions,
  type BuildControllerPowerProfile,
  type BuildOwnedParts,
  ensureBuildProfile,
  fingerprintValue,
  type BuildExportMode,
  type BuildInstallationTopology,
  type OwnedSupplyDeclaration,
  type OwnedWireDeclaration,
  type OwnedConnectorDeclaration,
  type OwnedFuseDeclaration,
  type BuildOutputProfile,
  type BuildSupplyFeedLocation,
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

interface PlanningBlocker {
  id: string
  title: string
  details: string[]
}

type VisibilityFilter = 'all' | 'unfinished'
type ViewportPanState = { pointerId: number; startX: number; startY: number; startScrollLeft: number; startScrollTop: number }

const MIN_ZOOM = 0.55
const MAX_ZOOM = 1.8
const ZOOM_STEP = 0.15
const FIT_PADDING = 48
const OUTPUT_TOPOLOGY_OPTIONS: { value: BuildInstallationTopology; label: string }[] = [
  { value: 'strip', label: 'Strip / linear run' },
  { value: 'matrix', label: 'Matrix / panel face' },
  { value: 'panels', label: 'Tiled panels' },
  { value: 'custom', label: 'Custom geometry' },
]
const FEED_LOCATION_OPTIONS: { value: BuildSupplyFeedLocation; label: string }[] = [
  { value: 'start', label: 'Feed at start' },
  { value: 'end', label: 'Feed at end' },
  { value: 'both-ends', label: 'Feed both ends' },
  { value: 'center', label: 'Feed at center' },
  { value: 'custom', label: 'Custom feed plan' },
]
const CONTROLLER_POWER_OPTIONS: { value: NonNullable<BuildControllerPowerProfile['preferredPath']>; label: string }[] = [
  { value: 'usb', label: 'USB power' },
  { value: 'vin', label: 'VIN input' },
  { value: '5vin', label: '5VIN input' },
  { value: 'regulated-5v', label: 'External regulated 5 V' },
  { value: 'regulated-3v3', label: 'External regulated 3.3 V' },
]
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

function parseNumberInput(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function hasBuildOutputProfileData(profile: BuildOutputProfile | undefined): profile is BuildOutputProfile {
  if (!profile) return false
  return Object.entries(profile).some(([key, value]) => {
    if (value == null) return false
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'string') return key === 'notes' ? value.trim().length > 0 : true
    return true
  })
}

function hasControllerPowerProfileData(profile: BuildControllerPowerProfile | undefined): profile is BuildControllerPowerProfile {
  if (!profile) return false
  return !!profile.preferredPath || !!profile.notes?.trim()
}

function hasAssumptionsData(assumptions: BuildAssumptions | undefined): assumptions is BuildAssumptions {
  if (!assumptions) return false
  return Object.values(assumptions).some((value) => value !== undefined)
}

function hasOwnedPartsData(ownedParts: BuildOwnedParts | undefined): ownedParts is BuildOwnedParts {
  if (!ownedParts) return false
  return Object.values(ownedParts).some((value) => {
    if (!value) return false
    if (typeof value !== 'object') return false
    return Object.keys(value).length > 0
  })
}

function inferredOutputTopology(item: HardwareManifestItem): BuildInstallationTopology {
  const layout = String(item.facts.layout ?? 'matrix')
  if (layout === 'panels') return 'panels'
  const width = Number(item.facts.width ?? 0)
  const height = Number(item.facts.height ?? 0)
  if (width > 1 && height > 1) return 'matrix'
  return 'strip'
}

function outputPlanningBlockers(profile: BuildOutputProfile | undefined): string[] {
  const blockers: string[] = []
  if (profile?.physicalLengthMm == null) {
    blockers.push('Physical length is still missing, so conductor sizing and injection spacing cannot be estimated yet.')
  }
  if (profile?.ledDensityPerMeter == null && profile?.pitchMm == null) {
    blockers.push('LED density or pitch is still missing, so current-per-length and injection planning cannot be estimated yet.')
  }
  if (profile?.feedCableLengthMm == null) {
    blockers.push('Feed-cable length is still missing, so voltage-drop and cable-size checks cannot be estimated yet.')
  }
  return blockers
}

function itemFingerprint(
  item: HardwareManifestItem,
  selectedFqbn: string,
  physicalBoardProfileId: string | undefined,
  outputProfile: BuildOutputProfile | undefined,
  controllerPower: BuildControllerPowerProfile | undefined,
  assumptions: BuildAssumptions | undefined,
  ownedParts: BuildOwnedParts | undefined,
  signalConditioningConfirmed: boolean,
): string {
  return fingerprintValue({
    selectedFqbn,
    physicalBoardProfileId,
    outputProfile,
    controllerPower,
    assumptions,
    ownedParts,
    signalConditioningConfirmed,
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
  const [advancedAssumptionsOpen, setAdvancedAssumptionsOpen] = useState(false)
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
        buildProfile.outputs?.[item.id],
        buildProfile.controllerPower,
        buildProfile.assumptions,
        buildProfile.ownedParts,
        buildProfile.signalConditioning?.[item.id] === true,
      ))
    }
    return map
  }, [buildProfile.assumptions, buildProfile.controllerPower, buildProfile.outputs, buildProfile.ownedParts, buildProfile.physicalBoardProfileId, buildProfile.signalConditioning, primaryItems, selectedFqbn])

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
  const planningBlockers = useMemo<PlanningBlocker[]>(() => {
    const blockers: PlanningBlocker[] = []
    if (!exactBoard) {
      blockers.push({
        id: 'exact-board',
        title: 'Exact board profile',
        details: ['Controller-side wiring and reviewed controller power-path checks stay blocked until the exact physical board is selected.'],
      })
    }
    if (!buildProfile.controllerPower?.preferredPath) {
      blockers.push({
        id: 'controller-power',
        title: 'Controller power path',
        details: ['Controller branch validation stays incomplete until Build Diagram knows whether the controller expects USB, VIN, 5VIN, or an external regulated rail.'],
      })
    }
    for (const item of outputItems) {
      const details = outputPlanningBlockers(buildProfile.outputs?.[item.id])
      if (details.length > 0) {
        blockers.push({
          id: `planner:${item.id}`,
          title: item.title,
          details,
        })
      }
    }
    return blockers
  }, [buildProfile.controllerPower?.preferredPath, buildProfile.outputs, exactBoard, outputItems])
  const requirementsInputText = planningBlockers.length === 0
    ? 'all required installation facts are captured for the electrical planner'
    : `${planningBlockers.length} input blocker${planningBlockers.length === 1 ? '' : 's'} still need review`
  const electricalPlan = useMemo(
    () => calculateElectricalPlan(manifest, buildProfile, exactBoard),
    [buildProfile, exactBoard, manifest],
  )
  const ownedSupplies = useMemo(
    () => Object.values(buildProfile.ownedParts?.supplies ?? {}),
    [buildProfile.ownedParts?.supplies],
  )
  const partsSummary = useMemo(() => {
    const lines: Array<{ id: string; quantity: string; label: string; pending?: boolean }> = []
    if (exactBoard) lines.push({ id: 'board', quantity: '1', label: exactBoard.label })
    for (const item of primaryItems) lines.push({ id: item.id, quantity: '1', label: item.title })
    if (outputItems.length > 0) {
      lines.push({ id: 'level-shifter', quantity: String(Math.max(1, Math.ceil(outputItems.length / 4))), label: '74AHCT125 level shifter' })
      lines.push({ id: 'resistors', quantity: String(outputItems.length), label: '330 ohm data resistor' })
      lines.push({ id: 'fuses', quantity: String(outputItems.length), label: 'Branch fuse', pending: true })
      lines.push({ id: 'capacitors', quantity: String(outputItems.length), label: '1000uF bulk capacitor' })
    }
    if (ownedSupplies.length > 0) {
      for (const supply of ownedSupplies) {
        lines.push({ id: `owned:${supply.id}`, quantity: '1', label: supply.label ?? supply.id })
      }
    } else if (outputItems.length > 0) {
      lines.push({ id: 'supply', quantity: '1', label: '5 V DC supply', pending: true })
    }
    lines.push({ id: 'wire', quantity: '-', label: 'Hookup wire', pending: true })
    return lines
  }, [exactBoard, outputItems.length, ownedSupplies, primaryItems])
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
  const supplyAssignments = useMemo(
    () => buildProfile.ownedParts?.supplyAssignments ?? {},
    [buildProfile.ownedParts?.supplyAssignments],
  )
  const assignmentCountsBySupplyId = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const supplyId of Object.values(supplyAssignments)) {
      counts[supplyId] = (counts[supplyId] ?? 0) + 1
    }
    return counts
  }, [supplyAssignments])

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
      buildProfile.outputs?.[item.id],
      buildProfile.controllerPower,
      buildProfile.assumptions,
      buildProfile.ownedParts,
      buildProfile.signalConditioning?.[item.id] === true,
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

  const updateOutputProfile = (
    itemId: string,
    recipe: (current: BuildOutputProfile | undefined) => BuildOutputProfile | undefined,
  ) => {
    patchBuildProfile((current) => {
      const outputs = { ...(current.outputs ?? {}) }
      const nextProfile = recipe(outputs[itemId])
      if (hasBuildOutputProfileData(nextProfile)) outputs[itemId] = nextProfile
      else delete outputs[itemId]
      return {
        ...current,
        outputs: Object.keys(outputs).length > 0 ? outputs : undefined,
      }
    })
  }

  const setOutputNumberField = (itemId: string, key: keyof BuildOutputProfile, rawValue: string) => {
    updateOutputProfile(itemId, (current) => ({
      ...(current ?? {}),
      [key]: parseNumberInput(rawValue),
    }))
  }

  const updateControllerPowerProfile = (
    recipe: (current: BuildControllerPowerProfile | undefined) => BuildControllerPowerProfile | undefined,
  ) => {
    patchBuildProfile((current) => {
      const nextProfile = recipe(current.controllerPower)
      return {
        ...current,
        controllerPower: hasControllerPowerProfileData(nextProfile) ? nextProfile : undefined,
      }
    })
  }

  const updateAssumptions = (
    recipe: (current: BuildAssumptions | undefined) => BuildAssumptions | undefined,
  ) => {
    patchBuildProfile((current) => {
      const nextAssumptions = recipe(current.assumptions)
      return {
        ...current,
        assumptions: hasAssumptionsData(nextAssumptions) ? nextAssumptions : undefined,
      }
    })
  }

  const updateOwnedParts = (
    recipe: (current: BuildOwnedParts | undefined) => BuildOwnedParts | undefined,
  ) => {
    patchBuildProfile((current) => {
      const nextOwnedParts = recipe(current.ownedParts)
      return {
        ...current,
        ownedParts: hasOwnedPartsData(nextOwnedParts) ? nextOwnedParts : undefined,
      }
    })
  }

  const setOutputTextField = (itemId: string, key: keyof BuildOutputProfile, rawValue: string) => {
    updateOutputProfile(itemId, (current) => ({
      ...(current ?? {}),
      [key]: rawValue.trim() ? rawValue : undefined,
    }))
  }

  const setOutputInjectionPoints = (itemId: string, rawValue: string) => {
    const points = rawValue.split(',').map((entry) => entry.trim()).filter(Boolean)
    updateOutputProfile(itemId, (current) => ({
      ...(current ?? {}),
      manualInjectionPoints: points.length > 0 ? points : undefined,
    }))
  }

  const adoptRecommendedBranchKit = (itemId: string) => {
    const plan = electricalPlan.outputs.find((entry) => entry.itemId === itemId)
    if (!plan?.conductor || !plan.connectorMinimumMa || !plan.fuse.ratingMa) return
    const conductor = plan.conductor
    const connectorMinimumMa = plan.connectorMinimumMa
    const fuseRatingMa = plan.fuse.ratingMa
    updateOwnedParts((current) => {
      const wireId = `recommended-wire:${itemId}`
      const connectorId = `recommended-connector:${itemId}`
      const fuseId = `recommended-fuse:${itemId}`
      const wire: OwnedWireDeclaration = {
        id: wireId,
        label: `Confirmed AWG ${conductor.awg} branch wire`,
        gaugeAwg: conductor.awg,
        crossSectionMm2: conductor.crossSectionMm2,
        conductorMaterial: conductor.material,
      }
      const connector: OwnedConnectorDeclaration = {
        id: connectorId,
        label: `Confirmed ${formatCurrentMa(connectorMinimumMa)} connector`,
        continuousCurrentMa: connectorMinimumMa,
      }
      const fuse: OwnedFuseDeclaration = {
        id: fuseId,
        label: `Confirmed ${formatCurrentMa(fuseRatingMa)} branch fuse`,
        ratingMa: fuseRatingMa,
      }
      return {
        ...(current ?? {}),
        wires: { ...(current?.wires ?? {}), [wireId]: wire },
        connectors: { ...(current?.connectors ?? {}), [connectorId]: connector },
        fuses: { ...(current?.fuses ?? {}), [fuseId]: fuse },
        wireAssignments: { ...(current?.wireAssignments ?? {}), [itemId]: wireId },
        connectorAssignments: { ...(current?.connectorAssignments ?? {}), [itemId]: connectorId },
        fuseAssignments: { ...(current?.fuseAssignments ?? {}), [itemId]: fuseId },
      }
    })
    patchBuildProfile((current) => ({
      ...current,
      signalConditioning: {
        ...(current.signalConditioning ?? {}),
        [itemId]: true,
      },
    }))
  }

  const setOutputEnumField = (itemId: string, key: keyof BuildOutputProfile, rawValue: string) => {
    updateOutputProfile(itemId, (current) => ({
      ...(current ?? {}),
      [key]: rawValue ? rawValue : undefined,
    }))
  }

  const setControllerPowerPath = (rawValue: string) => {
    updateControllerPowerProfile((current) => ({
      ...(current ?? {}),
      preferredPath: rawValue
        ? rawValue as NonNullable<BuildControllerPowerProfile['preferredPath']>
        : undefined,
    }))
  }

  const setControllerPowerNotes = (rawValue: string) => {
    updateControllerPowerProfile((current) => ({
      ...(current ?? {}),
      notes: rawValue.trim() ? rawValue : undefined,
    }))
  }

  const setAssumptionNumberField = (key: keyof BuildAssumptions, rawValue: string) => {
    updateAssumptions((current) => ({
      ...(current ?? {}),
      [key]: parseNumberInput(rawValue),
    }))
  }

  const setAssumptionMaterial = (rawValue: string) => {
    updateAssumptions((current) => ({
      ...(current ?? {}),
      conductorMaterial: rawValue === 'copper' || rawValue === 'cca' ? rawValue : undefined,
    }))
  }

  const addOwnedSupply = () => {
    updateOwnedParts((current) => {
      const supplies = { ...(current?.supplies ?? {}) }
      let index = Object.keys(supplies).length + 1
      let id = `supply-${index}`
      while (supplies[id]) {
        index += 1
        id = `supply-${index}`
      }
      supplies[id] = {
        id,
        label: `Supply ${index}`,
        voltage: 5,
        continuousCurrentMa: 20000,
        wattage: 100,
      }
      return {
        ...(current ?? {}),
        supplies,
      }
    })
  }

  const updateOwnedSupply = (
    supplyId: string,
    recipe: (current: OwnedSupplyDeclaration | undefined) => OwnedSupplyDeclaration | undefined,
  ) => {
    updateOwnedParts((current) => {
      const supplies = { ...(current?.supplies ?? {}) }
      const nextSupply = recipe(supplies[supplyId])
      if (nextSupply) supplies[supplyId] = nextSupply
      else delete supplies[supplyId]
      return {
        ...(current ?? {}),
        supplies: Object.keys(supplies).length > 0 ? supplies : undefined,
      }
    })
  }

  const removeOwnedSupply = (supplyId: string) => {
    updateOwnedParts((current) => {
      const supplies = { ...(current?.supplies ?? {}) }
      delete supplies[supplyId]
      const assignments = { ...(current?.supplyAssignments ?? {}) }
      for (const [itemId, assignedSupplyId] of Object.entries(assignments)) {
        if (assignedSupplyId === supplyId) delete assignments[itemId]
      }
      return {
        ...(current ?? {}),
        supplies: Object.keys(supplies).length > 0 ? supplies : undefined,
        supplyAssignments: Object.keys(assignments).length > 0 ? assignments : undefined,
      }
    })
  }

  const setOwnedSupplyTextField = (supplyId: string, key: 'label', rawValue: string) => {
    updateOwnedSupply(supplyId, (current) => ({
      ...(current ?? { id: supplyId, voltage: 5, continuousCurrentMa: 20000 }),
      [key]: rawValue.trim() ? rawValue : undefined,
    }))
  }

  const setOwnedSupplyNumberField = (
    supplyId: string,
    key: 'voltage' | 'continuousCurrentMa' | 'wattage',
    rawValue: string,
  ) => {
    updateOwnedSupply(supplyId, (current) => {
      const parsed = parseNumberInput(rawValue)
      if (key !== 'wattage' && parsed == null) return current
      return {
        ...(current ?? { id: supplyId, voltage: 5, continuousCurrentMa: 20000 }),
        [key]: parsed,
      }
    })
  }

  const setSupplyAssignment = (itemId: string, supplyId: string) => {
    updateOwnedParts((current) => {
      const assignments = { ...(current?.supplyAssignments ?? {}) }
      if (supplyId) assignments[itemId] = supplyId
      else delete assignments[itemId]
      return {
        ...(current ?? {}),
        supplyAssignments: Object.keys(assignments).length > 0 ? assignments : undefined,
      }
    })
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
  const unconfirmedSignalConditioning = outputItems.filter((item) => buildProfile.signalConditioning?.[item.id] !== true)
  const signalReady = !!exactBoard
    && canRenderControllerPins
    && unresolvedSignalMappingCount === 0
    && unconfirmedSignalConditioning.length === 0
  const readinessText = !exactBoard
    ? 'blocked by exact-board selection'
    : !canRenderControllerPins
      ? 'blocked because this exact board profile is still missing a reviewed physical pin map'
      : unresolvedSignalMappingCount > 0
        ? `needs review: ${unresolvedSignalMappingCount} controller pin mapping${unresolvedSignalMappingCount === 1 ? '' : 's'} unresolved`
        : unconfirmedSignalConditioning.length > 0
          ? `needs review: ${unconfirmedSignalConditioning.length} LED data route${unconfirmedSignalConditioning.length === 1 ? '' : 's'} still need the calculated level shifter and series resistor confirmed`
          : 'all supported hardware maps cleanly and required LED signal conditioning is confirmed'
  const requirementsCalculatedText = electricalPlan.requirementsCalculatedText
  const buildReadyText = signalReady && electricalPlan.powerReadyPasses
    ? 'ready'
    : !signalReady
      ? 'blocked by Signal ready'
      : 'blocked until Power ready passes'
  const exportDraftStatus = planningBlockers.length > 0 || !signalReady || !electricalPlan.powerReadyPasses
    ? 'Draft — unresolved build requirements'
    : 'Build reference — Signal and Power ready'
  const exportDraftReason = planningBlockers.length > 0
    ? 'Exports stay draft because Build Diagram is still missing installation facts required by the electrical plan.'
    : !signalReady
      ? 'Exports stay draft because controller-side signal mapping still needs review before the build reference is trustworthy.'
      : !electricalPlan.powerReadyPasses
        ? 'Exports stay draft until declared supply, conductor, connector, fuse, injection, and controller power checks all pass.'
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
                <p className={styles.panelSubtitle}>Physical hardware and installation facts for this project.</p>
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
              <h3 className={styles.cardTitle}>Controller power</h3>
              <p className={styles.copyMuted}>
                Choose the controller power path you expect to use. This does not size the power system yet, but it does record which voltage path later safety checks should validate.
              </p>
              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>Preferred path</span>
                <select
                  className={styles.fieldInput}
                  value={buildProfile.controllerPower?.preferredPath ?? ''}
                  onChange={(event) => setControllerPowerPath(event.target.value)}
                >
                  <option value="">Not decided yet</option>
                  {CONTROLLER_POWER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>Controller power notes</span>
                <textarea
                  className={styles.noteInput}
                  rows={3}
                  value={buildProfile.controllerPower?.notes ?? ''}
                  onChange={(event) => setControllerPowerNotes(event.target.value)}
                />
              </label>
              <p className={styles.copyMuted}>
                USB is the currently validated controller path on manufacturer-reviewed boards. VIN, regulator, and converter paths stay blocked until matching reviewed profiles are added.
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
                        <button type="button" className={styles.smallButton} onClick={() => toggleVisibility(item.id)}>
                          {isVisible ? 'Hide' : 'Show'}
                        </button>
                        <button type="button" className={styles.smallButton} onClick={() => setIsolatedItemId(isolatedItemId === item.id ? null : item.id)}>
                          {isolatedItemId === item.id ? 'Unisolate' : 'Isolate'}
                        </button>
                        <button type="button" className={`${styles.smallButton} ${isDone ? styles.smallButtonDone : ''}`} onClick={() => toggleDone(item)}>
                          {isDone ? 'Done' : 'Mark done'}
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

            {outputItems.length > 0 && (
              <section className={styles.card}>
                <h3 className={styles.cardTitle}>Physical install facts</h3>
                <p className={styles.copyMuted}>
                  Build Diagram already knows controller pins, route size, and chipset from the graph. Add the missing real-world strip length, density, and feed facts here so the electrical planner has something trustworthy to work from.
                </p>
                <div className={styles.outputFactList}>
                  {outputItems.map((item) => {
                    const profile = buildProfile.outputs?.[item.id]
                    const topology = profile?.topology ?? inferredOutputTopology(item)
                    const width = Number(item.facts.width ?? 0)
                    const height = Number(item.facts.height ?? 0)
                    const pixelCount = Number(item.facts.pixelCount ?? 0)
                    const missingFactLabels = [
                      profile?.physicalLengthMm == null ? 'physical length' : null,
                      profile?.ledDensityPerMeter == null && profile?.pitchMm == null ? 'LED density or pitch' : null,
                      profile?.feedCableLengthMm == null ? 'feed-cable length' : null,
                    ].filter((entry): entry is string => !!entry)
                    return (
                      <section key={item.id} className={styles.outputFactCard}>
                        <div className={styles.rowBetween}>
                          <div>
                            <h4 className={styles.subTitle}>{item.title}</h4>
                            <p className={styles.copyMuted}>{item.subtitle}</p>
                          </div>
                          <span className={styles.progressPill}>{pixelCount} px</span>
                        </div>
                        <div className={styles.knownFactRow}>
                          <span className={styles.knownFactChip}>{width}×{height}</span>
                          <span className={styles.knownFactChip}>{String(item.facts.chipset ?? 'Unknown chipset')}</span>
                          <span className={styles.knownFactChip}>{String(item.facts.layout ?? 'matrix')}</span>
                        </div>
                        <div className={styles.formGrid}>
                          <label className={styles.fieldBlock}>
                            <span className={styles.fieldLabel}>Topology</span>
                            <select
                              className={styles.fieldInput}
                              value={topology}
                              onChange={(event) => setOutputEnumField(item.id, 'topology', event.target.value)}
                            >
                              {OUTPUT_TOPOLOGY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className={styles.fieldBlock}>
                            <span className={styles.fieldLabel}>Feed location</span>
                            <select
                              className={styles.fieldInput}
                              value={profile?.intendedFeedLocation ?? 'start'}
                              onChange={(event) => setOutputEnumField(item.id, 'intendedFeedLocation', event.target.value)}
                            >
                              {FEED_LOCATION_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className={styles.fieldBlock}>
                            <span className={styles.fieldLabel}>Physical length (mm)</span>
                            <input
                              className={styles.fieldInput}
                              type="number"
                              min="0"
                              step="1"
                              value={profile?.physicalLengthMm ?? ''}
                              onChange={(event) => setOutputNumberField(item.id, 'physicalLengthMm', event.target.value)}
                            />
                          </label>
                          <label className={styles.fieldBlock}>
                            <span className={styles.fieldLabel}>LED density (/m)</span>
                            <input
                              className={styles.fieldInput}
                              type="number"
                              min="0"
                              step="1"
                              value={profile?.ledDensityPerMeter ?? ''}
                              onChange={(event) => setOutputNumberField(item.id, 'ledDensityPerMeter', event.target.value)}
                            />
                          </label>
                          <label className={styles.fieldBlock}>
                            <span className={styles.fieldLabel}>Pitch (mm)</span>
                            <input
                              className={styles.fieldInput}
                              type="number"
                              min="0"
                              step="0.1"
                              value={profile?.pitchMm ?? ''}
                              onChange={(event) => setOutputNumberField(item.id, 'pitchMm', event.target.value)}
                            />
                          </label>
                          <label className={styles.fieldBlock}>
                            <span className={styles.fieldLabel}>Feed cable length (mm)</span>
                            <input
                              className={styles.fieldInput}
                              type="number"
                              min="0"
                              step="1"
                              value={profile?.feedCableLengthMm ?? ''}
                              onChange={(event) => setOutputNumberField(item.id, 'feedCableLengthMm', event.target.value)}
                            />
                          </label>
                          <label className={styles.fieldBlock}>
                            <span className={styles.fieldLabel}>Operating current cap (mA)</span>
                            <input
                              className={styles.fieldInput}
                              type="number"
                              min="0"
                              step="100"
                              value={profile?.desiredCurrentCapMa ?? ''}
                              onChange={(event) => setOutputNumberField(item.id, 'desiredCurrentCapMa', event.target.value)}
                            />
                          </label>
                          <label className={styles.fieldBlock}>
                            <span className={styles.fieldLabel}>Confirmed injection points (mm)</span>
                            <input
                              className={styles.fieldInput}
                              type="text"
                              placeholder="0, 1250, 2500"
                              value={(profile?.manualInjectionPoints ?? []).join(', ')}
                              onChange={(event) => setOutputInjectionPoints(item.id, event.target.value)}
                            />
                          </label>
                        </div>
                        <label className={styles.fieldBlock}>
                          <span className={styles.fieldLabel}>Install notes</span>
                          <textarea
                            className={styles.noteInput}
                            rows={3}
                            value={profile?.notes ?? ''}
                            onChange={(event) => setOutputTextField(item.id, 'notes', event.target.value)}
                          />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span className={styles.fieldLabel}>Assigned owned supply</span>
                          <select
                            className={styles.fieldInput}
                            value={supplyAssignments[item.id] ?? ''}
                            onChange={(event) => setSupplyAssignment(item.id, event.target.value)}
                          >
                            <option value="">Not assigned yet</option>
                            {ownedSupplies.map((supply) => (
                              <option key={supply.id} value={supply.id}>
                                {supply.label ?? supply.id} · {formatVoltage(supply.voltage)} · {formatCurrentMa(supply.continuousCurrentMa)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {(() => {
                          const plan = electricalPlan.outputs.find((entry) => entry.itemId === item.id)
                          if (!plan) return null
                          const assigned = !!buildProfile.ownedParts?.wireAssignments?.[item.id]
                            && !!buildProfile.ownedParts?.connectorAssignments?.[item.id]
                            && !!buildProfile.ownedParts?.fuseAssignments?.[item.id]
                            && buildProfile.signalConditioning?.[item.id] === true
                          return (
                            <div className={styles.branchKitCallout}>
                              <div>
                                <strong>Calculated branch kit</strong>
                                <p className={styles.copyMuted}>
                                  {plan.conductor
                                    ? `74AHCT125 + 330 ohm data resistor; AWG ${plan.conductor.awg} / ${plan.conductor.crossSectionMm2} mm2 ${plan.conductor.material}; ${formatCurrentMa(plan.connectorMinimumMa ?? 0)} connector; ${plan.fuse.ratingMa ? formatCurrentMa(plan.fuse.ratingMa) : 'fuse unresolved'}.`
                                    : 'No reviewed conductor size meets the current assumptions.'}
                                </p>
                              </div>
                              <button
                                type="button"
                                className={`${styles.smallButton} ${assigned ? styles.smallButtonDone : ''}`}
                                disabled={!plan.conductor || !plan.connectorMinimumMa || !plan.fuse.ratingMa}
                                onClick={() => adoptRecommendedBranchKit(item.id)}
                              >
                                {assigned ? 'Branch kit selected' : 'Use this branch kit'}
                              </button>
                            </div>
                          )
                        })()}
                        {missingFactLabels.length > 0 && (
                          <p className={styles.warningText}>
                            Still needed for later power calculations: {missingFactLabels.join(', ')}.
                          </p>
                        )}
                        <p className={styles.copyMuted}>
                          Exact injection spacing remains unresolved without reviewed LED-product copper-path data; confirmed manual injection points can be entered below. Advanced environmental assumptions use conservative defaults unless changed.
                        </p>
                      </section>
                    )
                  })}
                </div>
              </section>
            )}

            <section className={styles.card}>
              <div className={styles.rowBetween}>
                <div>
                  <h3 className={styles.cardTitle}>Owned supplies</h3>
                  <p className={styles.copyMuted}>
                    Optional: record the LED power supplies you already have, then assign each output so Build Diagram can validate the conservative branch budget against real parts.
                  </p>
                </div>
                <button type="button" className={styles.smallButton} onClick={addOwnedSupply}>
                  Add supply
                </button>
              </div>
              {ownedSupplies.length === 0 ? (
                <p className={styles.copyMuted}>
                  No owned supplies recorded yet. Requirements can still be calculated first; Power ready stays pending until explicit supply choices are entered and assigned.
                </p>
              ) : (
                <div className={styles.outputFactList}>
                  {ownedSupplies.map((supply) => (
                    <section key={supply.id} className={styles.outputFactCard}>
                      <div className={styles.rowBetween}>
                        <div>
                          <h4 className={styles.subTitle}>{supply.label ?? supply.id}</h4>
                          <p className={styles.copyMuted}>
                            Used by {(assignmentCountsBySupplyId[supply.id] ?? 0)} output{(assignmentCountsBySupplyId[supply.id] ?? 0) === 1 ? '' : 's'}.
                          </p>
                        </div>
                        <button type="button" className={styles.smallButton} onClick={() => removeOwnedSupply(supply.id)}>
                          Remove
                        </button>
                      </div>
                      <div className={styles.formGrid}>
                        <label className={styles.fieldBlock}>
                          <span className={styles.fieldLabel}>Label</span>
                          <input
                            className={styles.fieldInput}
                            type="text"
                            value={supply.label ?? ''}
                            onChange={(event) => setOwnedSupplyTextField(supply.id, 'label', event.target.value)}
                          />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span className={styles.fieldLabel}>Voltage (V)</span>
                          <input
                            className={styles.fieldInput}
                            type="number"
                            min="0"
                            step="0.1"
                            value={supply.voltage}
                            onChange={(event) => setOwnedSupplyNumberField(supply.id, 'voltage', event.target.value)}
                          />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span className={styles.fieldLabel}>Continuous current (mA)</span>
                          <input
                            className={styles.fieldInput}
                            type="number"
                            min="0"
                            step="100"
                            value={supply.continuousCurrentMa}
                            onChange={(event) => setOwnedSupplyNumberField(supply.id, 'continuousCurrentMa', event.target.value)}
                          />
                        </label>
                        <label className={styles.fieldBlock}>
                          <span className={styles.fieldLabel}>Wattage (W)</span>
                          <input
                            className={styles.fieldInput}
                            type="number"
                            min="0"
                            step="0.1"
                            value={supply.wattage ?? ''}
                            onChange={(event) => setOwnedSupplyNumberField(supply.id, 'wattage', event.target.value)}
                          />
                        </label>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Power-planning blockers</h3>
              <p className={styles.copyMuted}>
                These are the missing facts currently preventing conductor, injection, or controller-power calculations from completing.
              </p>
              {planningBlockers.length === 0 ? (
                <p className={styles.copy}>All currently expected planner inputs are captured.</p>
              ) : (
                <ul className={styles.flatList}>
                  {planningBlockers.map((blocker) => (
                    <li key={blocker.id}>
                      <strong>{blocker.title}</strong>: {blocker.details.join(' ')}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.card}>
              <div className={styles.rowBetween}>
                <div>
                  <h3 className={styles.cardTitle}>Advanced assumptions</h3>
                  <p className={styles.copyMuted}>
                    Leave these blank to keep the reviewed conservative defaults. Open this only when you need to override the safety margins the future power planner will use.
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.smallButton}
                  onClick={() => setAdvancedAssumptionsOpen((current) => !current)}
                >
                  {advancedAssumptionsOpen ? 'Hide assumptions' : 'Show assumptions'}
                </button>
              </div>
              {advancedAssumptionsOpen && (
                <div className={styles.assumptionPanel}>
                  <div className={styles.formGrid}>
                    <label className={styles.fieldBlock}>
                      <span className={styles.fieldLabel}>Conductor material</span>
                      <select
                        className={styles.fieldInput}
                        value={buildProfile.assumptions?.conductorMaterial ?? ''}
                        onChange={(event) => setAssumptionMaterial(event.target.value)}
                      >
                        <option value="">Reviewed default</option>
                        <option value="copper">Copper</option>
                        <option value="cca">CCA / copper-clad aluminium</option>
                      </select>
                    </label>
                    <label className={styles.fieldBlock}>
                      <span className={styles.fieldLabel}>Allowed voltage drop (%)</span>
                      <input
                        className={styles.fieldInput}
                        type="number"
                        min="0"
                        step="0.1"
                        value={buildProfile.assumptions?.allowedVoltageDropPercent ?? ''}
                        onChange={(event) => setAssumptionNumberField('allowedVoltageDropPercent', event.target.value)}
                      />
                    </label>
                    <label className={styles.fieldBlock}>
                      <span className={styles.fieldLabel}>Ambient temperature (C)</span>
                      <input
                        className={styles.fieldInput}
                        type="number"
                        step="1"
                        value={buildProfile.assumptions?.ambientC ?? ''}
                        onChange={(event) => setAssumptionNumberField('ambientC', event.target.value)}
                      />
                    </label>
                    <label className={styles.fieldBlock}>
                      <span className={styles.fieldLabel}>Bundled circuits</span>
                      <input
                        className={styles.fieldInput}
                        type="number"
                        min="0"
                        step="1"
                        value={buildProfile.assumptions?.bundledCircuits ?? ''}
                        onChange={(event) => setAssumptionNumberField('bundledCircuits', event.target.value)}
                      />
                    </label>
                    <label className={styles.fieldBlock}>
                      <span className={styles.fieldLabel}>Supply headroom (%)</span>
                      <input
                        className={styles.fieldInput}
                        type="number"
                        min="0"
                        step="1"
                        value={buildProfile.assumptions?.supplyHeadroomPercent ?? ''}
                        onChange={(event) => setAssumptionNumberField('supplyHeadroomPercent', event.target.value)}
                      />
                    </label>
                  </div>
                  <p className={styles.copyMuted}>
                    These assumptions immediately affect conductor sizing, connector limits, fuse recommendations, and supply minimums. They are hidden by default so casual setups stay on the reviewed conservative defaults.
                  </p>
                </div>
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
                <li>Requirements inputs: {requirementsInputText}</li>
                <li>Requirements calculated: {requirementsCalculatedText}</li>
                <li>Signal ready: {readinessText}</li>
                <li>Power ready: {electricalPlan.powerReadyText}</li>
                <li>Build ready: {buildReadyText}</li>
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
                  Conservative supply/current requirements appear here once the exact board, controller power path, and output install facts are captured.
                </p>
              ) : (
                <>
                  <p className={styles.copyMuted}>
                    Conservative WS2812-class power summary for the currently supported Build Diagram scope. Wire, fuse, connector, and injection sizing still stay explicitly unresolved until the reviewed rule tables land.
                  </p>
                  {electricalPlan.totals && (
                    <ul className={styles.flatList}>
                      <li>Total design load: {formatCurrentMa(electricalPlan.totals.designCurrentMa)} @ {electricalPlan.totals.nominalVoltage} V</li>
                      {electricalPlan.totals.operatingCurrentCapMa != null && (
                        <li>Configured operating cap: {formatCurrentMa(electricalPlan.totals.operatingCurrentCapMa)}</li>
                      )}
                      <li>
                        Minimum supply budget: {formatCurrentMa(electricalPlan.totals.recommendedSupplyCurrentMa)} continuous
                        {' '}@ {electricalPlan.totals.nominalVoltage} V ({formatWattage(electricalPlan.totals.recommendedSupplyWattage)})
                        {' '}with {electricalPlan.totals.headroomPercent}% headroom
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
                            <p className={styles.copyMuted}>{output.pixelCount} px · {output.topology} · feed at {output.feedLocation}</p>
                          </div>
                          <span className={styles.progressPill}>{formatCurrentMa(output.designCurrentMa)}</span>
                        </div>
                        <ul className={styles.flatList}>
                          <li>Physical length: {Math.round(output.physicalLengthMm)} mm</li>
                          <li>Estimated LED density: {output.estimatedDensityPerMeter}/m ({output.estimatedPitchMm} mm pitch)</li>
                          <li>Conservative current-per-metre: {formatCurrentMa(output.currentPerMeterMa)}</li>
                          <li>Recommended branch supply budget: {formatCurrentMa(output.recommendedSupplyCurrentMa)} @ {output.nominalVoltage} V ({formatWattage(output.recommendedSupplyWattage)})</li>
                          {output.conductor && (
                            <li>Feed conductor: AWG {output.conductor.awg} / {output.conductor.crossSectionMm2} mm2 {output.conductor.material}; {output.conductor.voltageDropPercent}% calculated drop</li>
                          )}
                          {output.connectorMinimumMa && <li>Connector minimum: {formatCurrentMa(output.connectorMinimumMa)} continuous</li>}
                          {output.fuse.ratingMa && <li>Branch fuse: {formatCurrentMa(output.fuse.ratingMa)}</li>}
                          <li>Injection: {output.injectionPointsMm.length > 0 ? output.injectionPointsMm.map((point) => `${point} mm`).join(', ') : 'unresolved - select an exact LED product or confirm points'}</li>
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
              <h3 className={styles.cardTitle}>Owned supply validation</h3>
              {electricalPlan.status === 'blocked' ? (
                <p className={styles.copyMuted}>
                  Supply validation unlocks after Requirements calculated has enough exact-board, controller-power, and installation facts to produce branch budgets.
                </p>
              ) : ownedSupplies.length === 0 ? (
                <p className={styles.copyMuted}>
                  Add at least one owned supply and assign every output to start validating actual LED power branches.
                </p>
              ) : electricalPlan.supplyChecks.length === 0 ? (
                <p className={styles.copyMuted}>
                  Assign each output to an owned supply to compare the conservative branch requirements against declared voltage and current ratings.
                </p>
              ) : (
                <div className={styles.outputFactList}>
                  {electricalPlan.supplyChecks.map((check) => (
                    <section key={check.supplyId} className={styles.outputFactCard}>
                      <div className={styles.rowBetween}>
                        <div>
                          <h4 className={styles.subTitle}>{check.label}</h4>
                          <p className={styles.copyMuted}>
                            {check.assignedOutputTitles.join(', ') || 'No assigned outputs'}
                          </p>
                        </div>
                        <span className={styles.progressPill}>
                          {check.issues.length === 0 ? 'Matches budget' : `${check.issues.length} issue${check.issues.length === 1 ? '' : 's'}`}
                        </span>
                      </div>
                      <ul className={styles.flatList}>
                        <li>Required branch budget: {formatCurrentMa(check.requiredCurrentMa)} @ {formatVoltage(check.requiredVoltage)} ({formatWattage(check.requiredWattage)})</li>
                        <li>Declared supply: {formatCurrentMa(check.declaredCurrentMa)} @ {formatVoltage(check.declaredVoltage)}{check.declaredWattage != null ? ` (${formatWattage(check.declaredWattage)})` : ''}</li>
                      </ul>
                      {check.issues.length > 0 ? (
                        <>
                          <h4 className={styles.subTitle}>Issues</h4>
                          <ul className={styles.flatList}>
                            {check.issues.map((issue) => (
                              <li key={issue.id}>{issue.detail}</li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p className={styles.copyMuted}>
                          This declared supply meets the current conservative current and voltage budget for its assigned outputs. Wire, fuse, connector, and controller-branch validation still remain separate gates.
                        </p>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>Branch validation</h3>
              {electricalPlan.status === 'blocked' ? (
                <p className={styles.copyMuted}>Branch validation unlocks after the required installation facts are complete.</p>
              ) : electricalPlan.branchChecks.length === 0 ? (
                <p className={styles.copyMuted}>Select the calculated branch kit for each output and confirm its injection points.</p>
              ) : (
                <div className={styles.outputFactList}>
                  {electricalPlan.branchChecks.map((check) => (
                    <section key={check.itemId} className={styles.outputFactCard}>
                      <div className={styles.rowBetween}>
                        <h4 className={styles.subTitle}>{check.title}</h4>
                        <span className={styles.progressPill}>{check.issues.length === 0 ? 'Passes' : `${check.issues.length} issues`}</span>
                      </div>
                      {check.issues.length === 0 ? (
                        <p className={styles.copyMuted}>Declared conductor, connector, branch fuse, and injection plan meet the calculated minimums.</p>
                      ) : (
                        <ul className={styles.flatList}>{check.issues.map((issue) => <li key={issue.id}>{issue.detail}</li>)}</ul>
                      )}
                    </section>
                  ))}
                </div>
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
