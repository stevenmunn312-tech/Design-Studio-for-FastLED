import { useEffect, useRef, useState } from 'react'
import { rootGraphNodes, useGraphStore, useNodeProperties } from '../../../state/graphStore'
import { useNetworkCredentialsStore, EMPTY_CREDENTIALS } from '../../../state/peripherals/networkCredentials'
import { wiredNetworkIn, wiredNetworkPhrase } from '../../../state/peripherals/ethernetModule'
import { webRemoteMdnsName } from '../../../state/peripherals/webRemote'
import { networkSourceIn } from '../../../codegen/peripherals/networkCpp'
import {
  cleanRadioStationName, normalizeRadioStations, parseRadioPlaylist, radioAccessCodeProblem, radioStationPagePort,
  radioStationsM3u, radioStationUrlProblem, RADIO_CARD_PLAYLIST, RADIO_STATION_NAME_MAX, RADIO_STATIONS_MAX,
  RADIO_URL_MAX, type RadioStation,
} from '../../../state/player/radioStations'
import { searchRadioBrowser, type RadioBrowserResult } from '../../../state/player/radioBrowser'
import WifiPasswordInput from '../WifiPasswordInput'
import fieldStyles from './DmxInputBody.module.css'
import styles from './RadioStationsBody.module.css'

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * The Music Player's internet radio stations: the ordered list Next and
 * Previous walk, a station added by URL or found in the radio-browser.info
 * directory, and the Wi-Fi the board streams over.
 *
 * Every station goes through `normalizeRadioStations` on its way in, the same
 * rules the generator applies, so the list never holds one the board would
 * refuse. Directory results are untrusted text and are only ever rendered as
 * text.
 */
