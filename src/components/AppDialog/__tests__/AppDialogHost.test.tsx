import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import AppDialogHost from '../AppDialogHost'
import { useUiStore } from '../../../state/uiStore'

describe('AppDialogHost', () => {
  beforeEach(() => {
    useUiStore.setState({ appDialog: null })
  })

  it('renders a confirm dialog and resolves false on cancel', async () => {
    const promise = useUiStore.getState().requestConfirm({
      title: 'Delete project?',
      message: 'Delete this saved project?',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })

    const { getByRole, getByText } = render(<AppDialogHost />)

    const dialog = getByRole('dialog', { name: 'Delete project?' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(getByText('Delete project?')).toBeTruthy()
    fireEvent.click(getByText('Cancel'))

    await expect(promise).resolves.toBe(false)
    expect(useUiStore.getState().appDialog).toBeNull()
  })

  it('focuses a prompt input and resolves the entered value', async () => {
    const promise = useUiStore.getState().requestPrompt({
      title: 'Rename project',
      message: 'Rename project:',
      inputLabel: 'Project name',
      initialValue: 'Alpha',
      confirmLabel: 'Rename',
    })

    const { getByLabelText, getByText } = render(<AppDialogHost />)

    const input = getByLabelText('Project name') as HTMLInputElement
    await waitFor(() => expect(document.activeElement).toBe(input))
    fireEvent.change(input, { target: { value: 'Beta' } })
    fireEvent.click(getByText('Rename'))

    await expect(promise).resolves.toBe('Beta')
  })

  it('restores focus to the previous element after Escape closes the dialog', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open'
    document.body.appendChild(opener)
    opener.focus()

    const promise = useUiStore.getState().requestConfirm({
      title: 'Replace graph?',
      message: 'Loading a graph will replace your current workspace.',
    })

    const { getByRole } = render(<AppDialogHost />)
    const dialog = getByRole('dialog', { name: 'Replace graph?' })

    fireEvent.keyDown(dialog, { key: 'Escape' })

    await expect(promise).resolves.toBe(false)
    await waitFor(() => expect(document.activeElement).toBe(opener))
    opener.remove()
  })
})
