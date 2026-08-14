import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import BoardPinoutPopup from '../BoardPinoutPopup'
import { useUploadStore } from '../../../state/uploadStore'
import { boardProfileById } from '../../../build/boardProfiles'

// "Is this the board in my hand?" — the render beside its own pin list, so the
// answer is a glance rather than a datasheet comparison.

function open(profileId: string | null) {
  useUploadStore.setState({ pinoutProfileId: profileId } as never)
}

describe('BoardPinoutPopup', () => {
  beforeEach(() => open(null))

  it('renders nothing when no board is selected', () => {
    const { container } = render(<BoardPinoutPopup />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for a profile id that does not exist', () => {
    // A stale id must fail closed rather than throwing inside an overlay.
    open('no-such-board')
    const { container } = render(<BoardPinoutPopup />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the imported render and every pin label', () => {
    const xiao = boardProfileById('seeed-xiao-esp32s3')!
    open(xiao.id)
    render(<BoardPinoutPopup />)

    const img = screen.getByAltText(/board render, USB connector down/i) as HTMLImageElement
    expect(img.getAttribute('src')).toBe(`/${xiao.render!.file}`)

    for (const pin of xiao.pins ?? []) {
      expect(screen.getAllByText(pin.label).length).toBeGreaterThan(0)
    }
  })

  it('separates pins that are not on the side headers', () => {
    // The XIAO's GPIO39-42 are underside pads. Listing them inline with the
    // side rails is precisely the misreading this whole feature exists to
    // prevent, so they get their own labelled group.
    open('seeed-xiao-esp32s3')
    render(<BoardPinoutPopup />)
    expect(screen.getByText('Not on the side headers')).toBeTruthy()
  })

  it('offers a legend that does not present unknown pins as usable', () => {
    open('seeed-xiao-esp32s3')
    render(<BoardPinoutPopup />)
    expect(screen.getByText('Free to use')).toBeTruthy()
    expect(screen.getByText('Not available on this board')).toBeTruthy()
    expect(screen.getByText('No board data')).toBeTruthy()
  })

  it('closes through the store', () => {
    open('seeed-xiao-esp32s3')
    render(<BoardPinoutPopup />)
    screen.getByLabelText('Close pinout').click()
    expect(useUploadStore.getState().pinoutProfileId).toBeNull()
  })
})
