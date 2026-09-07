import type {
  DisplayBounds,
  DisplayDocument,
  DisplayWidget,
  DisplayWidgetProperty,
  DisplayWidgetType,
} from './displayDocument'
import { constrainDisplayWidgetBounds, nextDisplayWidgetId } from './displayEditor'
import { defaultDisplayWidgetProperties } from './displayRegistry'
import { displayControlAssetId, type DisplayControlIconName } from './displayAssets'

export type DisplayTemplateId =
  | 'now-playing'
  | 'minimal-transport'
  | 'pattern-deck'
  | 'led-performance'
  | 'audio-reactor'
  | 'diagnostics'
  | 'dmx-monitor'

export interface DisplayTemplateWidget {
  type: DisplayWidgetType
  label: string
  bounds: DisplayBounds
  properties?: Readonly<Record<string, DisplayWidgetProperty>>
}

export interface DisplayTemplate {
  id: DisplayTemplateId
  label: string
  description: string
  widgets: readonly DisplayTemplateWidget[]
  /** The physical custom panel is portrait. Keep a deliberate portrait
   * composition rather than clamping a landscape layout into collisions. */
  portraitWidgets: readonly DisplayTemplateWidget[]
}

/** Templates are authored against the reference screen; a smaller document
 * clamps them through the same constraint every hand-placed widget uses. */
export const DISPLAY_TEMPLATE_REFERENCE_SIZE = { width: 320, height: 240 } as const

/*
 * Templates remain ordinary widgets, but the transport actions are ordinary
 * enough to arrive with the currently chosen button art. A label is only the
 * presentation name here — port identity still comes from the widget id.
 */
const TEMPLATE_CONTROL_ICONS: Readonly<Record<string, DisplayControlIconName>> = {
  Previous: 'previous',
  Play: 'play-pause',
  Next: 'next',
  Confirm: 'confirm',
  Blackout: 'led-toggle',
  Shuffle: 'shuffle',
  'Auto advance': 'auto-advance',
  Freeze: 'freeze',
}

const widget = (
  type: DisplayWidgetType,
  label: string,
  bounds: readonly [number, number, number, number],
  properties?: Readonly<Record<string, DisplayWidgetProperty>>,
): DisplayTemplateWidget => ({
  type,
  label,
  bounds: { x: bounds[0], y: bounds[1], width: bounds[2], height: bounds[3] },
  properties,
})

/**
 * Starting layouts made of ordinary widgets. A template mints the same visible
 * ports its widgets would mint one at a time and carries no private runtime
 * behaviour, so a placed template is indistinguishable from a hand-built screen
 * once it is on the canvas. None of them uses Image/Icon: that widget cannot be
 * valid until the asset registry exists, and a template must not arrive holding
 * a validation error.
 */
