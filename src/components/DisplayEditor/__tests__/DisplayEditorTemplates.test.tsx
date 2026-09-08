import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import DisplayEditor from '../DisplayEditor'
import { createDisplayDocument, displayLayoutIssues } from '../../../state/displayEditor'
import { displayAsset, displayAssetUrl } from '../../../state/displayAssets'
import { useDisplayRuntimeStore } from '../../../state/displayRuntimeStore'
import { useGraphStore } from '../../../state/graphStore'
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
        expect(element.style.left).toBe(`${placed.bounds.x}px`)
        expect(element.style.top).toBe(`${placed.bounds.y}px`)
        expect(element.style.width).toBe(`${placed.bounds.width}px`)
        expect(element.style.height).toBe(`${placed.bounds.height}px`)

        if (!isDisplayTouchTarget(placed.type)) continue
        // Template controls are already at least the registry touch minimum,
        // so the browser and LVGL do not need a hit region outside their
        // visible, non-overlapping placement.
        expect(displayControlHitBounds(placed)).toEqual(placed.bounds)
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
