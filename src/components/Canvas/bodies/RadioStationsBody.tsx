import { useEffect, useRef, useState } from 'react'
import { rootGraphNodes, useGraphStore, useNodeProperties } from '../../../state/graphStore'
import { useNetworkCredentialsStore } from '../../../state/peripherals/networkCredentials'
import { boardNetworkIdentity } from '../../../state/peripherals/boardNetwork'
import { webRemoteMdnsName } from '../../../state/peripherals/webRemote'
import { useNodeBoardId } from '../../Hardware/boardSelection'
import BoardNetworkNote from './BoardNetworkNote'
import {
  cleanRadioStationName, normalizeRadioStations, parseRadioPlaylist, radioAccessCodeProblem, radioStationPagePort,
  radioStationsM3u, radioStationUrlProblem, RADIO_CARD_PLAYLIST, RADIO_STATION_NAME_MAX, RADIO_STATIONS_MAX,
  RADIO_URL_MAX, type RadioStation,
} from '../../../state/player/radioStations'
import { searchRadioBrowser, type RadioBrowserResult } from '../../../state/player/radioBrowser'
import WifiPasswordInput from '../WifiPasswordInput'
import nodeStyles from '../StudioNode.module.css'
import styles from './RadioStationsBody.module.css'
import { Icon } from '../../icons/Icon'

const PLAYLIST_FILE = RADIO_CARD_PLAYLIST.slice(1)

/**
 * The Music Player's Internet Radio group: the ordered stations Next and
 * Previous walk, a station added by URL or from the radio-browser.info
 * directory, whose network the board streams over (the Board's, set in its
 * Network settings) and the phone station page.
 * Drawn as property rows inside the group, which the node shows only while
 * Music Source is Internet Radio; anything longer than a label is a tooltip.
 *
 * Every station goes through `normalizeRadioStations` on its way in, the same
 * rules the generator applies. Directory results are untrusted text and are
 * only ever rendered as text.
 */
