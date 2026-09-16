import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import DisplayEditor from '../DisplayEditor'
import { createDisplayDocument, displayLayoutIssues } from '../../../state/displayEditor'
import { displayAsset, displayAssetUrl } from '../../../state/displayAssets'
import { useDisplayRuntimeStore } from '../../../state/displayRuntimeStore'
import { useGraphStore, type StudioNode } from '../../../state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { displayControlHitBounds, isDisplayTouchTarget } from '../../../state/displayRegistry'
import { DISPLAY_TEMPLATES } from '../../../state/displayTemplates'
import { useUiStore } from '../../../state/uiStore'

const PORTRAIT_SIZE = { width: 240, height: 320 } as const
const ICON_THEME = 'theme:03-synthwave'

describe('DisplayEditor portrait templates', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([], [])
    useGraphStore.getState().setDisplayDocument(createDisplayDocument(
      'panel',
      PORTRAIT_SIZE.width,
      PORTRAIT_SIZE.height,
    ))
    useGraphStore.temporal.getState().clear()
    useDisplayRuntimeStore.getState().resetDisplayRuntime()
    useUiStore.setState({
      workspaceMode: 'graph',
      designWorkspaceView: { kind: 'display', displayId: 'panel' },
      fitViewRequest: { nonce: 0 },
    })
  })

  const libraryNode = (id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode => {
    const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
    return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    } } as unknown as StudioNode
  }

  /*
   * The shelf follows the panel's own wire.
   *
   * The layouts the wired source can fill come first, under a heading naming
   * that source, and everything else stays below it: a template reading its
   * values off the graph is correct on any panel, so promoting the mapped ones
   * must not hide the rest.
   */
  it('puts the layouts the wired source can fill at the top of the shelf', () => {
    useGraphStore.setState({
      nodes: [
        libraryNode('tft', 'TransportDisplay', {
          partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', displayId: 'panel',
        }),
        libraryNode('rtc', 'RTCInput'),
      ],
      edges: [{ id: 'e-clock', source: 'rtc', sourceHandle: 'display', target: 'tft', targetHandle: 'display' } as never],
    })
    const view = render(<DisplayEditor />)
    expect(view.getByRole('heading', { name: 'Mapped to RTC Clock' })).toBeTruthy()
    expect(view.getByRole('heading', { name: 'Other layouts' })).toBeTruthy()
    // Reachable either way — the grouping promotes, it does not filter.
    for (const template of DISPLAY_TEMPLATES) {
      expect(view.getByRole('button', { name: `Insert ${template.label} template` })).toBeTruthy()
    }
  })

  /*
   * Nothing wired, nothing to map against: one ungrouped list, as before.
   */
  it('leaves the shelf ungrouped while the panel has no source', () => {
    const view = render(<DisplayEditor />)
    expect(view.queryByRole('heading', { name: /^Mapped to / })).toBeNull()
    expect(view.queryByRole('heading', { name: 'Other layouts' })).toBeNull()
  })

  it.each(DISPLAY_TEMPLATES)(
    'inserts and renders the $label 240x320 composition at its authored bounds',
    (template) => {
      const view = render(<DisplayEditor />)
      fireEvent.change(view.getByLabelText('Icon theme'), { target: { value: ICON_THEME } })
      fireEvent.click(view.getByRole('button', { name: `Insert ${template.label} template` }))

      const document = useGraphStore.getState().displayDocuments.panel
      expect(document.designSize).toEqual(PORTRAIT_SIZE)
      expect(document.widgets.map((widget) => widget.bounds)).toEqual(
        template.portraitWidgets.map((widget) => widget.bounds),
      )
      expect(displayLayoutIssues(document)).toEqual([])
      expect(view.getByRole('status', { name: 'Display validation status' }).textContent)
        .toContain('Layout valid.')

      const screen = view.getByTestId('display-screen')
      const renderedWidgets = [...screen.querySelectorAll<HTMLElement>('[data-widget-type]')]
      expect(renderedWidgets).toHaveLength(template.portraitWidgets.length)

      for (const [index, element] of renderedWidgets.entries()) {
        const placed = document.widgets[index]
        expect(element.dataset.widgetType).toBe(placed.type)
        expect(element.style.left).toBe(`${placed.bounds!.x}px`)
        expect(element.style.top).toBe(`${placed.bounds!.y}px`)
        expect(element.style.width).toBe(`${placed.bounds!.width}px`)
        expect(element.style.height).toBe(`${placed.bounds!.height}px`)

        if (!isDisplayTouchTarget(placed.type)) continue
        // Template controls are already at least the registry touch minimum,
        // so the browser and LVGL do not need a hit region outside their
        // visible, non-overlapping placement.
        expect(displayControlHitBounds({ type: placed.type, bounds: placed.bounds! })).toEqual(placed.bounds)
        if (placed.type !== 'Button' && placed.type !== 'Toggle') continue
        const asset = displayAsset(String(placed.properties.assetId ?? ''))
        expect(placed.properties.presentation).toBe('icon')
        expect(asset).toBeTruthy()
        expect(element.querySelector('img')?.getAttribute('src')).toBe(displayAssetUrl(asset!))
      }

      fireEvent.click(view.getByRole('button', { name: 'Run' }))
      const runWidgets = [...screen.querySelectorAll<HTMLElement>('[data-widget-type]')]
      for (const [index, element] of runWidgets.entries()) {
        const placed = document.widgets[index]
        if (!isDisplayTouchTarget(placed.type)) continue
        expect(element.getAttribute('role')).toBe(placed.type === 'Toggle' ? 'switch' : placed.type === 'Button' ? 'button' : 'slider')
        expect(element.getAttribute('tabindex')).toBe('0')
        if (placed.type === 'Button' || placed.type === 'Toggle') {
          expect(element.querySelector('img')).toBeTruthy()
        }
      }
    },
  )
})
