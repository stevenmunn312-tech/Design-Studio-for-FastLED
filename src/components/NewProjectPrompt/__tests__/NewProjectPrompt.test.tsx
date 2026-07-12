import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import NewProjectPrompt from '../NewProjectPrompt'
import { useUiStore } from '../../../state/uiStore'

describe('NewProjectPrompt', () => {
  beforeEach(() => {
    useUiStore.setState({
      newProjectPrompt: { open: false, projectName: '' },
    })
  })

  it('renders yes, no, and cancel actions', () => {
    useUiStore.setState({
      newProjectPrompt: { open: true, projectName: 'alpha' },
    })

    const { getByRole, getByText } = render(<NewProjectPrompt />)

    expect(getByRole('dialog', { name: 'Save current project first' })).toBeTruthy()
    expect(getByText('Yes')).toBeTruthy()
    expect(getByText('No')).toBeTruthy()
    expect(getByText('Cancel')).toBeTruthy()
  })

  it('closes when cancel is clicked', () => {
    useUiStore.setState({
      newProjectPrompt: { open: true, projectName: 'alpha' },
    })

    const { getByText } = render(<NewProjectPrompt />)
    fireEvent.click(getByText('Cancel'))

    expect(useUiStore.getState().newProjectPrompt.open).toBe(false)
  })
})
