import { useState } from 'react'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { SECTION_TYPES } from '../../../codegen/performanceGenerator'
import { useCapacityStore } from '../../../state/upload/capacityStore'
import { capacityDelta, formatCapacityDelta } from '../../../utils/capacityFormat'
import { shouldConsumeWheel } from '../wheelBehavior'
import PatternCollectionPicker from '../../PatternCollection/PatternCollectionPicker'
import { buildLibraryBundle, sharedCollectionFromNode } from '../../../state/library/libraryBundle'
import { copyLibraryLink, downloadLibraryFile, libraryFileName } from '../../../utils/libraryShare'
import ClampedNumberInput from '../ClampedNumberInput'
import {
  ENERGY_BANDS, PATTERN_WEIGHT_DEFAULT, PATTERN_WEIGHT_MAX, PATTERN_WEIGHT_MIN,
  clampPatternWeight, type EnergyBand,
} from '../../../state/patterns/patternPick'
import styles from './PatternCollectionBody.module.css'

// Body of the PatternCollection node: the list of absorbed pattern groups (by
// name), each removable, with per-pattern song-section chips. Patterns are
// added by wiring a Group node's frame output into the node's input and
// confirming (see NodeGraphCanvas.handleConnect). The section chips drive the
// Performance Generator's section-aware pattern selection — a pattern with no
// chip lit is eligible in any section; lighting chips restricts it to those.

const EMPTY: string[] = []
const EMPTY_MAP: Record<string, string[]> = {}
const EMPTY_WEIGHTS: Record<string, number> = {}
const EMPTY_ENERGY: Record<string, EnergyBand[]> = {}
const EMPTY_ENTRY: Record<string, string> = {}

// 3-letter chip labels for the seven section types (full name on hover).
const SECTION_ABBR: Record<string, string> = {
  intro: 'int', verse: 'vrs', buildup: 'bld', drop: 'drp', chorus: 'chr', bridge: 'brg', outro: 'out',
}

