import { PATTERN_FORM_TAGS, patternFormTags } from '../../state/patterns/patternTags'
import styles from './PatternFormIcons.module.css'

/** Every display preference keeps a fixed slot, so the same symbol sits in
 * the same column on every row of a listing. */
const SLOTS = ['any', ...PATTERN_FORM_TAGS.map((tag) => tag.id)] as const

/** Display preferences, shared by both library listings. Untagged patterns
 * retain their "works anywhere" meaning rather than acquiring a matrix label. */
export default function PatternFormIcons({ bestOn }: { bestOn?: unknown }) {
  const tags = patternFormTags(bestOn)
  const label = tags.length
    ? `Best on ${tags.map((tag) => PATTERN_FORM_TAGS.find((entry) => entry.id === tag)?.label).join(', ')}`
    : 'No preferred display — LED strings, matrices and rings'
  const shown = new Set<string>(tags.length ? tags : ['any'])
  return (
    <span className={styles.icons} role="img" aria-label={label} title={label}>
      {SLOTS.map((tag) => shown.has(tag) ? (
        <svg key={tag} data-form={tag} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          {tag === 'string' ? (
            <><path d="M1 8h14" /><rect x="2" y="5.5" width="3" height="5" rx="0.8" /><rect x="6.5" y="5.5" width="3" height="5" rx="0.8" /><rect x="11" y="5.5" width="3" height="5" rx="0.8" /></>
          ) : tag === 'matrix' ? (
            <><rect x="2" y="2" width="12" height="12" rx="1" /><path d="M6 2v12M10 2v12M2 6h12M2 10h12" /></>
          ) : tag === 'ring' ? (
            <><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="2.5" r="1" /><circle cx="13.5" cy="8" r="1" /><circle cx="8" cy="13.5" r="1" /><circle cx="2.5" cy="8" r="1" /></>
          ) : (
            <path d="M8 8c-2-4-6-4-6 0s4 4 6 0c2-4 6-4 6 0s-4 4-6 0Z" />
          )}
        </svg>
      ) : <span key={tag} className={styles.slot} aria-hidden="true" />)}
    </span>
  )
}
