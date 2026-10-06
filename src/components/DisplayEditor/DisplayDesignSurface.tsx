import type { CSSProperties } from 'react'
import { DISPLAY_WIDGET_LIBRARY } from '../../state/displayRegistry'
import type { DisplayDocument } from '../../state/displayDocument'
import { displayWidgetVisualState, resolveDisplayThemeTokens } from '../../state/displayTheme'
import DisplayWidgetPreview from './DisplayWidgetPreview'
import DisplayRuntimeWidgets from './DisplayRuntimeWidgets'
import {
  displayBackgroundStyle,
  displayThemeVariables,
  displayWidgetThemeVariables,
} from './displayPreviewStyles'
import styles from './DisplayDesignSurface.module.css'

/**
 * A panel's screen design drawn read-only at its own document size, with the
 * live widget values.
 *
 * The node body and the Hardware bench both show what a mounted design puts on
 * the glass; drawing it here once is what keeps the two pictures the same.
 * Callers scale it to their own box — a CSS transform in the node body, an SVG
 * transform on the bench — so it never sizes itself to anything but the
 * document.
 */
export default function DisplayDesignSurface({
  displayId,
  document,
  style,
}: {
  displayId: string
  document: DisplayDocument
  style?: CSSProperties
}) {
  return (
    <div
      className={styles.surface}
      style={{
        ...displayBackgroundStyle(resolveDisplayThemeTokens(document.theme).background),
        ...displayThemeVariables(document),
        width: document.designSize.width,
        height: document.designSize.height,
        ...style,
      }}
    >
      <DisplayRuntimeWidgets displayId={displayId} document={document}>
        {(widget, value) => {
          const definition = DISPLAY_WIDGET_LIBRARY[widget.type]
          const state = displayWidgetVisualState(widget, value)
          return (
            <div
              key={widget.id}
              className={styles.widget}
              style={{
                left: widget.bounds.x,
                top: widget.bounds.y,
                width: widget.bounds.width,
                height: widget.bounds.height,
                ...displayWidgetThemeVariables(document.theme, state),
              }}
            >
              <DisplayWidgetPreview
                widget={widget}
                renderer={definition.previewRenderer}
                theme={document.theme}
                state={state}
                value={value}
              />
            </div>
          )
        }}
      </DisplayRuntimeWidgets>
    </div>
  )
}
