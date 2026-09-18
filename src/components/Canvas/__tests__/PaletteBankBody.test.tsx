import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { useGraphStore } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import PaletteBankBody from '../PaletteBankBody'

function installBank(palettes: string[]) {
  const def = NODE_LIBRARY.find((n) => n.type === 'PaletteBank')!
  useGraphStore.setState({
    nodes: [{
      id: 'bank',
      type: 'studioNode',
      position: { x: 0, y: 0 },
      data: {
        label: def.label,
        nodeType: def.type,
        category: def.category,
        properties: { palettes },
        inputs: def.inputs,
        outputs: def.outputs,
      },
    }] as never[],
    edges: [],
    graphs: { root: { id: 'root', name: 'Main' } },
    graphData: {},
    activeGraphId: 'root',
    selectedNodeId: null,
  })
}

const bankNow = () =>
  (useGraphStore.getState().nodes[0].data.properties as { palettes: string[] }).palettes

/** A drag event's payload, which jsdom does not supply. */
function dataTransfer() {
  const store = new Map<string, string>()
  return {
    setData: (type: string, value: string) => { store.set(type, value) },
    getData: (type: string) => store.get(type) ?? '',
    effectAllowed: '',
    dropEffect: '',
  }
}

describe('PaletteBankBody', () => {
  beforeEach(() => installBank(['ocean', 'lava', 'forest']))

  it('reorders the bank when a row is dragged onto another', () => {
    const { getAllByRole } = render(<PaletteBankBody nodeId="bank" />)
    const rows = getAllByRole('listitem')
    expect(rows).toHaveLength(3)

    // Drag the last palette onto the first — the order Next will step through.
    fireEvent.dragStart(rows[2], { dataTransfer: dataTransfer() })
    fireEvent.dragOver(rows[0], { dataTransfer: dataTransfer() })
    fireEvent.drop(rows[0], { dataTransfer: dataTransfer() })

    expect(bankNow()).toEqual(['forest', 'ocean', 'lava'])
  })

  it('leaves the bank alone when a row is dropped back where it started', () => {
    const { getAllByRole } = render(<PaletteBankBody nodeId="bank" />)
    const rows = getAllByRole('listitem')

    fireEvent.dragStart(rows[1], { dataTransfer: dataTransfer() })
    fireEvent.dragOver(rows[1], { dataTransfer: dataTransfer() })
    fireEvent.drop(rows[1], { dataTransfer: dataTransfer() })

    expect(bankNow()).toEqual(['ocean', 'lava', 'forest'])
  })

  it('moves a palette without a pointer', () => {
    // Drag is the tool, but a reorder cannot be pointer-only.
    const { getByLabelText } = render(<PaletteBankBody nodeId="bank" />)

    fireEvent.click(getByLabelText('Move Forest earlier'))
    expect(bankNow()).toEqual(['ocean', 'forest', 'lava'])

    fireEvent.click(getByLabelText('Move Ocean later'))
    expect(bankNow()).toEqual(['forest', 'ocean', 'lava'])
  })

  it('cannot move the ends past themselves', () => {
    const { getByLabelText } = render(<PaletteBankBody nodeId="bank" />)
    expect((getByLabelText('Move Ocean earlier') as HTMLButtonElement).disabled).toBe(true)
    expect((getByLabelText('Move Forest later') as HTMLButtonElement).disabled).toBe(true)
  })

  it('draws no strip at all for an empty bank', () => {
    installBank([])
    const { queryAllByRole } = render(<PaletteBankBody nodeId="bank" />)
    expect(queryAllByRole('listitem')).toHaveLength(0)
  })

  it('appends a newly ticked palette to the end of the bank', () => {
    const { getByTitle } = render(<PaletteBankBody nodeId="bank" />)
    fireEvent.click(getByTitle('Add Ice to the bank'))
    expect(bankNow()).toEqual(['ocean', 'lava', 'forest', 'ice'])
  })
})
