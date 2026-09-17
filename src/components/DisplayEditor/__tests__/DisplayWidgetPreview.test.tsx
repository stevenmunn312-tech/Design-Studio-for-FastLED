import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import DisplayWidgetPreview from '../DisplayWidgetPreview'
import { DEFAULT_DISPLAY_THEME, type DisplayWidget } from '../../../state/displayDocument'
import { DISPLAY_WIDGET_LIBRARY } from '../../../state/displayRegistry'

const PLAY = 'control:01-neon-orbit:play-pause'

function control(
  type: 'Button' | 'Toggle',
  properties: Record<string, string | number | boolean>,
): DisplayWidget {
  return {
    id: type.toLowerCase(),
    type,
    label: type,
    bounds: { x: 0, y: 0, width: 64, height: 64 },
    properties: { ...DISPLAY_WIDGET_LIBRARY[type].defaultProperties, ...properties },
  }
}

function draw(widget: DisplayWidget, value?: unknown) {
  return render(
    <DisplayWidgetPreview
      widget={widget}
      renderer={DISPLAY_WIDGET_LIBRARY[widget.type].previewRenderer}
      theme={DEFAULT_DISPLAY_THEME}
      state="default"
      value={value}
    />,
  )
}

describe('display widget preview artwork', () => {
  it('draws the chosen control art beside or instead of the label', () => {
    const withText = draw(control('Button', { text: 'Play', assetId: PLAY, presentation: 'text+icon' }))
    expect(withText.container.querySelector('img')?.getAttribute('src'))
      .toBe('/display-assets/controls/01-neon-orbit/play-pause.svg')
    expect(withText.container.textContent).toContain('Play')

    const iconOnly = draw(control('Button', { text: 'Play', assetId: PLAY, presentation: 'icon' }))
    expect(iconOnly.container.querySelector('img')).toBeTruthy()
    expect(iconOnly.container.textContent).toBe('')

    const toggle = draw(control('Toggle', { assetId: PLAY, presentation: 'icon' }))
    expect(toggle.container.querySelector('img')).toBeTruthy()
  })

  it('keeps the label when an icon presentation has no art to draw', () => {
    // A blank key and a broken one look identical on a panel, so an icon-only
    // control with nothing chosen falls back to its text rather than nothing.
    const empty = draw(control('Button', { text: 'Play', assetId: '', presentation: 'icon' }))
    expect(empty.container.querySelector('img')).toBeNull()
    expect(empty.container.textContent).toContain('Play')

    const retired = draw(control('Button', { text: 'Play', assetId: 'control:retired:play', presentation: 'icon' }))
    expect(retired.container.querySelector('img')).toBeNull()
    expect(retired.container.textContent).toContain('Play')
  })

  it('draws a caption from the widget label only once Show Label is on', () => {
    const slider: DisplayWidget = {
      id: 'slider',
      type: 'Slider',
      label: 'Volume',
      bounds: { x: 0, y: 0, width: 120, height: 48 },
      properties: { ...DISPLAY_WIDGET_LIBRARY.Slider.defaultProperties, showLabel: true },
    }
    const on = draw(slider)
    expect(on.container.textContent).toContain('Volume')
    // Sized in the pixels the emitter offsets its object by, not in ems.
    const caption = on.container.querySelector<HTMLElement>('span[style*="font-size"]')
    expect(caption?.style.height).toBe('14px')
    expect(caption?.style.fontSize).toBe('12px')

    expect(draw({ ...slider, properties: { ...slider.properties, showLabel: false } }).container.textContent)
      .not.toContain('Volume')
  })

  it('leaves a text presentation alone even when art is chosen', () => {
    const view = draw(control('Button', { text: 'Play', assetId: PLAY, presentation: 'text' }))
    expect(view.container.querySelector('img')).toBeNull()
    expect(view.container.textContent).toContain('Play')
  })

  it('draws structured graph values for colour and pattern widgets', () => {
    const swatch = draw({
      id: 'swatch', type: 'Colour Swatch', label: 'Colour Swatch',
      bounds: { x: 0, y: 0, width: 64, height: 32 },
      properties: DISPLAY_WIDGET_LIBRARY['Colour Swatch'].defaultProperties,
    }, { r: 18, g: 52, b: 86 })
    expect(swatch.container.textContent).toBe('#123456')

    const browser = draw({
      id: 'browser', type: 'Pattern Browser', label: 'Pattern Browser',
      bounds: { x: 0, y: 0, width: 160, height: 80 },
      properties: DISPLAY_WIDGET_LIBRARY['Pattern Browser'].defaultProperties,
    }, {
      ids: ['aurora', 'midnight'], names: ['Aurora Drift', 'Midnight Drive'],
      activeIndex: 0, highlightIndex: 1, count: 2, browsing: true,
    })
    expect(browser.container.textContent).toContain('Midnight Drive')
    expect(browser.container.textContent).toContain('2 of 2')
  })
})
