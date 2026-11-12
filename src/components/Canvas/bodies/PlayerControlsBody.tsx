import { rootGraphEdges, rootGraphNodes, useGraphStore } from '../../../state/graphStore'
import { controlChainDestinations } from '../../../codegen/player/playerDisplays'
import { NODE_LIBRARY, nodeDisplayLabel } from '../../../state/nodeLibrary'
import styles from './PlayerControlsBody.module.css'

/**
 * Every node a Controls wire can end at, read from the definitions: a node
 * takes the bundle when it declares a `controls` input of that type. Player
 * Controls itself chains through Controls In, so it is not among them. The
 * LED output keeps its code name only in code.
 */
const CONTROLS_CONSUMERS = NODE_LIBRARY
  .filter((def) => def.inputs.some((port) => port.id === 'controls' && port.dataType === 'playercontrols'))
  .map((def) => (def.type === 'MatrixOutput' ? 'LED output' : def.label))

const PLAYER_CONTROLS_IDLE_HINT = `Wire Controls into a ${
  CONTROLS_CONSUMERS.length > 1
    ? `${CONTROLS_CONSUMERS.slice(0, -1).join(', ')} or ${CONTROLS_CONSUMERS[CONTROLS_CONSUMERS.length - 1]}`
    : CONTROLS_CONSUMERS.join('')
}`

/**
 * Where this node's Controls go.
 *
 * The rows on the node are jobs — Play / Pause, Volume — and the thing that
 * does them is wherever the Controls wire ends, possibly through more Player
 * Controls. Naming it here is what makes a row mean something on its own:
 * "Next" is a different promise to a Music Player than to nothing at all.
 */
export default function PlayerControlsBody({ nodeId }: { nodeId: string }) {
  // Joined into a string so the selector stays referentially stable.
  const targets = useGraphStore((state) => {
    const nodes = rootGraphNodes(state)
    const byId = new Map(nodes.map((node) => [node.id, node]))
    return [...controlChainDestinations(nodeId, rootGraphEdges(state) as never, byId as never)]
      .flatMap((id) => {
        const node = byId.get(id)
        return node ? [nodeDisplayLabel(node.data.nodeType, node.data.properties, String(node.data.label ?? node.data.nodeType))] : []
      })
      .sort()
      .join(', ')
  })

  return (
    <div className={`nodrag ${styles.target}`} aria-label="Controls destination">
      {targets
        ? <><span className={styles.arrow} aria-hidden>→</span> {targets}</>
        : <span className={styles.idle}>{PLAYER_CONTROLS_IDLE_HINT}</span>}
    </div>
  )
}
