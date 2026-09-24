/*
 * A Text widget set to scroll: one line moving in a loop on the glass, and the
 * same tokens the preview animates from. Now Playing's title uses it.
 */
import { describe, expect, it } from 'vitest'
import { createDisplayDocument, addDisplayWidget, updateDisplayWidget } from '../../state/displayEditor'
import { applyDisplayTemplate } from '../../state/displayTemplates'
import { displayWidgetTextTokens } from '../../state/displayTheme'
import { customDisplayLvglSetupCpp } from '../customDisplayLvglCpp'
import type { DisplayWidgetProperty } from '../../state/displayDocument'

function textDocument(properties: Record<string, DisplayWidgetProperty>) {
  const document = addDisplayWidget(createDisplayDocument('screen', 240, 320), 'Text')
  const id = document.widgets[0].id
  return updateDisplayWidget(document, id, (widget) => ({ ...widget, properties: { ...widget.properties, ...properties } }))
}

describe('scrolling Text', () => {
  it('scrolls as one line, overriding wrap', () => {
    const document = textDocument({ scroll: true, wrap: true, maxLines: 3 })
    const tokens = displayWidgetTextTokens(document.widgets[0], document.theme)
    expect(tokens).toMatchObject({ overflow: 'scroll', wrap: false, maxLines: 1 })
  })

  it('uses LVGL circular scroll on the glass', () => {
    const cpp = customDisplayLvglSetupCpp({ id: 'screen', document: textDocument({ scroll: true }), bindings: {} }).join('\n')
    expect(cpp).toContain('LV_LABEL_LONG_MODE_SCROLL_CIRCULAR')
  })

  it('leaves a Text that does not scroll as it was', () => {
    const cpp = customDisplayLvglSetupCpp({ id: 'screen', document: textDocument({}), bindings: {} }).join('\n')
    expect(cpp).not.toContain('SCROLL_CIRCULAR')
    expect(cpp).toContain('LV_LABEL_LONG_MODE_WRAP')
  })

  it('gives Now Playing a scrolling title and the track length', () => {
    const document = applyDisplayTemplate(createDisplayDocument('screen', 240, 320), 'now-playing')
    const title = document.widgets.find((widget) => widget.label === 'Title')!
    expect(title.properties.scroll).toBe(true)
    const length = document.widgets.find((widget) => widget.label === 'Duration')!
    expect(length.properties.source).toBe('duration')
    expect(document.widgets.some((widget) => widget.label === 'Remaining')).toBe(false)
  })
})
