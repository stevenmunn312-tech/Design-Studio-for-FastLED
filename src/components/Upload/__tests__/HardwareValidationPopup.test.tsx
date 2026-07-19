import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StudioNode } from '../../../state/graphStore'
import HardwareValidationPopup from '../HardwareValidationPopup'

const matrix = {
  id: 'matrix',
  type: 'studioNode',
  position: { x: 0, y: 0 },
  data: {
    label: 'Matrix Output',
    nodeType: 'MatrixOutput',
    category: 'output',
    properties: {
      width: 32,
      height: 8,
      chipset: 'WS2815',
      colorOrder: 'RGB',
      layout: 'matrix',
      serpentine: true,
      dataPin: 4,
    },
  },
} as StudioNode

describe('HardwareValidationPopup', () => {
  it('shows exact missing coverage and requires reviewed observations before GitHub submission', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { getByRole, getByText } = render(
      <HardwareValidationPopup
        nodes={[matrix]}
        edges={[]}
        selectedFqbn="esp32:esp32:esp32s3"
        helper={{ ok: true, engine: 'fbuild', fbuild: true, arduinoCli: false, fbuildVersion: '2.4.0' }}
        capacityResult={null}
        initialAction="normal-upload"
        onClose={vi.fn()}
      />,
    )

    expect(getByText('Exact controller + LED configuration')).toBeTruthy()
    const submit = getByRole('button', { name: 'Review on GitHub…' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    fireEvent.change(getByRole('textbox', { name: /Host OS/i }), { target: { value: 'Ubuntu 24.04.2 LTS' } })
    fireEvent.change(getByRole('textbox', { name: /Browser/i }), { target: { value: 'Firefox 140.0' } })
    fireEvent.change(getByRole('combobox', { name: 'Compile result' }), { target: { value: 'pass' } })

    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)
    expect(open).toHaveBeenCalledWith(expect.stringContaining('github.com/stevenmunn312-tech/Design-Studio-for-FastLED/issues/new'), '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })
})
