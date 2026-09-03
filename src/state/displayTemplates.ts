import type {
  DisplayBounds,
  DisplayDocument,
  DisplayWidget,
  DisplayWidgetProperty,
  DisplayWidgetType,
} from './displayDocument'
import { constrainDisplayWidgetBounds, nextDisplayWidgetId } from './displayEditor'
import { defaultDisplayWidgetProperties } from './displayRegistry'

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
}

/** Templates are authored against the reference screen; a smaller document
 * clamps them through the same constraint every hand-placed widget uses. */
export const DISPLAY_TEMPLATE_REFERENCE_SIZE = { width: 320, height: 240 } as const

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
      widget('Text', 'Title', [8, 8, 304, 32], { text: 'Title', fontSize: 24 }),
      widget('Text', 'Artist', [8, 48, 304, 24], { text: 'Artist' }),
      widget('Timecode', 'Elapsed', [8, 80, 80, 32]),
      widget('Timecode', 'Remaining', [232, 80, 80, 32]),
      widget('Progress', 'Position', [8, 120, 304, 16]),
      widget('Button', 'Previous', [32, 152, 64, 64], { text: 'Prev' }),
      widget('Toggle', 'Play', [128, 152, 64, 64], { offLabel: 'Play', onLabel: 'Pause' }),
      widget('Button', 'Next', [224, 152, 64, 64], { text: 'Next' }),
    ],
  },
  {
    id: 'minimal-transport',
    label: 'Minimal Transport',
    description: 'Three oversized transport targets and one volume control.',
    widgets: [
      widget('Text', 'Track', [16, 24, 288, 32], { text: 'Track', align: 'center', fontSize: 24 }),
      widget('Button', 'Previous', [16, 64, 80, 80], { text: 'Prev' }),
      widget('Toggle', 'Play', [120, 64, 80, 80], { offLabel: 'Play', onLabel: 'Pause' }),
      widget('Button', 'Next', [224, 64, 80, 80], { text: 'Next' }),
      widget('Slider', 'Volume', [16, 176, 288, 48]),
    ],
  },
  {
    id: 'pattern-deck',
    label: 'Pattern Deck',
    description: 'Pattern browsing with confirm, shuffle, and automatic advance.',
    widgets: [
      widget('Pattern Browser', 'Collection', [8, 8, 304, 104]),
      widget('Button', 'Previous', [8, 120, 72, 56], { text: 'Prev' }),
      widget('Button', 'Confirm', [120, 120, 80, 56], { text: 'Play' }),
      widget('Button', 'Next', [240, 120, 72, 56], { text: 'Next' }),
      widget('Toggle', 'Shuffle', [8, 184, 144, 48], { offLabel: 'In order', onLabel: 'Shuffle' }),
      widget('Toggle', 'Auto advance', [168, 184, 144, 48], { offLabel: 'Hold', onLabel: 'Advance' }),
    ],
  },
  {
    id: 'led-performance',
    label: 'LED Performance',
    description: 'Brightness and speed control beside blackout, freeze, and a frame-rate readout.',
    widgets: [
      widget('Text', 'Heading', [8, 8, 304, 24], { text: 'LED performance' }),
      widget('Slider', 'Brightness', [8, 40, 304, 48]),
      widget('Slider', 'Speed', [8, 96, 304, 48], { min: 0, max: 4, step: 0.05 }),
      widget('Toggle', 'Blackout', [8, 152, 144, 48], { offLabel: 'Lit', onLabel: 'Blackout' }),
      widget('Toggle', 'Freeze', [168, 152, 144, 48], { offLabel: 'Run', onLabel: 'Freeze' }),
      widget('Numeric Readout', 'Frame rate', [8, 208, 152, 32], { decimals: 0, suffix: ' fps', min: 0, max: 240 }),
      widget('Status Indicator', 'Output', [192, 208, 120, 24], { offLabel: 'IDLE', onLabel: 'LIVE' }),
    ],
  },
  {
    id: 'audio-reactor',
    label: 'Audio Reactor',
    description: 'Stereo levels, beat and tempo readouts, and the two knobs that shape them.',
    widgets: [
      widget('Value Meter', 'Left level', [8, 8, 304, 24]),
      widget('Value Meter', 'Right level', [8, 40, 304, 24]),
      widget('Status Indicator', 'Beat', [8, 72, 144, 32], { offLabel: 'STEADY', onLabel: 'BEAT' }),
      widget('Numeric Readout', 'Tempo', [168, 72, 144, 32], { decimals: 1, suffix: ' BPM', min: 0, max: 300 }),
      widget('Slider', 'Sensitivity', [8, 112, 304, 48]),
      widget('Slider', 'Noise gate', [8, 168, 304, 48]),
    ],
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    description: 'A read-only board panel: memory, frame rate, uptime, link state, and load.',
    widgets: [
      widget('Numeric Readout', 'Free heap', [8, 8, 152, 32], { decimals: 0, suffix: ' kB', min: 0, max: 1000000 }),
      widget('Numeric Readout', 'Frame rate', [168, 8, 144, 32], { decimals: 0, suffix: ' fps', min: 0, max: 240 }),
      widget('Timecode', 'Uptime', [8, 48, 152, 32], { showHours: true }),
      widget('Numeric Readout', 'Frames', [168, 48, 144, 32], { decimals: 0, min: 0, max: 1000000 }),
      widget('Status Indicator', 'Link', [8, 88, 152, 32], { offLabel: 'OFFLINE', onLabel: 'ONLINE' }),
      widget('Status Indicator', 'Card', [168, 88, 144, 32], { offLabel: 'NO CARD', onLabel: 'CARD' }),
      widget('Value Meter', 'Processor load', [8, 128, 304, 24]),
      widget('Value Meter', 'Temperature', [8, 160, 304, 24]),
      widget('Text', 'Message', [8, 192, 304, 40], { text: 'Ready', maxLines: 2 }),
    ],
  },
  {
    id: 'dmx-monitor',
    label: 'DMX Monitor',
    description: 'Universe and frame state above four monitored channel levels.',
    widgets: [
      widget('Numeric Readout', 'Universe', [8, 8, 144, 32], { decimals: 0, prefix: 'U', min: 0, max: 32768 }),
      widget('Numeric Readout', 'Frame rate', [168, 8, 144, 32], { decimals: 0, suffix: ' fps', min: 0, max: 240 }),
      widget('Status Indicator', 'Signal', [8, 48, 144, 40], { offLabel: 'NO DATA', onLabel: 'DATA' }),
      widget('Colour Swatch', 'Colour', [168, 48, 144, 40]),
      widget('Value Meter', 'Channel 1', [8, 96, 304, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
      widget('Value Meter', 'Channel 2', [8, 128, 304, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
      widget('Value Meter', 'Channel 3', [8, 160, 304, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
      widget('Value Meter', 'Channel 4', [8, 192, 304, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
    ],
  },
]

export function displayTemplate(id: DisplayTemplateId): DisplayTemplate | undefined {
  return DISPLAY_TEMPLATES.find((template) => template.id === id)
}

/** Insert a template's widgets as ordinary widgets: fresh stable ids, the same
 * bounds constraint as a hand-placed widget, and registry defaults under the
 * template's own property overrides. */
export function applyDisplayTemplate(document: DisplayDocument, id: DisplayTemplateId): DisplayDocument {
  const template = displayTemplate(id)
  if (!template) return document
  let working = document
  for (const spec of template.widgets) {
    const placed: DisplayWidget = {
      id: nextDisplayWidgetId(working, spec.type),
      type: spec.type,
      label: spec.label,
      bounds: constrainDisplayWidgetBounds(working, spec.type, spec.bounds),
      properties: { ...defaultDisplayWidgetProperties(spec.type), ...spec.properties },
    }
    working = { ...working, widgets: [...working.widgets, placed] }
  }
  return working
}
