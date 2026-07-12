import type { CSSProperties } from 'react'
import { CATEGORY_COLOR } from '../../state/nodeLibrary'
import { STARTER_TEMPLATES, type StarterTemplate } from '../../state/starterTemplates'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { startBlankCanvas, startTemplate } from '../../utils/startFlow'
import styles from './TemplatesPopup.module.css'

function TemplatePreview({ template }: { template: StarterTemplate }) {
  const cols = Math.max(...template.preview.nodes.map((node) => node.col), 0) + 1
  const rows = Math.max(...template.preview.nodes.map((node) => node.row), 0) + 1
  const cellW = 92
  const cellH = 58
  const nodeById = new Map(template.preview.nodes.map((node) => [node.id, node]))

  return (
    <div
      className={styles.preview}
      style={{
        '--preview-cols': cols,
        '--preview-rows': rows,
      } as CSSProperties}
      aria-hidden="true"
    >
      <svg className={styles.previewLines} viewBox={`0 0 ${cols * cellW} ${rows * cellH}`} preserveAspectRatio="none">
        {template.preview.edges.map((edge) => {
          const source = nodeById.get(edge.source)
          const target = nodeById.get(edge.target)
          if (!source || !target) return null
          const x1 = source.col * cellW + 58
          const y1 = source.row * cellH + 24
          const x2 = target.col * cellW + 14
          const y2 = target.row * cellH + 24
          return (
            <path
              key={`${edge.source}-${edge.target}`}
              d={`M ${x1} ${y1} C ${x1 + 16} ${y1}, ${x2 - 16} ${y2}, ${x2} ${y2}`}
              stroke={edge.color}
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
              opacity="0.9"
            />
          )
        })}
      </svg>
      {template.preview.nodes.map((node) => (
        <div
          key={node.id}
          className={styles.previewNode}
          style={{
            left: `calc(${node.col} * (100% / var(--preview-cols)) + 10px)`,
            top: `calc(${node.row} * (100% / var(--preview-rows)) + 10px)`,
            '--preview-accent': CATEGORY_COLOR[node.category] ?? '#5ad1ff',
          } as CSSProperties}
        >
          {node.label}
        </div>
      ))}
    </div>
  )
}

function BlankPreview() {
  return (
    <div className={`${styles.preview} ${styles.previewBlank}`} aria-hidden="true">
      <div className={styles.blankGlow} />
      <div className={styles.blankGrid} />
      <div className={styles.blankPrompt}>Blank canvas</div>
    </div>
  )
}

// A starting-point gallery for the blank-canvas problem: new users otherwise
// face an empty graph and ~90 node types with no sense of how they compose.
export default function TemplatesPopup() {
  const closeTemplates = useUiStore((s) => s.closeTemplates)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const lastStartChoice = useUiStore((s) => s.lastStartChoice)

  const lastStartLabel =
    lastStartChoice === 'blank'
      ? 'Blank canvas'
      : STARTER_TEMPLATES.find((template) => template.id === lastStartChoice)?.name ?? null

  const confirmReplace = async (confirmLabel: string) => {
    if (useGraphStore.getState().nodes.length === 0) return true
    return requestConfirm({
      title: 'Replace current graph?',
      message: 'Starting here replaces your current workspace. Any unsaved work will be lost. Continue?',
      confirmLabel,
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
  }

  const loadTemplate = async (template: StarterTemplate) => {
    const ok = await confirmReplace('Load starter')
    if (!ok) return
    startTemplate(template, { closeTemplates: true })
  }

  const loadBlank = async () => {
    const ok = await confirmReplace('Start blank')
    if (!ok) return
    startBlankCanvas({ closeTemplates: true })
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeTemplates() }}>
      <div className={styles.popup} role="dialog" aria-label="Start gallery">
        <div className={styles.header}>
          <div>
            <div className={styles.kicker}>Start Gallery</div>
            <span>Pick a starting point</span>
          </div>
          <button className={styles.closeBtn} onClick={closeTemplates} title="Close">×</button>
        </div>
        <div className={styles.hint}>
          Start from a ready-made patch or jump straight to a blank canvas.
          {lastStartLabel && <span className={styles.lastStart}>Last start: {lastStartLabel}</span>}
        </div>
        <div className={styles.grid}>
          <button
            type="button"
            className={`${styles.card} ${styles.blankCard} ${lastStartChoice === 'blank' ? styles.cardRemembered : ''}`}
            onClick={() => { void loadBlank() }}
          >
            <BlankPreview />
            <div className={styles.cardBody}>
              <div className={styles.cardHeader}>
                <span className={styles.cardName}>Blank Canvas</span>
                {lastStartChoice === 'blank' && <span className={styles.lastBadge}>Last</span>}
              </div>
              <span className={styles.cardDesc}>Start clean, but keep starters one click away from the new Start button.</span>
            </div>
            <span className={styles.cardAction}>Start blank</span>
          </button>

          {STARTER_TEMPLATES.map((template) => (
            <button
              type="button"
              key={template.id}
              className={`${styles.card} ${lastStartChoice === template.id ? styles.cardRemembered : ''}`}
              onClick={() => { void loadTemplate(template) }}
            >
              <TemplatePreview template={template} />
              <div className={styles.cardBody}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardName}>{template.name}</span>
                  {lastStartChoice === template.id && <span className={styles.lastBadge}>Last</span>}
                </div>
                <span className={styles.cardDesc}>{template.description}</span>
                {template.completionSteps && template.completionSteps.length > 0 && (
                  <ol className={styles.steps}>
                    {template.completionSteps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                )}
              </div>
              <span className={styles.cardAction}>Load starter</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
