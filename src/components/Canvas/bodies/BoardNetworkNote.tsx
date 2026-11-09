import { boardPartitionOf, rootGraphNodes, useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { EMPTY_CREDENTIALS, useNetworkCredentialsStore } from '../../../state/peripherals/networkCredentials'
import { wiredNetworkIn, wiredNetworkPhrase } from '../../../state/peripherals/ethernetModule'
import { boardNetworkCredentialsKey, boardNetworkIdentity } from '../../../state/peripherals/boardNetwork'
import { boardOrdinalLabel, useBoardNodes, useNodeBoardId } from '../../Hardware/boardSelection'
import styles from './BoardNetworkNote.module.css'

/**
 * Whose network a network node joins, said on the node: the Board's, which
 * every network user on that board shares (state/peripherals/boardNetwork.ts).
 * The node keeps only its protocol settings; the name, address and Wi-Fi are
 * set once in the Board's Network settings, which the button opens.
 */
export default function BoardNetworkNote({ nodeId }: { nodeId: string }) {
  const boardId = useNodeBoardId(nodeId)
  const boards = useBoardNodes()
  const hostname = useGraphStore((s) => boardNetworkIdentity(rootGraphNodes(s).find((node) => node.id === boardId)).hostname)
  const wired = useGraphStore((s) => {
    const network = wiredNetworkIn(boardPartitionOf(s, boardId).nodes)
    return network ? wiredNetworkPhrase(network) : null
  })
  const ssid = useNetworkCredentialsStore((s) => (s.byNodeId[boardNetworkCredentialsKey({ id: boardId })] ?? EMPTY_CREDENTIALS).ssid)
  const board = boards.length > 1 ? boardOrdinalLabel(boards, boardId) : 'The Board'

  const openSettings = () => {
    const ui = useUiStore.getState()
    ui.setActiveBoardId(boardId)
    ui.openHardwareBoardMenu()
  }

  const text = wired
    ? `Joins the network as ${hostname} through ${wired}.`
    : ssid
      ? `Joins “${ssid}” as ${hostname}.`
      : `${board} has no Wi-Fi name yet.`
  return (
    <div className={styles.note}>
      <span>{text}</span>
      <button type="button" className={`nodrag ${styles.button}`} onClick={openSettings}
        title={`Hostname, Wi-Fi and address are ${board === 'The Board' ? 'the Board' : board}'s, shared by every network node on it`}>
        Network settings
      </button>
    </div>
  )
}
