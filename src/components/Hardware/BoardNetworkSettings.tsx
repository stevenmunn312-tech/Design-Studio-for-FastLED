import { boardPartitionOf, rootGraphNodes, useGraphStore } from '../../state/graphStore'
import { EMPTY_CREDENTIALS, useNetworkCredentialsStore } from '../../state/peripherals/networkCredentials'
import { wiredNetworkIn, wiredNetworkPhrase } from '../../state/peripherals/ethernetModule'
import {
  BOARD_HOSTNAME_MAX, boardHostnameProblem, boardNetworkCredentialsKey, defaultBoardHostname,
} from '../../state/peripherals/boardNetwork'
import { networkUsedIn, parseIpv4Literal } from '../../codegen/peripherals/networkCpp'
import { propertyDescription } from '../../state/nodeLibrary'
import WifiPasswordInput from '../Canvas/WifiPasswordInput'
import styles from './BoardNetworkSettings.module.css'

const ADDRESS_FIELDS = [
  { key: 'staticIp', label: 'Static IP', placeholder: '192.168.1.50' },
  { key: 'staticGateway', label: 'Gateway', placeholder: '192.168.1.1' },
  { key: 'staticSubnet', label: 'Subnet mask', placeholder: '255.255.255.0' },
  { key: 'staticDns', label: 'DNS', placeholder: 'the gateway' },
] as const

/**
 * The Board's Network group: the one identity every network user on this
 * board shares (state/peripherals/boardNetwork.ts). The name and addressing
 * are Board properties; the Wi-Fi name and password are kept on this machine
 * under the Board's id, never in the project. A cable replaces the radio but
 * not the name or the address, so only the Wi-Fi fields give way to it.
 */
export default function BoardNetworkSettings({ boardNodeId }: { boardNodeId: string }) {
  const updateNodeProperty = useGraphStore((state) => state.updateNodeProperty)
  const props = useGraphStore((state) =>
    rootGraphNodes(state).find((node) => node.id === boardNodeId)?.data.properties) as Record<string, unknown> | undefined
  // Asked of this board's own partition: a network node or cable on another
  // board is that board's business.
  const used = useGraphStore((state) => networkUsedIn(boardPartitionOf(state, boardNodeId).nodes))
  const wired = useGraphStore((state) => {
    const network = wiredNetworkIn(boardPartitionOf(state, boardNodeId).nodes)
    return network ? wiredNetworkPhrase(network) : null
  })
  const key = boardNetworkCredentialsKey({ id: boardNodeId })
  const credentials = useNetworkCredentialsStore((state) => state.byNodeId[key] ?? EMPTY_CREDENTIALS)
  const setCredentials = useNetworkCredentialsStore((state) => state.setCredentials)

  const hostname = typeof props?.wifiHostname === 'string' ? props.wifiHostname : ''
  const hostnameProblem = boardHostnameProblem(hostname.trim())
  const useDhcp = props?.useDhcp !== false
  const id = (field: string) => `${boardNodeId}-network-${field}`

  return (
    <section className={styles.network} aria-label="Board network">
      <div className={styles.header}>
        <strong>Network</strong>
        <span>
          {used
            ? 'Every network feature on this board joins as this board: Art-Net, sACN, DDP, the Web Remote, NTP time, Frame Stream, internet radio and clock sync.'
            : 'Nothing on this board uses the network yet. These settings apply once something does.'}
        </span>
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={id('hostname')}>Hostname</label>
        <input
          id={id('hostname')}
          className={`nodrag ${styles.fieldInput}`}
          type="text"
          autoComplete="off"
          maxLength={BOARD_HOSTNAME_MAX}
          title={propertyDescription('Board', 'wifiHostname')}
          aria-invalid={hostnameProblem !== null}
          value={hostname}
          placeholder={defaultBoardHostname(boardNodeId)}
          onChange={(event) => updateNodeProperty(boardNodeId, 'wifiHostname', event.target.value)}
        />
        {hostnameProblem && <span className={styles.problem} role="alert">The hostname {hostnameProblem}.</span>}
      </div>
      {wired ? (
        <div className={styles.note}>This board reaches the network through {wired}, so it needs no Wi-Fi name or password.</div>
      ) : (
        <>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={id('ssid')}>Wi-Fi SSID</label>
            <input
              id={id('ssid')}
              className={`nodrag ${styles.fieldInput}`}
              type="text"
              autoComplete="off"
              value={credentials.ssid}
              onChange={(event) => setCredentials(key, { ssid: event.target.value })}
              placeholder="network name"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={id('password')}>Wi-Fi password</label>
            <WifiPasswordInput
              id={id('password')}
              className={`nodrag ${styles.fieldInput}`}
              value={credentials.password}
              onChange={(password) => setCredentials(key, { password })}
            />
          </div>
          <div className={styles.note}>Stored in this browser only — never saved in the project file or share links.</div>
        </>
      )}
      <label className={styles.toggle} title={propertyDescription('Board', 'useDhcp')}>
        <input
          type="checkbox"
          checked={useDhcp}
          onChange={(event) => updateNodeProperty(boardNodeId, 'useDhcp', event.target.checked)}
        />
        <span>Get an address from the router (DHCP)</span>
      </label>
      {!useDhcp && ADDRESS_FIELDS.map((field) => {
        const value = typeof props?.[field.key] === 'string' ? String(props[field.key]) : ''
        // DNS may stay empty; the other three must each be an address.
        const invalid = field.key === 'staticDns'
          ? value.trim() !== '' && parseIpv4Literal(value) === null
          : parseIpv4Literal(value) === null
        return (
          <div className={styles.field} key={field.key}>
            <label className={styles.fieldLabel} htmlFor={id(field.key)}>{field.label}</label>
            <input
              id={id(field.key)}
              className={`nodrag ${styles.fieldInput}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              title={propertyDescription('Board', field.key)}
              aria-invalid={invalid}
              value={value}
              placeholder={field.placeholder}
              onChange={(event) => updateNodeProperty(boardNodeId, field.key, event.target.value)}
            />
          </div>
        )
      })}
    </section>
  )
}
