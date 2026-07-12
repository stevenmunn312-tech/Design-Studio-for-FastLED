import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import NewProjectPrompt from '../NewProjectPrompt'
import { useUiStore } from '../../../state/uiStore'

describe('NewProjectPrompt', () => {
  beforeEach(() => {
    useUiStore.setState({
      newProjectPrompt: { open: false, projectName: '', actionLabel: 'creating a new project', destinationLabel: 'a new blank project' },
    })
  })

  it('renders explicit save, continue-without-saving, and cancel actions', () => {
    useUiStore.setState({
      newProjectPrompt: {
        open: true,
        projectName: 'alpha',
        actionLabel: 'creating a new project',
        destinationLabel: 'a new blank project',
      },
    })

    const { getByRole, getByText } = render(<NewProjectPrompt />)

    expect(getByRole('dialog', { name: 'Save current project before continuing' })).toBeTruthy()
    expect(getByText('Save and continue')).toBeTruthy()
    expect(getByText('Continue without saving')).toBeTruthy()
    expect(getByText('Cancel')).toBeTruthy()
  })

  it('closes when cancel is clicked', () => {
    useUiStore.setState({
      newProjectPrompt: {
        open: true,
        projectName: 'alpha',
        actionLabel: 'opening another project',
        destinationLabel: 'project "beta"',
      },
    })

    const { getByText } = render(<NewProjectPrompt />)
    fireEvent.click(getByText('Cancel'))

    expect(useUiStore.getState().newProjectPrompt.open).toBe(false)
  })

  it('renders the requested action text', () => {
    useUiStore.setState({
      newProjectPrompt: {
        open: true,
        projectName: 'alpha',
        actionLabel: 'opening another project',
        destinationLabel: 'project "beta"',
      },
    })

    const { getByText } = render(<NewProjectPrompt />)

    expect(getByText(/Current project/)).toBeTruthy()
    expect(getByText(/Destination:/)).toBeTruthy()
    expect(getByText('project "beta"')).toBeTruthy()
  })
})
