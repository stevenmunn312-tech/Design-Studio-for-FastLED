import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  controlDestinationLabel,
  displayControlEdges,
  displayControlInertReason,
  displayControlIsUnconfigured,
  placeTouchControlIn,
  touchControlPlan,
  touchControlWireInert,
} from '../wireFirstControls'
import { connectTouchControl, ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../graphStore'
import { createDisplayDocument } from '../displayEditor'
import { NODE_LIBRARY } from '../nodeLibrary'
import { placedWidgets } from '../displayDocument'
import { TOUCH_CONTROL_ADD_HANDLE } from '../displayRegistry'

/*
 * Creating a touch control by wiring it. The property being dropped on is the
 * only thing that knows the control's type, range, step and label, so this is
 * where that derivation and the single-undo-step minting are held.
 *
 * See docs/development/design/wire-first-touch-controls.md.
 */

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      nodeType,
      category: definition.category,
      properties: { ...definition.defaultProperties, ...properties },
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  } as unknown as StudioNode
}

describe('touchControlPlan', () => {
  it('reads a slider straight off the property it will drive', () => {
    // Formula Field's petals is 1..12 step 1. A control created for it should
    // arrive with that range rather than the widget default of 0..1.
    const plan = touchControlPlan('FormulaField', 'petals', { formulaType: 'rose' })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.spec.type).toBe('Slider')
    expect(plan.spec.label).toBe('Petals')
    expect(plan.spec.properties).toMatchObject({ min: 1, max: 12, step: 1 })
  })

  it('gives a boolean property a Toggle and an action a Button', () => {
    const toggle = touchControlPlan('MatrixOutput', 'enabled', {})
    expect(toggle.ok && toggle.spec.type).toBe('Toggle')

    // An action is a press, not a value to hold; a latch would keep reporting
    // "pressed" after the finger left.
    const action = touchControlPlan('PatternMaster', 'playPause', {})
    expect(action.ok && action.spec.type).toBe('Button')
  })

  it('refuses a second control rather than inventing a precedence', () => {
    const plan = touchControlPlan('FormulaField', 'petals', { formulaType: 'rose' }, true)
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.refusal.code).toBe('already-driven')
    expect(plan.refusal.message).toMatch(/already has a control/)
  })

  it('refuses a property the node is currently ignoring', () => {
    // petals belongs to the rose variant. Creating a control that does nothing
    // from the moment it exists is worse than a sentence saying why.
    const plan = touchControlPlan('FormulaField', 'petals', { formulaType: 'superformula' })
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.refusal.code).toBe('disabled')
  })

  it('refuses an input that is not controllable at all', () => {
    const plan = touchControlPlan('FormulaField', 'field', {})
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.refusal.code).toBe('not-a-property-input')
  })
})

