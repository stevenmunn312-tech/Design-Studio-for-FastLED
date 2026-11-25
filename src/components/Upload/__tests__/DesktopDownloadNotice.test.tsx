import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import DesktopDownloadNotice from '../DesktopDownloadNotice'

const mode = vi.hoisted(() => ({ embedded: true }))

vi.mock('../../../utils/embedMode', () => ({
  get EMBEDDED() { return mode.embedded },
}))

afterEach(() => {
  cleanup()
  mode.embedded = true
})

describe('DesktopDownloadNotice', () => {
  it('tells an embedded demo where to get the build tools', () => {
    const { getByRole } = render(<DesktopDownloadNotice />)

    expect(getByRole('note').textContent).toBe(
      'Download the desktop version to use build tools. designstudioforfastled.com')
    const link = getByRole('link', { name: 'designstudioforfastled.com' })
    expect(link.getAttribute('href')).toBe('https://designstudioforfastled.com')
    // The demo is framed on someone else's page: the site opens beside it.
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('draws nothing outside an embedded demo', () => {
    mode.embedded = false
    const { container } = render(<DesktopDownloadNotice />)

    expect(container.firstChild).toBeNull()
  })
})
