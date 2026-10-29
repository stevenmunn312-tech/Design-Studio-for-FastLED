import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import MatrixSizePopup from '../MatrixSizePopup'
import { useEscapeLayer } from '../../../hooks/useEscapeLayer'

// The node menu the popup opened from, still open beneath it.
function Host({ onEscape, onClose }: { onEscape: () => void; onClose: () => void }) {
  useEscapeLayer(onEscape)
  return <MatrixSizePopup width={16} height={16} onApply={() => {}} onClose={onClose} />
}

describe('MatrixSizePopup', () => {
  it('closes once on Escape in a field and leaves the layer beneath it open', () => {
    const onEscape = vi.fn()
    const onClose = vi.fn()
    const view = render(<Host onEscape={onEscape} onClose={onClose} />)
    const width = view.getByRole('spinbutton', { name: 'Width (X)' })
    width.focus()
    fireEvent.keyDown(width, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('applies both fields on Enter', () => {
    const onApply = vi.fn()
    const view = render(<MatrixSizePopup width={16} height={16} onApply={onApply} onClose={() => {}} />)
    const height = view.getByRole('spinbutton', { name: 'Height (Y)' })
    fireEvent.change(height, { target: { value: '8' } })
    fireEvent.keyDown(height, { key: 'Enter' })
    expect(onApply).toHaveBeenCalledWith(16, 8)
  })
})