export default function PatternCollectionBody({ nodeId }: { nodeId: string }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const patternIds = useGraphStore(
    (s) => ((s.nodes.find((n) => n.id === nodeId)?.data.properties as { patternIds?: string[] } | undefined)?.patternIds) ?? EMPTY,
  )
  const patternSections = useGraphStore(
    (s) => ((s.nodes.find((n) => n.id === nodeId)?.data.properties as { patternSections?: Record<string, string[]> } | undefined)?.patternSections) ?? EMPTY_MAP,
  )
  const patternWeights = useGraphStore(
    (s) => ((s.nodes.find((n) => n.id === nodeId)?.data.properties as { patternWeights?: Record<string, number> } | undefined)?.patternWeights) ?? EMPTY_WEIGHTS,
  )
  const patternEnergy = useGraphStore(
    (s) => ((s.nodes.find((n) => n.id === nodeId)?.data.properties as { patternEnergy?: Record<string, EnergyBand[]> } | undefined)?.patternEnergy) ?? EMPTY_ENERGY,
  )
  const patternEntry = useGraphStore(
    (s) => ((s.nodes.find((n) => n.id === nodeId)?.data.properties as { patternEntry?: Record<string, string> } | undefined)?.patternEntry) ?? EMPTY_ENTRY,
  )
  const updateNodeProperties = useGraphStore((s) => s.updateNodeProperties)
  const graphs = useGraphStore((s) => s.graphs)
  const removeFromCollection = useGraphStore((s) => s.removeFromCollection)
  const clearCollection = useGraphStore((s) => s.clearCollection)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const requestPrompt = useUiStore((s) => s.requestPrompt)
  const setStatus = useUiStore((s) => s.setStatus)
  const togglePatternSection = useGraphStore((s) => s.togglePatternSection)
  const setPatternSections = useGraphStore((s) => s.setPatternSections)

  // Last live-capacity-meter delta (driven by CapacityWatcher), so adding or
  // removing a pattern here shows what it cost without opening the upload panel.
  const { result: capacityResult, previousResult: capacityPrevious } = useCapacityStore()
  const deltaText = (() => {
    const delta = capacityDelta(capacityPrevious, capacityResult)
    return delta ? formatCapacityDelta(delta) : null
  })()

  function setWeight(id: string, value: number) {
    const next = { ...patternWeights }
    const weight = clampPatternWeight(value)
    if (weight === PATTERN_WEIGHT_DEFAULT) delete next[id]
    else next[id] = weight
    updateNodeProperties(nodeId, { patternWeights: next })
  }

  function toggleEnergy(id: string, band: EnergyBand) {
    const next = { ...patternEnergy }
    const cur = next[id] ?? []
    const tags = cur.includes(band) ? cur.filter((item) => item !== band) : [...cur, band]
    if (tags.length === 0) delete next[id]
    else next[id] = tags
    updateNodeProperties(nodeId, { patternEnergy: next })
  }

  function toggleEntry(id: string) {
    const next = { ...patternEntry }
    if (next[id] === 'resume') delete next[id]
    else next[id] = 'resume'
    updateNodeProperties(nodeId, { patternEntry: next })
  }

  function handleListWheel(e: React.WheelEvent<HTMLUListElement>) {
    if (shouldConsumeWheel(e.currentTarget, e.deltaY)) e.stopPropagation()
  }

  // Emptying a collection discards each pattern's absorbed subgraph, so it asks
  // first — the same courtesy the library's delete already extends, and unlike
  // the per-row ✕ there is no obvious way to guess what was in a full list.
  async function handleClear() {
    const ok = await requestConfirm({
      title: 'Remove every pattern?',
      message: `Remove all ${patternIds.length} patterns from this collection? The saved library copies are not affected.`,
      confirmLabel: 'Remove all',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
    if (ok) clearCollection(nodeId)
  }

  // The collection as a library bundle: every pattern with its subgraph and
  // nested groups, plus the show profile kept for each (see
  // docs/design/library-sharing.md).
  function sharedCollection() {
    const node = useGraphStore.getState().nodes.find((n) => n.id === nodeId)
    const collection = node ? sharedCollectionFromNode(node) : null
    if (!collection || collection.patterns.length === 0) {
      setStatus('This collection has no patterns to share yet', 'error')
      return null
    }
    return collection
  }

  function handleExport() {
    const collection = sharedCollection()
    if (!collection) return
    downloadLibraryFile({ collections: [collection] }, libraryFileName(collection.name, 'collection'))
    setStatus(`Exported “${collection.name}” with ${collection.patterns.length} pattern${collection.patterns.length === 1 ? '' : 's'}`, 'success')
  }

  async function handleCopyLink() {
    const collection = sharedCollection()
    if (!collection) return
    const result = await copyLibraryLink(buildLibraryBundle({ collections: [collection] }))
    if (!result.copied) {
      await requestPrompt({
        title: 'Collection link',
        message: result.warning ?? 'Copy this link:',
        inputLabel: 'Share URL',
        initialValue: result.url,
        readOnly: true,
        selectText: true,
        monospace: true,
        confirmLabel: 'Close',
        cancelLabel: null,
      })
      return
    }
    setStatus(result.warning ?? 'Collection link copied to clipboard', result.warning ? 'info' : 'success')
  }

  return (
    <div className={`nodrag ${styles.wrap}`}>
      {patternIds.length === 0 ? (
        <div className={styles.empty}>Choose saved patterns or connect a Group node</div>
      ) : (
        <ul className={styles.list} onWheelCapture={handleListWheel}>
          {patternIds.map((id) => {
            const tags = patternSections[id] ?? EMPTY
            const patternName = graphs[id]?.name ?? id
            return (
              <li key={id} className={styles.row}>
                <div className={styles.head}>
                  <span className={styles.name}>{patternName}</span>
                  <button
                    className={styles.remove}
                    title="Remove from collection"
                    aria-label={`Remove ${patternName} from collection`}
                    onClick={() => removeFromCollection(nodeId, id)}
                  >
                    ✕
                  </button>
                </div>
                <div className={styles.sections} title="Sections this pattern plays in (none = any)">
                  <button
                    className={`${styles.chip} ${tags.length === SECTION_TYPES.length ? styles.chipOn : ''}`}
                    title="All sections"
                    aria-label={`${patternName}: all sections`}
                    aria-pressed={tags.length === SECTION_TYPES.length}
                    onClick={() => setPatternSections(nodeId, id, tags.length === SECTION_TYPES.length ? [] : [...SECTION_TYPES])}
                  >
                    all
                  </button>
                  {SECTION_TYPES.map((sec) => (
                    <button
                      key={sec}
                      className={`${styles.chip} ${tags.includes(sec) ? styles.chipOn : ''}`}
                      title={sec}
                      aria-label={`${patternName}: ${sec} section`}
                      aria-pressed={tags.includes(sec)}
                      onClick={() => togglePatternSection(nodeId, id, sec)}
                    >
                      {SECTION_ABBR[sec]}
                    </button>
                  ))}
                </div>
                <div className={styles.meta}>
                  <label className={styles.weight}>
                    Weight
                    <ClampedNumberInput
                      value={patternWeights[id] ?? PATTERN_WEIGHT_DEFAULT}
                      min={PATTERN_WEIGHT_MIN}
                      max={PATTERN_WEIGHT_MAX}
                      step={1}
                      ariaLabel={`${patternName} weight`}
                      className={styles.weightInput}
                      onCommit={(value) => setWeight(id, value)}
                    />
                  </label>
                  <div className={styles.sections} title="Energy tags. None matches every band.">
                    {ENERGY_BANDS.map((band) => (
                      <button
                        key={band}
                        type="button"
                        className={`${styles.chip} ${(patternEnergy[id] ?? EMPTY).includes(band) ? styles.chipOn : ''}`}
                        aria-label={`${patternName}: ${band} energy`}
                        aria-pressed={(patternEnergy[id] ?? EMPTY).includes(band)}
                        onClick={() => toggleEnergy(id, band)}
                      >
                        {band}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`${styles.chip} ${patternEntry[id] === 'resume' ? styles.chipOn : ''}`}
                      aria-label={`${patternName}: ${patternEntry[id] === 'resume' ? 'resume' : 'restart'} entry`}
                      aria-pressed={patternEntry[id] === 'resume'}
                      title="Resume keeps state. Restart clears it when the pattern enters."
                      onClick={() => toggleEntry(id)}
                    >
                      {patternEntry[id] === 'resume' ? 'resume' : 'restart'}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.addPatterns} onClick={() => setPickerOpen(true)}>
          <span aria-hidden="true">＋</span>
          Add patterns…
        </button>
        {patternIds.length > 0 && (
          <button
            type="button"
            className={styles.clearAll}
            title="Remove every pattern from this collection"
            onClick={() => void handleClear()}
          >
            Remove all
          </button>
        )}
      </div>
      {patternIds.length > 0 && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.shareBtn}
            title="Save this collection as a file: every pattern with its show profile"
            onClick={handleExport}
          >
            Export collection…
          </button>
          <button
            type="button"
            className={styles.shareBtn}
            title="Copy a link that recreates this collection in another Studio"
            onClick={() => void handleCopyLink()}
          >
            Copy collection link
          </button>
        </div>
      )}
      <div className={styles.count}>{patternIds.length} pattern{patternIds.length === 1 ? '' : 's'}</div>
      {deltaText && (
        <div className={styles.delta} title="Change in measured controller capacity since the last live check on this board">
          since last check: {deltaText}
        </div>
      )}
      {pickerOpen && (
        <PatternCollectionPicker collectionNodeId={nodeId} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  )
}
