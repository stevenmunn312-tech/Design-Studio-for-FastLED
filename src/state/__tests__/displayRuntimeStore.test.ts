import { beforeEach, describe, expect, it } from 'vitest'
import { resolvedDisplayControlValue, useDisplayRuntimeStore } from '../displayRuntimeStore'

const runtime = () => useDisplayRuntimeStore.getState()

describe('custom display runtime store', () => {
  beforeEach(() => {
    runtime().resetDisplayRuntime()
  })

  it('keeps touch and graph values apart under one display and widget key', () => {
    runtime().touchDisplayWidget('panel', 'slider', 0.4)
    runtime().publishDisplayRoleValue('panel', 'slider', 'set', 0.9)
    runtime().publishDisplayRoleValue('other', 'slider', 'set', 0.1)

    expect(runtime().readDisplayWidget('panel', 'slider')).toMatchObject({ touchValue: 0.4, touchOwned: true })
    expect(runtime().readDisplayWidget('panel', 'slider')?.roleValues.get('set')).toBe(0.9)
    expect(runtime().readDisplayWidget('other', 'slider')?.roleValues.get('set')).toBe(0.1)
    expect(runtime().readDisplayWidget('panel', 'missing')).toBeUndefined()

    runtime().releaseDisplayWidget('panel', 'slider')
    expect(runtime().readDisplayWidget('panel', 'slider')).toMatchObject({
      touchValue: 0.4, touchOwned: false, touchPending: true,
    })
  })

  it('gives a synchronized control to the graph after release and keeps an unwired control local', () => {
    runtime().publishDisplayRoleValue('panel', 'slider', 'set', 0.9)
    runtime().touchDisplayWidget('panel', 'slider', 0.4)

    expect(runtime().sampleDisplayWidgetOutput('panel', 'slider', 0)).toBe(0.4)
    runtime().releaseDisplayWidget('panel', 'slider')
    expect(runtime().sampleDisplayWidgetOutput('panel', 'slider', 0)).toBe(0.9)

    runtime().touchDisplayWidget('panel', 'local', true)
    runtime().releaseDisplayWidget('panel', 'local')
    expect(runtime().sampleDisplayWidgetOutput('panel', 'local', false)).toBe(true)
    expect(runtime().sampleDisplayWidgetOutput('panel', 'local', false)).toBe(true)
  })

  it('publishes a quick touch once even when it is released between evaluator passes', () => {
    runtime().publishDisplayRoleValue('panel', 'toggle', 'set', false)
    runtime().touchDisplayWidget('panel', 'toggle', true)
    runtime().releaseDisplayWidget('panel', 'toggle')

    expect(runtime().sampleDisplayWidgetOutput('panel', 'toggle', false)).toBe(true)
    expect(runtime().sampleDisplayWidgetOutput('panel', 'toggle', false)).toBe(false)
  })

  /*
   * A second control moving the same value while a finger is on the first.
   *
   * Ownership is the whole point of the latch: the held control keeps sending
   * what the finger says, and the value arriving from elsewhere must not fight
   * it mid-drag — a slider that loses this jitters under the finger. On
   * release the other control wins on the very next sample, because the
   * finger's intent has already been delivered by the samples taken while it
   * was down. The extra pending sample exists for the one case where it has
   * not: a tap that begins and ends between two passes, covered above.
   *
   * The firmware says this in the same two lines per widget
   * (`synchronizedUpdateLines` in customDisplayLvglCpp.ts): skip the publish
   * while `touchOwned || touchPending`, then clear `touchPending` once the
   * finger is off.
   */
  it('keeps a held control against another control, and hands over on release', () => {
    runtime().publishDisplayRoleValue('panel', 'level', 'set', 0.2)
    runtime().touchDisplayWidget('panel', 'level', 0.8)

    // The other control moves the shared value while this one is held.
    runtime().publishDisplayRoleValue('panel', 'level', 'set', 0.35)
    expect(runtime().sampleDisplayWidgetOutput('panel', 'level', 0)).toBe(0.8)
    expect(resolvedDisplayControlValue(runtime().readDisplayWidget('panel', 'level'), 0)).toBe(0.8)
    // Still the finger's on a second pass; the graph value does not creep in.
    runtime().publishDisplayRoleValue('panel', 'level', 'set', 0.4)
    expect(runtime().sampleDisplayWidgetOutput('panel', 'level', 0)).toBe(0.8)

    runtime().releaseDisplayWidget('panel', 'level')
    expect(runtime().sampleDisplayWidgetOutput('panel', 'level', 0)).toBe(0.4)
    expect(resolvedDisplayControlValue(runtime().readDisplayWidget('panel', 'level'), 0)).toBe(0.4)
  })

  it('marks a widget dirty only when something it draws changed, and clears it once', () => {
    runtime().publishDisplayRoleValue('panel', 'text', 'value', 'Aurora')
    runtime().publishDisplayRoleValue('panel', 'meter', 'value', 0.5)
    expect(runtime().takeDirtyDisplayWidgets('panel')).toEqual(['text', 'meter'])
    expect(runtime().takeDirtyDisplayWidgets('panel')).toEqual([])

    runtime().publishDisplayRoleValue('panel', 'text', 'value', 'Aurora')
    expect(runtime().takeDirtyDisplayWidgets('panel')).toEqual([])

    runtime().publishDisplayRoleValue('panel', 'text', 'value', 'Drift')
    runtime().releaseDisplayWidget('panel', 'meter')
    expect(runtime().takeDirtyDisplayWidgets('panel')).toEqual(['text'])
    expect(runtime().takeDirtyDisplayWidgets('missing')).toEqual([])
  })

  it('keeps diagnostic subscriptions separate from live paint revisions', () => {
    const before = useDisplayRuntimeStore.getState().diagnosticsVersion
    runtime().touchDisplayWidget('panel', 'dial', 0.2)
    runtime().publishDisplayRoleValue('panel', 'dial', 'set', 0.3)
    expect(useDisplayRuntimeStore.getState().diagnosticsVersion).toBe(before)

    runtime().setDisplayWidgetDiagnostic('panel', 'dial', 'Set is unwired; the control stays locally owned.')
    expect(useDisplayRuntimeStore.getState().diagnosticsVersion).toBe(before + 1)
    runtime().setDisplayWidgetDiagnostic('panel', 'dial', 'Set is unwired; the control stays locally owned.')
    expect(useDisplayRuntimeStore.getState().diagnosticsVersion).toBe(before + 1)
    expect(runtime().displayRuntimeDiagnostics('panel')).toEqual([
      { widgetId: 'dial', message: 'Set is unwired; the control stays locally owned.' },
    ])

    runtime().setDisplayWidgetDiagnostic('panel', 'dial', undefined)
    expect(runtime().displayRuntimeDiagnostics('panel')).toEqual([])
  })

  it('notifies every renderer once per visible change without consuming dirty state', () => {
    let editorPaints = 0
    let panelPaints = 0
    const stopEditor = runtime().subscribeDisplay('panel', () => { editorPaints++ })
    const stopPanel = runtime().subscribeDisplay('panel', () => { panelPaints++ })

    runtime().publishDisplayRoleValue('panel', 'readout', 'value', 0.5)
    expect(runtime().displayRevision('panel')).toBe(1)
    expect([editorPaints, panelPaints]).toEqual([1, 1])

    runtime().publishDisplayRoleValue('panel', 'readout', 'value', 0.5)
    expect([editorPaints, panelPaints]).toEqual([1, 1])
    expect(runtime().takeDirtyDisplayWidgets('panel')).toEqual(['readout'])
    expect(runtime().displayRevision('panel')).toBe(1)

    stopEditor()
    runtime().publishDisplayRoleValue('panel', 'readout', 'value', 0.75)
    expect([editorPaints, panelPaints]).toEqual([1, 2])
    stopPanel()
  })

  it('resets one display without disturbing another', () => {
    runtime().touchDisplayWidget('panel', 'button', true)
    runtime().touchDisplayWidget('deck', 'button', true)

    runtime().resetDisplayRuntime('panel')
    expect(runtime().readDisplayWidget('panel', 'button')).toBeUndefined()
    expect(runtime().readDisplayWidget('deck', 'button')).toMatchObject({ touchValue: true })

    runtime().resetDisplayRuntime()
    expect(runtime().readDisplayWidget('deck', 'button')).toBeUndefined()
  })
})
