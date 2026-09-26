import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import TemplatesPopup from '../TemplatesPopup'
import { useUiStore } from '../../../state/uiStore'
import { useGraphStore } from '../../../state/graphStore'
import { STARTER_TEMPLATES } from '../../../state/starterTemplates'

describe('TemplatesPopup', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    useUiStore.setState({
      templatesOpen: true,
      lastStartChoice: 'audio-spectrum',
    })
    useGraphStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
    useGraphStore.temporal.getState().clear()
  })

  it('shows the blank-canvas card, starter cards, and remembered last start', () => {
    const { getByText } = render(<TemplatesPopup />)

    expect(getByText('Blank Canvas')).toBeTruthy()
    expect(getByText('Audio Spectrum')).toBeTruthy()
    expect(getByText('Last start: Audio Spectrum')).toBeTruthy()
  })

  describe('the recommended first patch', () => {
    it('is exactly one starter, Juggle', () => {
      expect(STARTER_TEMPLATES.filter((template) => template.recommended).map((template) => template.id)).toEqual(['juggle'])
    })

    it('comes first with its lesson, and Blank Canvas sits right beside it', () => {
      const { getAllByRole } = render(<TemplatesPopup />)
      const cards = getAllByRole('button').filter((button) => button.closest('[role="dialog"]')
        && button.textContent !== '×' && button.textContent !== 'Guide me from here to my board')
      expect(cards[0].getAttribute('aria-label')).toBe('Start with Juggle — recommended first patch')
      expect(cards[0].textContent).toContain('Start here')
      // The teaching sequence the starter exists for, kept intact.
      expect(cards[0].textContent).toMatch(/Set Count to 5[\s\S]*Trails[\s\S]*Mirror/)
      expect(cards[1].textContent).toContain('Blank Canvas')
      // Juggle is not listed a second time among the rest.
      expect(cards.filter((card) => card.textContent?.includes('Juggle')).length).toBe(1)
    })

    it('has the focus when the gallery opens, so Enter starts it', async () => {
      const { getByRole } = render(<TemplatesPopup />)
      await waitFor(() => expect(document.activeElement).toBe(getByRole('button', { name: /Start with Juggle/ })))
    })

    it('lists the rest under their own heading', () => {
      const { getByRole } = render(<TemplatesPopup />)
      expect(getByRole('heading', { name: 'More starters' })).toBeTruthy()
    })
  })

  describe('from the keyboard', () => {
    it('closes on Escape', () => {
      render(<TemplatesPopup />)
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(useUiStore.getState().templatesOpen).toBe(false)
    })

    it('leaves Escape to its own replace confirmation while one is asking', () => {
      render(<TemplatesPopup />)
      void useUiStore.getState().requestConfirm({ title: 'Replace current graph?', message: 'Continue?' })
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(useUiStore.getState().templatesOpen).toBe(true)
      useUiStore.setState({ appDialog: null })
    })

    it('keeps Tab inside the dialog', () => {
      const { getByRole } = render(<TemplatesPopup />)
      const dialog = getByRole('dialog', { name: 'Start gallery' })
      expect(dialog.getAttribute('aria-modal')).toBe('true')
      const buttons = Array.from(dialog.querySelectorAll('button'))
      const last = buttons[buttons.length - 1]
      last.focus()
      fireEvent.keyDown(last, { key: 'Tab' })
      expect(document.activeElement).toBe(buttons[0])
      fireEvent.keyDown(buttons[0], { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(last)
    })
  })

  it('shows what a starter needs before it loads, separately from what runs in the browser', () => {
    const { getByText, getByRole } = render(<TemplatesPopup />)
    const card = getByText('Music-synced SD Show').closest('button')!
    expect(card.textContent).toContain('Advanced')
    expect(card.textContent).toMatch(/In the browser.*Analyse songs and preview the show/)
    expect(card.textContent).toMatch(/On a board.*microSD card module/)
    expect(card.textContent).toMatch(/Have ready.*songs to analyse/i)
    const juggle = getByRole('button', { name: /Start with Juggle/ })
    expect(juggle.textContent).toMatch(/nothing to plug in/)
  })

  // A two-word label is drawn as two <tspan> lines, whose textContent would
  // otherwise run together as "LEDString".
  const boxLabels = (container: HTMLElement) =>
    [...container.querySelectorAll('svg text')].map((text) =>
      [...text.querySelectorAll('tspan')].map((line) => line.textContent).join(' '))

  it('draws each starter output as the form that starter teaches', () => {
    // Juggle is a run of tape; the rest are built for a matrix, and two of them
    // teach it (Fire's mounting direction, Scrolling Text's fit).
    const { container } = render(<TemplatesPopup />)
    const labels = boxLabels(container)

    expect(labels).toContain('LED String')
    expect(labels).toContain('LED Matrix')
    expect(labels.filter((l) => l === 'LED String')).toHaveLength(1)
  })

  it('keeps hardware-only parts off the graph maps', () => {
    // SD Card is a bench part with no canvas presence, so the map that draws
    // the signal path has nothing to draw for it.
    const { container } = render(<TemplatesPopup />)

    expect(boxLabels(container)).not.toContain('SD Card')
  })

  it('can start from a blank canvas and remember that choice', async () => {
    useGraphStore.setState({
      nodes: [{
        id: 'scratch',
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: { label: 'Noise', nodeType: 'Noise', category: 'pattern', properties: {}, inputs: [], outputs: [] },
      }] as never[],
      edges: [],
      selectedNodeId: null,
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
    useUiStore.setState({
      requestConfirm: vi.fn().mockResolvedValue(true),
    })

    const { getByRole } = render(<TemplatesPopup />)
    fireEvent.click(getByRole('button', { name: /Blank Canvas/i }))

    await waitFor(() => {
      // A blank canvas still carries the hidden root Board node the hardware
      // view owns; blank means no authored content, not no nodes at all.
      expect(useGraphStore.getState().nodes.filter((node) => node.data.nodeType !== 'Board')).toEqual([])
    })
    expect(useUiStore.getState().lastStartChoice).toBe('blank')
    expect(useUiStore.getState().templatesOpen).toBe(false)
  })
})
