import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import HardwarePane from '../HardwarePane'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/uploadStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { DEFAULT_BOARD_PROFILE_ID, ROOT_BOARD_NODE_ID } from '../../../state/hardware'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function node(type: string, id: string, properties: Record<string, unknown> = {}) {
  const definition = NODE_LIBRARY.find((entry) => entry.type === type)!
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    hidden: type === 'Board',
    selectable: type !== 'Board',
    draggable: type !== 'Board',
    data: {
      label: definition.label,
      nodeType: definition.type,
      category: definition.category,
      properties,
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  }
}

describe('HardwarePane', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    useGraphStore.setState({
      nodes: [node('Board', ROOT_BOARD_NODE_ID, { profileId: DEFAULT_BOARD_PROFILE_ID }) as never],
      edges: [],
    })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3' })
    useUiStore.setState({
      hardwarePaneTab: 'hardware',
      viewCenter: { x: 0, y: 0 },
      sidebarOpen: false,
      previewPanelOpen: false,
      uiEffectsEnabled: true,
    })
  })

  it('adds a DS3231 RTC module as a hardware-owned RTCInput node', () => {
    render(<HardwarePane />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Hardware' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Inputs/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /DS3231 RTC module/ }))

    const rtc = useGraphStore.getState().nodes.find((entry) => entry.data.nodeType === 'RTCInput')
    expect(rtc).toBeTruthy()
    expect(rtc!.data.properties).toMatchObject({
      timeSource: 'DS3231',
      partId: 'ds3231-rtc-module',
    })
    expect(within(document.body).getByText('Default I2C bus')).toBeTruthy()
  })

  it('adds a Raspberry Pi RTC clock module as the compact RTCInput option', () => {
    render(<HardwarePane />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Hardware' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Inputs/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /DS3231 RTC Clock Module for Raspberry Pi/ }))

    const rtc = useGraphStore.getState().nodes.find((entry) => entry.data.nodeType === 'RTCInput')
    expect(rtc).toBeTruthy()
    expect(rtc!.data.properties).toMatchObject({
      timeSource: 'DS3231',
      partId: 'jaycar-xc9044-rtc-module',
    })
  })
})
