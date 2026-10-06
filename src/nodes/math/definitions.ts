// Math and logic node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'
import { STEP_VALUE_DEFAULTS } from '../shared/stepValue'

export const MATH_DEFINITIONS: NodeDefinition[] = [

  // ── Math ───────────────────────────────────────────────────────────────
  {
    // Bundled binary math — `mathOp` selects the operation. All variants share
    // the (a, b)→result signature; the header reflects the chosen op. See
    // PROPERTY_META.mathOp and the `Math` case in graphEvaluator/cppGenerator.
    type: 'Math',
    label: 'Math',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { mathOp: 'add' },
  },
  {
    type: 'Clamp',
    label: 'Clamp',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'min', label: 'Min', dataType: 'float' },
      { id: 'max', label: 'Max', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { value: 0, min: 0, max: 1 },
  },
  {
    type: 'MapRange',
    label: 'Map Range',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'inMin', label: 'In Min', dataType: 'float' },
      { id: 'inMax', label: 'In Max', dataType: 'float' },
      { id: 'outMin', label: 'Out Min', dataType: 'float' },
      { id: 'outMax', label: 'Out Max', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { value: 0, inMin: 0, inMax: 1, outMin: 0, outMax: 1 },
  },
  {
    // Event-to-value adapter for buttons, touch actions and (later) IR keys.
    // Runtime state is intentionally not persisted: a board/app restart begins
    // again at `initial`.
    type: 'StepValue',
    label: 'Step Value',
    category: 'math',
    inputs: [
      { id: 'increase', label: 'Increase', dataType: 'bool' },
      { id: 'decrease', label: 'Decrease', dataType: 'bool' },
      { id: 'reset', label: 'Reset', dataType: 'bool' },
    ],
    outputs: [{ id: 'value', label: 'Value', dataType: 'float' }],
    defaultProperties: { ...STEP_VALUE_DEFAULTS },
  },
  {
    type: 'Lerp',
    label: 'Lerp',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
      { id: 't', label: 'T', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { a: 0, b: 1, t: 0.5 },
  },
  {
    // Easing curve on a 0–1 value — legacy lib8tion shapes plus FastLED's
    // directional quad/cubic/sine family. `easeType` selects the curve; the
    // header reflects it. See PROPERTY_META.easeType.
    type: 'Ease',
    label: 'Ease',
    category: 'math',
    inputs: [{ id: 't', label: 'T (0–1)', dataType: 'float' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { easeType: 'inOutCubic', t: 0 },
  },

  // ── Logic / Control ────────────────────────────────────────────────────
  {
    type: 'Abs',
    label: 'Abs',
    category: 'math',
    inputs: [{ id: 'x', label: 'X', dataType: 'float' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { x: 0 },
  },
  {
    type: 'Mod',
    label: 'Mod',
    category: 'math',
    inputs: [
      { id: 'x', label: 'X', dataType: 'float' },
      { id: 'm', label: 'M', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { x: 0, m: 1 },
  },
  {
    type: 'Gate',
    label: 'Gate',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'gate', label: 'Gate', dataType: 'bool' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { value: 0, fallback: 0 },
  },
  {
    // Low-pass smoothing — eases a jittery value (FFT bands, PotInput) toward
    // the input over a `response` time constant (seconds to ~63% of a step).
    // Fills the gap left by Lerp, which can't self-feed (the cycle guard
    // breaks feedback loops by design).
    type: 'Smooth',
    label: 'Smooth',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'response', label: 'Response', dataType: 'float' },
    ],
    propertyInputs: { response: 'response' },

    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { value: 0, response: 0.25 },
  },
  {
    // Sample & hold — latches `value` on each rising edge of `trigger`
    // (initialised to the first value seen). Random → SampleHold ← BeatDetect
    // is the "new random value every beat" idiom.
    type: 'SampleHold',
    label: 'Sample & Hold',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'trigger', label: 'Trigger', dataType: 'bool' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { value: 0 },
  },
  {
    // A/B selector — outputs A when `sel` is false, B when true (unlike Gate,
    // both branches are live signals). FrameSwitch is the frame counterpart.
    type: 'Switch',
    label: 'Switch',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
      { id: 'sel', label: 'Select', dataType: 'bool' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { a: 0, b: 1 },
  },
  {
    type: 'Not',
    label: 'Not',
    category: 'math',
    inputs: [{ id: 'x', label: 'X', dataType: 'bool' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'bool' }],
    defaultProperties: {},
  },
  {
    type: 'Compare',
    label: 'Compare',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'A > B', dataType: 'bool' }],
    defaultProperties: { a: 0, b: 0.5 },
  },
  {
    // Bundled trigger/edge utility — `triggerOp` selects Debounce, Changed,
    // Toggle/Flip-Flop, One Shot, Pulse Divider, or Trigger Delay. All share the same
    // bool-in/bool-out signature; the variant-specific timing/count property is
    // gated by isPropertyEnabled. See PROPERTY_META.triggerOp.
    /*
     * The four timing knobs are deliberately NOT property inputs yet. Trigger
     * is emitted twice — by `cppGenerator.ts` and, for physical control
     * chains, by `codegen/scalarControlCpp.ts` — and only the first reads them
     * wire-then-property. Declaring the ports without teaching the second
     * would let a control-chain build ignore a wire the preview follows, which
     * is the parity break the property-input registry exists to prevent.
     * `scalarControlInputDefaults` has to resolve them first.
     */
    type: 'Trigger',
    label: 'Trigger',
    category: 'math',
    inputs: [
      { id: 'trigger', label: 'Trigger', dataType: 'bool' },
      { id: 'on', label: 'On', dataType: 'bool' },
      { id: 'off', label: 'Off', dataType: 'bool' },
    ],

    outputs: [{ id: 'out', label: 'Out', dataType: 'bool' }],
    defaultProperties: {
      triggerOp: 'debounce',
      initialState: false,
      stableTime: 0.05,
      holdTime: 0.1,
      divideBy: 2,
      delayTime: 0.5,
    },
  },
  // ── Text ────────────────────────────────────────────────────────────────
  // The three nodes that produce a `string`. Auxiliary displays are the
  // consumer (see docs/design/auxiliary-displays.md); formatting
  // is a node rather than something a display does privately, so the decision
  // about how a number reads is visible on the canvas instead of buried in a
  // display's properties.
  {
    type: 'TextValue',
    label: 'Text Value',
    category: 'math',
    inputs: [],
    outputs: [{ id: 'text', label: 'Text', dataType: 'string' }],
    defaultProperties: { text: 'HELLO' },
  },
  {
    type: 'FormatNumber',
    label: 'Format Number',
    category: 'math',
    inputs: [{ id: 'value', label: 'Value', dataType: 'float' }],
    outputs: [{ id: 'text', label: 'Text', dataType: 'string' }],
    defaultProperties: {
      value: 0,
      decimals: 0,
      padWidth: 1,
      showSign: false,
      maxIntegerDigits: 6,
      prefix: '',
      suffix: '',
    },
  },
  {
    type: 'FormatDateTime',
    label: 'Format Date/Time',
    category: 'math',
    inputs: [{ id: 'dateTime', label: 'DateTime', dataType: 'datetime' }],
    outputs: [{ id: 'text', label: 'Text', dataType: 'string' }],
    defaultProperties: { dateTimeFormat: 'HH:MM' },
  },
  {
    type: 'XYMapper',
    label: 'XY → Index',
    category: 'math',
    inputs: [
      { id: 'x', label: 'X', dataType: 'float' },
      { id: 'y', label: 'Y', dataType: 'float' },
    ],
    outputs: [{ id: 'index', label: 'Index', dataType: 'float' }],
    defaultProperties: { x: 0, y: 0 },
  },
]

export const MATH_DESCRIPTIONS: Record<string, string> = {
  // math
  Math: 'Binary math — add, subtract, multiply, divide, min or max (a op b).',
  Clamp: 'Constrains a value between min and max.',
  MapRange: 'Remaps a value from one range to another.',
  StepValue: 'Turns Increase, Decrease and Reset event pulses into a bounded numeric value.',
  Lerp: 'Linear interpolation between a and b by t.',
  Ease: 'Shapes 0–1 with FastLED linear, quad, cubic, sine, or wave curves.',
  Abs: 'Absolute value.',
  Mod: 'Modulo — x wrapped into [0, m).',
  Gate: 'Passes a value when a boolean is true, else a fallback.',
  Smooth: 'Low-pass — eases a jittery value in over a response time.',
  SampleHold: 'Latches the value each time the trigger pulses true.',
  Switch: 'Outputs A or B, selected by a boolean.',
  Not: 'Logical NOT of a boolean.',
  Compare: 'True when a > b.',
  Trigger: 'Debounces, detects changes, toggles, delays, or divides boolean pulses.',
  TextValue: 'A fixed line of text for a display to show.',
  FormatNumber: 'Turns a number into display text with decimals, padding, and units.',
  FormatDateTime: 'Turns a clock reading into display text such as HH:MM.',
  XYMapper: 'Converts (x, y) to a strip index.',
}
