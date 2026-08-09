import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  boardPinForGpio,
  boardProfileById,
  compatibleBoardProfilesForFqbn,
  type PhysicalBoardPinAnchor,
  type PhysicalBoardProfile,
  type PhysicalBoardPinProfile,
} from '../../build/boardProfiles'
import { ensureBuildProfile, fingerprintValue } from '../../build/buildProfile'
import { buildHardwareManifest, type HardwareManifestItem, type HardwarePinUse } from '../../build/hardwareManifest'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { boardByFqbn, useUploadStore } from '../../state/uploadStore'
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
  const [diagramZoom, setDiagramZoom] = useState(1)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const panStateRef = useRef<ViewportPanState | null>(null)

  const primaryItems = manifest.primaryItems
  const currentFingerprints = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of primaryItems) {
      map.set(item.id, itemFingerprint(item, selectedFqbn, buildProfile.physicalBoardProfileId))
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

  const completedCount = primaryItems.filter((item) => {
    return isItemDone(item.id)
  }).length

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
    const fingerprint = itemFingerprint(item, selectedFqbn, buildProfile.physicalBoardProfileId)
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

  const controllerBox = useMemo(() => {
    const size = controllerBoxSize(exactBoard?.pinAnchors)
    return {
      x: 40,
      y: 44,
      width: size.width,
      height: size.height,
    }
  }, [exactBoard])

  const deviceLayouts = useMemo(() => {
    let y = 72
    return visiblePrimaryItems.map((item) => {
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
  }, [controllerBox.width, controllerBox.x, visiblePrimaryItems])

  const boardAnchorsById = useMemo(() => new Map((exactBoard?.pinAnchors ?? []).map((anchor) => [anchor.id, anchor])), [exactBoard])
  const canRenderControllerPins = !!exactBoard && boardAnchorsById.size > 0 && (exactBoard.pins?.length ?? 0) > 0

  const allConnections = useMemo<DiagramConnection[]>(() => {
    const byItemId = new Map(deviceLayouts.map((layout) => [layout.itemId, layout]))
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
    deviceLayouts,
    exactBoard,
    visiblePrimaryItems,
  ])

  const selectedConnections = useMemo(() => {
    if (selectedItemId === 'controller') return allConnections
    return allConnections.filter((connection) => connection.itemId === selectedItemId)
  }, [allConnections, selectedItemId])

  const unresolvedConnections = allConnections.filter((connection) => connection.unresolvedReason)
  const highlightedBoardPinIds = useMemo(
    () => new Set(selectedConnections.flatMap((connection) => connection.boardPin ? [connection.boardPin.id] : [])),
    [selectedConnections],
  )
  const usedBoardPinIds = useMemo(
    () => new Set(allConnections.flatMap((connection) => connection.boardPin ? [connection.boardPin.id] : [])),
    [allConnections],
  )

  const boardPinsToRender = useMemo(() => {
    return (exactBoard?.pins ?? []).filter((pin) =>
      usedBoardPinIds.has(pin.id) || pin.role === 'power-in' || pin.role === 'power-out' || pin.role === 'ground' || pin.role === 'usb')
  }, [exactBoard, usedBoardPinIds])

  const connectionRows = canRenderControllerPins
    ? selectedConnections
    : []

  const signalReady = !!exactBoard && canRenderControllerPins && unresolvedConnections.length === 0
  const readinessText = !exactBoard
    ? 'blocked by exact-board selection'
    : !canRenderControllerPins
      ? 'blocked because this exact board profile is still missing a reviewed physical pin map'
      : unresolvedConnections.length > 0
        ? `needs review: ${unresolvedConnections.length} controller pin mapping${unresolvedConnections.length === 1 ? '' : 's'} unresolved`
        : 'all visible supported hardware maps cleanly onto the selected physical board'

  const canvasWidth = deviceLayouts.length > 0
    ? Math.max(controllerBox.x + controllerBox.width + 420, ...deviceLayouts.map((layout) => layout.x + layout.width + 40))
    : controllerBox.x + controllerBox.width + 80
  const canvasHeight = deviceLayouts.length > 0
    ? Math.max(controllerBox.y + controllerBox.height + 40, ...deviceLayouts.map((layout) => layout.y + layout.height + 40))
    : controllerBox.y + controllerBox.height + 40
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
    const widthZoom = (viewport.clientWidth - FIT_PADDING) / canvasWidth
    const heightZoom = (viewport.clientHeight - FIT_PADDING) / canvasHeight
    const fitZoom = clampZoom(Math.min(widthZoom, heightZoom, 1))
    updateViewport(fitZoom, { x: 0, y: 0, width: canvasWidth, height: canvasHeight })
  }

  const focusSelected = () => {
    const layout = deviceLayouts.find((entry) => entry.itemId === selectedItemId)
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
    fitAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exactBoard?.id, canvasWidth, canvasHeight])

  return (
    <section className={styles.workspace} aria-label="Build Diagram workspace">
      <aside className={styles.sidebar}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>Build Diagram</h2>
            <p className={styles.panelSubtitle}>Physical hardware and installation facts for this project.</p>
          </div>
          <button type="button" className={styles.backButton} onClick={closeBuildDiagram}>
            Back to Design
          </button>
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
            <button type="button" className={styles.smallButton} onClick={() => updateViewport(diagramZoom - ZOOM_STEP)}>
              Zoom out
            </button>
            <button type="button" className={styles.smallButton} onClick={() => updateViewport(diagramZoom + ZOOM_STEP)}>
              Zoom in
            </button>
            <button type="button" className={styles.smallButton} onClick={fitAll} disabled={!exactBoard}>
              Fit all
            </button>
            <button type="button" className={styles.smallButton} onClick={focusSelected} disabled={!exactBoard}>
              Focus selected
            </button>
            <button type="button" className={styles.smallButton} onClick={resetView} disabled={!exactBoard}>
              Reset view
            </button>
            <button type="button" className={styles.resetButton} onClick={() => setIsolatedItemId(null)} disabled={!isolatedItemId}>
              Show all
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
                <svg
                  className={styles.wireLayer}
                  viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                  aria-hidden="true"
                >
                  {allConnections.map((connection, index) => {
                    if (connection.controllerX == null || connection.controllerY == null) return null
                    const midX = connection.controllerX + 86 + ((index % 3) * 10)
                    const path = [
                      `M ${connection.controllerX} ${connection.controllerY}`,
                      `L ${midX} ${connection.controllerY}`,
                      `L ${midX} ${connection.deviceY}`,
                      `L ${connection.deviceX} ${connection.deviceY}`,
                    ].join(' ')
                    const active = selectedItemId === 'controller' || selectedItemId === connection.itemId
                    return (
                      <path
                        key={connection.id}
                        d={path}
                        className={`${styles.wirePath} ${active ? styles.wirePathActive : styles.wirePathDim}`}
                      />
                    )
                  })}
                </svg>

                <button
                  type="button"
                  className={`${styles.controllerCard} ${selectedItemId === 'controller' ? styles.diagramCardActive : ''}`}
                  style={{
                    left: `${controllerBox.x}px`,
                    top: `${controllerBox.y}px`,
                    width: `${controllerBox.width}px`,
                    height: `${controllerBox.height}px`,
                  }}
                  onClick={() => setSelectedItemId('controller')}
                >
                  <div className={styles.controllerHeader}>
                    <span className={styles.diagramCardTitle}>{exactBoard.label}</span>
                    <span className={styles.diagramCardMeta}>{exactBoard.confidence.replace(/-/g, ' ')}</span>
                  </div>
                  <div className={styles.controllerBody}>
                    <BoardPreview svg={exactBoard.previewSvg} label={exactBoard.label} />
                    {boardPinsToRender.map((pin) => {
                      const anchor = boardAnchorsById.get(pin.anchorId)
                      if (!anchor) return null
                      const selected = highlightedBoardPinIds.has(pin.id)
                      const used = usedBoardPinIds.has(pin.id)
                      return (
                        <span
                          key={pin.id}
                          className={[
                            styles.controllerPin,
                            styles[`controllerPin${anchor.labelAlign[0].toUpperCase()}${anchor.labelAlign.slice(1)}`],
                            selected ? styles.controllerPinSelected : '',
                            used ? styles.controllerPinUsed : styles.controllerPinUnused,
                          ].join(' ').trim()}
                          style={{ left: `${anchor.x}px`, top: `${anchor.y}px` }}
                          title={pin.note ?? pin.label}
                        >
                          {pin.label}
                        </span>
                      )
                    })}
                  </div>
                </button>

                {deviceLayouts.map((layout) => {
                  const item = visiblePrimaryItems.find((entry) => entry.id === layout.itemId)
                  if (!item) return null
                  const itemConnections = allConnections.filter((connection) => connection.itemId === item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.diagramCard} ${selectedItemId === item.id ? styles.diagramCardActive : ''}`}
                      style={{
                        left: `${layout.x}px`,
                        top: `${layout.y}px`,
                        width: `${layout.width}px`,
                        height: `${layout.height}px`,
                      }}
                      onClick={() => setSelectedItemId(item.id)}
                    >
                      <span className={styles.diagramCardTitle}>{item.title}</span>
                      <span className={styles.diagramCardMeta}>{item.subtitle}</span>
                      {itemConnections.length > 0 && (
                        <span className={styles.diagramCardPins}>
                          {itemConnections.map((connection) =>
                            connection.boardPin ? connection.boardPin.label : `GPIO ${connection.pinUse.pin}`
                          ).join(' · ')}
                        </span>
                      )}
                      <div className={styles.devicePinList}>
                        {itemConnections.map((connection) => (
                          <span key={connection.id} className={styles.devicePinRow}>
                            <strong>{connection.boardPin?.label ?? `GPIO ${connection.pinUse.pin}`}</strong>
                            <span>{connection.pinUse.label}</span>
                          </span>
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      <aside className={styles.detailPane}>
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
            <li>Requirements calculated: pending the electrical rule engine</li>
            <li>Signal ready: {readinessText}</li>
            <li>Power ready: pending the calculated electrical plan and owned-parts validation</li>
            <li>Build ready: {signalReady ? 'blocked until Power ready passes' : 'blocked by Signal ready'}</li>
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
          <h3 className={styles.cardTitle}>Exports</h3>
          <p className={styles.copyMuted}>
            Current-view and complete-build exports will be enabled once the normalized assembly and BOM layers are in place.
          </p>
        </section>
      </aside>
    </section>
  )
}