export default function RadioStationsBody({ nodeId, disabled = false }: { nodeId: string; disabled?: boolean }) {
  const props = useNodeProperties(nodeId)
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const stations = normalizeRadioStations(props.stations)
  const full = stations.length >= RADIO_STATIONS_MAX

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<RadioBrowserResult[] | null>(null)
  const search = useRef<AbortController | null>(null)
  useEffect(() => () => search.current?.abort(), [])

  // The access code is this player's; the Wi-Fi it streams over is the Board's.
  const accessCode = useNetworkCredentialsStore((s) => s.byNodeId[nodeId]?.accessCode ?? '')
  const setCredentials = useNetworkCredentialsStore((s) => s.setCredentials)
  // The page answers to the name of the board the player runs on.
  const boardId = useNodeBoardId(nodeId)
  const hostname = useGraphStore((s) => boardNetworkIdentity(rootGraphNodes(s).find((node) => node.id === boardId)).hostname)
  const hasWebRemote = useGraphStore((s) => rootGraphNodes(s).some((node) => node.data.nodeType === 'WebRemoteInput'))
  const port = radioStationPagePort(hasWebRemote)
  const pageAddress = `http://${webRemoteMdnsName(hostname)}.local${port === 80 ? '' : `:${port}`}`
  const codeProblem = radioAccessCodeProblem(accessCode)

  const save = (next: RadioStation[]) => updateNodeProperty(nodeId, 'stations', normalizeRadioStations(next))
  const has = (stream: string) => stations.some((station) => station.url === stream)

  const addTyped = () => {
    const stream = url.trim()
    if (!stream) return
    const why = radioStationUrlProblem(stream) ?? (has(stream) ? 'That stream is already in the list.' : null)
    setProblem(why)
    if (why) return
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
    setProblem(null)
    try {
      setResults(await searchRadioBrowser(text, { signal: controller.signal }))
    } catch (error) {
      if (controller.signal.aborted) return
      setResults(null)
      setProblem(error instanceof Error ? error.message : 'The search failed.')
    } finally {
      if (search.current === controller) setSearching(false)
    }
  }

  // A playlist from VLC or a station's own site, merged after the list.
  const importPlaylist = async (file: File | undefined) => {
    if (!file) return
    const found = parseRadioPlaylist(await file.text())
    setProblem(found.length ? null : `${file.name} holds no stream the board can play.`)
    if (found.length) save([...stations, ...found])
  }

  // The same list as the file the board reads from its card.
  const exportPlaylist = () => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([radioStationsM3u(stations)], { type: 'audio/x-mpegurl' }))
    link.download = PLAYLIST_FILE
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

  const input = `nodrag ${nodeStyles.propInput}`
  return (
    <fieldset className={styles.group} disabled={disabled} aria-label="Internet radio stations">
      <ol className={styles.list}>
        {stations.map((station, index) => (
          <li className={styles.station} key={station.url}>
            <span className={styles.stationName} title={`${station.name}\n${station.url}`}>{station.name}</span>
            <button type="button" className={`nodrag ${styles.mini}`} aria-label={`Move ${station.name} up`} title="Move up" disabled={index === 0} onClick={() => move(index, index - 1)}><Icon name="arrow-up" /></button>
            <button type="button" className={`nodrag ${styles.mini}`} aria-label={`Move ${station.name} down`} title="Move down" disabled={index === stations.length - 1} onClick={() => move(index, index + 1)}><Icon name="arrow-down" /></button>
            <button type="button" className={`nodrag ${styles.mini}`} aria-label={`Remove ${station.name}`} title="Remove" onClick={() => save(stations.filter((_, i) => i !== index))}><Icon name="close" /></button>
          </li>
        ))}
      </ol>

      <div className={nodeStyles.propRow} title="A name for the next station you add. Optional: the stream's host is used when empty.">
        <span className={nodeStyles.propKey}>name</span>
        <input className={input} type="text" aria-label="New station name" maxLength={RADIO_STATION_NAME_MAX}
          value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className={nodeStyles.propRow} title="A stream address (http:// or https://). Press Enter or + to add it.">
        <span className={nodeStyles.propKey}>stream URL</span>
        <input className={input} type="url" aria-label="New station stream URL" aria-invalid={problem !== null && url !== ''}
          maxLength={RADIO_URL_MAX} value={url}
          onChange={(event) => { setUrl(event.target.value); setProblem(null) }}
          onKeyDown={(event) => { if (event.key === 'Enter') addTyped() }} />
        <button type="button" className={`nodrag ${styles.mini}`} aria-label="Add" title="Add station" disabled={full} onClick={addTyped}>+</button>
      </div>
      <div className={nodeStyles.propRow}
        title="Search the open radio-browser.info directory. Only stations the board can play are listed. Press Enter to search.">
        <span className={nodeStyles.propKey}>find station</span>
        <input className={input} type="search" aria-label="Search radio-browser.info" value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') void runSearch() }} />
        <button type="button" className={`nodrag ${styles.mini}`} aria-label="Search" title="Search" disabled={searching} onClick={() => void runSearch()}>
          {searching ? '…' : '⌕'}
        </button>
      </div>
      {problem && <div className={styles.error} role="alert">{problem}</div>}
      {results && results.length === 0 && <div className={styles.error} role="status">No playable stations found.</div>}
      {results && results.length > 0 && (
        <ul className={`nowheel ${styles.list} ${styles.results}`} aria-label="Search results">
          {results.map((result) => {
            const added = has(result.url)
            const facts = [result.codec, result.bitrateKbps ? `${result.bitrateKbps} kbps` : '', result.country].filter(Boolean).join(' · ')
            return (
              <li className={styles.station} key={result.url}>
                <span className={styles.stationName} title={`${result.name}\n${facts}\n${result.url}`}>{result.name}</span>
                <button
                  type="button"
                  className={`nodrag ${styles.mini}`}
                  disabled={added || full}
                  aria-label={added ? `${result.name} is in the list` : `Add ${result.name}`}
                  title={added ? 'In the list' : `Add (${facts})`}
                  onClick={() => save([...stations, { name: result.name, url: result.url }])}
                >
                  {added ? '✓' : '+'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className={styles.actions}>
        <label className={`nodrag ${styles.link}`} title="Add the stations in an .m3u playlist">
          import .m3u
          <input className={styles.fileInput} type="file" accept=".m3u,.m3u8,audio/x-mpegurl,text/plain"
            aria-label="Import a playlist" disabled={full || disabled}
            onChange={(event) => { void importPlaylist(event.target.files?.[0]); event.target.value = '' }} />
        </label>
        <button type="button" className={`nodrag ${styles.link}`} disabled={stations.length === 0}
          title={`Save the list as ${PLAYLIST_FILE}. On the SD card it replaces the built-in stations at start-up.`}
          onClick={exportPlaylist}>
          save {PLAYLIST_FILE}
        </button>
      </div>

      <BoardNetworkNote nodeId={nodeId} />

      <div className={nodeStyles.propRow}
        title={`Serve a page at ${pageAddress} for choosing a station from a phone on the same network. Anyone on the network can choose; adding and removing needs the access code.`}>
        <span className={nodeStyles.propKey}>phone page</span>
        <input className="nodrag" type="checkbox" aria-label="Phone station page" checked={props.stationPage === true}
          onChange={(event) => updateNodeProperty(nodeId, 'stationPage', event.target.checked)} />
      </div>
      {props.stationPage === true && (
        <div className={nodeStyles.propRow}
          title={`Lets the page at ${pageAddress} add and remove stations. 6 to 32 characters; empty allows choosing only. Stored in this browser only.`}>
          <label className={nodeStyles.propKey} htmlFor={`${nodeId}-radio-code`}>access code</label>
          <WifiPasswordInput id={`${nodeId}-radio-code`} className={input} value={accessCode}
            onChange={(code) => setCredentials(nodeId, { accessCode: code })} />
        </div>
      )}
      {props.stationPage === true && codeProblem && <div className={styles.error} role="alert">{codeProblem}</div>}
    </fieldset>
  )
}
