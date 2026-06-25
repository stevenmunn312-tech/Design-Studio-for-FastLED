import { useRef } from 'react'
import { useMusicStore } from '../../state/musicStore'
import { exportShowPackage } from '../../utils/zipExport'
import styles from './MusicLibraryPanel.module.css'

// Status badge colours
const STATUS_LABEL: Record<string, string> = {
  pending:   'Pending',
  analyzing: 'Analyzing…',
  done:      'Ready',
  error:     'Error',
}

export default function MusicLibraryPanel() {
  const {
    entries, isOpen, engine,
    addFiles, analyzeAll, removeEntry, clearAll, setOpen, setEngine,
  } = useMusicStore()

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const doneCount     = entries.filter(e => e.status === 'done').length
  const analyzingAny  = entries.some(e => e.status === 'analyzing')

  function handleFiles(files: FileList | null) {
    if (!files) return
    addFiles(Array.from(files))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  function handleExport() {
    exportShowPackage(entries)
  }

  return (
    <div className={styles.overlay} onClick={() => setOpen(false)}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>Music Library</span>
          <span className={styles.subtitle}>
            {doneCount}/{entries.length} songs analysed
          </span>
          <button className={styles.closeBtn} onClick={() => setOpen(false)}>✕</button>
        </div>

        {/* Analysis engine */}
        <div className={styles.engineRow}>
          <span className={styles.engineLabel}>Analysis engine</span>
          <div className={styles.engineToggle} role="group" aria-label="Analysis engine">
            <button
              className={engine === 'essentia' ? styles.engineOn : styles.engineOff}
              onClick={() => setEngine('essentia')}
              disabled={analyzingAny}
              title="Essentia.js — best quality (BPM, beats, real key, danceability). Loads a WASM module."
            >
              Essentia.js
            </button>
            <button
              className={engine === 'builtin' ? styles.engineOn : styles.engineOff}
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
          className={styles.dropZone}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className={styles.dropIcon}>♪</span>
          <span>Drop MP3 files here or click to browse</span>
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
          <div className={styles.songList}>
            {entries.map(entry => (
              <div key={entry.id} className={styles.songRow}>
                <div className={styles.songInfo}>
                  <span className={styles.songTitle}>{entry.analysis?.title ?? entry.file.name}</span>
                  {entry.analysis && (
                    <span className={styles.songMeta}>
                      {entry.analysis.beats.bpm} BPM ·{' '}
                      {entry.analysis.mood.key} ·{' '}
                      {(entry.analysis.durationMs / 60000).toFixed(1)} min ·{' '}
                      {entry.show?.events.length ?? 0} events
                    </span>
                  )}
                  {entry.error && (
                    <span className={styles.songError}>{entry.error}</span>
                  )}
                </div>

                <div className={styles.songActions}>
                  <span className={`${styles.badge} ${styles[`badge_${entry.status}`]}`}>
                    {STATUS_LABEL[entry.status]}
                  </span>
                  {entry.show && (
                    <button
                      className={styles.actionBtn}
                      title="Preview show file (JSON)"
                      onClick={() => {
                        const json = JSON.stringify(entry.show, null, 2)
                        const w = window.open('', '_blank')
                        w?.document.write(`<pre>${json}</pre>`)
                      }}
                    >
                      { }
                    </button>
                  )}
                  <button
                    className={styles.removeBtn}
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

        {/* Footer actions */}
        <div className={styles.footer}>
          <button
            className={styles.secondaryBtn}
            onClick={clearAll}
            disabled={entries.length === 0}
          >
            Clear All
          </button>

          <div className={styles.footerRight}>
            <button
              className={styles.primaryBtn}
              onClick={() => analyzeAll()}
              disabled={analyzingAny || entries.every(e => e.status === 'done')}
            >
              {analyzingAny ? 'Analysing…' : 'Analyse All'}
            </button>

            <button
              className={styles.exportBtn}
              onClick={handleExport}
              disabled={doneCount === 0}
              title="Download ZIP with .show files + player sketch"
            >
              Export ZIP
            </button>
          </div>
        </div>

        {/* Section breakdown for selected song */}
        {entries.find(e => e.status === 'done') && (
          <div className={styles.legend}>
            <span className={styles.legendTitle}>Section colours:</span>
            {(['intro','verse','buildup','drop','chorus','bridge','outro'] as const).map(s => (
              <span key={s} className={`${styles.legendChip} ${styles[`section_${s}`]}`}>{s}</span>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
