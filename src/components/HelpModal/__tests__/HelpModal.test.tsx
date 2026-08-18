import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import HelpModal from '../HelpModal'
import { useUiStore } from '../../../state/uiStore'
import { useGraphStore } from '../../../state/graphStore'
import { useAudioStore } from '../../../state/audioStore'

const realStartAudio = useAudioStore.getState().startAudio
const startAudio = vi.fn(async () => {})

describe('HelpModal session state', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([], [])
    useUiStore.setState({
      helpOpen: true,
      helpTab: 'quickstart',
      helpNodeReference: {
        search: '',
        expandedCategory: 'input',
        selectedType: '',
      },
      testSignal: false,
    })
    startAudio.mockClear()
    useAudioStore.setState({ startAudio })
  })

  afterEach(() => useAudioStore.setState({ startAudio: realStartAudio }))

  it('reopens on the last selected top-level tab', () => {
    const first = render(<HelpModal />)

    fireEvent.click(first.getByRole('tab', { name: 'Upload & Export' }))
    expect(useUiStore.getState().helpTab).toBe('upload')

    first.unmount()

    const second = render(<HelpModal />)

    expect(second.getByRole('tab', { name: 'Upload & Export' }).getAttribute('aria-selected')).toBe('true')
    expect(second.getByText('Before the first upload')).toBeTruthy()
  })

  it('shows version, license, and credits on the About tab', () => {
    const view = render(<HelpModal />)

    fireEvent.click(view.getByRole('tab', { name: 'About' }))

    expect(view.getByText(`Version ${__APP_VERSION__}`)).toBeTruthy()
    expect(view.getByText('Steven Munn')).toBeTruthy()
    expect(view.getByText('Stefan Petrick')).toBeTruthy()
    expect(view.getByRole('link', { name: 'AnimARTrix' }).getAttribute('href')).toBe('https://github.com/StefanPetrick/animartrix')
    expect(view.getByRole('link', { name: 'FastLED library' })).toBeTruthy()
    expect(view.getByRole('link', { name: 'Essentia' })).toBeTruthy()
    expect(view.getByRole('link', { name: 'third-party notices' })).toBeTruthy()
  })

  it('reopens the node reference where the session left off', async () => {
    const first = render(<HelpModal />)

    fireEvent.click(first.getByRole('tab', { name: 'Node Reference' }))
    fireEvent.change(first.getByLabelText('Find module'), { target: { value: 'led matrix' } })

    let matrixOutputButton: HTMLElement | undefined
    await waitFor(() => {
      matrixOutputButton = first.getAllByRole('button').find((button) => button.textContent?.includes('LED MatrixMAT-OUT'))
      expect(matrixOutputButton).toBeTruthy()
    })

    fireEvent.click(matrixOutputButton!)
    expect(useUiStore.getState().helpNodeReference.search).toBe('led matrix')
    expect(useUiStore.getState().helpNodeReference.selectedType).toBe('MatrixOutput')

    first.unmount()

    const second = render(<HelpModal />)

    expect(second.getByRole('tab', { name: 'Node Reference' }).getAttribute('aria-selected')).toBe('true')
    expect((second.getByLabelText('Find module') as HTMLInputElement).value).toBe('led matrix')
    expect(second.getByRole('heading', { name: 'LED Matrix' })).toBeTruthy()
  })

  it('opens the node reference on a general node introduction', () => {
    const view = render(<HelpModal />)

    fireEvent.click(view.getByRole('tab', { name: 'Node Reference' }))

    expect(view.getByRole('heading', { name: 'Using Nodes' })).toBeTruthy()
    expect(view.getByRole('heading', { name: 'Add or spawn nodes' })).toBeTruthy()
    expect(view.getByRole('heading', { name: 'Copy, paste, duplicate, and delete' })).toBeTruthy()
    expect(view.getByRole('button', { name: /Using Nodes/ })).toBeTruthy()
  })

  it('presents the first patch visually and separates deployment choices', () => {
    const view = render(<HelpModal />)

    expect(view.getByText('Your first working patch')).toBeTruthy()
    // The screenshot shows the Juggle starter, which is what the Quick Start
    // steps walk through — the alt text described a Rainbow node until 2026-08-14.
    expect(view.getByAltText(/Juggle node wired into Matrix Output/i)).toBeTruthy()

    fireEvent.click(view.getByRole('tab', { name: 'Upload & Export' }))

    expect(view.getByText('Choose the result you want')).toBeTruthy()
    expect(view.getByText('Run this design on LEDs')).toBeTruthy()
    expect(view.getByText('If an upload fails')).toBeTruthy()
  })

  // Help is a modal dialog but had none of the focus handling AppDialogHost
  // gives the other dialogs: Tab walked straight out into the canvas behind
  // it, nothing was focused on open, and closing dropped focus to the body.
  describe('dialog keyboard behaviour', () => {
    it('focuses the active tab on open and restores focus on close', async () => {
      const opener = document.createElement('button')
      document.body.appendChild(opener)
      opener.focus()

      const view = render(<HelpModal />)
      await waitFor(() => {
        expect(document.activeElement).toBe(view.getByRole('tab', { name: 'Quick Start' }))
      })

      view.unmount()
      expect(document.activeElement).toBe(opener)
      opener.remove()
    })

    it('keeps Tab inside the dialog', () => {
      const view = render(<HelpModal />)
      const focusable = Array.from(
        view.getByRole('dialog').querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      last.focus()
      fireEvent.keyDown(view.getByRole('dialog'), { key: 'Tab' })
      expect(document.activeElement).toBe(first)

      first.focus()
      fireEvent.keyDown(view.getByRole('dialog'), { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(last)
    })

    it('moves between tabs with arrow keys, Home and End', () => {
      const view = render(<HelpModal />)
      const quickStart = view.getByRole('tab', { name: 'Quick Start' })

      fireEvent.keyDown(quickStart, { key: 'ArrowRight' })
      expect(useUiStore.getState().helpTab).toBe('shortcuts')

      fireEvent.keyDown(view.getByRole('tab', { name: 'Shortcuts' }), { key: 'ArrowLeft' })
      expect(useUiStore.getState().helpTab).toBe('quickstart')

      fireEvent.keyDown(view.getByRole('tab', { name: 'Quick Start' }), { key: 'End' })
      expect(useUiStore.getState().helpTab).toBe('about')

      fireEvent.keyDown(view.getByRole('tab', { name: 'About' }), { key: 'Home' })
      expect(useUiStore.getState().helpTab).toBe('quickstart')
    })

    it('wraps around at both ends of the tab strip', () => {
      useUiStore.setState({ helpTab: 'about' })
      const view = render(<HelpModal />)

      fireEvent.keyDown(view.getByRole('tab', { name: 'About' }), { key: 'ArrowRight' })
      expect(useUiStore.getState().helpTab).toBe('quickstart')

      fireEvent.keyDown(view.getByRole('tab', { name: 'Quick Start' }), { key: 'ArrowLeft' })
      expect(useUiStore.getState().helpTab).toBe('about')
    })

    it('exposes one tab stop for the strip and links the panel to its tab', () => {
      const view = render(<HelpModal />)

      const selected = view.getByRole('tab', { name: 'Quick Start' })
      expect(selected.getAttribute('tabindex')).toBe('0')
      expect(view.getByRole('tab', { name: 'About' }).getAttribute('tabindex')).toBe('-1')

      const panel = view.getByRole('tabpanel')
      expect(panel.getAttribute('aria-labelledby')).toBe(selected.id)
      expect(selected.getAttribute('aria-controls')).toBe(panel.id)
    })
  })

  it('explains what opening someone else’s project holds back', () => {
    const view = render(<HelpModal />)

    expect(view.getByText('Opening a project from someone else')).toBeTruthy()
    expect(view.getByText('Formula and Code nodes')).toBeTruthy()
    expect(view.getAllByText(/No network listener is opened/).length).toBeGreaterThan(0)
    expect(view.getAllByText(/Studio asks first/).length).toBeGreaterThan(0)
  })

  it('documents the workspace features that live outside the canvas', () => {
    const view = render(<HelpModal />)

    expect(view.getByText('Beyond the canvas')).toBeTruthy()
    expect(view.getByText('Plan the physical build')).toBeTruthy()
    expect(view.getByText('Record the preview')).toBeTruthy()
    expect(view.getByText('Review saved patterns')).toBeTruthy()
    expect(view.getByText('Drive several outputs')).toBeTruthy()
    expect(view.getAllByText(/View → Layout/).length).toBeGreaterThan(0)
  })

  it('describes the board catalogue by family rather than a stale fixed list', () => {
    const view = render(<HelpModal />)

    fireEvent.click(view.getByRole('tab', { name: 'Upload & Export' }))

    const catalogue = view.getByText(/three dozen board targets/)
    expect(catalogue).toBeTruthy()
    // Families that existed in the catalogue but were missing from the old
    // nine-board sentence.
    for (const family of ['Teensy', 'Adafruit', 'STM32', 'nRF52840 DK']) {
      expect(catalogue.textContent).toContain(family)
    }
  })

  it.each(['BeatDetect', 'SpectrumBars'])('forces real audio for the %s live example', (selectedType) => {
    useUiStore.setState({
      helpTab: 'nodes',
      helpNodeReference: {
        search: '',
        expandedCategory: 'audio',
        selectedType,
      },
      testSignal: true,
    })
    const view = render(<HelpModal />)

    fireEvent.click(view.getByRole('button', { name: /Try it live/ }))

    expect(useUiStore.getState().testSignal).toBe(false)
    expect(useUiStore.getState().statusText).toMatch(/microphone starting/i)
    expect(startAudio).toHaveBeenCalledOnce()
  })
})