export const DISPLAY_TEMPLATES: readonly DisplayTemplate[] = [
  {
    id: 'now-playing',
    label: 'Now Playing',
    description: 'Track text, elapsed and remaining time, progress, and transport controls.',
    widgets: [
      widget('Text', 'Title', [16, 8, 288, 32], { text: 'Title', fontSize: 24 }),
      widget('Text', 'Artist', [16, 48, 288, 24], { text: 'Artist' }),
      widget('Timecode', 'Elapsed', [16, 80, 80, 32]),
      widget('Timecode', 'Remaining', [224, 80, 80, 32]),
      widget('Progress', 'Position', [16, 128, 288, 16]),
      widget('Button', 'Previous', [32, 160, 64, 64], { text: 'Prev' }),
      widget('Toggle', 'Play', [128, 160, 64, 64], { offLabel: 'Play', onLabel: 'Pause' }),
      widget('Button', 'Next', [224, 160, 64, 64], { text: 'Next' }),
    ],
    portraitWidgets: [
      widget('Text', 'Title', [16, 8, 208, 32], { text: 'Title', fontSize: 24 }),
      widget('Text', 'Artist', [16, 48, 208, 24], { text: 'Artist' }),
      widget('Timecode', 'Elapsed', [16, 80, 80, 32]),
      widget('Timecode', 'Remaining', [144, 80, 80, 32]),
      widget('Progress', 'Position', [16, 128, 208, 16]),
      widget('Button', 'Previous', [8, 160, 64, 64], { text: 'Prev' }),
      widget('Toggle', 'Play', [88, 160, 64, 64], { offLabel: 'Play', onLabel: 'Pause' }),
      widget('Button', 'Next', [168, 160, 64, 64], { text: 'Next' }),
    ],
  },
  {
    id: 'minimal-transport',
    label: 'Minimal Transport',
    description: 'Three oversized transport targets and one volume control.',
    widgets: [
      widget('Text', 'Track', [16, 16, 288, 32], { text: 'Track', align: 'center', fontSize: 24 }),
      widget('Button', 'Previous', [16, 64, 80, 80], { text: 'Prev' }),
      widget('Toggle', 'Play', [120, 64, 80, 80], { offLabel: 'Play', onLabel: 'Pause' }),
      widget('Button', 'Next', [224, 64, 80, 80], { text: 'Next' }),
      widget('Slider', 'Volume', [16, 176, 288, 48]),
    ],
    portraitWidgets: [
      widget('Text', 'Track', [16, 16, 208, 32], { text: 'Track', align: 'center', fontSize: 24 }),
      widget('Button', 'Previous', [16, 72, 64, 64], { text: 'Prev' }),
      widget('Toggle', 'Play', [88, 72, 64, 64], { offLabel: 'Play', onLabel: 'Pause' }),
      widget('Button', 'Next', [160, 72, 64, 64], { text: 'Next' }),
      widget('Slider', 'Volume', [16, 168, 208, 48]),
    ],
  },
  {
    id: 'pattern-deck',
    label: 'Pattern Deck',
    description: 'Pattern browsing with confirm, shuffle, and automatic advance.',
    widgets: [
      widget('Pattern Browser', 'Collection', [16, 8, 288, 88]),
      widget('Button', 'Previous', [16, 104, 64, 64], { text: 'Prev' }),
      widget('Button', 'Confirm', [128, 104, 64, 64], { text: 'Play' }),
      widget('Button', 'Next', [240, 104, 64, 64], { text: 'Next' }),
      widget('Toggle', 'Shuffle', [80, 176, 64, 64], { offLabel: 'In order', onLabel: 'Shuffle' }),
      widget('Toggle', 'Auto advance', [176, 176, 64, 64], { offLabel: 'Hold', onLabel: 'Advance' }),
    ],
    portraitWidgets: [
      widget('Pattern Browser', 'Collection', [16, 8, 208, 72]),
      widget('Button', 'Previous', [16, 88, 64, 64], { text: 'Prev' }),
      widget('Button', 'Confirm', [88, 88, 64, 64], { text: 'Play' }),
      widget('Button', 'Next', [160, 88, 64, 64], { text: 'Next' }),
      widget('Toggle', 'Shuffle', [48, 176, 64, 64], { offLabel: 'In order', onLabel: 'Shuffle' }),
      widget('Toggle', 'Auto advance', [128, 176, 64, 64], { offLabel: 'Hold', onLabel: 'Advance' }),
    ],
  },
  {
    id: 'led-performance',
    label: 'LED Performance',
    description: 'Brightness and speed control beside blackout, freeze, and a frame-rate readout.',
    widgets: [
      widget('Text', 'Heading', [16, 8, 288, 24], { text: 'LED performance' }),
      widget('Slider', 'Brightness', [16, 40, 288, 48]),
      widget('Slider', 'Speed', [16, 96, 288, 48], { min: 0, max: 4, step: 0.05 }),
      widget('Toggle', 'Blackout', [80, 152, 48, 48], { offLabel: 'Lit', onLabel: 'Blackout' }),
      widget('Toggle', 'Freeze', [192, 152, 48, 48], { offLabel: 'Run', onLabel: 'Freeze' }),
      widget('Numeric Readout', 'Frame rate', [16, 208, 136, 32], { decimals: 0, suffix: ' fps', min: 0, max: 240 }),
      widget('Status Indicator', 'Output', [168, 208, 136, 24], { offLabel: 'IDLE', onLabel: 'LIVE' }),
    ],
    portraitWidgets: [
      widget('Text', 'Heading', [16, 8, 208, 24], { text: 'LED performance' }),
      widget('Slider', 'Brightness', [16, 48, 208, 48]),
      widget('Slider', 'Speed', [16, 112, 208, 48], { min: 0, max: 4, step: 0.05 }),
      widget('Toggle', 'Blackout', [64, 176, 48, 48], { offLabel: 'Lit', onLabel: 'Blackout' }),
      widget('Toggle', 'Freeze', [128, 176, 48, 48], { offLabel: 'Run', onLabel: 'Freeze' }),
      widget('Numeric Readout', 'Frame rate', [16, 248, 96, 32], { decimals: 0, suffix: ' fps', min: 0, max: 240 }),
      widget('Status Indicator', 'Output', [128, 248, 96, 24], { offLabel: 'IDLE', onLabel: 'LIVE' }),
    ],
  },
  {
    id: 'audio-reactor',
    label: 'Audio Reactor',
    description: 'Stereo levels, beat and tempo readouts, and the two knobs that shape them.',
    widgets: [
      widget('Value Meter', 'Left level', [16, 8, 288, 24]),
      widget('Value Meter', 'Right level', [16, 40, 288, 24]),
      widget('Status Indicator', 'Beat', [16, 72, 136, 32], { offLabel: 'STEADY', onLabel: 'BEAT' }),
      widget('Numeric Readout', 'Tempo', [168, 72, 136, 32], { decimals: 1, suffix: ' BPM', min: 0, max: 300 }),
      widget('Slider', 'Sensitivity', [16, 112, 288, 48]),
      widget('Slider', 'Noise gate', [16, 168, 288, 48]),
    ],
    portraitWidgets: [
      widget('Value Meter', 'Left level', [16, 8, 208, 24]),
      widget('Value Meter', 'Right level', [16, 40, 208, 24]),
      widget('Status Indicator', 'Beat', [16, 80, 96, 32], { offLabel: 'STEADY', onLabel: 'BEAT' }),
      widget('Numeric Readout', 'Tempo', [128, 80, 96, 32], { decimals: 1, suffix: ' BPM', min: 0, max: 300 }),
      widget('Slider', 'Sensitivity', [16, 136, 208, 48]),
      widget('Slider', 'Noise gate', [16, 208, 208, 48]),
    ],
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    description: 'A read-only board panel: memory, frame rate, uptime, link state, and load.',
    widgets: [
      widget('Numeric Readout', 'Free heap', [16, 8, 136, 32], { decimals: 0, suffix: ' kB', min: 0, max: 1000000 }),
      widget('Numeric Readout', 'Frame rate', [168, 8, 136, 32], { decimals: 0, suffix: ' fps', min: 0, max: 240 }),
      widget('Timecode', 'Uptime', [16, 48, 136, 32], { showHours: true }),
      widget('Numeric Readout', 'Frames', [168, 48, 136, 32], { decimals: 0, min: 0, max: 1000000 }),
      widget('Status Indicator', 'Link', [16, 88, 136, 32], { offLabel: 'OFFLINE', onLabel: 'ONLINE' }),
      widget('Status Indicator', 'Card', [168, 88, 136, 32], { offLabel: 'NO CARD', onLabel: 'CARD' }),
      widget('Value Meter', 'Processor load', [16, 128, 288, 24]),
      widget('Value Meter', 'Temperature', [16, 160, 288, 24]),
      widget('Text', 'Message', [16, 192, 288, 40], { text: 'Ready', maxLines: 2 }),
    ],
    portraitWidgets: [
      widget('Numeric Readout', 'Free heap', [16, 8, 96, 32], { decimals: 0, suffix: ' kB', min: 0, max: 1000000 }),
      widget('Numeric Readout', 'Frame rate', [128, 8, 96, 32], { decimals: 0, suffix: ' fps', min: 0, max: 240 }),
      widget('Timecode', 'Uptime', [16, 48, 96, 32], { showHours: true }),
      widget('Numeric Readout', 'Frames', [128, 48, 96, 32], { decimals: 0, min: 0, max: 1000000 }),
      widget('Status Indicator', 'Link', [16, 96, 96, 32], { offLabel: 'OFFLINE', onLabel: 'ONLINE' }),
      widget('Status Indicator', 'Card', [128, 96, 96, 32], { offLabel: 'NO CARD', onLabel: 'CARD' }),
      widget('Value Meter', 'Processor load', [16, 144, 208, 24]),
      widget('Value Meter', 'Temperature', [16, 176, 208, 24]),
      widget('Text', 'Message', [16, 224, 208, 40], { text: 'Ready', maxLines: 2 }),
    ],
  },
  {
    id: 'dmx-monitor',
    label: 'DMX Monitor',
    description: 'Universe and frame state above four monitored channel levels.',
    widgets: [
      widget('Numeric Readout', 'Universe', [16, 8, 136, 32], { decimals: 0, prefix: 'U', min: 0, max: 32768 }),
      widget('Numeric Readout', 'Frame rate', [168, 8, 136, 32], { decimals: 0, suffix: ' fps', min: 0, max: 240 }),
      widget('Status Indicator', 'Signal', [16, 48, 136, 40], { offLabel: 'NO DATA', onLabel: 'DATA' }),
      widget('Colour Swatch', 'Colour', [168, 48, 136, 40]),
      widget('Value Meter', 'Channel 1', [16, 96, 288, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
      widget('Value Meter', 'Channel 2', [16, 128, 288, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
      widget('Value Meter', 'Channel 3', [16, 160, 288, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
      widget('Value Meter', 'Channel 4', [16, 192, 288, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
    ],
    portraitWidgets: [
      widget('Numeric Readout', 'Universe', [16, 8, 96, 32], { decimals: 0, prefix: 'U', min: 0, max: 32768 }),
      widget('Numeric Readout', 'Frame rate', [128, 8, 96, 32], { decimals: 0, suffix: ' fps', min: 0, max: 240 }),
      widget('Status Indicator', 'Signal', [16, 48, 96, 40], { offLabel: 'NO DATA', onLabel: 'DATA' }),
      widget('Colour Swatch', 'Colour', [128, 48, 96, 40]),
      widget('Value Meter', 'Channel 1', [16, 112, 208, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
      widget('Value Meter', 'Channel 2', [16, 152, 208, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
      widget('Value Meter', 'Channel 3', [16, 192, 208, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
      widget('Value Meter', 'Channel 4', [16, 232, 208, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
    ],
  },
]

export function displayTemplate(id: DisplayTemplateId): DisplayTemplate | undefined {
  return DISPLAY_TEMPLATES.find((template) => template.id === id)
}

/**
 * Return the authored bounds for a complete, recognised template after an
 * orientation change. A placed template is still made from ordinary widgets,
 * so it must still be possible to distinguish it from a customised screen.
 * Require its current bounds as well as its stable type-and-label sequence.
 * Moving any non-icon widget deliberately opts that screen into the ordinary
 * resize behaviour instead of discarding the edit.
 */
export function canonicalDisplayTemplateBounds(
  widgets: readonly DisplayWidget[],
  width: number,
  height: number,
): DisplayBounds[] | undefined {
  const template = DISPLAY_TEMPLATES.find((candidate) => (
    [candidate.widgets, candidate.portraitWidgets].some((layout) => (
      layout.length === widgets.length
      && layout.every((spec, index) => (
        spec.type === widgets[index].type
        && spec.label === widgets[index].label
        && (sameDisplayBounds(spec.bounds, widgets[index].bounds)
          || isLegacyThemedControlBounds(widgets[index]))
      ))
    ))
  ))
  const specs = template && (height > width ? template.portraitWidgets : template.widgets)

  return specs?.map((spec) => ({ ...spec.bounds }))
}

function sameDisplayBounds(a: DisplayBounds, b: DisplayBounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/** Earlier orientation handling could only distort the themed icon artwork,
 * leaving every other template widget in its authored location. Treat that
 * narrow shape as a recoverable template; any other user edit opts out. */
function isLegacyThemedControlBounds(widget: DisplayWidget): boolean {
  return (widget.type === 'Button' || widget.type === 'Toggle')
    && widget.properties.presentation === 'icon'
}

/** Insert a template's widgets as ordinary widgets: fresh stable ids, the same
 * bounds constraint as a hand-placed widget, and registry defaults under the
 * template's own property overrides. */
export function applyDisplayTemplate(
  document: DisplayDocument,
  id: DisplayTemplateId,
  controlThemeId?: string,
): DisplayDocument {
  const template = displayTemplate(id)
  if (!template) return document
  const specs = document.designSize.height > document.designSize.width
    ? template.portraitWidgets
    : template.widgets
  let working = document
  for (const spec of specs) {
    const icon = TEMPLATE_CONTROL_ICONS[spec.label]
    const assetId = icon ? displayControlAssetId(controlThemeId, icon) : undefined
    const placed: DisplayWidget = {
      id: nextDisplayWidgetId(working, spec.type),
      type: spec.type,
      label: spec.label,
      bounds: constrainDisplayWidgetBounds(working, spec.type, spec.bounds),
      properties: {
        ...defaultDisplayWidgetProperties(spec.type),
        ...spec.properties,
        ...(assetId ? { assetId, presentation: 'icon' } : {}),
      },
    }
    working = { ...working, widgets: [...working.widgets, placed] }
  }
  return working
}
