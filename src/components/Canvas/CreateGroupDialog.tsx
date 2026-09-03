import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGraphStore } from '../../state/graphStore'
import PatternTagChips from '../PatternTags/PatternTagChips'
import type { PatternFormTag } from '../../state/patternTags'
import styles from './CreateGroupDialog.module.css'

interface PaletteCandidate {
  nodeId: string
  label: string
}

export interface CreateGroupResult {
  saveToLibrary: boolean
  /** The author's "best displayed on" claim. Empty means "works anywhere",
   *  which is both the default and a perfectly good answer. */
  bestOn: PatternFormTag[]
  exposePaletteNodeIds: string[]
}

interface Props {
  selectedIds: string[]
  onClose: () => void
  onCreate: (name: string, result: CreateGroupResult) => void
}

// Replaces the old `window.prompt` group-naming flow: a name field plus two
// opt-in checkboxes so "save to library" and "expose this pattern's palette(s)
// to the show generator" don't require remembering a separate right-click step.
export default function CreateGroupDialog({ selectedIds, onClose, onCreate }: Props) {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const [name, setName] = useState('New Group')
  const [saveToLibrary, setSaveToLibrary] = useState(false)
  const [bestOn, setBestOn] = useState<PatternFormTag[]>([])
  const [checkedPalettes, setCheckedPalettes] = useState<Set<string>>(new Set())

  // Candidates: selected nodes with an unwired `paletteIn` port — a node
  // whose palette is already driven by something else is left alone.
  const paletteCandidates: PaletteCandidate[] = nodes
    .filter((n) => selectedIds.includes(n.id))
    .filter((n) => (n.data.inputs as { id: string }[] | undefined)?.some((p) => p.id === 'paletteIn'))
    .filter((n) => !edges.some((e) => e.target === n.id && e.targetHandle === 'paletteIn'))
    .map((n) => ({ nodeId: n.id, label: String(n.data.label ?? n.data.nodeType) }))

  const togglePalette = (nodeId: string) => {
    setCheckedPalettes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed, {
      saveToLibrary,
      bestOn: saveToLibrary ? bestOn : [],
      exposePaletteNodeIds: [...checkedPalettes],
    })
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.popup} role="dialog" aria-label="Create group">
        <div className={styles.header}>
          <span>Create Group</span>
          <button className={styles.closeBtn} onClick={onClose} title="Cancel">×</button>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Name</span>
          <input
            className={styles.textInput}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') onClose()
            }}
          />
        </label>

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={saveToLibrary}
            onChange={(e) => setSaveToLibrary(e.target.checked)}
          />
          Save to library
        </label>

        {/* The only save path that already stops to ask something. The three
            context-menu saves stay one click — a modal on the tweak-and-resave
            loop gets dismissed, and a dismissed question tags nothing. */}
        {saveToLibrary && (
          <div className={styles.paletteSection}>
            <div className={styles.sectionTitle}>Best displayed on (optional)</div>
            <PatternTagChips name={name.trim() || 'this pattern'} value={bestOn} onChange={setBestOn} />
          </div>
        )}

        {paletteCandidates.length > 0 && (
          <div className={styles.paletteSection}>
            <div className={styles.sectionTitle}>Replace palette(s) in Performance Generator</div>
            {paletteCandidates.map((c) => (
              <label key={c.nodeId} className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={checkedPalettes.has(c.nodeId)}
                  onChange={() => togglePalette(c.nodeId)}
                />
                {c.label}
              </label>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.createBtn} onClick={handleCreate} disabled={!name.trim()}>
            Create Group
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
