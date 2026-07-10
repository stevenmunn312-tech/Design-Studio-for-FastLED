import { useMemo, useRef, useState } from 'react'
import { decompressFrames, parseGIF, type ParsedFrame } from 'gifuct-js'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import {
  ANIMATED_IMAGE_MAX_FRAMES,
  asAnimatedImage,
  asImage,
  IMAGE_MAX_DIM,
  type AnimatedImageData,
  type ImageData,
} from '../../state/image'
import styles from './ImageNodeBody.module.css'

// The Image node accepts either a still image or an animation (GIF/APNG/WebP).
// A still is stored in `properties.image`, an animation in `properties.animation`
// — loading one clears the other so the evaluator/codegen have a single source.
// Note: the loaded state shows *controls only*, not a thumbnail — StudioNode
// already renders the generic frame NodePreview for this node.

interface DecodedVideoFrame {
  displayWidth: number
  displayHeight: number
  duration?: number | null
  close(): void
}

interface BrowserImageDecoder {
  tracks: { ready: Promise<void>; selectedTrack?: { frameCount: number } }
  decode(options: { frameIndex: number }): Promise<{ image: DecodedVideoFrame }>
  close(): void
}

type BrowserImageDecoderConstructor = new (options: { data: ArrayBuffer; type: string }) => BrowserImageDecoder

function mimeFor(file: File) {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  return 'image/png'
}

// A file whose format *can* carry multiple frames — worth attempting an animated
// decode. A single-frame file of these types falls back to the still path.
function isAnimatableFormat(file: File) {
  const mime = mimeFor(file)
  return mime === 'image/gif' || mime === 'image/webp' || /\.(gif|apng|webp)$/i.test(file.name)
}

function canvasFrame(ctx: CanvasRenderingContext2D, w: number, h: number): ImageData {
  const data = ctx.getImageData(0, 0, w, h).data
  const pixels: number[] = []
  const alpha: number[] = []
  let hasTransparency = false
  for (let i = 0; i < w * h; i++) {
    pixels.push(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    alpha.push(data[i * 4 + 3])
    if (data[i * 4 + 3] < 255) hasTransparency = true
  }
  return hasTransparency ? { w, h, pixels, alpha } : { w, h, pixels }
}

function decodeGif(buffer: ArrayBuffer): AnimatedImageData {
  const gif = parseGIF(buffer)
  const decoded = decompressFrames(gif, true).slice(0, ANIMATED_IMAGE_MAX_FRAMES)
  if (decoded.length === 0) throw new Error('No GIF frames found')
  const source = document.createElement('canvas')
  source.width = gif.lsd.width; source.height = gif.lsd.height
  const sourceCtx = source.getContext('2d')
  const ratio = Math.min(1, IMAGE_MAX_DIM / Math.max(source.width, source.height))
  const w = Math.max(1, Math.round(source.width * ratio))
  const h = Math.max(1, Math.round(source.height * ratio))
  const output = document.createElement('canvas')
  output.width = w; output.height = h
  const outputCtx = output.getContext('2d')
  if (!sourceCtx || !outputCtx) throw new Error('Could not read image')

  const frames: ImageData[] = []
  const durations: number[] = []
  let previous: ParsedFrame | null = null
  let previousRestore: globalThis.ImageData | null = null
  for (const frame of decoded) {
    if (previous?.disposalType === 2) {
      sourceCtx.clearRect(previous.dims.left, previous.dims.top, previous.dims.width, previous.dims.height)
    } else if (previous?.disposalType === 3 && previousRestore) {
      sourceCtx.putImageData(previousRestore, 0, 0)
    }
    const restore = frame.disposalType === 3 ? sourceCtx.getImageData(0, 0, source.width, source.height) : null
    const patch = document.createElement('canvas')
    patch.width = frame.dims.width; patch.height = frame.dims.height
    const patchCtx = patch.getContext('2d')
    if (!patchCtx) throw new Error('Could not compose image')
    patchCtx.putImageData(new globalThis.ImageData(frame.patch, frame.dims.width, frame.dims.height), 0, 0)
    sourceCtx.drawImage(patch, frame.dims.left, frame.dims.top)
    outputCtx.clearRect(0, 0, w, h)
    outputCtx.drawImage(source, 0, 0, w, h)
    frames.push(canvasFrame(outputCtx, w, h))
    durations.push(Math.max(16, frame.delay || 100))
    previous = frame
    previousRestore = restore
  }
  return { frames, durations }
}

async function decodeAnimatedFile(file: File): Promise<AnimatedImageData> {
  const buffer = await file.arrayBuffer()
  if (mimeFor(file) === 'image/gif') return decodeGif(buffer)
  const Decoder = (globalThis as unknown as { ImageDecoder?: BrowserImageDecoderConstructor }).ImageDecoder
  if (!Decoder) throw new Error('APNG/WebP animation decoding is not supported by this browser; GIF works everywhere')
  const decoder = new Decoder({ data: buffer, type: mimeFor(file) })
  try {
    await decoder.tracks.ready
    const available = decoder.tracks.selectedTrack?.frameCount ?? 0
    if (available < 1) throw new Error('No image frames found')
    const frameCount = Math.min(available, ANIMATED_IMAGE_MAX_FRAMES)
    const frames: ImageData[] = []
    const durations: number[] = []
    let canvas: HTMLCanvasElement | null = null
    let ctx: CanvasRenderingContext2D | null = null
    let w = 0, h = 0

    for (let i = 0; i < frameCount; i++) {
      const result = await decoder.decode({ frameIndex: i })
      const frame = result.image
      if (!canvas) {
        const ratio = Math.min(1, IMAGE_MAX_DIM / Math.max(frame.displayWidth, frame.displayHeight))
        w = Math.max(1, Math.round(frame.displayWidth * ratio))
        h = Math.max(1, Math.round(frame.displayHeight * ratio))
        canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        ctx = canvas.getContext('2d')
        if (!ctx) { frame.close(); throw new Error('Could not read image') }
      }
      ctx!.clearRect(0, 0, w, h)
      ctx!.drawImage(frame as unknown as CanvasImageSource, 0, 0, w, h)
      frames.push(canvasFrame(ctx!, w, h))
      durations.push(Math.max(16, Math.round((frame.duration ?? 100_000) / 1000)))
      frame.close()
    }
    return { frames, durations }
  } finally {
    decoder.close()
  }
}

// Decode a plain still (jpg/png/single-frame webp) via an <img> element.
function loadStillImage(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
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
      if (!ctx) { reject(new Error('Could not read image')); return }
      ctx.drawImage(el, 0, 0, w, h)
      resolve(canvasFrame(ctx, w, h))
    }
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')) }
    el.src = url
  })
}