describe('connectTouchControl', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    // Fake timers from the start: the history push is debounced 400 ms, so the
    // setup's own push has to land and be cleared before the test's write, or
    // undo steps back past the fixture instead of past the action.
    vi.useFakeTimers()
    const panel = node('panel', 'TransportDisplay', { displayId: 'screen' })
    const touch = node('touch', 'TouchInput', { panelId: 'panel' })
    const formula = node('ff', 'FormulaField', { formulaType: 'rose' })
    useGraphStore.setState({
      activeGraphId: ROOT_GRAPH_ID,
      graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
      graphData: {},
    } as never)
    // Through loadGraph rather than a bare setState: the Touch node's ports are
    // derived from the document, and that derivation runs in the store's own
    // writes rather than on read.
    useGraphStore.getState().loadGraph([panel, touch, formula], [], {
      nodes: [panel, touch, formula],
      edges: [],
      displayDocuments: { screen: createDisplayDocument('screen', 240, 320) },
    } as never)
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().clear()
  })

  const touchNode = () => useGraphStore.getState().nodes.find((entry) => entry.id === 'touch')!
  const document = () => useGraphStore.getState().displayDocuments.screen

  it('mints a connected widget with no bounds and wires it in one step', () => {
    const plan = connectTouchControl('touch', 'ff', 'petals')
    expect(plan.ok).toBe(true)

    const widget = document().widgets.at(-1)!
    expect(widget.type).toBe('Slider')
    expect(widget.properties).toMatchObject({ min: 1, max: 12, step: 1 })
    // Connected, not placed: it waits in the designer's Connected group.
    expect(widget.bounds).toBeUndefined()
    expect(placedWidgets(document())).toEqual([])

    // The edge is real from the first moment, and the Touch node has grown the
    // output it names — both in the same write.
    const edge = useGraphStore.getState().edges.at(-1)!
    expect(edge.sourceHandle).toBe(`widget:${widget.id}:out`)
    expect(edge.target).toBe('ff')
    expect(edge.targetHandle).toBe('petals')
    expect((touchNode().data.outputs as { id: string }[]).map((port) => port.id))
      .toContain(`widget:${widget.id}:out`)

    // And the socket it lands on is drawn, not left as a field with a hidden
    // wire into it.
    const target = useGraphStore.getState().nodes.find((entry) => entry.id === 'ff')!
    expect(target.data.exposedInputs).toContain('petals')
  })

  it('takes one undo to remove, wire and widget together', () => {
    // The push is debounced 400 ms after the last write in a burst, which is
    // what makes the widget and its wire one entry rather than two.
    connectTouchControl('touch', 'ff', 'petals')
    expect(document().widgets).toHaveLength(1)
    vi.advanceTimersByTime(400)

    useGraphStore.temporal.getState().undo()

    expect(useGraphStore.getState().edges).toHaveLength(0)
    expect(document().widgets).toHaveLength(0)
  })

  it('refuses the second control on one property and changes nothing', () => {
    expect(connectTouchControl('touch', 'ff', 'petals').ok).toBe(true)
    const before = useGraphStore.getState()
    const widgets = before.displayDocuments.screen.widgets.length
    const edges = before.edges.length

    const second = connectTouchControl('touch', 'ff', 'petals')
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.refusal.code).toBe('already-driven')
    expect(document().widgets).toHaveLength(widgets)
    expect(useGraphStore.getState().edges).toHaveLength(edges)
  })

  it('says what the drop will make before the noodle lands', () => {
    // The hint the canvas shows while dragging reads from the same plan the
    // drop performs, so the reason a row refuses is visible in the air rather
    // than only in a status line afterwards.
    const offered = touchControlPlan('FormulaField', 'petals', { formulaType: 'rose' })
    expect(offered.ok && offered.spec.type).toBe('Slider')

    connectTouchControl('touch', 'ff', 'petals')
    const target = useGraphStore.getState().nodes.find((entry) => entry.id === 'ff')!
    const driven = useGraphStore.getState().edges
      .some((edge) => edge.target === 'ff' && edge.targetHandle === 'petals')
    const second = touchControlPlan(
      target.data.nodeType, 'petals', target.data.properties as Record<string, unknown>, driven)
    expect(second.ok).toBe(false)
  })

  it('offers the trailing socket only while there is a screen design to add to', () => {
    const outputs = () => (touchNode().data.outputs as { id: string }[]).map((port) => port.id)
    expect(outputs()).toContain(TOUCH_CONTROL_ADD_HANDLE)

    // A panel drawing a fixed layout has no design to put a widget on, so the
    // invitation is absent rather than refusing after the gesture.
    useGraphStore.getState().loadGraph(
      [node('panel', 'TransportDisplay', { displayId: '' }), node('touch', 'TouchInput', { panelId: 'panel' })],
      [],
    )
    expect(outputs()).not.toContain(TOUCH_CONTROL_ADD_HANDLE)
  })
})

/*
 * What a control drives, which the designer's Connected group captions each
 * entry with and the range repair resolves its target through. One walk, so
 * the two cannot disagree about which wire a widget is on.
 */
