import { beforeEach, describe, expect, it } from 'vitest'
import { useDisplayRuntimeStore } from '../displayRuntimeStore'

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
    expect(runtime().readDisplayWidget('panel', 'slider')).toMatchObject({ touchValue: 0.4, touchOwned: false })
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

  it('wakes React for diagnostics but never for per-frame values', () => {
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
