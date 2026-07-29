import { useMemo, useRef, useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { asWireframeMesh, parseWireframeMeshFile, WIREFRAME_DECIMATE_INPUT_MAX_VERTS } from '../../state/wireframeModel'
import styles from './ImageNodeBody.module.css'

// Only relevant when `model === 'custom'` (StudioNode gates rendering this
// body on that). The uploaded mesh lives in `properties.mesh` — validated,
// excluded from the generic property list, and consumed identically by the
// evaluator and the C++ generator. Note: no bespoke preview canvas here — the
// node's `frame` output already gets the generic live NodePreview thumbnail.

export default function Wireframe3DNodeBody({ nodeId }: { nodeId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const setStatus = useUiStore((s) => s.setStatus)
  const rawMesh = useGraphStore((s) => {
    const node = s.nodes.find((n) => n.id === nodeId)
    const props = node?.data.properties as Record<string, unknown> | undefined
    return props?.mesh
  })
  const mesh = useMemo(() => asWireframeMesh(rawMesh), [rawMesh])

  async function handleFile(file: File) {
    if (!/\.(json|obj)$/i.test(file.name)) {
      setStatus('Model must be a .json or .obj file', 'error')
      return
    }
    setLoading(true)
    try {
      const text = await file.text()
      const result = parseWireframeMeshFile(file.name, text)
      if (!result) {
        setStatus(`Could not read model (too complex to simplify — max ${WIREFRAME_DECIMATE_INPUT_MAX_VERTS} verts)`, 'error')
        return
      }
      updateNodeProperty(nodeId, 'mesh', result.mesh)
      const counts = `${result.mesh.vertices.length / 3} verts, ${result.mesh.edges.length / 2} edges`
      setStatus(result.decimated ? `Loaded model, simplified to fit (${counts})` : `Loaded model (${counts})`, 'success')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load model', 'error')
    } finally {
      setLoading(false)
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault(); event.stopPropagation()
    const file = event.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  function clear() {
    updateNodeProperty(nodeId, 'mesh', undefined)
  }

  const dims = mesh ? `${mesh.vertices.length / 3}v · ${mesh.edges.length / 2}e` : ''

  return (
    <div className={`nodrag ${styles.wrap}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.obj"
        style={{ display: 'none' }}
        onChange={(event) => {
          if (event.target.files?.[0]) void handleFile(event.target.files[0])
          event.target.value = ''
        }}
      />
      {mesh ? (
        <div className={styles.meta}>
          <span className={styles.dims}>{dims}</span>
          <button className={`nodrag ${styles.replaceBtn}`} onClick={() => fileInputRef.current?.click()} title="Replace">Replace</button>
          <button className={`nodrag ${styles.clearBtn}`} onClick={clear} title="Remove">✕</button>
        </div>
      ) : (
        <div
          className={`nodrag ${styles.dropZone}`}
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
          onClick={() => !loading && fileInputRef.current?.click()}
        >
          <span className={styles.dropIcon}>[ {loading ? '...' : '3d'} ]</span>
          <span>{loading ? 'Reading…' : 'Drop .json or .obj model'}</span>
        </div>
      )}
    </div>
  )
}
