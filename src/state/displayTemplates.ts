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
  | 'show-status'
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
  /**
   * A composition for a square panel, where the portrait one will not fit.
   *
   * Both catalogued ST7789 modules are 240x240 at every one of their four
   * rotations, so square is not an exotic size — it is what a Screen Design
   * created on a 1.3-inch module is born as. It takes the *portrait*
   * composition by default rather than the landscape one, because portrait is
   * already authored 240 wide and so needs no horizontal clamping; only the
   * eighty rows it does not have are the problem. A template declares this
   * only when its portrait layout runs past the bottom of a square panel,
   * which is why three of the eight have none: copying a layout that already
   * fits would be a second copy to keep in step for no gain.
   */
  squareWidgets?: readonly DisplayTemplateWidget[]
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
    /*
     * The screen the fixed `Show Status` TFT layout gave up.
     *
     * That layout drew section, tempo, beat, output state and brightness from
     * ports nothing could feed: `PatternSlideshow` has no tempo or section
     * concept, and the two output readings belong to the LED output. Wiring
     * arbitrary graph readings onto a panel is this node's job, not a fixed
     * layout's, so the rows moved here rather than surviving as five fields a
     * template build reported unresolved.
     *
     * Two of them come back as *controls* rather than readouts. Blackout and
     * Brightness were touch regions on the old layout, and a Toggle and a
     * Slider are synchronized widgets — they report the graph's value and
     * command it from the same wire, which is what that touch region did.
     */
    id: 'show-status',
    label: 'Show Status',
    description: 'Pattern, section, tempo and beat beside the blackout and brightness a show panel used to carry.',
    widgets: [
      widget('Pattern Browser', 'Collection', [16, 8, 288, 80]),
      widget('Text', 'Section', [16, 96, 288, 24]),
      widget('Numeric Readout', 'Tempo', [16, 128, 136, 32], { decimals: 0, suffix: ' BPM', min: 0, max: 300 }),
      widget('Status Indicator', 'Beat', [168, 128, 136, 32], { offLabel: 'STEADY', onLabel: 'BEAT' }),
      widget('Slider', 'Brightness', [16, 168, 208, 48]),
      widget('Toggle', 'Blackout', [240, 168, 64, 64], { offLabel: 'Lit', onLabel: 'Blackout' }),
    ],
    portraitWidgets: [
      widget('Pattern Browser', 'Collection', [16, 8, 208, 80]),
      widget('Text', 'Section', [16, 96, 208, 24]),
      widget('Numeric Readout', 'Tempo', [16, 128, 96, 32], { decimals: 0, suffix: ' BPM', min: 0, max: 300 }),
      widget('Status Indicator', 'Beat', [128, 128, 96, 32], { offLabel: 'STEADY', onLabel: 'BEAT' }),
      widget('Slider', 'Brightness', [16, 176, 208, 48]),
      widget('Toggle', 'Blackout', [88, 240, 64, 64], { offLabel: 'Lit', onLabel: 'Blackout' }),
    ],
    squareWidgets: [
      widget('Pattern Browser', 'Collection', [16, 8, 208, 72]),
      widget('Text', 'Section', [16, 88, 208, 24]),
      widget('Numeric Readout', 'Tempo', [16, 120, 96, 32], { decimals: 0, suffix: ' BPM', min: 0, max: 300 }),
      widget('Status Indicator', 'Beat', [128, 120, 96, 32], { offLabel: 'STEADY', onLabel: 'BEAT' }),
      // Brightness gives up the width Blackout needs beside it, rather than
      // Blackout dropping to a row of its own there is no room for.
      widget('Slider', 'Brightness', [16, 160, 128, 48]),
      // 48 rather than the 64 the taller panels give it, so the two controls
      // sharing this row end on the same line — still the touch minimum.
      widget('Toggle', 'Blackout', [160, 160, 64, 48], { offLabel: 'Lit', onLabel: 'Blackout' }),
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
    squareWidgets: [
      widget('Text', 'Heading', [16, 8, 208, 24], { text: 'LED performance' }),
      widget('Slider', 'Brightness', [16, 40, 208, 48]),
      widget('Slider', 'Speed', [16, 96, 208, 48], { min: 0, max: 4, step: 0.05 }),
      // The two toggles and the frame rate share one row here; on the taller
      // panels the readout has a row of its own below them.
      widget('Toggle', 'Blackout', [16, 152, 48, 48], { offLabel: 'Lit', onLabel: 'Blackout' }),
      widget('Toggle', 'Freeze', [72, 152, 48, 48], { offLabel: 'Run', onLabel: 'Freeze' }),
      // Centred against the two toggles beside it rather than top-aligned: it
      // is a readout sharing their row, not a third control in it.
      widget('Numeric Readout', 'Frame rate', [136, 160, 88, 32], { decimals: 0, suffix: ' fps', min: 0, max: 240 }),
      widget('Status Indicator', 'Output', [16, 208, 208, 24], { offLabel: 'IDLE', onLabel: 'LIVE' }),
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
    squareWidgets: [
      widget('Value Meter', 'Left level', [16, 8, 208, 24]),
      widget('Value Meter', 'Right level', [16, 40, 208, 24]),
      widget('Status Indicator', 'Beat', [16, 72, 96, 32], { offLabel: 'STEADY', onLabel: 'BEAT' }),
      widget('Numeric Readout', 'Tempo', [128, 72, 96, 32], { decimals: 1, suffix: ' BPM', min: 0, max: 300 }),
      widget('Slider', 'Sensitivity', [16, 112, 208, 48]),
      widget('Slider', 'Noise gate', [16, 168, 208, 48]),
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
    squareWidgets: [
      widget('Numeric Readout', 'Free heap', [16, 8, 96, 32], { decimals: 0, suffix: ' kB', min: 0, max: 1000000 }),
      widget('Numeric Readout', 'Frame rate', [128, 8, 96, 32], { decimals: 0, suffix: ' fps', min: 0, max: 240 }),
      widget('Timecode', 'Uptime', [16, 48, 96, 32], { showHours: true }),
      widget('Numeric Readout', 'Frames', [128, 48, 96, 32], { decimals: 0, min: 0, max: 1000000 }),
      widget('Status Indicator', 'Link', [16, 88, 96, 24], { offLabel: 'OFFLINE', onLabel: 'ONLINE' }),
      widget('Status Indicator', 'Card', [128, 88, 96, 24], { offLabel: 'NO CARD', onLabel: 'CARD' }),
      widget('Value Meter', 'Processor load', [16, 120, 208, 24]),
      widget('Value Meter', 'Temperature', [16, 152, 208, 24]),
      widget('Text', 'Message', [16, 184, 208, 40], { text: 'Ready', maxLines: 2 }),
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
    squareWidgets: [
      widget('Numeric Readout', 'Universe', [16, 8, 96, 32], { decimals: 0, prefix: 'U', min: 0, max: 32768 }),
      widget('Numeric Readout', 'Frame rate', [128, 8, 96, 32], { decimals: 0, suffix: ' fps', min: 0, max: 240 }),
      widget('Status Indicator', 'Signal', [16, 48, 96, 40], { offLabel: 'NO DATA', onLabel: 'DATA' }),
      widget('Colour Swatch', 'Colour', [128, 48, 96, 40]),
      widget('Value Meter', 'Channel 1', [16, 96, 208, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
      widget('Value Meter', 'Channel 2', [16, 128, 208, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
      widget('Value Meter', 'Channel 3', [16, 160, 208, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
      widget('Value Meter', 'Channel 4', [16, 192, 208, 24], { min: 0, max: 255, warningLow: 0, warningHigh: 204 }),
    ],
  },
]

export function displayTemplate(id: DisplayTemplateId): DisplayTemplate | undefined {
  return DISPLAY_TEMPLATES.find((template) => template.id === id)
}

/**
 * The composition a canvas of this shape gets.
 *
 * One answer, read by both the placer and the orientation reflow, because the
 * two disagreeing means a screen that reflows into a layout it can never be
 * placed in. Square asks for `squareWidgets` and settles for the portrait
 * set, which is the right fallback rather than a convenient one: portrait is
 * authored 240 wide, the same as a square panel, so it lands with nothing
 * clamped horizontally. The landscape set is 320 wide and clamping it was
 * what slid every right-hand widget onto its neighbour.
 */
export function templateComposition(
  template: DisplayTemplate,
  width: number,
  height: number,
): readonly DisplayTemplateWidget[] {
  if (height > width) return template.portraitWidgets
  if (height === width) return template.squareWidgets ?? template.portraitWidgets
  return template.widgets
}

/** Every composition a template declares, for recognising a placed one. */
function templateCompositions(template: DisplayTemplate): Array<readonly DisplayTemplateWidget[]> {
  return [template.widgets, template.portraitWidgets, ...(template.squareWidgets ? [template.squareWidgets] : [])]
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
    templateCompositions(candidate).some((layout) => (
      layout.length === widgets.length
      && layout.every((spec, index) => (
        spec.type === widgets[index].type
        && spec.label === widgets[index].label
        && (sameDisplayBounds(spec.bounds, widgets[index].bounds)
          || isLegacyThemedControlBounds(widgets[index]))
      ))
    ))
  ))
  const specs = template && templateComposition(template, width, height)

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
  const specs = templateComposition(template, document.designSize.width, document.designSize.height)
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
