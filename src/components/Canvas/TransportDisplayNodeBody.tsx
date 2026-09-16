import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { usePreviewStore } from '../../state/previewStore'
import { tftControllerForProps } from '../../state/nodeLibrary'
import { asTftRotation, rgb565Components, TFT_CONTROLLERS, tftRotatedSize, type TftSurface } from '../../state/tftSurface'
import { displayHasTouch } from '../../state/partCatalogue'
import { useTransportDisplayTouchStore } from '../../state/transportDisplayTouchStore'
import { DISPLAY_WIDGET_LIBRARY } from '../../state/displayRegistry'
import { displayWidgetVisualState, resolveDisplayThemeTokens } from '../../state/displayTheme'
import DisplayWidgetPreview from '../DisplayEditor/DisplayWidgetPreview'
import DisplayRuntimeWidgets from '../DisplayEditor/DisplayRuntimeWidgets'
import {
  displayBackgroundStyle,
  displayThemeVariables,
  displayWidgetThemeVariables,
} from '../DisplayEditor/displayPreviewStyles'
import styles from './TransportDisplayNodeBody.module.css'

function isTftSurface(value: unknown): value is TftSurface {
  if (!value || typeof value !== 'object') return false
  const surface = value as Partial<TftSurface>
  return Number.isInteger(surface.width) && Number.isInteger(surface.height)
    && surface.data instanceof Uint16Array
}

/** Compact physical-screen preview; canvas pixels keep the panel's true ratio. */
export default function TransportDisplayNodeBody({ nodeId }: { nodeId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const props = useGraphStore((state) => state.nodes.find((node) => node.id === nodeId)?.data.properties)
  // The screen drawn on this panel, which the panel owns. Resolved here so the
  // compact panel and the editor Run surface share the same live widget
  // renderer and values.
  const customDisplayId = useGraphStore((state) => String(
    state.nodes.find((entry) => entry.id === nodeId)?.data.properties.displayId ?? '',
  ))
  const customDocument = useGraphStore((state) => (customDisplayId
    ? state.displayDocuments[customDisplayId]
    : undefined))
  const customDisplayWired = customDisplayId !== ''
  const createScreenDesignForPanel = useGraphStore((state) => state.createScreenDesignForPanel)
  const openDisplayWorkspace = useUiStore((state) => state.openDisplayWorkspace)
  const setStatus = useUiStore((state) => state.setStatus)
  const live = usePreviewStore((state) => state.outputs.get(nodeId)?.surface)
  const lit = usePreviewStore((state) => state.outputs.get(nodeId)?.lit)
  // Enabled is resolved by the evaluator, including a wire overriding the
  // property. Before the first published frame, use the panel's saved setting.
  const panelEnabled = typeof lit === 'boolean' ? lit : props?.enabled !== false
  const surface = customDisplayWired ? null : (isTftSurface(live) ? live : null)
  const setTouch = useTransportDisplayTouchStore((state) => state.setTouch)
  const releaseTouch = useTransportDisplayTouchStore((state) => state.releaseTouch)
  const touchCapable = displayHasTouch(String((props as Record<string, unknown> | undefined)?.partId ?? ''))
  const fallbackSize = useMemo(() => tftRotatedSize(
    tftControllerForProps((props ?? {}) as Record<string, unknown>) ?? TFT_CONTROLLERS.ST7789,
    asTftRotation((props as Record<string, unknown> | undefined)?.tftRotation),
  ), [props])
  const width = surface?.width ?? fallbackSize.width
  const height = surface?.height ?? fallbackSize.height

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

  const designAction = customDisplayWired
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

  const updateTouch = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || !touchCapable || !panelEnabled) return
    const rect = canvas.getBoundingClientRect()
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    // Off is painted, not skipped — see the matching clear in
    // InfoDisplayNodeBody. A backlit panel showing nothing is black.
    if (!surface) {
      context.fillStyle = '#000'
      context.fillRect(0, 0, canvas.width, canvas.height)
      return
    }
    const image = context.createImageData(surface.width, surface.height)
    for (let i = 0; i < surface.data.length; i++) {
      const { r, g, b } = rgb565Components(surface.data[i])
      const at = i * 4
      image.data[at] = r
      image.data[at + 1] = g
      image.data[at + 2] = b
      image.data[at + 3] = 255
    }
    context.putImageData(image, 0, 0)
  }, [surface])

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
            {panelEnabled && <div
              className={styles.customSurface}
              style={{
                ...displayBackgroundStyle(resolveDisplayThemeTokens(customDocument.theme).background),
                ...displayThemeVariables(customDocument),
                width: customDocument.designSize.width,
                height: customDocument.designSize.height,
                transform: `scale(${scale})`,
              }}
            >
              <DisplayRuntimeWidgets displayId={customDisplayId} document={customDocument}>
                {(widget, value) => {
                  const definition = DISPLAY_WIDGET_LIBRARY[widget.type]
                  const state = displayWidgetVisualState(widget, value)
                  return (
                    <div
                      key={widget.id}
                      className={styles.customWidget}
                      style={{
                        left: widget.bounds.x,
                        top: widget.bounds.y,
                        width: widget.bounds.width,
                        height: widget.bounds.height,
                        ...displayWidgetThemeVariables(customDocument.theme, state),
                      }}
                    >
                      <DisplayWidgetPreview
                        widget={widget}
                        renderer={definition.previewRenderer}
                        theme={customDocument.theme}
                        state={state}
                        value={value}
                      />
                    </div>
                  )
                }}
              </DisplayRuntimeWidgets>
            </div>}
          </div>
          {designAction}
        </div>
      )
    }
    return (
      <div className={styles.wrap}>
        <div className={styles.customNotice} style={{ '--aspect': `${width} / ${height}` } as never} role="img"
          aria-label="Driven by a wired Screen Design">
          Screen Design — its document is missing
        </div>
        {designAction}
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <canvas
        ref={canvasRef}
        className={`nodrag ${styles.screen} ${touchCapable ? styles.touchScreen : ''}`}
        width={width}
        height={height}
        role="img"
        aria-label={`Transport display preview, ${width} by ${height} pixels`}
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
      {designAction}
    </div>
  )
}
