import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import HelpModal from '../HelpModal'
import { useUiStore } from '../../../state/uiStore'

describe('HelpModal session state', () => {
  beforeEach(() => {
    useUiStore.setState({
      helpOpen: true,
      helpTab: 'quickstart',
      helpNodeReference: {
        search: '',
        expandedCategory: 'input',
        selectedType: '',
      },
    })
  })

  it('reopens on the last selected top-level tab', () => {
    const first = render(<HelpModal />)

    fireEvent.click(first.getByRole('tab', { name: 'Upload & Export' }))
    expect(useUiStore.getState().helpTab).toBe('upload')

    first.unmount()

    const second = render(<HelpModal />)

    expect(second.getByRole('tab', { name: 'Upload & Export' }).getAttribute('aria-selected')).toBe('true')
    expect(second.getByText('Prerequisites')).toBeTruthy()
  })

  it('reopens the node reference where the session left off', async () => {
    const first = render(<HelpModal />)

    fireEvent.click(first.getByRole('tab', { name: 'Node Reference' }))
    fireEvent.change(first.getByLabelText('Find module'), { target: { value: 'matrix output' } })

    let matrixOutputButton: HTMLElement | undefined
    await waitFor(() => {
      matrixOutputButton = first.getAllByRole('button').find((button) => button.textContent?.includes('Matrix OutputMAT-OUT'))
      expect(matrixOutputButton).toBeTruthy()
    })

    fireEvent.click(matrixOutputButton!)
    expect(useUiStore.getState().helpNodeReference.search).toBe('matrix output')
    expect(useUiStore.getState().helpNodeReference.selectedType).toBe('MatrixOutput')

    first.unmount()

    const second = render(<HelpModal />)

    expect(second.getByRole('tab', { name: 'Node Reference' }).getAttribute('aria-selected')).toBe('true')
    expect((second.getByLabelText('Find module') as HTMLInputElement).value).toBe('matrix output')
    expect(second.getByRole('heading', { name: 'Matrix Output' })).toBeTruthy()
  })
})
