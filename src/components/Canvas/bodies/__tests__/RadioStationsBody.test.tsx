import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { useGraphStore } from '../../../../state/graphStore'
import { NODE_LIBRARY } from '../../../../state/nodeLibrary'
import { useNetworkCredentialsStore } from '../../../../state/peripherals/networkCredentials'
import RadioStationsBody from '../RadioStationsBody'

function installPlayer(properties: Record<string, unknown>) {
  const def = NODE_LIBRARY.find((n) => n.type === 'PatternMaster')!
  useGraphStore.setState({
    nodes: [{
      id: 'player',
      type: 'studioNode',
      position: { x: 0, y: 0 },
      data: {
        label: def.label, nodeType: def.type, category: def.category,
        properties: { ...def.defaultProperties, musicSource: 'Internet Radio', ...properties },
        inputs: def.inputs, outputs: def.outputs,
      },
    }] as never[],
    edges: [],
    graphs: { root: { id: 'root', name: 'Main' } },
    graphData: {},
    activeGraphId: 'root',
    selectedNodeId: null,
  })
}

const stationsNow = () =>
  (useGraphStore.getState().nodes[0].data.properties as { stations: { name: string; url: string }[] }).stations

describe('RadioStationsBody', () => {
  beforeEach(() => installPlayer({ stations: [{ name: 'Jazz', url: 'http://jazz.example.com/live' }] }))
  afterEach(() => {
    vi.unstubAllGlobals()
    useNetworkCredentialsStore.getState().removeCredentials('player')
  })

  it('adds a typed station and refuses one the board could not play', () => {
    const view = render(<RadioStationsBody nodeId="player" />)
    fireEvent.change(view.getByLabelText('New station stream URL'), { target: { value: 'http://bad.example.com/a b' } })
    fireEvent.click(view.getByRole('button', { name: 'Add' }))
    expect(view.getByRole('alert').textContent).toMatch(/space/)
    expect(stationsNow()).toHaveLength(1)

    fireEvent.change(view.getByLabelText('New station name'), { target: { value: 'Rock' } })
    fireEvent.change(view.getByLabelText('New station stream URL'), { target: { value: 'http://rock.example.com/live' } })
    fireEvent.click(view.getByRole('button', { name: 'Add' }))
    expect(stationsNow()).toEqual([
      { name: 'Jazz', url: 'http://jazz.example.com/live' },
      { name: 'Rock', url: 'http://rock.example.com/live' },
    ])
  })

  it('imports a playlist file after the list, skipping what it already holds', async () => {
    const view = render(<RadioStationsBody nodeId="player" />)
    const file = new File(['#EXTM3U\n#EXTINF:-1,Rock\nhttp://rock.example.com/live\nhttp://jazz.example.com/live\n'], 'mine.m3u')
    fireEvent.change(view.getByLabelText('Import a playlist'), { target: { files: [file] } })
    await waitFor(() => expect(stationsNow()).toHaveLength(2))
    expect(stationsNow()[1]).toEqual({ name: 'Rock', url: 'http://rock.example.com/live' })
    expect(view.getByRole('button', { name: 'Save stations.m3u' })).toBeTruthy()
  })

  it('reorders and removes stations', () => {
    installPlayer({ stations: [{ name: 'A', url: 'http://a.example.com/' }, { name: 'B', url: 'http://b.example.com/' }] })
    const view = render(<RadioStationsBody nodeId="player" />)
    fireEvent.click(view.getByRole('button', { name: 'Move B up' }))
    expect(stationsNow().map((station) => station.name)).toEqual(['B', 'A'])
    fireEvent.click(view.getByRole('button', { name: 'Remove B' }))
    expect(stationsNow().map((station) => station.name)).toEqual(['A'])
  })

  it('adds a station found in the directory, as text only', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      { name: '<b>Smooth</b> Jazz', url_resolved: 'http://smooth.example.com/live', codec: 'MP3', bitrate: 128, hls: 0, lastcheckok: 1, countrycode: 'us' },
    ]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<RadioStationsBody nodeId="player" />)
    fireEvent.change(view.getByLabelText('Search radio-browser.info'), { target: { value: 'jazz' } })
    fireEvent.click(view.getByRole('button', { name: 'Search' }))
    const add = await waitFor(() => view.getByRole('button', { name: 'Add <b>Smooth</b> Jazz' }))
    expect(view.container.querySelector('b')).toBeNull()
    expect(view.getByText('MP3 · 128 kbps · US')).toBeTruthy()
    fireEvent.click(add)
    expect(stationsNow()).toContainEqual({ name: '<b>Smooth</b> Jazz', url: 'http://smooth.example.com/live' })
  })

  it('keeps the Wi-Fi details and access code in this browser, not the project', () => {
    installPlayer({ stationPage: true, stations: [] })
    const view = render(<RadioStationsBody nodeId="player" />)
    fireEvent.change(view.getByLabelText('Wi-Fi SSID'), { target: { value: 'home' } })
    fireEvent.change(view.getByLabelText('Access code (to add or remove stations)'), { target: { value: 'abc' } })
    expect(useNetworkCredentialsStore.getState().byNodeId.player).toMatchObject({ ssid: 'home', accessCode: 'abc' })
    expect(view.getByRole('alert').textContent).toMatch(/shorter than 6/)
    expect(view.getByText('http://fastled-radio.local')).toBeTruthy()
    const props = useGraphStore.getState().nodes[0].data.properties as Record<string, unknown>
    expect(JSON.stringify(props)).not.toMatch(/home|abc/)
  })
})
