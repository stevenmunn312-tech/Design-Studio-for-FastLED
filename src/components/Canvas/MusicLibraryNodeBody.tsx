import { useRef } from 'react'
import { useMusicStore } from '../../state/musicStore'
import { exportShowPackage } from '../../utils/zipExport'
import styles from './MusicLibraryNodeBody.module.css'

// The full Music Library UI, embedded directly in the MusicLibrary canvas node
// (drop MP3s → analyse → export). Interactive controls carry `nodrag` so React
// Flow doesn't pan/drag the node while you use them, and the scrollable song
// list carries `nowheel` so wheeling it doesn't zoom the canvas.

const STATUS_LABEL: Record<string, string> = {
  pending:   'Pending',
  analyzing: 'Analyzing…',
  done:      'Ready',
  error:     'Error',
}

const SECTIONS = ['intro', 'verse', 'buildup', 'drop', 'chorus', 'bridge', 'outro'] as const

export default function MusicLibraryNodeBody() {
  const { entries, engine, addFiles, analyzeAll, removeEntry, clearAll, setEngine } = useMusicStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const doneCount    = entries.filter(e => e.status === 'done').length
  const analyzingAny = entries.some(e => e.status === 'analyzing')

  function handleFiles(files: FileList | null) {
    if (!files) return
    addFiles(Array.from(files))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className={`nodrag ${styles.wrap}`}>
      {/* Analysis engine */}
      <div className={styles.engineRow}>
        <span className={styles.engineLabel}>Engine</span>
        <div className={styles.engineToggle} role="group" aria-label="Analysis engine">
          <button
            className={`nodrag ${engine === 'essentia' ? styles.engineOn : styles.engineOff}`}
            onClick={() => setEngine('essentia')}
            disabled={analyzingAny}
            title="Essentia.js — best quality (BPM, beats, real key, danceability). Loads a WASM module."
          >
            Essentia.js
          </button>
          <button
            className={`nodrag ${engine === 'builtin' ? styles.engineOn : styles.engineOff}`}
            onClick={() => setEngine('builtin')}
            disabled={analyzingAny}
            title="Built-in DSP — dependency-free, lower quality."
          >
            Built-in
          </button>
        </div>
      </div>

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
        <div className={`nowheel ${styles.songList}`}>
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
          <button
            className={`nodrag ${styles.primaryBtn}`}
            onClick={() => analyzeAll()}
            disabled={analyzingAny || entries.length === 0 || entries.every(e => e.status === 'done')}
          >
            {analyzingAny ? 'Analysing…' : 'Analyse All'}
          </button>
          <button
            className={`nodrag ${styles.exportBtn}`}
            onClick={() => exportShowPackage(entries)}
            disabled={doneCount === 0}
            title="Download ZIP with .show files + player sketch"
          >
            Export ZIP
          </button>
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
    </div>
  )
}
