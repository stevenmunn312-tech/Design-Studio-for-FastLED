import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { DISPLAY_WIDGET_LIBRARY, displayControlHitBounds } from '../../state/displayRegistry'
import type { DisplayDocument, PlacedDisplayWidget } from '../../state/displayDocument'
import { displayWidgetVisualState, resolveDisplayThemeTokens } from '../../state/displayTheme'
import { useDisplayRuntimeStore } from '../../state/displayRuntimeStore'
import DisplayWidgetPreview from './DisplayWidgetPreview'
import DisplayRuntimeWidgets from './DisplayRuntimeWidgets'
import {
  displayBackgroundStyle,
  displayThemeVariables,
  displayWidgetThemeVariables,
} from './displayPreviewStyles'
import {
  dialValueFromDrag,
  displayControlRange,
  isInteractiveDisplayWidget,
  sliderValueFromPoint,
  stepDisplayControlValue,
  type DisplayControlValue,
} from './displayRunPreview'
import styles from './DisplayEditor.module.css'

interface RunDisplayWidgetProps {
  widget: PlacedDisplayWidget
  theme: DisplayDocument['theme']
  value: unknown
  onValue: (value: DisplayControlValue, held: boolean) => void
  onRelease: () => void
}

function RunDisplayWidget({ widget, theme, value, onValue, onRelease }: RunDisplayWidgetProps) {
  const definition = DISPLAY_WIDGET_LIBRARY[widget.type]
  const interactive = isInteractiveDisplayWidget(widget)
  const drag = useRef<{ pointerId: number; startY: number; startValue: number } | null>(null)
  const suppressToggleClick = useRef(false)
  const [touchOwned, setTouchOwned] = useState(false)
  const range = displayControlRange(widget)
  const numericValue = typeof value === 'number' ? value : range.min
  const booleanValue = value === true
  const visualState = displayWidgetVisualState(widget, value, { pressed: touchOwned })
  const hitBounds = displayControlHitBounds(widget)
  const role = widget.type === 'Toggle'
    ? 'switch'
    : widget.type === 'Slider' || widget.type === 'Dial'
      ? 'slider'
      : widget.type === 'Button'
        ? 'button'
        : undefined

  const setSliderFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    onValue(sliderValueFromPoint(
      widget,
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect(),
    ), true)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setTouchOwned(true)
    if (widget.type === 'Button') onValue(true, true)
    else if (widget.type === 'Toggle') {
      suppressToggleClick.current = true
      onValue(!booleanValue, true)
    }
    else if (widget.type === 'Slider') setSliderFromPointer(event)
    else if (widget.type === 'Dial') {
      drag.current = { pointerId: event.pointerId, startY: event.clientY, startValue: numericValue }
      onValue(numericValue, true)
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (widget.type === 'Slider' && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      setSliderFromPointer(event)
    } else if (widget.type === 'Dial' && drag.current?.pointerId === event.pointerId) {
      onValue(dialValueFromDrag(widget, drag.current.startValue, event.clientY - drag.current.startY), true)
    }
  }

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    setTouchOwned(false)
    if (widget.type === 'Button') onValue(false, false)
    else onRelease()
    if (event.type === 'pointercancel') suppressToggleClick.current = false
    if (drag.current?.pointerId === event.pointerId) drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return
    if (widget.type === 'Button' && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault()
      onValue(true, true)
      return
    }
    if (widget.type === 'Toggle' && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault()
      if (!event.repeat) {
        suppressToggleClick.current = true
        onValue(!booleanValue, true)
      }
      return
    }
    if (widget.type !== 'Slider' && widget.type !== 'Dial') return
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      onValue(event.key === 'Home' ? range.min : range.max, false)
      return
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const decrease = event.key === 'ArrowLeft' || event.key === 'ArrowDown'
    onValue(stepDisplayControlValue(widget, numericValue, decrease ? -1 : 1), false)
  }

  return (
    <div
      className={`${styles.widget} ${styles.runWidget} ${interactive ? styles.interactiveWidget : ''}`}
      style={{
        left: widget.bounds.x,
        top: widget.bounds.y,
        width: widget.bounds.width,
        height: widget.bounds.height,
        ...displayWidgetThemeVariables(theme, visualState),
        '--widget-hit-inset-x': `${(widget.bounds.width - hitBounds.width) / 2}px`,
        '--widget-hit-inset-y': `${(widget.bounds.height - hitBounds.height) / 2}px`,
      } as CSSProperties}
      data-widget-state={visualState}
      data-widget-type={widget.type}
      role={role}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${widget.label || definition.label} run preview` : undefined}
      aria-pressed={widget.type === 'Button' ? booleanValue : undefined}
      aria-checked={widget.type === 'Toggle' ? booleanValue : undefined}
      aria-valuemin={widget.type === 'Slider' || widget.type === 'Dial' ? range.min : undefined}
      aria-valuemax={widget.type === 'Slider' || widget.type === 'Dial' ? range.max : undefined}
      aria-valuenow={widget.type === 'Slider' || widget.type === 'Dial' ? numericValue : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onClick={(event) => {
        event.stopPropagation()
        if (widget.type !== 'Toggle') return
        if (suppressToggleClick.current) {
          suppressToggleClick.current = false
          return
        }
        onValue(!booleanValue, false)
      }}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => {
        if (widget.type === 'Button' && (event.key === ' ' || event.key === 'Enter')) {
          event.preventDefault()
          onValue(false, false)
        } else if (widget.type === 'Toggle' && (event.key === ' ' || event.key === 'Enter')) {
          event.preventDefault()
          onRelease()
        }
      }}
    >
      <DisplayWidgetPreview widget={widget} renderer={definition.previewRenderer} theme={theme} state={visualState} value={value} />
    </div>
  )
}

/** Live, finger-driven screen. Shared by the graph overlay and any Run surface. */
export default function DisplayRunSurface({
  displayId,
  document,
}: {
  displayId: string
  document: DisplayDocument
}) {
  const writeRunValue = (widgetId: string, value: DisplayControlValue, held: boolean) => {
    const store = useDisplayRuntimeStore.getState()
    store.touchDisplayWidget(displayId, widgetId, value)
    if (!held) store.releaseDisplayWidget(displayId, widgetId)
  }
  const releaseRunValue = (widgetId: string) => {
    useDisplayRuntimeStore.getState().releaseDisplayWidget(displayId, widgetId)
  }

  return (
    <div
      className={`${styles.screen} ${styles.runScreen}`}
      data-testid="live-touch-screen"
      style={{
        ...displayBackgroundStyle(resolveDisplayThemeTokens(document.theme).background),
        ...displayThemeVariables(document),
        width: document.designSize.width,
        height: document.designSize.height,
      }}
    >
      <DisplayRuntimeWidgets displayId={displayId} document={document}>
        {(widget, value) => (
          <RunDisplayWidget
            key={widget.id}
            widget={widget}
            theme={document.theme}
            value={value}
            onValue={(next, held) => writeRunValue(widget.id, next, held)}
            onRelease={() => releaseRunValue(widget.id)}
          />
        )}
      </DisplayRuntimeWidgets>
    </div>
  )
}
