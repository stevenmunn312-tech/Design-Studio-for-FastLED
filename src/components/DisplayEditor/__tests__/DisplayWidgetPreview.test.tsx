import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import DisplayWidgetPreview from '../DisplayWidgetPreview'
import { DEFAULT_DISPLAY_THEME, type DisplayWidget } from '../../../state/displays/displayDocument'
import { DISPLAY_WIDGET_LIBRARY } from '../../../state/displays/displayRegistry'

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
      activeIndex: 1, count: 2,
    })
    expect(browser.container.textContent).toContain('Midnight Drive')
    expect(browser.container.textContent).toContain('2 of 2')
  })
})

describe('display widget preview text', () => {
  const artist: DisplayWidget = {
    id: 'text', type: 'Text', label: 'Artist',
    bounds: { x: 0, y: 0, width: 200, height: 24 },
    properties: { ...DISPLAY_WIDGET_LIBRARY.Text.defaultProperties, text: 'Artist', source: 'artist' },
  }

  it('shows the placeholder only until something has been read', () => {
    expect(draw(artist).container.textContent).toBe('Artist')
  })

  it('shows nothing for an empty reading, as the glass does', () => {
    // A track with no artist tag reports an empty artist; the row goes blank
    // rather than reading "Artist" as though that were the name.
    expect(draw(artist, '').container.textContent).toBe('')
    expect(draw(artist, 'Björk').container.textContent).toBe('Björk')
  })
})

/*
 * jsdom lays nothing out and animates nothing, so the box and text widths are
 * given and each animation recorded: the contract is the keyframes, duration
 * and start time `_cdSetMarquee` gives the glass.
 */
describe('Marquee preview', () => {
  const BOX = 200
  const animations: Array<{ keyframes: Keyframe[]; options: KeyframeAnimationOptions; currentTime: number | null; cancel: () => void }> = []
  let textWidth = 100

  beforeEach(() => {
    animations.length = 0
    textWidth = 100
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => BOX)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => textWidth)
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
        const animation = { keyframes, options, currentTime: null as number | null, cancel: vi.fn() }
        animations.push(animation)
        return animation
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (HTMLElement.prototype as { animate?: unknown }).animate
  })

  const ticker = (text: string): DisplayWidget => ({
    id: 'ticker',
    type: 'Marquee',
    label: 'Marquee',
    bounds: { x: 0, y: 0, width: BOX, height: 32 },
    properties: { ...DISPLAY_WIDGET_LIBRARY.Marquee.defaultProperties, text, speed: 50 },
  })

  it('runs from the right edge until the text has gone, starting with it at the left', () => {
    draw(ticker('Doors open at 8'))
    const [animation] = animations
    expect(animation.keyframes).toEqual([{ transform: 'translateX(200px)' }, { transform: 'translateX(-100px)' }])
    expect(animation.options).toMatchObject({ duration: 6000, iterations: Infinity, easing: 'linear' })
    // 200 px travelled at 50 px/s puts the text at the left edge.
    expect(animation.currentTime).toBe(4000)
  })

  it('moves even text that fits, unlike a scrolling Text', () => {
    textWidth = 20
    draw(ticker('Hi'))
    expect(animations).toHaveLength(1)
  })

  it('keeps its place through new text, or starts again from the right when the text is too short', () => {
    const view = draw(ticker('First'))
    animations[0].currentTime = 5000 // 250 px in: x = -50
    view.rerender(
      <DisplayWidgetPreview widget={ticker('First')} renderer="marquee" theme={DEFAULT_DISPLAY_THEME} state="default" value="Second" />,
    )
    expect(animations[0].cancel).toHaveBeenCalled()
    expect(animations[1].currentTime).toBe(5000)

    animations[1].currentTime = 5800 // 290 px in: x = -90
    textWidth = 40
    view.rerender(
      <DisplayWidgetPreview widget={ticker('First')} renderer="marquee" theme={DEFAULT_DISPLAY_THEME} state="default" value="3rd" />,
    )
    expect(animations[2].currentTime).toBe(0)
  })
})