describe('displayControlEdges', () => {
  const panel = node('panel', 'TransportDisplay', { displayId: 'screen' })
  const touch = node('touch', 'TouchInput', { panelId: 'panel' })
  const juggle = node('juggle', 'Juggle', { count: 4 })
  const nodes = [panel, touch, juggle]
  const edge = (id: string, sourceHandle: string, targetHandle: string) => ({
    id, source: 'touch', sourceHandle, target: 'juggle', targetHandle,
  })

  it('keys the wire on the widget the port names, and says where it lands', () => {
    const found = displayControlEdges('screen', nodes, [edge('a', 'widget:slider:out', 'count')] as never)
    expect(found.get('slider')?.id).toBe('a')
    // The readable property label, not the key, and the node's derived title
    // rather than its unpersisted `data.label`.
    expect(controlDestinationLabel(found.get('slider')!, nodes)).toBe('Juggle · Count')
  })

  it('ignores a port that is not a control output', () => {
    const found = displayControlEdges('screen', nodes, [
      edge('reading', 'widget:meter:value', 'count'),
      edge('control', 'widget:slider:out', 'count'),
    ] as never)
    expect([...found.keys()]).toEqual(['slider'])
  })

  it('answers nothing for a widget driving two things rather than picking one', () => {
    // "What does this control?" has no single answer then, and a caption that
    // named one of them would be arbitrary.
    const found = displayControlEdges('screen', nodes, [
      edge('a', 'widget:slider:out', 'count'),
      edge('b', 'widget:slider:out', 'speed'),
    ] as never)
    expect(found.has('slider')).toBe(false)
  })

  it('answers nothing when the design is not on exactly one panel with one Touch node', () => {
    const second = node('panel-2', 'TransportDisplay', { displayId: 'screen' })
    const wires = [edge('a', 'widget:slider:out', 'count')] as never
    expect(displayControlEdges('screen', [...nodes, second], wires).size).toBe(0)
    expect(displayControlEdges('elsewhere', nodes, wires).size).toBe(0)
    expect(displayControlEdges('screen', [panel, juggle], wires).size).toBe(0)
  })
})

/*
 * One inert predicate, three causes. They are read in two places that have to
 * agree — the wire on the graph canvas and the widget in the designer — and
 * they are the same statement either way: this control exists and nothing is
 * reaching the pixels or the firmware through it.
 */
describe('displayControlInertReason', () => {
  const slider = (bounds?: { x: number; y: number; width: number; height: number }) => ({
    id: 'slider', type: 'Slider' as const, label: 'Petals',
    ...(bounds ? { bounds } : {}),
    properties: { min: 1, max: 12, step: 1, orientation: 'horizontal' },
  })
  const placed = { x: 0, y: 0, width: 96, height: 48 }
  const formula = (formulaType: string) => node('ff', 'FormulaField', { formulaType })
  const wire = { target: 'ff', targetHandle: 'petals' }

  it('names each of the three causes', () => {
    expect(displayControlInertReason(slider(), undefined, [])).toBe('unplaced')
    expect(displayControlInertReason(slider(placed), undefined, [])).toBe('unconnected')
    expect(displayControlInertReason(slider(placed), wire, [formula('superformula')]))
      .toBe('target-disabled')
  })

  it('says nothing about a control that is placed and driving a live property', () => {
    expect(displayControlInertReason(slider(placed), wire, [formula('rose')])).toBeNull()
  })

  it('reports unplaced ahead of a disabled target, since that is the one to act on', () => {
    // Both are true. The author is looking at a screen designer, and the thing
    // they can do from there is place it.
    expect(displayControlInertReason(slider(), wire, [formula('superformula')])).toBe('unplaced')
  })

  it('is silent about every widget that is not a control', () => {
    // A Label can never have a wire and a bound readout mints no port at all;
    // calling either inert would report most of a finished screen as broken.
    for (const type of ['Text', 'Image/Icon', 'Progress', 'Value Meter'] as const) {
      expect(displayControlInertReason(
        { id: 'w', type, label: 'w', properties: {} }, undefined, [],
      )).toBeNull()
    }
  })
})

