import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import NewProjectPrompt from '../NewProjectPrompt'
import { useUiStore } from '../../../state/uiStore'

describe('NewProjectPrompt', () => {
  beforeEach(() => {
    useUiStore.setState({
      newProjectPrompt: { open: false, projectName: '', actionLabel: 'creating a new project' },
    })
  })

  it('renders yes, no, and cancel actions', () => {
    useUiStore.setState({
      newProjectPrompt: { open: true, projectName: 'alpha', actionLabel: 'creating a new project' },
    })

    const { getByRole, getByText } = render(<NewProjectPrompt />)

    expect(getByRole('dialog', { name: 'Save current project first' })).toBeTruthy()
    expect(getByText('Yes')).toBeTruthy()
    expect(getByText('No')).toBeTruthy()
    expect(getByText('Cancel')).toBeTruthy()
  })

  it('closes when cancel is clicked', () => {
    useUiStore.setState({
      newProjectPrompt: { open: true, projectName: 'alpha', actionLabel: 'opening another project' },
    })

    const { getByText } = render(<NewProjectPrompt />)
    fireEvent.click(getByText('Cancel'))

    expect(useUiStore.getState().newProjectPrompt.open).toBe(false)
  })

  it('renders the requested action text', () => {
    useUiStore.setState({
      newProjectPrompt: { open: true, projectName: 'alpha', actionLabel: 'opening another project' },
    })

    const { getByText } = render(<NewProjectPrompt />)

    expect(getByText('Save current project "alpha" before opening another project?')).toBeTruthy()
  })
})
