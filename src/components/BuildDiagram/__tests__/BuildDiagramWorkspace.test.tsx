import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import BuildDiagramWorkspace from '../BuildDiagramWorkspace'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/uploadStore'

describe('BuildDiagramWorkspace', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [{
        id: 'out',
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Matrix Output',
          nodeType: 'MatrixOutput',
          category: 'output',
          properties: { width: 16, height: 16, chipset: 'WS2812B', dataPin: 14 },
          inputs: [],
          outputs: [],
        },
      }] as never[],
      edges: [],
      buildProfile: undefined,
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
    useUiStore.setState({ workspaceMode: 'build' })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3', selectedPort: 'COM7' })
  })

  it('requires an exact board before showing controller-side connections', () => {
    const { getByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Exact board required')).toBeTruthy()
    expect(getByText('Controller-side connections appear here after an exact board with a reviewed pin map is selected.')).toBeTruthy()
  })

  it('shows GPIO connections once a reviewed exact board profile is selected', () => {
    useGraphStore.setState({
      buildProfile: {
        version: 1,
        physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1',
      },
    })

    const { getAllByText, getByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Espressif ESP32-S3-DevKitC-1 selected. Connections now resolve against that exact board\'s pin map.')).toBeTruthy()
    expect(getAllByText((_, node) => node?.textContent?.includes('GPIO14 → Matrix Output data pin') ?? false).length).toBeGreaterThan(0)
  })

  it('offers zoom controls for the diagram viewport', () => {
    useGraphStore.setState({
      buildProfile: {
        version: 1,
        physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1',
      },
    })

    const { getByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Zoom 100%')).toBeTruthy()
    fireEvent.click(getByText('Zoom in'))
    expect(getByText('Zoom 115%')).toBeTruthy()
    fireEvent.click(getByText('Zoom out'))
    expect(getByText('Zoom 100%')).toBeTruthy()
    fireEvent.click(getByText('Zoom in'))
    fireEvent.click(getByText('Reset view'))
    expect(getByText('Zoom 100%')).toBeTruthy()
  })

  it('keeps layout positions stable and distinguishes fit visible from fit all', () => {
    const clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 1000,
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 500,
    })

    try {
      useGraphStore.setState({
        nodes: Array.from({ length: 6 }, (_, index) => ({
          id: `out-${index}`,
          type: 'studioNode',
          position: { x: 0, y: 0 },
          data: {
            label: `Matrix Output ${index + 1}`,
            nodeType: 'MatrixOutput',
            category: 'output',
            properties: { width: 16, height: 16, chipset: 'WS2812B', dataPin: 10 + index },
            inputs: [],
            outputs: [],
          },
        })) as never[],
        buildProfile: {
          version: 1,
          physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1',
        },
      })

      const { getAllByText, getByText } = render(<BuildDiagramWorkspace />)

      fireEvent.click(getAllByText('Isolate')[0])
      expect(getByText('Unisolate')).toBeTruthy()
      fireEvent.click(getByText('Fit visible'))
      const fitVisibleZoom = Number(getByText((_, node) => node?.tagName === 'SPAN' && (node.textContent?.startsWith('Zoom ') ?? false)).textContent?.replace(/\D/g, ''))

      fireEvent.click(getByText('Fit all'))
      const fitAllZoom = Number(getByText((_, node) => node?.tagName === 'SPAN' && (node.textContent?.startsWith('Zoom ') ?? false)).textContent?.replace(/\D/g, ''))
      expect(fitAllZoom).toBeLessThan(fitVisibleZoom)
    } finally {
      if (clientWidthDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidthDescriptor)
      else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
      if (clientHeightDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor)
      else delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight
    }
  })

  it('uses the supplied generic N16R8 pin map for controller-side connections', () => {
    useGraphStore.setState({
      buildProfile: {
        version: 1,
        physicalBoardProfileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc',
      },
    })

    const { getAllByText, getByText, queryByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Generic ESP32-S3 N16R8, 44-pin dual USB-C selected. Connections now resolve against that exact board\'s pin map.')).toBeTruthy()
    expect(getByText('GPIO14 → Matrix Output data pin')).toBeTruthy()
    expect(getAllByText('Pinout verified only - power-path review still pending.').length).toBeGreaterThan(0)
    expect(queryByText('This exact board profile does not yet have a reviewed physical pin map.')).toBeNull()
  })

  it('flags generic N16R8 PSRAM pins as unavailable even when the header exposes them', () => {
    useGraphStore.setState({
      nodes: [{
        id: 'out',
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Matrix Output',
          nodeType: 'MatrixOutput',
          category: 'output',
          properties: { width: 16, height: 16, chipset: 'WS2812B', dataPin: 35 },
          inputs: [],
          outputs: [],
        },
      }] as never[],
      buildProfile: {
        version: 1,
        physicalBoardProfileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc',
      },
    })

    const { getAllByText, getByText } = render(<BuildDiagramWorkspace />)

    expect(getAllByText('GPIO35').length).toBeGreaterThan(0)
    expect(getByText('Signal ready: needs review: 1 controller pin mapping unresolved', { selector: 'li' })).toBeTruthy()
    expect(
      getByText((_, node) => node?.tagName === 'LI'
        && node.textContent === 'Matrix Output: GPIO 35 is exposed on the selected board header but unavailable on this module because octal PSRAM uses it.')
    ).toBeTruthy()
  })

  it('shows identifying details for each exact board option', () => {
    const { getByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Generic / AliExpress · 53×28 mm · pinout verified')).toBeTruthy()
    expect(getByText('Espressif · 54×28 mm · manufacturer verified')).toBeTruthy()
    expect(getByText('Seeed Studio · 21×18 mm · manufacturer verified')).toBeTruthy()
  })

  it('can filter the hardware list down to unfinished items', () => {
    const { getByText, queryByText } = render(<BuildDiagramWorkspace />)

    fireEvent.click(getByText('Mark done'))
    expect(getByText('1/1 done')).toBeTruthy()

    fireEvent.click(getByText('Show unfinished only'))
    expect(queryByText('Hide')).toBeNull()
  })

  it('can collapse and reopen both side panels', () => {
    const { getByText, queryByText } = render(<BuildDiagramWorkspace />)

    fireEvent.click(getByText('Hide build panel'))
    expect(queryByText('Controller target')).toBeNull()
    fireEvent.click(getByText('Show build panel'))
    expect(getByText('Controller target')).toBeTruthy()

    fireEvent.click(getByText('Hide details'))
    expect(queryByText('Selected item')).toBeNull()
    fireEvent.click(getByText('Show details'))
    expect(getByText('Selected item')).toBeTruthy()
  })

  it('defaults exports to complete build and lets the user switch to current view', () => {
    const { getByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Complete build is selected. Exports will include every configured hardware item by default.')).toBeTruthy()
    expect(getByText('Draft — unresolved build requirements')).toBeTruthy()
    fireEvent.click(getByText('Current view'))
    expect(getByText('Current view is selected. Exports will follow the hardware currently visible under the eye/filter/isolation state.')).toBeTruthy()
    expect(useGraphStore.getState().buildProfile?.exportMode).toBe('current-view')

    fireEvent.click(getByText('Complete build'))
    expect(getByText('Complete build is selected. Exports will include every configured hardware item by default.')).toBeTruthy()
    expect(useGraphStore.getState().buildProfile?.exportMode).toBeUndefined()
  })

  it('stores output install facts and invalidates done state when they change', () => {
    const { getByLabelText, getByText } = render(<BuildDiagramWorkspace />)

    fireEvent.click(getByText('Mark done'))
    expect(getByText('1/1 done')).toBeTruthy()

    fireEvent.change(getByLabelText('Physical length (mm)'), { target: { value: '2500' } })

    expect(useGraphStore.getState().buildProfile?.outputs?.['output:out']?.physicalLengthMm).toBe(2500)
    expect(getByText('0/1 done')).toBeTruthy()
    expect(getByText('Wiring changed—recheck this connection.')).toBeTruthy()
  })

  it('summarizes the missing facts that still block future power planning', () => {
    const { getByLabelText, getByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Requirements inputs: 3 input blockers still need review')).toBeTruthy()
    expect(getByText('Requirements calculated: blocked by 3 missing planner inputs')).toBeTruthy()
    expect(getByText('Draft — unresolved build requirements')).toBeTruthy()
    expect(getByText((_, node) => node?.textContent === 'Exact board profile: Controller-side wiring and reviewed controller power-path checks stay blocked until the exact physical board is selected.')).toBeTruthy()
    expect(getByText((_, node) => node?.textContent === 'Controller power path: Controller branch validation stays incomplete until Build Diagram knows whether the controller expects USB, VIN, 5VIN, or an external regulated rail.')).toBeTruthy()
    expect(getByText((_, node) => node?.textContent === 'Matrix Output: Physical length is still missing, so conductor sizing and injection spacing cannot be estimated yet. LED density or pitch is still missing, so current-per-length and injection planning cannot be estimated yet. Feed-cable length is still missing, so voltage-drop and cable-size checks cannot be estimated yet.')).toBeTruthy()

    fireEvent.click(getByText('Generic ESP32-S3 N16R8, 44-pin dual USB-C'))
    fireEvent.change(getByLabelText('Preferred path'), { target: { value: 'usb' } })
    fireEvent.change(getByLabelText('Physical length (mm)'), { target: { value: '2500' } })
    fireEvent.change(getByLabelText('LED density (/m)'), { target: { value: '60' } })
    fireEvent.change(getByLabelText('Feed cable length (mm)'), { target: { value: '500' } })

    expect(getByText('Requirements inputs: all currently expected install facts are captured for the future planner')).toBeTruthy()
    expect(getByText('Requirements calculated: ready to calculate once the electrical rule engine lands')).toBeTruthy()
    expect(getByText('Draft — electrical plan export pending assembly/BOM generation')).toBeTruthy()
    expect(getByText('All currently expected planner inputs are captured.')).toBeTruthy()
  })

  it('stores controller power preferences and advanced assumptions, invalidating done state when they change', () => {
    const { getByLabelText, getByText, queryByText } = render(<BuildDiagramWorkspace />)

    expect(queryByText('Conductor material')).toBeNull()
    fireEvent.click(getByText('Mark done'))
    expect(getByText('1/1 done')).toBeTruthy()

    fireEvent.change(getByLabelText('Preferred path'), { target: { value: 'usb' } })
    expect(useGraphStore.getState().buildProfile?.controllerPower?.preferredPath).toBe('usb')
    expect(getByText('0/1 done')).toBeTruthy()

    fireEvent.click(getByText('Show assumptions'))
    expect(getByText('Hide assumptions')).toBeTruthy()
    fireEvent.change(getByLabelText('Allowed voltage drop (%)'), { target: { value: '7.5' } })

    expect(useGraphStore.getState().buildProfile?.assumptions?.allowedVoltageDropPercent).toBe(7.5)
    expect(getByText('Wiring changed—recheck this connection.')).toBeTruthy()
  })
})
