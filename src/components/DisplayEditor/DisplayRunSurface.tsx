import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  DISPLAY_PICKER_HUE_MAX,
  DISPLAY_WIDGET_LIBRARY,
  displayChoiceOptions,
  displayControlHitBounds,
  displayControlRange,
  displayPickerColor,
  displayTextEntryClamp,
  displayPickerHueAt,
  displayStepKeyWidth,
  displayWidgetContentBounds,
  displayWidgetIsNumericControl,
} from '../../state/displays/displayRegistry'
import { rgbToHex } from '../../state/palettes/customPalette'
import { displayWidgetGoTo, type DisplayDocument, type PlacedDisplayWidget } from '../../state/displays/displayDocument'
import { displayWidgetTextTokens, displayWidgetVisualState, resolveDisplayThemeTokens } from '../../state/displays/displayTheme'
import { useDisplayRuntimeStore } from '../../state/displays/displayRuntimeStore'
import DisplayWidgetPreview from './DisplayWidgetPreview'
import DisplayRuntimeWidgets from './DisplayRuntimeWidgets'
import {
  displayBackgroundStyle,
  displayThemeVariables,
  displayWidgetClipStyle,
  displayWidgetThemeVariables,
} from './displayPreviewStyles'
import {
  choiceIndexFromPoint,
  dialValueFromDrag,
  isInteractiveDisplayWidget,
  sliderValueFromPoint,
  stepDirectionFromPoint,
  stepDisplayControlValue,
  type DisplayControlValue,
} from './displayRunPreview'
import styles from './DisplayEditor.module.css'

/** LVGL's default long-press time, then its repeat interval. */
const STEP_HOLD_MS = 400
const STEP_REPEAT_MS = 100
/** Degrees an arrow key moves a Colour Picker. */
const PICKER_KEY_DEGREES = 10

interface RunDisplayWidgetProps {
  widget: PlacedDisplayWidget
  theme: DisplayDocument['theme']
  /** Its container's clip, from `displayWidgetClipStyle`. */
  clip: CSSProperties
  value: unknown
  onValue: (value: DisplayControlValue, held: boolean) => void
  onRelease: () => void
  /** A Button's Go to screen, called once a press completes. */
  onNavigate?: () => void
}