describe('touchControlWireInert', () => {
  const panel = node('panel', 'TransportDisplay', { displayId: 'screen' })
  const touch = node('touch', 'TouchInput', { panelId: 'panel' })
  const unplaced = { id: 'slider', type: 'Slider' as const, label: 'Petals', properties: {} }
  const state = (widget: typeof unplaced, nodeType = 'rose') => ({
    nodes: [panel, touch, node('ff', 'FormulaField', { formulaType: nodeType })],
    displayDocuments: { screen: { widgets: [widget] } },
  } as never)

  it('dims the wire out of a control nobody has placed yet', () => {
    expect(touchControlWireInert(state(unplaced), 'touch', 'widget:slider:out', 'ff', 'petals'))
      .toBe(true)
    expect(touchControlWireInert(
      state({ ...unplaced, bounds: { x: 0, y: 0, width: 96, height: 48 } } as never),
      'touch', 'widget:slider:out', 'ff', 'petals',
    )).toBe(false)
  })

  it('answers null for a wire that is not a control wire, rather than calling it live', () => {
    // Null sends the caller back to the ordinary target-side rule; answering
    // false would quietly stop dimming every other inert property wire.
    expect(touchControlWireInert(state(unplaced), 'touch', 'controls', 'ff', 'petals')).toBeNull()
    expect(touchControlWireInert(state(unplaced), 'ff', 'widget:slider:out', 'ff', 'petals')).toBeNull()
    expect(touchControlWireInert(state(unplaced), 'touch', 'widget:gone:out', 'ff', 'petals')).toBeNull()
  })
})

/*
 * The range flows at two moments — when a control is wired and when it is
 * placed — through one derivation rather than a copy per path. Placement is a
 * real second moment: a widget drawn from the palette, wired, then deleted
 * from the screen waits in the Connected group with a live wire, and the
 * property may have moved on in between.
 */
describe('placeTouchControlIn', () => {
  const panel = node('panel', 'TransportDisplay', { displayId: 'screen' })
  const touch = node('touch', 'TouchInput', { panelId: 'panel' })
  const juggle = node('juggle', 'Juggle', { count: 4 })
  const nodes = [panel, touch, juggle]
  const edges = [{
    id: 'w', source: 'touch', sourceHandle: 'widget:slider:out',
    target: 'juggle', targetHandle: 'count',
  }] as never
  const document = (widget: Record<string, unknown>) => ({
    ...createDisplayDocument('screen', 240, 320),
    widgets: [widget],
  } as never)
  const fresh = {
    id: 'slider', type: 'Slider', label: 'Slider',
    properties: { min: 0, max: 1, step: 0.01, orientation: 'horizontal' },
  }

  it('takes the target range and label with it when the control is untouched', () => {
    const placed = placeTouchControlIn(document(fresh), 'screen', 'slider', nodes, edges)
    expect(placed.widgets[0]).toMatchObject({
      label: 'Count',
      bounds: { x: 0, y: 0 },
      properties: { min: 1, max: 8, step: 1 },
    })
  })

  it('keeps a range somebody chose rather than reverting it', () => {
    // A deliberately coarse slider on a wider property is a decision. The
    // explicit "Match target range" repair stays the way to change one's mind.
    const configured = { ...fresh, properties: { ...fresh.properties, min: 0, max: 4, step: 1 } }
    const placed = placeTouchControlIn(document(configured), 'screen', 'slider', nodes, edges)
    expect(placed.widgets[0]).toMatchObject({
      label: 'Slider',
      properties: { min: 0, max: 4, step: 1 },
    })
    expect(placed.widgets[0].bounds).toBeDefined()
  })

  it('places a control with no wire, and finds no range to adopt', () => {
    const placed = placeTouchControlIn(document(fresh), 'screen', 'slider', nodes, [])
    expect(placed.widgets[0].bounds).toBeDefined()
    expect(placed.widgets[0].properties).toMatchObject({ min: 0, max: 1, step: 0.01 })
  })

  it('declines a widget that is already on the screen or gone', () => {
    const already = document({ ...fresh, bounds: { x: 8, y: 8, width: 96, height: 48 } })
    expect(placeTouchControlIn(already, 'screen', 'slider', nodes, edges)).toBe(already)
    const missing = document(fresh)
    expect(placeTouchControlIn(missing, 'screen', 'nobody', nodes, edges)).toBe(missing)
  })

  it('agrees with the connect-time path about what counts as untouched', () => {
    expect(displayControlIsUnconfigured(fresh as never)).toBe(true)
    expect(displayControlIsUnconfigured({ ...fresh, label: 'Brightness' } as never)).toBe(false)
    expect(displayControlIsUnconfigured({
      ...fresh, properties: { ...fresh.properties, max: 4 },
    } as never)).toBe(false)
    // A bound widget has a source contract of its own.
    expect(displayControlIsUnconfigured({
      ...fresh, properties: { ...fresh.properties, source: 'title' },
    } as never)).toBe(false)
  })
})
