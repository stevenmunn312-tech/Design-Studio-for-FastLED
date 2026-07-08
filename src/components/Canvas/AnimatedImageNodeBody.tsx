import { useMemo, useRef, useState } from 'react'
import { decompressFrames, parseGIF, type ParsedFrame } from 'gifuct-js'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import {
  ANIMATED_IMAGE_MAX_FRAMES,
  asAnimatedImage,
  IMAGE_MAX_DIM,
  type AnimatedImageData,
  type ImageData,
} from '../../state/image'
import styles from './ImageNodeBody.module.css'

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
  if (!sourceCtx || !outputCtx) throw new Error('Could not read animated GIF')

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
    if (!patchCtx) throw new Error('Could not compose animated GIF')
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
        if (!ctx) { frame.close(); throw new Error('Could not read animated image') }
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

export default function AnimatedImageNodeBody({ nodeId }: { nodeId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const setStatus = useUiStore((s) => s.setStatus)
  const rawAnimation = useGraphStore((s) => {
    const node = s.nodes.find((candidate) => candidate.id === nodeId)
    return node ? (node.data.properties as Record<string, unknown>).animation : undefined
  })
  const animation = useMemo(() => asAnimatedImage(rawAnimation), [rawAnimation])

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/') && !/\.(gif|png|apng|webp)$/i.test(file.name)) return
    setLoading(true)
    try {
      const decoded = await decodeAnimatedFile(file)
      updateNodeProperty(nodeId, 'animation', decoded)
      const capped = decoded.frames.length === ANIMATED_IMAGE_MAX_FRAMES ? ' (frame limit reached)' : ''
      setStatus(`Loaded animation (${decoded.frames.length} frames)${capped}`, 'success')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load animated image', 'error')
    } finally {
      setLoading(false)
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault(); event.stopPropagation()
    const file = event.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  return (
    <div className={`nodrag ${styles.wrap}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/gif,image/png,image/webp,.apng"
        style={{ display: 'none' }}
        onChange={(event) => {
          if (event.target.files?.[0]) void handleFile(event.target.files[0])
          event.target.value = ''
        }}
      />
      {animation ? (
        <div className={styles.meta}>
          <span className={styles.dims}>{animation.frames[0].w}×{animation.frames[0].h} · {animation.frames.length}f</span>
          <button className={`nodrag ${styles.replaceBtn}`} onClick={() => fileInputRef.current?.click()}>Replace</button>
          <button className={`nodrag ${styles.clearBtn}`} onClick={() => updateNodeProperty(nodeId, 'animation', undefined)} title="Remove animation">✕</button>
        </div>
      ) : (
        <div
          className={`nodrag ${styles.dropZone}`}
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
          onClick={() => !loading && fileInputRef.current?.click()}
        >
          <span className={styles.dropIcon}>[ {loading ? '...' : 'gif'} ]</span>
          <span>{loading ? 'Decoding frames…' : 'Drop GIF, APNG or WebP'}</span>
        </div>
      )}
    </div>
  )
}
