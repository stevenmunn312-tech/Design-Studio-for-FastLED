import { useRef } from 'react'
import { useMusicStore } from '../../state/musicStore'
import { useGraphStore } from '../../state/graphStore'
import { performanceOptionsFromProperties } from '../../codegen/performanceGenerator'
import { shouldConsumeWheel } from './wheelBehavior'
import styles from './MusicLibraryNodeBody.module.css'

// The full Music Library UI, embedded directly in the MusicLibrary canvas node
// (drop MP3s → analyse → export). Interactive controls carry `nodrag` so React
// Flow doesn't pan/drag the node while you use them. The song list keeps wheel
// input for itself only while it can actually scroll; otherwise the canvas can
// still zoom under the pointer.

const STATUS_LABEL: Record<string, string> = {
  pending:   'Pending',
  analyzing: 'Analyzing…',
  done:      'Ready',
  error:     'Error',
}

const SECTIONS = ['intro', 'verse', 'buildup', 'drop', 'chorus', 'bridge', 'outro'] as const

export default function MusicLibraryNodeBody({ nodeId }: { nodeId: string }) {
  const { entries, addFiles, retryFailed, removeEntry, clearAll } = useMusicStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const performanceProperties = useGraphStore((s) => {
    const perfId = s.edges.find((edge) =>
      edge.source === nodeId && edge.sourceHandle === 'music'
    )?.target
    const connected = perfId
      ? s.nodes.find((node) => node.id === perfId && node.data.nodeType === 'PerformanceGenerator')
      : undefined
    return (connected ?? s.nodes.find((node) => node.data.nodeType === 'PerformanceGenerator'))?.data.properties
  })

  const doneCount    = entries.filter(e => e.status === 'done').length
  const analyzingAny = entries.some(e => e.status === 'analyzing')
  const failedCount  = entries.filter(e => e.status === 'error').length

  function handleFiles(files: FileList | null) {
    if (!files) return
    addFiles(Array.from(files), performanceOptionsFromProperties(performanceProperties ?? {}))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    handleFiles(e.dataTransfer.files)
  }

  function handleSongListWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (shouldConsumeWheel(e.currentTarget, e.deltaY)) e.stopPropagation()
  }

  return (
    <div className={`nodrag ${styles.wrap}`}>
      {/* Drop zone */}
      <div
        className={`nodrag ${styles.dropZone}`}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
      >
        <span className={styles.dropIcon}>♪</span>
        <span>Drop MP3s here or click to browse</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
          multiple
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {/* Song list */}
      {entries.length > 0 && (
        <div className={styles.songList} onWheelCapture={handleSongListWheel}>
          {entries.map(entry => (
            <div key={entry.id} className={styles.songRow}>
              <div className={styles.songInfo}>
                <span className={styles.songTitle}>{entry.analysis?.title ?? entry.file.name}</span>
                {entry.analysis && (
                  <span className={styles.songMeta}>
                    {entry.analysis.beats.bpm} BPM · {entry.analysis.mood.key} ·{' '}
                    {(entry.analysis.durationMs / 60000).toFixed(1)} min ·{' '}
                    {entry.show?.events.length ?? 0} events
                  </span>
                )}
                {entry.error && <span className={styles.songError}>{entry.error}</span>}
              </div>
              <div className={styles.songActions}>
                <span className={`${styles.badge} ${styles[`badge_${entry.status}`]}`}>
                  {STATUS_LABEL[entry.status]}
                </span>
                <button
                  className={`nodrag ${styles.removeBtn}`}
                  onClick={() => removeEntry(entry.id)}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className={styles.footer}>
        <button
          className={`nodrag ${styles.secondaryBtn}`}
          onClick={clearAll}
          disabled={entries.length === 0}
        >
          Clear
        </button>
        <div className={styles.footerRight}>
          {/* Analysis starts on its own when songs are added, so there is no
              button for the normal path. This appears only when a song failed
              — the one case the user has to decide about. */}
          {failedCount > 0 && (
            <button
              className={`nodrag ${styles.primaryBtn}`}
              onClick={() => retryFailed(performanceOptionsFromProperties(performanceProperties ?? {}))}
              disabled={analyzingAny}
            >
              {analyzingAny ? 'Analyzing…' : `Retry ${failedCount}`}
            </button>
          )}
        </div>
      </div>

      {/* Section colour legend (shown once at least one song is analysed) */}
      {doneCount > 0 && (
        <div className={styles.legend}>
          {SECTIONS.map(s => (
            <span key={s} className={`${styles.legendChip} ${styles[`section_${s}`]}`}>{s}</span>
          ))}
        </div>
      )}

      <p className={styles.credit}>
        Music analysis uses Essentia.js / Essentia. Origin:{' '}
        <a
          href="http://essentia.upf.edu"
          target="_blank"
          rel="noreferrer"
        >
          http://essentia.upf.edu
        </a>
      </p>
    </div>
  )
}
