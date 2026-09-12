import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import DeviceTelemetryCard from '../DeviceTelemetryCard'
import { useDeviceTelemetryStore } from '../../../state/deviceTelemetryStore'
import { TELEMETRY_MARKER } from '../../../state/deviceTelemetry'

function feed(fields: Record<string, number>) {
  useDeviceTelemetryStore.getState().ingest(
    `${TELEMETRY_MARKER} ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ')}\n`,
  )
}

describe('DeviceTelemetryCard', () => {
  beforeEach(() => {
    useDeviceTelemetryStore.getState().reset()
  })

  it('says what to do when the device has reported nothing', () => {
    render(<DeviceTelemetryCard />)
    expect(screen.getByText(/Report telemetry/)).toBeTruthy()
    expect(screen.getByText('not connected')).toBeTruthy()
  })

  it('shows the figures once a device reports', () => {
    feed({ uptime: 65, heap: 204800, minheap: 198000, fps: 58.4, psram: 4194304, psramtotal: 8388608, drawbuf: 9600 })
    render(<DeviceTelemetryCard />)
    expect(screen.getByText('uptime 00:01:05')).toBeTruthy()
    expect(screen.getByText('200.0 KB')).toBeTruthy()
    expect(screen.getByText('9.4 KB')).toBeTruthy()
    expect(screen.getByText('4.00 MB of 8.00 MB')).toBeTruthy()
  })

  it('reports an untouched panel as untouched rather than as nought', () => {
    feed({ uptime: 10, heap: 204800, minheap: 198000, fps: 60 })
    render(<DeviceTelemetryCard />)
    expect(screen.getByText('untouched')).toBeTruthy()
  })

  it('says a board has no PSRAM rather than showing it as empty', () => {
    feed({ uptime: 10, heap: 204800, minheap: 198000, fps: 60, psram: 0, psramtotal: 0 })
    render(<DeviceTelemetryCard />)
    expect(screen.getByText('none fitted')).toBeTruthy()
  })

  it('holds off on a drift verdict until the run is long enough to fit one', () => {
    feed({ uptime: 2, heap: 204800, minheap: 198000, fps: 60 })
    render(<DeviceTelemetryCard />)
    expect(screen.getByText('measuring…')).toBeTruthy()
  })

  it('calls out a leaking run as a soak failure', () => {
    for (let i = 0; i < 60; i += 1) {
      feed({ uptime: i * 2, heap: 300000 - (i * 400), minheap: 180000, fps: 60 })
    }
    render(<DeviceTelemetryCard />)
    expect(screen.getByText(/fails the soak condition/)).toBeTruthy()
  })
})
