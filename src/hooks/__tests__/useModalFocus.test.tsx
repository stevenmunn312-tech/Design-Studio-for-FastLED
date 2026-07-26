import { useState } from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useModalFocus } from '../useModalFocus'

function Modal({ onClose }: { onClose: () => void }) {
  const ref = useModalFocus<HTMLDivElement>(onClose)
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Test modal" tabIndex={-1}>
      <button>First action</button>
      <button>Last action</button>
    </div>
  )
}

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open modal</button>
      {open && <Modal onClose={() => setOpen(false)} />}
    </>
  )
}

describe('useModalFocus', () => {
  it('enters, traps, closes, and restores modal focus', async () => {
    const view = render(<Harness />)
    const opener = view.getByRole('button', { name: 'Open modal' })
    opener.focus()
    fireEvent.click(opener)

    const first = view.getByRole('button', { name: 'First action' })
    const last = view.getByRole('button', { name: 'Last action' })
    await waitFor(() => expect(document.activeElement).toBe(first))

    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)

    fireEvent.keyDown(last, { key: 'Escape' })
    expect(view.queryByRole('dialog', { name: 'Test modal' })).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
