import { useEffect, useMemo, useRef, useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { compositionDims } from '../../state/output/outputRouting'
import {
  asSdVideoClip, sdvBandwidth, sdvPath, SDV_BANDWIDTH_WARN, SDV_MAX_FPS,
} from '../../state/evaluator/sdVideo'
import { deleteSdVideo, getSdVideoBytes, loadSdVideo, onSdVideoChange, saveSdVideo } from '../../state/sdVideoStore'
import { decodeVideoToClip } from '../../utils/sdVideoImport'
import { copyToSdCard, listRemovableDrives, type RemovableDrive } from '../../utils/backendClient'
import styles from './ImageNodeBody.module.css'

const FPS_CHOICES = [10, 15, 24, 30, SDV_MAX_FPS]

// The SD Video node's controls. The frame preview above it is the generic one
// StudioNode already draws, so this is controls only: bring a clip in, and put
// it on the card.
export default function SdVideoNodeBody({ nodeId }: { nodeId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [fps, setFps] = useState(30)
  const [drives, setDrives] = useState<RemovableDrive[]>([])
  const [drive, setDrive] = useState('')
  const [, bump] = useState(0)
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const setStatus = useUiStore((s) => s.setStatus)
  const rawClip = useGraphStore((s) => {
    const node = s.nodes.find((n) => n.id === nodeId)
    return (node?.data.properties as Record<string, unknown> | undefined)?.clip
  })
  const clip = useMemo(() => asSdVideoClip(rawClip), [rawClip])

  // A project reopened cold has the clip's record but not its bytes in memory.
  useEffect(() => { if (clip) void loadSdVideo(clip.id) }, [clip])
  useEffect(() => onSdVideoChange(() => bump((n) => n + 1)), [])

  async function importFile(file: File) {
    if (!file.type.startsWith('video/') && !/\.(mp4|m4v|mov|webm|ogv|mkv|avi)$/i.test(file.name)) {
      setStatus('That is not a video file', 'error')
      return
    }
    const { nodes, edges } = useGraphStore.getState()
    const canvas = compositionDims(nodes, edges)
    setBusy('Decoding 0%')
    try {
      const imported = await decodeVideoToClip(file, { w: canvas.w, h: canvas.h }, fps, (done, total) => {
        setBusy(`Decoding ${Math.round((done / total) * 100)}%`)
      })
      const id = clip?.id ?? crypto.randomUUID()
      await saveSdVideo(id, imported.bytes)
      updateNodeProperty(nodeId, 'clip', {
        id, name: file.name, w: imported.w, h: imported.h, fps: imported.fps, frames: imported.frames,
      })
      const cut = imported.truncated ? ' (cut to the length limit)' : ''
      setStatus(`Imported ${imported.frames} frames at ${imported.w}×${imported.h}${cut}`, 'success')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import that video', 'error')
    } finally {
      setBusy(null)
    }
  }

  function remove() {
    if (clip) void deleteSdVideo(clip.id)
    updateNodeProperty(nodeId, 'clip', undefined)
  }

  async function refreshDrives() {
    const found = await listRemovableDrives()
    setDrives(found)
    setDrive((current) => (found.some((d) => d.path === current) ? current : found[0]?.path ?? ''))
    if (found.length === 0) setStatus('No removable drive found. Put the SD card in a reader.', 'info')
  }

  async function writeToCard() {
    const bytes = clip ? getSdVideoBytes(clip.id) : null
    if (!clip || !bytes || !drive) return
    setBusy('Writing…')
    try {
      let log = ''
      await copyToSdCard(
        { drive, files: [{ path: sdvPath(clip.name), data: new Blob([bytes as BlobPart]) }] },
        (chunk) => { log += chunk },
      )
      const failed = /\[error\]/.test(log)
      setStatus(failed ? log.trim().split('\n').pop() ?? 'Could not write the card' : `Wrote ${sdvPath(clip.name)} to ${drive}`,
        failed ? 'error' : 'success')
    } catch {
      setStatus('The helper is not running, so the card could not be written', 'error')
    } finally {
      setBusy(null)
    }
  }

  const bandwidth = clip ? sdvBandwidth(clip.w, clip.h, clip.fps) : 0
  const ready = !!clip && !!getSdVideoBytes(clip.id)

  return (
    <div className={`nodrag ${styles.wrap}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.m4v,.mov,.webm,.ogv,.mkv"
        style={{ display: 'none' }}
        onChange={(event) => {
          if (event.target.files?.[0]) void importFile(event.target.files[0])
          event.target.value = ''
        }}
      />
      {clip ? (
        <>
          <div className={styles.meta}>
            <span className={styles.dims} title={clip.name}>
              {clip.w}×{clip.h} · {clip.fps} fps · {clip.frames}f
            </span>
            <button className={`nodrag ${styles.replaceBtn}`} disabled={!!busy} onClick={() => fileInputRef.current?.click()} title="Import another video">Replace</button>
            <button className={`nodrag ${styles.clearBtn}`} disabled={!!busy} onClick={remove} title="Remove the clip">✕</button>
          </div>
          <div className={styles.meta}>
            <span className={styles.dims}>{sdvPath(clip.name)} · {Math.round(bandwidth / 1000)} KB/s</span>
          </div>
          {bandwidth > SDV_BANDWIDTH_WARN && (
            <div className={styles.dims}>Above what an ESP32 reliably reads. Lower the frame rate.</div>
          )}
          <div className={styles.meta}>
            <select
              className="nodrag"
              value={drive}
              onFocus={() => { void refreshDrives() }}
              onChange={(event) => setDrive(event.target.value)}
              aria-label="SD card drive"
            >
              {drives.length === 0 && <option value="">Choose a card…</option>}
              {drives.map((d) => <option key={d.path} value={d.path}>{d.path} {d.label}</option>)}
            </select>
            <button
              className={`nodrag ${styles.replaceBtn}`}
              disabled={!!busy || !drive || !ready}
              onClick={() => { void writeToCard() }}
              title="Copy this clip onto the SD card"
            >
              Write to card
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.meta}>
            <span className={styles.dims}>Frame rate</span>
            <select className="nodrag" value={fps} onChange={(event) => setFps(Number(event.target.value))} aria-label="Frame rate">
              {FPS_CHOICES.map((rate) => <option key={rate} value={rate}>{rate} fps</option>)}
            </select>
          </div>
          <div
            className={`nodrag ${styles.dropZone}`}
            onDrop={(event) => {
              event.preventDefault(); event.stopPropagation()
              const file = event.dataTransfer.files[0]
              if (file) void importFile(file)
            }}
            onDragOver={(event) => event.preventDefault()}
            onClick={() => !busy && fileInputRef.current?.click()}
          >
            <span className={styles.dropIcon}>[ {busy ? '...' : 'vid'} ]</span>
            <span>{busy ?? 'Drop a video'}</span>
          </div>
        </>
      )}
      {busy && clip && <div className={styles.dims}>{busy}</div>}
    </div>
  )
}
