import { beforeEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import HelpModal from '../HelpModal'
import { useUiStore } from '../../../state/uiStore'

describe('dimension-aware expression help', () => {
  beforeEach(() => {
    useUiStore.setState({ helpOpen: true, helpTab: 'quickstart' })
  })

  it('documents the available geometry variables', () => {
    const help = render(<HelpModal />)
    expect(help.getByText('Dimension-aware numeric expressions')).toBeTruthy()
    expect(help.getByText('num_leds')).toBeTruthy()
    expect(help.getAllByText('max_x').length).toBeGreaterThan(0)
    expect(help.getByText('center_y')).toBeTruthy()
  })
})
