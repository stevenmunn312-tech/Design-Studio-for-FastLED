import { useMemo, useState } from 'react'
import { ROOT_GRAPH_ID, useGraphStore } from '../../state/graphStore'
import { boardByFqbn, useUploadStore } from '../../state/uploadStore'
import { useUiStore } from '../../state/uiStore'
import {
  buildGraphDiagnostics,
  type GraphDiagnostic,
  type GraphDiagnosticAction,
  type GraphDiagnosticCategory,
  type GraphDiagnosticSeverity,
} from '../../utils/validateGraph'
import styles from './GraphHealthDrawer.module.css'

type Filter = 'all' | GraphDiagnosticSeverity

const CATEGORY_LABELS: Record<GraphDiagnosticCategory, string> = {
  connection: 'Signal path',
  expression: 'Expression',
  pins: 'GPIO',
  layout: 'Layout',
  preview: 'Preview parity',
  power: 'Power',
  memory: 'Memory',
  board: 'Board',
  show: 'Show',
}

function actionLabel(action: GraphDiagnosticAction): string {
  return action === 'choose-board' ? 'Choose board' : 'Open library'
}

export default function GraphHealthDrawer() {
  const nodes = useGraphStore((state) => state.nodes)
  const edges = useGraphStore((state) => state.edges)
  const activeGraphId = useGraphStore((state) => state.activeGraphId)
  const graphs = useGraphStore((state) => state.graphs)
  const selectNode = useGraphStore((state) => state.selectNode)
  const selectedFqbn = useUploadStore((state) => state.selectedFqbn)
  const openBoardPopup = useUploadStore((state) => state.openBoardPopup)
  const open = useUiStore((state) => state.graphHealthOpen)
  const toggle = useUiStore((state) => state.toggleGraphHealth)
  const requestFitView = useUiStore((state) => state.requestFitView)
  const setStatus = useUiStore((state) => state.setStatus)
  const [filter, setFilter] = useState<Filter>('all')

  const diagnostics = useMemo(() => buildGraphDiagnostics(nodes, edges, {
    selectedFqbn,
    target: activeGraphId === ROOT_GRAPH_ID ? 'matrix' : 'group',
  }), [activeGraphId, edges, nodes, selectedFqbn])
  const errors = diagnostics.filter((issue) => issue.severity === 'error').length
  const warnings = diagnostics.length - errors
  const visible = filter === 'all' ? diagnostics : diagnostics.filter((issue) => issue.severity === filter)
  const health = errors > 0 ? 'error' : warnings > 0 ? 'warning' : 'clear'
  const graphName = graphs[activeGraphId]?.name ?? (activeGraphId === ROOT_GRAPH_ID ? 'Main' : 'Group')
  const boardLabel = boardByFqbn(selectedFqbn)?.label ?? 'No board selected'

  const locate = (issue: GraphDiagnostic) => {
    if (issue.nodeIds.length === 0) return
    selectNode(issue.nodeIds[0])
    requestFitView(issue.nodeIds)
    setStatus(`Located ${issue.nodeLabel ?? 'graph issue'}`, 'info')
  }

  const runAction = (action: GraphDiagnosticAction) => {
    if (action === 'choose-board') {
      openBoardPopup()
      return
    }
    useUiStore.setState({ sidebarOpen: true })
    setStatus('Node library opened', 'info')
  }

  return (
    <section className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`} aria-label="Graph health inspector">
      <div className={styles.rail}>
        <button
          className={styles.summary}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="graph-health-body"
        >
          <span className={`${styles.signalRail} ${styles[health]}`} aria-hidden="true">
            <i /><i /><i /><i />
          </span>
          <span className={styles.identity}>
            <span className={styles.title}>Graph health</span>
            <span className={styles.scope}>{graphName} · live diagnostics</span>
          </span>
        </button>
        <div className={styles.telemetry} aria-live="polite">
          {errors > 0 && <span className={`${styles.count} ${styles.errorCount}`}>{errors} error{errors === 1 ? '' : 's'}</span>}
          {warnings > 0 && <span className={`${styles.count} ${styles.warningCount}`}>{warnings} warning{warnings === 1 ? '' : 's'}</span>}
          {diagnostics.length === 0 && <span className={`${styles.count} ${styles.clearCount}`}>All checks clear</span>}
          <span className={styles.board}>{boardLabel}</span>
          <button className={styles.chevron} type="button" onClick={toggle} aria-label={open ? 'Collapse graph health' : 'Expand graph health'}>
            {open ? '⌄' : '⌃'}
          </button>
        </div>
      </div>

      {open && (
        <div className={styles.body} id="graph-health-body">
          <div className={styles.toolbar} aria-label="Diagnostic filters">
            <span className={styles.toolbarLabel}>Show</span>
            {(['all', 'error', 'warning'] as Filter[]).map((value) => {
              const count = value === 'all' ? diagnostics.length : value === 'error' ? errors : warnings
              return (
                <button
                  key={value}
                  type="button"
                  className={`${styles.filter} ${filter === value ? styles.filterActive : ''}`}
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                >
                  {value === 'all' ? 'All issues' : value === 'error' ? 'Errors' : 'Warnings'}
                  <span>{count}</span>
                </button>
              )
            })}
            <span className={styles.scanNote}>Rechecks after every graph or board change</span>
          </div>

          <div className={styles.issueList}>
            {visible.map((issue) => (
              <article key={issue.id} className={`${styles.issue} ${styles[issue.severity]}`}>
                <span className={styles.severityMark} aria-hidden="true">{issue.severity === 'error' ? '!' : '△'}</span>
                <div className={styles.issueCopy}>
                  <div className={styles.issueMeta}>
                    <span>{CATEGORY_LABELS[issue.category]}</span>
                    {issue.nodeLabel && <span>{issue.nodeLabel}</span>}
                  </div>
                  <h3>{issue.title}</h3>
                  <p className={styles.message}>{issue.message}</p>
                  <p className={styles.fix}><span>Fix</span>{' '}{issue.fix}</p>
                </div>
                <div className={styles.issueActions}>
                  {issue.nodeIds.length > 0 && (
                    <button type="button" onClick={() => locate(issue)}>
                      {issue.nodeIds.length > 1 ? `Locate ${issue.nodeIds.length} nodes` : 'Locate node'}
                    </button>
                  )}
                  {issue.action && <button type="button" onClick={() => runAction(issue.action!)}>{actionLabel(issue.action)}</button>}
                </div>
              </article>
            ))}
            {visible.length === 0 && (
              <div className={styles.emptyState}>
                <span className={styles.emptyPulse} aria-hidden="true" />
                <strong>{diagnostics.length === 0 ? 'Signal path is healthy' : `No ${filter}s detected`}</strong>
                <span>{diagnostics.length === 0 ? 'Connections, expressions, hardware, and resource checks all pass.' : 'Choose another filter to review the remaining diagnostics.'}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
