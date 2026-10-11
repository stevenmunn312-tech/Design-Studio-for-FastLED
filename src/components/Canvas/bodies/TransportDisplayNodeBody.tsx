import { useCallback, useEffect, useMemo, useRef } from 'react'
import { rootGraphNodes, useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { usePreviewStore } from '../../../state/previewStore'
import { nodeDisplayLabel, tftControllerForProps } from '../../../state/nodeLibrary'
import { displayRuntimeId, mountedPanelGeometry, panelsNamingDocument } from '../../../state/displays/mountedDisplays'
import { asTftRotation, TFT_CONTROLLERS, tftRotatedSize } from '../../../state/displays/tftSurface'
import { displayHasTouch } from '../../../build/parts/partCatalogue'
import { useTransportDisplayTouchStore } from '../../../state/displays/transportDisplayTouchStore'
import { CUSTOM_DESIGN_LAYOUT, shownDesignId } from '../../../state/displays/transportDisplay'
import DisplayDesignSurface from '../../DisplayEditor/DisplayDesignSurface'
import { blankSurfaceUrl, useSurfacePicture } from '../../Preview/useSurfacePicture'
import styles from './TransportDisplayNodeBody.module.css'

/**
 * Compact physical-screen preview at the panel's true ratio.
 *
 * An `<img>` fed by `useSurfacePicture`, not a live `<canvas>`: a visible
 * canvas in the graph is its own compositor layer and leaks renderer memory
 * every frame. A dark panel shows the black behind a transparent picture, so
 * a panel switched off never keeps its last lit frame.
 */
export default function TransportDisplayNodeBody({ nodeId }: { nodeId: string }) {
  const screenRef = useRef<HTMLImageElement>(null)
  const props = useGraphStore((state) => state.nodes.find((node) => node.id === nodeId)?.data.properties)
  // The screen drawn on this panel, which the panel owns. Resolved here so the
  // compact panel and the editor Run surface share the same live widget
  // renderer and values.
  // Showing, not merely having: a design set aside for a fixed layout is kept
  // for when Custom design is chosen again, and draws nothing meanwhile.
  const customDisplayId = useGraphStore((state) => shownDesignId(
    state.nodes.find((entry) => entry.id === nodeId)?.data.properties ?? {},
  ))
  const customSelected = String((props as Record<string, unknown> | undefined)?.tftLayout ?? '') === CUSTOM_DESIGN_LAYOUT
  const customDocument = useGraphStore((state) => (customDisplayId
    ? state.displayDocuments[customDisplayId]
    : undefined))
  const customDisplayWired = customDisplayId !== ''
  const documents = useGraphStore((state) => state.displayDocuments)
  const rootNodes = useGraphStore(rootGraphNodes)
  const createScreenDesignForPanel = useGraphStore((state) => state.createScreenDesignForPanel)
  const adoptScreenDesign = useGraphStore((state) => state.adoptScreenDesign)
  const detachScreenDesign = useGraphStore((state) => state.detachScreenDesign)
  const openDisplayWorkspace = useUiStore((state) => state.openDisplayWorkspace)
  const setStatus = useUiStore((state) => state.setStatus)
  const namedId = String((props as Record<string, unknown> | undefined)?.displayId ?? '')
  const geometry = useMemo(
    () => mountedPanelGeometry((props ?? {}) as Record<string, unknown>),
    [props],
  )
  const shareOptions = useMemo(() => {
    const ids = new Set<string>()
    if (namedId && documents[namedId]) ids.add(namedId)
    for (const [id, document] of Object.entries(documents)) {
      if (panelsNamingDocument(id, rootNodes).length === 0) continue
      if (document.designSize.width === geometry.width && document.designSize.height === geometry.height) {
        ids.add(id)
      }
    }
    return [...ids].map((id) => {
      const namers = panelsNamingDocument(id, rootNodes)
      const names = namers.map((panel) => (
        panel.id === nodeId
          ? 'this panel'
          : nodeDisplayLabel(panel.data.nodeType, panel.data.properties, panel.data.label)
      ))
      const widgets = documents[id]?.widgets.length ?? 0
      const who = names.length > 0 ? names.join(', ') : 'Screen design'
      return { id, label: `${who} (${widgets} ${widgets === 1 ? 'widget' : 'widgets'})` }
    })
  }, [documents, geometry.height, geometry.width, namedId, nodeId, rootNodes])
  const otherDesigns = shareOptions.some((option) => option.id !== namedId)
  const shared = namedId !== '' && panelsNamingDocument(namedId, rootNodes).length > 1
  const runtimeId = customDisplayId
    ? displayRuntimeId(nodeId, customDisplayId, rootNodes)
    : ''
  const lit = usePreviewStore((state) => state.outputs.get(nodeId)?.lit)
  // Enabled is resolved by the evaluator, including a wire overriding the
  // property. Before the first published frame, use the panel's saved setting.
  const panelEnabled = typeof lit === 'boolean' ? lit : props?.enabled !== false
  const picture = useSurfacePicture(nodeId, 'tft', !customDisplayWired)
  const setTouch = useTransportDisplayTouchStore((state) => state.setTouch)
  const releaseTouch = useTransportDisplayTouchStore((state) => state.releaseTouch)
  const touchCapable = displayHasTouch(String((props as Record<string, unknown> | undefined)?.partId ?? ''))
  const fallbackSize = useMemo(() => tftRotatedSize(
    tftControllerForProps((props ?? {}) as Record<string, unknown>) ?? TFT_CONTROLLERS.ST7789,
    asTftRotation((props as Record<string, unknown> | undefined)?.tftRotation),
  ), [props])
  const width = picture?.width ?? fallbackSize.width
  const height = picture?.height ?? fallbackSize.height

  /*
   * Authoring a screen starts at the panel, and stays there.
   *
   * A design has no size until something physical says what size it is, and
   * the panel is that something — so it simply gains a screen at its own
   * rotated size. No node appears on the canvas and no cable is drawn, because
   * the design belongs to this glass.
   */
  const createScreenDesign = useCallback(() => {
    createScreenDesignForPanel(nodeId)
    openDisplayWorkspace(nodeId)
    setStatus('Screen design added to this panel', 'success')
  }, [createScreenDesignForPanel, nodeId, openDisplayWorkspace, setStatus])

  const showDesign = useCallback((documentId: string) => {
    if (!documentId || documentId === namedId) return
    adoptScreenDesign(nodeId, documentId)
    setStatus('This panel is showing that screen design', 'success')
  }, [adoptScreenDesign, namedId, nodeId, setStatus])

  const takeOwnCopy = useCallback(() => {
    detachScreenDesign(nodeId)
    setStatus('This panel has its own copy of the screen design', 'success')
  }, [detachScreenDesign, nodeId, setStatus])

  /*
   * The Layout dropdown decides; this button only follows it. A fixed layout
   * shows the button disabled with the reason beside it, so the design is
   * always one choice away rather than something that, once opened, took the
   * fixed layouts with it.
   */
  const designAction = !customSelected
    ? (
        <>
          <button type="button" className={`nodrag ${styles.designAction}`} disabled>
            Edit screen design
          </button>
          <span className={styles.designNote}>Set Layout to {CUSTOM_DESIGN_LAYOUT} to edit.</span>
        </>
      )
    : customDisplayWired
      ? (
          <button
            type="button"
            className={`nodrag ${styles.designAction}`}
            disabled={!customDocument}
            onClick={() => { if (customDocument) openDisplayWorkspace(customDisplayId) }}
          >
            Edit screen design
          </button>
        )
      : (
          <button type="button" className={`nodrag ${styles.designAction}`} onClick={createScreenDesign}>
            Create screen design
          </button>
        )
  const selectedDesign = shareOptions.some((option) => option.id === namedId) ? namedId : ''
  const designFooter = (
    <>
      {designAction}
      {customSelected && otherDesigns && (
        <select
          className={`nodrag ${styles.designSelect}`}
          aria-label="Screen design"
          value={selectedDesign}
          onChange={(event) => showDesign(event.target.value)}
        >
          {selectedDesign === '' && <option value="">Screen design</option>}
          {shareOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      )}
      {shared && (
        <button type="button" className={`nodrag ${styles.designAction}`} onClick={takeOwnCopy}>
          Own copy
        </button>
      )}
    </>
  )

  const updateTouch = useCallback((clientX: number, clientY: number) => {
    const screen = screenRef.current
    if (!screen || !touchCapable || !panelEnabled) return
    const rect = screen.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    setTouch(nodeId, {
      pressed: true,
      x: Math.max(0, Math.min(width - 1, Math.floor((clientX - rect.left) * width / rect.width))),
      y: Math.max(0, Math.min(height - 1, Math.floor((clientY - rect.top) * height / rect.height))),
    })
  }, [height, nodeId, panelEnabled, setTouch, touchCapable, width])

  useEffect(() => {
    if (!panelEnabled) releaseTouch(nodeId)
  }, [nodeId, panelEnabled, releaseTouch])

  if (customDisplayWired) {
    if (customDocument) {
      const scale = 160 / customDocument.designSize.width
      return (
        <div className={styles.wrap}>
          <div
            className={styles.customPreview}
            style={{
              width: customDocument.designSize.width * scale,
              height: customDocument.designSize.height * scale,
            }}
            role="img"
            aria-label={`${panelEnabled ? 'Live' : 'Disabled'} custom display preview, ${customDocument.designSize.width} by ${customDocument.designSize.height} pixels`}
          >
            {panelEnabled && (
              <DisplayDesignSurface
                displayId={runtimeId}
                document={customDocument}
                style={{ transform: `scale(${scale})` }}
              />
            )}
          </div>
          {designFooter}
        </div>
      )
    }
    return (
      <div className={styles.wrap}>
        <div className={styles.customNotice} style={{ '--aspect': `${width} / ${height}` } as never} role="img"
          aria-label="Driven by a wired Screen Design">
          Screen Design — its document is missing
        </div>
        {designFooter}
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <img
        ref={screenRef}
        className={`nodrag ${styles.screen} ${touchCapable ? styles.touchScreen : ''}`}
        src={picture?.url ?? blankSurfaceUrl(width, height)}
        width={width}
        height={height}
        alt={`Transport display preview, ${width} by ${height} pixels`}
        draggable={false}
        onPointerDown={(event) => {
          if (!touchCapable || !panelEnabled) return
          event.currentTarget.setPointerCapture(event.pointerId)
          updateTouch(event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) updateTouch(event.clientX, event.clientY)
        }}
        onPointerUp={() => releaseTouch(nodeId)}
        onPointerCancel={() => releaseTouch(nodeId)}
      />
      {designFooter}
    </div>
  )
}