export default function ImageNodeBody({ nodeId }: { nodeId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const setStatus = useUiStore((s) => s.setStatus)
  // Select the *raw* stored values (stable references until they actually
  // change) — validating inside the selector would return a fresh object every
  // render and spin useSyncExternalStore into an infinite loop.
  const raw = useGraphStore((s) => {
    const node = s.nodes.find((n) => n.id === nodeId)
    const props = node?.data.properties as Record<string, unknown> | undefined
    return { image: props?.image, animation: props?.animation }
  })
  const imgData = useMemo(() => asImage(raw.image), [raw.image])
  const animation = useMemo(() => asAnimatedImage(raw.animation), [raw.animation])

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/') && !/\.(gif|png|apng|webp|jpe?g|bmp)$/i.test(file.name)) return
    setLoading(true)
    try {
      // A GIF/APNG/WebP with more than one frame becomes an animation; anything
      // else (including a single-frame version of those) becomes a still.
      if (isAnimatableFormat(file)) {
        const decoded = await decodeAnimatedFile(file)
        if (decoded.frames.length > 1) {
          updateNodeProperty(nodeId, 'image', undefined)
          updateNodeProperty(nodeId, 'animation', decoded)
          const capped = decoded.frames.length === ANIMATED_IMAGE_MAX_FRAMES ? ' (frame limit reached)' : ''
          setStatus(`Loaded animation (${decoded.frames.length} frames)${capped}`, 'success')
          return
        }
        updateNodeProperty(nodeId, 'animation', undefined)
        updateNodeProperty(nodeId, 'image', decoded.frames[0])
        return
      }
      const still = await loadStillImage(file)
      updateNodeProperty(nodeId, 'animation', undefined)
      updateNodeProperty(nodeId, 'image', still)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load image', 'error')
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
    updateNodeProperty(nodeId, 'image', undefined)
    updateNodeProperty(nodeId, 'animation', undefined)
  }

  const loaded = animation ?? imgData
  const dims = animation
    ? `${animation.frames[0].w}×${animation.frames[0].h} · ${animation.frames.length}f`
    : imgData
      ? `${imgData.w}×${imgData.h}`
      : ''

  return (
    <div className={`nodrag ${styles.wrap}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.gif,.apng,.webp"
        style={{ display: 'none' }}
        onChange={(event) => {
          if (event.target.files?.[0]) void handleFile(event.target.files[0])
          event.target.value = ''
        }}
      />
      {loaded ? (
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
          <span className={styles.dropIcon}>[ {loading ? '...' : 'img'} ]</span>
          <span>{loading ? 'Decoding…' : 'Drop image or GIF'}</span>
        </div>
      )}
    </div>
  )
}
