import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import styles from './CustomDisplayNodeBody.module.css'

export default function CustomDisplayNodeBody({ nodeId }: { nodeId: string }) {
  const displayId = useGraphStore((state) => {
    const node = state.nodes.find((entry) => entry.id === nodeId)
    return String(node?.data.properties.displayId ?? nodeId)
  })
  const document = useGraphStore((state) => state.displayDocuments[displayId])
  const openDisplayWorkspace = useUiStore((state) => state.openDisplayWorkspace)

  return (
    <div className={styles.body}>
      <div className={styles.summary}>
        <span>{document ? `${document.designSize.width} × ${document.designSize.height}` : 'No document'}</span>
        <span>{document?.widgets.length ?? 0} widget{document?.widgets.length === 1 ? '' : 's'}</span>
      </div>
      <button
        type="button"
        className={`nodrag ${styles.edit}`}
        disabled={!document}
        onClick={() => openDisplayWorkspace(displayId)}
      >
        Edit display
      </button>
    </div>
  )
}
