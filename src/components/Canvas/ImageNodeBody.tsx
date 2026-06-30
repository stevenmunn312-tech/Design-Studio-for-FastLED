import { useRef, useMemo } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { asImage, IMAGE_MAX_DIM } from '../../state/image'
import styles from './ImageNodeBody.module.css'

function loadImageFile(
  file: File,
  onDone: (data: { w: number; h: number; pixels: number[] }) => void,
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
    for (let i = 0; i < w * h; i++) pixels.push(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    onDone({ w, h, pixels })
  }
  el.onerror = () => URL.revokeObjectURL(url)
  el.src = url
}

function pixelsToDataUrl(w: number, h: number, pixels: number[]): string {
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const raw = ctx.createImageData(w, h)
  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
    raw.data[j] = pixels[i]; raw.data[j + 1] = pixels[i + 1]
    raw.data[j + 2] = pixels[i + 2]; raw.data[j + 3] = 255
  }
  ctx.putImageData(raw, 0, 0)
  return canvas.toDataURL()
}

export default function ImageNodeBody({ nodeId }: { nodeId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const updateNodeProperty = useGraphStore(s => s.updateNodeProperty)
  const imgData = useGraphStore(s => {
    const node = s.nodes.find(n => n.id === nodeId)
    return node ? asImage((node.data.properties as Record<string, unknown>).image) : null
  })

  // Reconstruct a data URL from stored pixels — only recomputed when pixels change.
  const thumbUrl = useMemo(
    () => imgData ? pixelsToDataUrl(imgData.w, imgData.h, imgData.pixels) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imgData?.pixels],
  )

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

      {imgData && thumbUrl ? (
        <div className={styles.preview}>
          <img
            className={styles.thumb}
            src={thumbUrl}
            alt="uploaded image"
            onClick={() => fileInputRef.current?.click()}
            title="Click to replace"
          />
          <div className={styles.meta}>
            <span className={styles.dims}>{imgData.w}×{imgData.h}</span>
            <button
              className={`nodrag ${styles.clearBtn}`}
              onClick={() => updateNodeProperty(nodeId, 'image', undefined)}
              title="Remove image"
            >
              ✕
            </button>
          </div>
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
