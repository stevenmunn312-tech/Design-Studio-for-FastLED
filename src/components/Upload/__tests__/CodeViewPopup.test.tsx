import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import CodeViewPopup from '../CodeViewPopup'
import { useUploadStore } from '../../../state/uploadStore'

const CODE = 'void setup() {}\nvoid loop() {}\n'

describe('CodeViewPopup', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()
  const exportIno = vi.fn()

  beforeEach(() => {
    writeText.mockReset()
    writeText.mockResolvedValue()
    exportIno.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    useUploadStore.setState({
      closeCodeView: vi.fn(),
      exportIno,
    })
  })

  it('shows one gutter line number per source line, separate from the code text', () => {
    const { baseElement } = render(<CodeViewPopup code={CODE} />)
    const gutterLines = baseElement.querySelectorAll('[aria-hidden="true"] span')
    expect(Array.from(gutterLines).map((el) => el.textContent)).toEqual(['1', '2', '3'])
    expect(baseElement.querySelector('pre')?.textContent).toBe(CODE)
  })

  it('copies and downloads the raw code without line numbers', async () => {
    const { getByRole } = render(<CodeViewPopup code={CODE} />)

    fireEvent.click(getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CODE))

    fireEvent.click(getByRole('button', { name: 'Download' }))
    expect(exportIno).toHaveBeenCalledWith(CODE)
  })

  it('omits the upload button when no onUpload handler is supplied', () => {
    const { queryByRole } = render(<CodeViewPopup code={CODE} />)
    expect(queryByRole('button', { name: /Upload/ })).toBeNull()
  })

  it('wires the upload button to the supplied handler and respects disabled state', () => {
    const onUpload = vi.fn()
    const { getByRole, rerender } = render(
      <CodeViewPopup code={CODE} onUpload={onUpload} uploadDisabled />,
    )
    const button = getByRole('button', { name: '↑ Upload' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)

    rerender(<CodeViewPopup code={CODE} onUpload={onUpload} uploadDisabled={false} />)
    fireEvent.click(getByRole('button', { name: '↑ Upload' }))
    expect(onUpload).toHaveBeenCalled()
  })
})
