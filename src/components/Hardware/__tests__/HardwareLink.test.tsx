import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HardwareLink from '../HardwareLink'

const baseProps = {
  dataType: 'frame',
  color: '#33d6ff',
  x1: 10,
  y1: 20,
  x2: 200,
  y2: 80,
  // The bench's own shape: down out of a part, along a lane, down into the next.
  points: [
    { x: 10, y: 20 },
    { x: 10, y: 50 },
    { x: 200, y: 50 },
    { x: 200, y: 80 },
  ],
  corner: 10,
  label: 'Board to LEDs',
}

describe('HardwareLink', () => {
  it('scales a simple connection stroke and both plugs with the hardware', () => {
    const { container } = render(
      <svg>
        <HardwareLink {...baseProps} effects={false} visualScale={0.25} />
      </svg>,
    )

    expect(container.querySelector('path')?.getAttribute('stroke-width')).toBe('0.6')
    expect([...container.querySelectorAll('circle')].map((circle) => circle.getAttribute('r')))
      .toEqual(['0.8', '0.8'])
  })

  it('draws the route the layout gave it, with rounded square corners', () => {
    const { container } = render(
      <svg>
        <HardwareLink {...baseProps} effects={false} visualScale={1} />
      </svg>,
    )

    const d = container.querySelector('path')?.getAttribute('d') ?? ''
    // Two corners, each a quadratic between two straight runs — no bezier
    // sweeping diagonally between the endpoints.
    expect(d.match(/Q/g)).toHaveLength(2)
    expect(d.startsWith('M 10 20')).toBe(true)
    expect(d.endsWith('L 200 80')).toBe(true)
  })

  it('scales every animated layer, including dashes, packets and endpoints', () => {
    const { container } = render(
      <svg>
        <HardwareLink {...baseProps} effects visualScale={0.5} />
      </svg>,
    )

    const paths = [...container.querySelectorAll('path')]
    const core = paths[paths.length - 1]
    expect(paths.map((path) => path.getAttribute('stroke-width'))).toEqual(['8', '4', '2.4', '1.4'])
    expect(core.getAttribute('stroke-dasharray')).toBe('12 9')
    expect(core.getAttribute('style')).toContain('--edge-flow-distance: -36')

    const radii = [...container.querySelectorAll('circle')].map((circle) => circle.getAttribute('r'))
    expect(radii.slice(-2)).toEqual(['2', '2'])
    expect(radii.slice(0, -2)).toEqual(['1.7', '1.25', '0.9'])
  })
})