export default function RadioStationsBody({ nodeId }: { nodeId: string }) {
  const props = useNodeProperties(nodeId)
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const stations = normalizeRadioStations(props.stations)
  const full = stations.length >= RADIO_STATIONS_MAX

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<RadioBrowserResult[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const search = useRef<AbortController | null>(null)
  useEffect(() => () => search.current?.abort(), [])

  const credentials = useNetworkCredentialsStore((s) => s.byNodeId[nodeId] ?? EMPTY_CREDENTIALS)
  const setCredentials = useNetworkCredentialsStore((s) => s.setCredentials)
  const wired = useGraphStore((s) => {
    const network = wiredNetworkIn(rootGraphNodes(s))
    return network ? wiredNetworkPhrase(network) : null
  })
  const pageAddress = useGraphStore((s) => {
    const nodes = rootGraphNodes(s)
    const source = networkSourceIn(nodes)
    const name = webRemoteMdnsName((source?.data.properties as Record<string, unknown> | undefined)?.wifiHostname ?? props.wifiHostname)
    const port = radioStationPagePort(nodes.some((node) => node.data.nodeType === 'WebRemoteInput'))
    return `http://${name}.local${port === 80 ? '' : `:${port}`}`
  })
  const accessCode = credentials.accessCode ?? ''
  const codeProblem = radioAccessCodeProblem(accessCode)

  const save = (next: RadioStation[]) => updateNodeProperty(nodeId, 'stations', normalizeRadioStations(next))
  const has = (stream: string) => stations.some((station) => station.url === stream)

  const addTyped = () => {
    const stream = url.trim()
    const problem = radioStationUrlProblem(stream) ?? (has(stream) ? 'That stream is already in the list.' : null)
    setUrlError(problem)
    if (problem) return
    save([...stations, { name: cleanRadioStationName(name, stream), url: stream }])
    setName('')
    setUrl('')
  }

  const runSearch = async () => {
    const text = query.trim()
    if (!text) return
    search.current?.abort()
    const controller = new AbortController()
    search.current = controller
    setSearching(true)
    setSearchError(null)
    try {
      setResults(await searchRadioBrowser(text, { signal: controller.signal }))
    } catch (error) {
      if (controller.signal.aborted) return
      setResults(null)
      setSearchError(error instanceof Error ? error.message : 'The search failed.')
    } finally {
      if (search.current === controller) setSearching(false)
    }
  }

  // A playlist from VLC or a station's own site, merged after the list.
  const importPlaylist = async (file: File | undefined) => {
    if (!file) return
    const found = parseRadioPlaylist(await file.text())
    setUrlError(found.length ? null : `${file.name} holds no stream the board can play.`)
    if (found.length) save([...stations, ...found])
  }

  // The same list as the file the board reads from its card.
  const exportPlaylist = () => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([radioStationsM3u(stations)], { type: 'audio/x-mpegurl' }))
    link.download = RADIO_CARD_PLAYLIST.slice(1)
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= stations.length) return
    const next = [...stations]
    const [entry] = next.splice(from, 1)
    next.splice(to, 0, entry)
    save(next)
  }

  return (
    <div className={styles.body} aria-label="Internet radio stations">
      <div className={styles.heading}>
        Stations <span className={styles.count}>{stations.length}/{RADIO_STATIONS_MAX}</span>
      </div>
      {stations.length === 0 && (
        <div className={fieldStyles.note}>No stations yet. Add one by its stream URL, or search the directory below.</div>
      )}
      <ol className={styles.list}>
        {stations.map((station, index) => (
          <li className={styles.station} key={station.url}>
            <span className={styles.stationText} title={station.url}>
              <span className={styles.stationName}>{station.name}</span>
              <span className={styles.stationHost}>{host(station.url)}</span>
            </span>
            <button type="button" className={`nodrag ${styles.mini}`} aria-label={`Move ${station.name} up`} disabled={index === 0} onClick={() => move(index, index - 1)}>↑</button>
            <button type="button" className={`nodrag ${styles.mini}`} aria-label={`Move ${station.name} down`} disabled={index === stations.length - 1} onClick={() => move(index, index + 1)}>↓</button>
            <button type="button" className={`nodrag ${styles.mini}`} aria-label={`Remove ${station.name}`} onClick={() => save(stations.filter((_, i) => i !== index))}>×</button>
          </li>
        ))}
      </ol>

      <div className={styles.section}>
        <input
          className={`nodrag ${fieldStyles.fieldInput}`}
          type="text"
          aria-label="New station name"
          placeholder="name (optional)"
          maxLength={RADIO_STATION_NAME_MAX}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div className={styles.row}>
          <input
            className={`nodrag ${fieldStyles.fieldInput}`}
            type="url"
            aria-label="New station stream URL"
            aria-invalid={urlError !== null}
            placeholder="http://stream.example.com/live.mp3"
            maxLength={RADIO_URL_MAX}
            value={url}
            onChange={(event) => { setUrl(event.target.value); setUrlError(null) }}
            onKeyDown={(event) => { if (event.key === 'Enter') addTyped() }}
          />
          <button type="button" className={`nodrag ${styles.button}`} disabled={full || !url.trim()} onClick={addTyped}>Add</button>
        </div>
        {urlError && <div className={styles.error} role="alert">{urlError}</div>}
        <div className={styles.row}>
          <label className={`nodrag ${styles.button}`}>
            Import .m3u…
            <input
              className={styles.fileInput}
              type="file"
              accept=".m3u,.m3u8,audio/x-mpegurl,text/plain"
              aria-label="Import a playlist"
              disabled={full}
              onChange={(event) => { void importPlaylist(event.target.files?.[0]); event.target.value = '' }}
            />
          </label>
          <button
            type="button"
            className={`nodrag ${styles.button}`}
            disabled={stations.length === 0}
            title={`Save the list as ${RADIO_CARD_PLAYLIST.slice(1)}; on the SD card it replaces the built-in stations at start-up`}
            onClick={exportPlaylist}
          >
            Save {RADIO_CARD_PLAYLIST.slice(1)}
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.row}>
          <input
            className={`nodrag ${fieldStyles.fieldInput}`}
            type="search"
            aria-label="Search radio-browser.info"
            placeholder="search stations, e.g. jazz"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void runSearch() }}
          />
          <button type="button" className={`nodrag ${styles.button}`} disabled={searching || !query.trim()} onClick={() => void runSearch()}>
            {searching ? '…' : 'Search'}
          </button>
        </div>
        <div className={fieldStyles.note}>Searches the open radio-browser.info directory. Only stations the board can play are listed.</div>
        {searchError && <div className={styles.error} role="alert">{searchError}</div>}
        {results && results.length === 0 && <div className={fieldStyles.note}>No playable stations found.</div>}
        {results && results.length > 0 && (
          <ul className={`nowheel ${styles.results}`} aria-label="Search results">
            {results.map((result) => {
              const added = has(result.url)
              return (
                <li className={styles.station} key={result.url}>
                  <span className={styles.stationText} title={result.url}>
                    <span className={styles.stationName}>{result.name}</span>
                    <span className={styles.stationHost}>
                      {[result.codec, result.bitrateKbps ? `${result.bitrateKbps} kbps` : '', result.country].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={`nodrag ${styles.button}`}
                    disabled={added || full}
                    aria-label={added ? `${result.name} is in the list` : `Add ${result.name}`}
                    onClick={() => save([...stations, { name: result.name, url: result.url }])}
                  >
                    {added ? 'Added' : 'Add'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {wired ? (
        <div className={fieldStyles.note}>Firmware reaches the network through {wired}, so no Wi-Fi credentials are needed.</div>
      ) : (
        <>
          <div className={fieldStyles.field}>
            <label className={fieldStyles.fieldLabel} htmlFor={`${nodeId}-radio-ssid`}>Wi-Fi SSID</label>
            <input
              id={`${nodeId}-radio-ssid`}
              className={`nodrag ${fieldStyles.fieldInput}`}
              type="text"
              autoComplete="off"
              value={credentials.ssid}
              onChange={(event) => setCredentials(nodeId, { ssid: event.target.value })}
              placeholder="network name"
            />
          </div>
          <div className={fieldStyles.field}>
            <label className={fieldStyles.fieldLabel} htmlFor={`${nodeId}-radio-password`}>Wi-Fi password</label>
            <WifiPasswordInput
              id={`${nodeId}-radio-password`}
              className={`nodrag ${fieldStyles.fieldInput}`}
              value={credentials.password}
              onChange={(password) => setCredentials(nodeId, { password })}
            />
          </div>
        </>
      )}
      {props.stationPage === true && (
        <>
          <div className={fieldStyles.note}>
            Station page: <span className={styles.address}>{pageAddress}</span> from a phone on the same network.
          </div>
          <div className={fieldStyles.field}>
            <label className={fieldStyles.fieldLabel} htmlFor={`${nodeId}-radio-code`}>Access code (to add or remove stations)</label>
            <WifiPasswordInput
              id={`${nodeId}-radio-code`}
              className={`nodrag ${fieldStyles.fieldInput}`}
              value={accessCode}
              onChange={(code) => setCredentials(nodeId, { accessCode: code })}
            />
          </div>
          {codeProblem && <div className={styles.error} role="alert">{codeProblem}</div>}
          <div className={fieldStyles.note}>
            Without a code the page only chooses among the stations. Anyone on the network can do that, as with a Web Remote.
          </div>
        </>
      )}
      {!wired && <div className={fieldStyles.note}>Wi-Fi details and the access code are stored in this browser only — never in the project file or share links.</div>}
    </div>
  )
}
