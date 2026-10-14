// Math and logic node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'
import { STEP_VALUE_DEFAULTS } from '../shared/stepValue'

export const MATH_DEFINITIONS: NodeDefinition[] = [

  // ── Math ───────────────────────────────────────────────────────────────
  {
    // A number with no input: the source a graph fans out to several ports,
    // or pins where a wire would otherwise carry a literal. `value` takes a
    // matrix-relative expression like any numeric property.
    type: 'Constant',
    label: 'Constant',
    category: 'math',
    subcategory: 'Math',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', dataType: 'float' }],
    defaultProperties: { value: 1 },
  },
  {
    // Bundled binary math — `mathOp` selects the operation. All variants share
    // the (a, b)→result signature; the header reflects the chosen op. See
    // PROPERTY_META.mathOp and the `Math` case in graphEvaluator/cppGenerator.
    type: 'Math',
    label: 'Math',
    category: 'math',
    subcategory: 'Math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    propertyInputs: { a: 'a', b: 'b' },
    defaultExposedInputs: ['a', 'b'],
    defaultProperties: { mathOp: 'add', a: 0, b: 0 },
  },
  {
    type: 'Clamp',
    label: 'Clamp',
    category: 'math',
    subcategory: 'Math',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'min', label: 'Min', dataType: 'float' },
      { id: 'max', label: 'Max', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    propertyInputs: { value: 'value', min: 'min', max: 'max' },
    defaultExposedInputs: ['value', 'min', 'max'],
    defaultProperties: { value: 0, min: 0, max: 1 },
  },
  {
    type: 'MapRange',
    label: 'Map Range',
    category: 'math',
    subcategory: 'Math',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'inMin', label: 'In Min', dataType: 'float' },
      { id: 'inMax', label: 'In Max', dataType: 'float' },
      { id: 'outMin', label: 'Out Min', dataType: 'float' },
      { id: 'outMax', label: 'Out Max', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    propertyInputs: { value: 'value', inMin: 'inMin', inMax: 'inMax', outMin: 'outMin', outMax: 'outMax' },
    defaultExposedInputs: ['value', 'inMin', 'inMax', 'outMin', 'outMax'],
    defaultProperties: { value: 0, inMin: 0, inMax: 1, outMin: 0, outMax: 1 },
  },
  {
    // Event-to-value adapter for buttons, touch actions and (later) IR keys.
    // Runtime state is intentionally not persisted: a board/app restart begins
    // again at `initial`.
    type: 'StepValue',
    label: 'Step Value',
    category: 'math',
    subcategory: 'Math',
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
    subcategory: 'Math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
      { id: 't', label: 'T', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    propertyInputs: { a: 'a', b: 'b', t: 't' },
    defaultExposedInputs: ['a', 'b', 't'],
    defaultProperties: { a: 0, b: 1, t: 0.5 },
  },
  {
    // Easing curve on a 0–1 value — legacy lib8tion shapes plus FastLED's
    // directional quad/cubic/sine family. `easeType` selects the curve; the
    // header reflects it. See PROPERTY_META.easeType.
    type: 'Ease',
    label: 'Ease',
    category: 'math',
    subcategory: 'Math',
    inputs: [{ id: 't', label: 'T (0–1)', dataType: 'float' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    propertyInputs: { t: 't' },
    defaultExposedInputs: ['t'],
    defaultProperties: { easeType: 'inOutCubic', t: 0 },
  },

  // ── Logic / Control ────────────────────────────────────────────────────
  {
    // Bundled one-input functions — `fn` selects which. The header reflects
    // the chosen function; see PROPERTY_META.fn and the `Function` cases in
    // the math evaluator and scalarControlCpp.
    type: 'Function',
    label: 'Function',
    category: 'math',
    subcategory: 'Math',
    inputs: [{ id: 'x', label: 'X', dataType: 'float' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    propertyInputs: { x: 'x' },
    defaultExposedInputs: ['x'],
    defaultProperties: { fn: 'sin', x: 0 },
  },
  {
    // One scalar from a formula over a, b, t, W and H on the same sandboxed
    // language as Custom Formula (formulaLang's SCALAR_FORMULA_VARIABLES).
    // Trust-gated like the other formula nodes: it outputs 0 until trusted.
    type: 'Expression',
    label: 'Expression',
    category: 'math',
    subcategory: 'Math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    propertyInputs: { a: 'a', b: 'b' },
    defaultExposedInputs: ['a', 'b'],
    defaultProperties: { formula: 'sin(t)*0.5+0.5', a: 0, b: 0 },
  },
  {
    type: 'Gate',
    label: 'Gate',
    category: 'math',
    subcategory: 'Logic',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'gate', label: 'Gate', dataType: 'bool' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    propertyInputs: { value: 'value' },
    defaultExposedInputs: ['value'],
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
    subcategory: 'Math',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'response', label: 'Response', dataType: 'float' },
    ],
    propertyInputs: { value: 'value', response: 'response' },
    defaultExposedInputs: ['value'],

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
    subcategory: 'Math',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'trigger', label: 'Trigger', dataType: 'bool' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    propertyInputs: { value: 'value' },
    defaultExposedInputs: ['value'],
    defaultProperties: { value: 0 },
  },
  {
    // A/B selector — outputs A when `sel` is false, B when true (unlike Gate,
    // both branches are live signals). FrameSwitch is the frame counterpart.
    type: 'Switch',
    label: 'Switch',
    category: 'math',
    subcategory: 'Logic',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
      { id: 'sel', label: 'Select', dataType: 'bool' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    propertyInputs: { a: 'a', b: 'b' },
    defaultExposedInputs: ['a', 'b'],
    defaultProperties: { a: 0, b: 1 },
  },
  {
    type: 'Not',
    label: 'Not',
    category: 'math',
    subcategory: 'Logic',
    inputs: [{ id: 'x', label: 'X', dataType: 'bool' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'bool' }],
    defaultProperties: {},
  },
  {
    // Two booleans in, one out — `logicOp` selects and/or/xor/nand/nor (see
    // src/nodes/math/logic.ts). An unwired side is false, so a lone wire into
    // And is false and into Or passes through.
    type: 'Logic',
    label: 'Logic',
    category: 'math',
    subcategory: 'Logic',
    inputs: [
      { id: 'a', label: 'A', dataType: 'bool' },
      { id: 'b', label: 'B', dataType: 'bool' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'bool' }],
    defaultProperties: { logicOp: 'and' },
  },
  {
    type: 'Compare',
    label: 'Compare',
    category: 'math',
    subcategory: 'Logic',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'A > B', dataType: 'bool' }],
    propertyInputs: { a: 'a', b: 'b' },
    defaultExposedInputs: ['a', 'b'],
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
    subcategory: 'Logic',
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
    subcategory: 'Text',
    inputs: [],
    outputs: [{ id: 'text', label: 'Text', dataType: 'string' }],
    defaultProperties: { text: 'HELLO' },
  },
  {
    type: 'FormatNumber',
    label: 'Format Number',
    category: 'math',
    subcategory: 'Text',
    inputs: [{ id: 'value', label: 'Value', dataType: 'float' }],
    outputs: [{ id: 'text', label: 'Text', dataType: 'string' }],
    propertyInputs: { value: 'value' },
    defaultExposedInputs: ['value'],
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
    subcategory: 'Text',
    inputs: [{ id: 'dateTime', label: 'DateTime', dataType: 'datetime' }],
    outputs: [{ id: 'text', label: 'Text', dataType: 'string' }],
    defaultProperties: { dateTimeFormat: 'HH:MM' },
  },
]

export const MATH_DESCRIPTIONS: Record<string, string> = {
  // math
  Constant: 'A fixed number to wire into several ports at once.',
  Math: 'Binary math, a op b: add, subtract, multiply, divide, modulo, average, min, max.',
  Expression: 'One number from a formula over a, b and t — with the FastLED shims.',
  Logic: 'Combines two booleans: and, or, xor, nand or nor.',
  Clamp: 'Constrains a value between min and max.',
  MapRange: 'Remaps a value from one range to another.',
  StepValue: 'Turns Increase, Decrease and Reset event pulses into a bounded numeric value.',
  Lerp: 'Linear interpolation between a and b by t.',
  Ease: 'Shapes 0–1 with FastLED linear, quad, cubic, sine, or wave curves.',
  Function: 'One-input function of X: sin, cos, abs, sqrt, square, floor or round.',
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
}
