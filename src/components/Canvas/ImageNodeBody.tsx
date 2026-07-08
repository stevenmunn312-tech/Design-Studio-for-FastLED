import { useRef, useMemo } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { asImage, IMAGE_MAX_DIM } from '../../state/image'
import styles from './ImageNodeBody.module.css'

// Note: the loaded state deliberately shows *controls only*, not a thumbnail —
// StudioNode already renders the generic frame NodePreview for this node (its
// primary output is a frame), so a thumbnail here would be a second preview.

function loadImageFile(
  file: File,
  onDone: (data: { w: number; h: number; pixels: number[]; alpha?: number[] }) => void,
) {
  const url = URL.createObjectURL(file)
  const el = new Image()
  el.onload = () => {
    const ratio = Math.min(1, IMAGE_MAX_DIM / Math.max(el.width, el.height))
    const w = Math.max(1, Math.round(el.width * ratio))
    const h = Math.max(1, Math.round(el.height * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    URL.revokeObjectURL(url)
    if (!ctx) return
    ctx.drawImage(el, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h).data
    const pixels: number[] = []
    const alpha: number[] = []
    let hasTransparency = false
    for (let i = 0; i < w * h; i++) {
      pixels.push(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
      alpha.push(data[i * 4 + 3])
      if (data[i * 4 + 3] < 255) hasTransparency = true
    }
    onDone(hasTransparency ? { w, h, pixels, alpha } : { w, h, pixels })
  }
  el.onerror = () => URL.revokeObjectURL(url)
  el.src = url
}

export default function ImageNodeBody({ nodeId }: { nodeId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const updateNodeProperty = useGraphStore(s => s.updateNodeProperty)
  // Select the *raw* stored value (a stable reference until the property
  // actually changes) — validating with asImage() inside the selector would
  // return a fresh object every render and spin useSyncExternalStore into an
  // infinite loop ("getSnapshot should be cached").
  const rawImage = useGraphStore(s => {
    const node = s.nodes.find(n => n.id === nodeId)
    return node ? (node.data.properties as Record<string, unknown>).image : undefined
  })
  const imgData = useMemo(() => asImage(rawImage), [rawImage])

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return
    loadImageFile(file, data => updateNodeProperty(nodeId, 'image', data))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className={`nodrag ${styles.wrap}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = '' }}
      />

      {imgData ? (
        <div className={styles.meta}>
          <span className={styles.dims}>{imgData.w}×{imgData.h}</span>
          <button
            className={`nodrag ${styles.replaceBtn}`}
            onClick={() => fileInputRef.current?.click()}
            title="Replace image"
          >
            Replace
          </button>
          <button
            className={`nodrag ${styles.clearBtn}`}
            onClick={() => updateNodeProperty(nodeId, 'image', undefined)}
            title="Remove image"
          >
            ✕
          </button>
        </div>
      ) : (
        <div
          className={`nodrag ${styles.dropZone}`}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className={styles.dropIcon}>[ img ]</span>
          <span>Drop image or click to upload</span>
        </div>
      )}
    </div>
  )
}