function RunDisplayWidget({ widget, theme, clip, value, onValue, onRelease, onNavigate }: RunDisplayWidgetProps) {
  const definition = DISPLAY_WIDGET_LIBRARY[widget.type]
  const interactive = isInteractiveDisplayWidget(widget)
  const drag = useRef<{ pointerId: number; startY: number; startValue: number } | null>(null)
  const suppressToggleClick = useRef(false)
  const [touchOwned, setTouchOwned] = useState(false)
  // A Text Entry being typed into: the draft, which reaches the output only
  // once confirmed with Enter, as the keyboard's tick key confirms on glass.
  const [draft, setDraft] = useState<string | null>(null)
  const entry = widget.type === 'Text Entry'
  // A held Step Control key repeats, on LVGL's own long-press timings.
  const stepRepeat = useRef<number | null>(null)
  const range = displayControlRange(widget)
  const numericValue = typeof value === 'number' ? value : range.min
  const booleanValue = value === true
  const numeric = displayWidgetIsNumericControl(widget.type)
  const picker = widget.type === 'Colour Picker'
  const visualState = displayWidgetVisualState(widget, value, { pressed: touchOwned })
  const hitBounds = displayControlHitBounds(widget)
  const role = widget.type === 'Toggle'
    ? 'switch'
    : widget.type === 'Step Control'
      ? 'spinbutton'
      : numeric || picker
        ? 'slider'
        : widget.type === 'Button'
          ? 'button'
          : widget.type === 'Text Entry'
            ? 'textbox'
            : undefined

  const stopStepRepeat = () => {
    if (stepRepeat.current !== null) window.clearTimeout(stepRepeat.current)
    stepRepeat.current = null
  }
  useEffect(() => stopStepRepeat, [])

  const pressStepKey = (event: ReactPointerEvent<HTMLDivElement>) => {
    const content = displayWidgetContentBounds(widget, displayWidgetTextTokens(widget, theme).fontSize)
    const keyFraction = displayStepKeyWidth(content.width, content.height) / Math.max(1, content.width)
    const direction = stepDirectionFromPoint(event.clientX, event.currentTarget.getBoundingClientRect(), keyFraction)
    if (direction === 0) return
    let current = stepDisplayControlValue(widget, numericValue, direction)
    onValue(current, true)
    const repeat = (delay: number) => {
      stepRepeat.current = window.setTimeout(() => {
        current = stepDisplayControlValue(widget, current, direction)
        onValue(current, true)
        repeat(STEP_REPEAT_MS)
      }, delay)
    }
    repeat(STEP_HOLD_MS)
  }

  // The strip spans the whole box, so the hue is read across the box, the
  // same span `_cdEvent` reads on the glass.
  const setHueFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    onValue(displayPickerHueAt(event.clientX, rect.left, rect.width), true)
  }

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
    else if (picker) setHueFromPointer(event)
    else if (widget.type === 'Choice Strip') {
      onValue(choiceIndexFromPoint(widget, event.clientX, event.currentTarget.getBoundingClientRect()), true)
    }
    else if (widget.type === 'Step Control') pressStepKey(event)
    else if (widget.type === 'Dial') {
      drag.current = { pointerId: event.pointerId, startY: event.clientY, startValue: numericValue }
      onValue(numericValue, true)
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (widget.type === 'Slider' && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      setSliderFromPointer(event)
    } else if (picker && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      setHueFromPointer(event)
    } else if (widget.type === 'Dial' && drag.current?.pointerId === event.pointerId) {
      onValue(dialValueFromDrag(widget, drag.current.startValue, event.clientY - drag.current.startY), true)
    }
  }

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    setTouchOwned(false)
    stopStepRepeat()
    if (widget.type === 'Button') {
      onValue(false, false)
      // LVGL's click: a release that was not cancelled. The press is reported
      // first, so the button's own output reads a whole press either way.
      if (event.type === 'pointerup' && touchOwned) onNavigate?.()
    }
    else onRelease()
    if (event.type === 'pointercancel') suppressToggleClick.current = false
    if (drag.current?.pointerId === event.pointerId) drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return
    if (entry && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault()
      setDraft(typeof value === 'string' ? value : '')
      return
    }
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
    if (picker) {
      const hue = typeof value === 'number' ? value : 0
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? DISPLAY_PICKER_HUE_MAX
          : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? hue - PICKER_KEY_DEGREES
            : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? hue + PICKER_KEY_DEGREES
              : null
      if (next === null) return
      event.preventDefault()
      onValue(Math.max(0, Math.min(DISPLAY_PICKER_HUE_MAX, next)), false)
      return
    }
    if (!numeric) return
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
        ...clip,
      } as CSSProperties}
      data-widget-state={visualState}
      data-widget-type={widget.type}
      role={role}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${widget.label || definition.label} run preview` : undefined}
      aria-pressed={widget.type === 'Button' ? booleanValue : undefined}
      aria-checked={widget.type === 'Toggle' ? booleanValue : undefined}
      aria-valuemin={numeric ? range.min : picker ? 0 : undefined}
      aria-valuemax={numeric ? range.max : picker ? DISPLAY_PICKER_HUE_MAX : undefined}
      aria-valuenow={numeric ? numericValue : picker && typeof value === 'number' ? value : undefined}
      aria-valuetext={widget.type === 'Choice Strip'
        ? displayChoiceOptions(widget)[Math.round(numericValue)]
        : picker && typeof value === 'number'
          ? `Hue ${value} degrees, ${rgbToHex(displayPickerColor(widget, value)).toUpperCase()}`
          : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onClick={(event) => {
        event.stopPropagation()
        if (entry && draft === null) setDraft(typeof value === 'string' ? value : '')
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
          onNavigate?.()
        } else if (widget.type === 'Toggle' && (event.key === ' ' || event.key === 'Enter')) {
          event.preventDefault()
          onRelease()
        }
      }}
    >
      <DisplayWidgetPreview widget={widget} renderer={definition.previewRenderer} theme={theme} state={visualState} value={value} />
      {entry && draft !== null && (
        <input
          className={styles.runEntry}
          aria-label={`${widget.label || definition.label} text`}
          title="Enter confirms; Escape puts back the confirmed text"
          autoFocus
          value={draft}
          onChange={(event) => setDraft(displayTextEntryClamp(widget, event.target.value))}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') {
              event.preventDefault()
              onValue(displayTextEntryClamp(widget, draft), false)
              setDraft(null)
            } else if (event.key === 'Escape') {
              // Answered here, before the overlay's own Escape layer.
              event.preventDefault()
              setDraft(null)
            }
          }}
          // Leaving the field without confirming keeps the confirmed text,
          // as closing the keyboard does on the glass.
          onBlur={() => setDraft(null)}
        />
      )}
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
  const navigate = (widget: PlacedDisplayWidget) => {
    const target = displayWidgetGoTo(document, widget)
    return target ? () => useDisplayRuntimeStore.getState().showDisplayScreen(displayId, target) : undefined
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
            clip={displayWidgetClipStyle(document, widget)}
            value={value}
            onValue={(next, held) => writeRunValue(widget.id, next, held)}
            onRelease={() => releaseRunValue(widget.id)}
            onNavigate={navigate(widget)}
          />
        )}
      </DisplayRuntimeWidgets>
    </div>
  )
}
