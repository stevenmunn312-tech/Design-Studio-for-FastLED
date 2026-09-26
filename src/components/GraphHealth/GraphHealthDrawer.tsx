import { useMemo, useState } from 'react'
import {
  addPatternCollectionTo,
  connectShowOutput,
  connectTemplateControls,
  insertMapRangeOnEdge,
  movePartPinToFree,
  placeTouchControl,
  ROOT_GRAPH_ID,
  useGraphStore,
  useRootNodes,
} from '../../state/graphStore'
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
  if (action === 'choose-board') return 'Choose board'
  // Named rather than a bare "Fix", so the button says what will appear on the
  // canvas before it appears there.
  if (action === 'insert-map-range') return 'Insert Map Range'
  if (action === 'place-touch-control') return 'Place on screen'
  if (action === 'connect-template-controls') return 'Connect them'
  if (action === 'move-pin') return 'Move to a free pin'
  if (action === 'open-board-settings') return 'Open Board settings'
  if (action === 'connect-show-output') return 'Connect it'
  if (action === 'add-pattern-collection') return 'Add a collection'
  return 'Open library'
}

export default function GraphHealthDrawer() {
  const nodes = useGraphStore((state) => state.nodes)
  const capabilityNodes = useRootNodes()
  const edges = useGraphStore((state) => state.edges)
  const displayDocuments = useGraphStore((state) => state.displayDocuments)
  const activeGraphId = useGraphStore((state) => state.activeGraphId)
  const graphs = useGraphStore((state) => state.graphs)
  const focusNode = useGraphStore((state) => state.focusNode)
  const selectedFqbn = useUploadStore((state) => state.selectedFqbn)
  const openBoardPopup = useUploadStore((state) => state.openBoardPopup)
  const open = useUiStore((state) => state.graphHealthOpen)
  const toggle = useUiStore((state) => state.toggleGraphHealth)
  const revealGraphNodes = useUiStore((state) => state.revealGraphNodes)
  const setStatus = useUiStore((state) => state.setStatus)
  const [filter, setFilter] = useState<Filter>('all')

  const diagnostics = useMemo(() => buildGraphDiagnostics(nodes, edges, {
    selectedFqbn,
    target: activeGraphId === ROOT_GRAPH_ID ? 'matrix' : 'group',
    capabilityNodes,
    displayDocuments,
  }), [activeGraphId, capabilityNodes, edges, nodes, selectedFqbn, displayDocuments])
  const errors = diagnostics.filter((issue) => issue.severity === 'error').length
  const warnings = diagnostics.length - errors
  const visible = filter === 'all' ? diagnostics : diagnostics.filter((issue) => issue.severity === filter)
  const health = errors > 0 ? 'error' : warnings > 0 ? 'warning' : 'clear'
  // Validators are grouped by subsystem rather than globally sorted. The
  // compact rail still needs to lead with a blocker when a warning happened to
  // be collected first.
  const highestPriority = diagnostics.find((issue) => issue.severity === 'error') ?? diagnostics[0]
  const graphName = graphs[activeGraphId]?.name ?? (activeGraphId === ROOT_GRAPH_ID ? 'Main' : 'Group')
  const boardLabel = boardByFqbn(selectedFqbn)?.label ?? 'No board selected'

  const locate = (issue: GraphDiagnostic) => {
    if (issue.nodeIds.length === 0) return
    focusNode(issue.nodeIds[0])
    // The drawer is open in Hardware and Upload too, where the canvas is not
    // on screen — locating has to bring it back before framing anything.
    revealGraphNodes(issue.nodeIds)
    setStatus(`Located ${issue.nodeLabel ?? 'graph issue'}`, 'info')
  }

  const runAction = (issue: GraphDiagnostic) => {
    if (issue.action === 'choose-board') {
      openBoardPopup()
      return
    }
    if (issue.repair?.kind === 'signal-range') {
      const { edgeId, outMin, outMax } = issue.repair
      const done = insertMapRangeOnEdge(edgeId, outMin, outMax)
      setStatus(
        done
          ? `Map Range inserted, mapping 0–1 to ${outMin}–${outMax}`
          : 'That wire is no longer there — the graph has changed since this was reported',
        done ? 'success' : 'info',
      )
      return
    }
    if (issue.repair?.kind === 'place-touch-control') {
      const { displayId, widgetId } = issue.repair
      const placed = placeTouchControl(displayId, widgetId)
      // A diagnostic can be read after the thing it names has been dealt with,
      // so the repair says it found nothing rather than reporting a success it
      // did not have — the same stance `insertMapRangeOnEdge` takes.
      setStatus(
        placed
          ? `${placed.label || placed.type} placed at ${placed.bounds.x}, ${placed.bounds.y}`
          : 'That control is no longer waiting — the screen design has changed since this was reported',
        placed ? 'success' : 'info',
      )
      return
    }
    if (issue.action === 'open-board-settings') {
      useUiStore.getState().setWorkspaceMode('hardware')
      setStatus('On the Board, tick Enable global power cap and enter your supply’s rating', 'info')
      return
    }
    if (issue.repair?.kind === 'move-pin') {
      const result = movePartPinToFree(issue.repair.nodeId, issue.repair.propertyKey)
      setStatus(result.ok ? `Moved to GPIO ${result.pin}` : result.reason, result.ok ? 'success' : 'info')
      return
    }
    if (issue.repair?.kind === 'connect-show-output') {
      const done = connectShowOutput(issue.repair.engineId, issue.repair.outputId)
      setStatus(done ? 'Show connected to its LED output' : 'That output is no longer free', done ? 'success' : 'info')
      return
    }
    if (issue.repair?.kind === 'add-pattern-collection') {
      const result = addPatternCollectionTo(issue.repair.playerId)
      setStatus(
        result === 'added' ? 'Pattern Collection added — now add the patterns you want it to play'
          : result === 'connected' ? 'Pattern Collection connected'
          : 'That Music Player is no longer there',
        result ? 'success' : 'info',
      )
      return
    }
    if (issue.repair?.kind === 'connect-template-controls') {
      const result = connectTemplateControls(issue.repair.panelId)
      setStatus(
        result.connected > 0
          ? `Connected ${result.connected} screen control${result.connected === 1 ? '' : 's'}`
          : result.unrouted[0]?.reason ?? 'Those controls are already connected',
        result.connected > 0 ? 'success' : 'info',
      )
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
            <span className={styles.scope}>{graphName}{open ? ' · live diagnostics' : ''}</span>
            {!open && (
              <span
                className={`${styles.priority} ${highestPriority ? styles[highestPriority.severity] : styles.clear}`}
                title={highestPriority?.title ?? 'All good'}
              >
                {highestPriority?.title ?? 'All good'}
              </span>
            )}
          </span>
        </button>
        <div className={styles.telemetry} aria-live="polite">
          {errors > 0 && <span className={`${styles.count} ${styles.errorCount}`}>{errors} to fix</span>}
          {warnings > 0 && <span className={`${styles.count} ${styles.warningCount}`}>{warnings} suggestion{warnings === 1 ? '' : 's'}</span>}
          {diagnostics.length === 0 && <span className={`${styles.count} ${styles.clearCount}`}>All good</span>}
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
                  {value === 'all' ? 'Everything' : value === 'error' ? 'To fix' : 'Suggestions'}
                  <span>{count}</span>
                </button>
              )
            })}
            <span className={styles.scanNote}>Rechecks after every graph or board change</span>
          </div>

          <div className={styles.issueList}>
            {visible.map((issue) => (
              <article key={issue.id} className={`${styles.issue} ${styles[issue.severity]}`}>
                <span className={styles.severityMark} aria-hidden="true">{issue.severity === 'error' ? '!' : 'i'}</span>
                <div className={styles.issueCopy}>
                  <div className={styles.issueMeta}>
                    <span>{CATEGORY_LABELS[issue.category]}</span>
                    {issue.nodeLabel && <span>{issue.nodeLabel}</span>}
                  </div>
                  <h3>{issue.title}</h3>
                  <p className={styles.message}>{issue.message}</p>
                  {issue.fix && <p className={styles.fix}><span>Next step</span>{' '}{issue.fix}</p>}
                </div>
                <div className={styles.issueActions}>
                  {issue.nodeIds.length > 0 && (
                    <button type="button" onClick={() => locate(issue)}>
                      {issue.nodeIds.length > 1 ? `Locate ${issue.nodeIds.length} nodes` : 'Locate node'}
                    </button>
                  )}
                  {issue.action && <button type="button" onClick={() => runAction(issue)}>{actionLabel(issue.action)}</button>}
                </div>
              </article>
            ))}
            {visible.length === 0 && (
              <div className={styles.emptyState}>
                <span className={styles.emptyPulse} aria-hidden="true" />
                <strong>{diagnostics.length === 0 ? 'Signal path is healthy' : filter === 'error' ? 'Nothing to fix' : 'No suggestions'}</strong>
                <span>{diagnostics.length === 0 ? 'Connections, expressions, hardware, and resource checks all pass.' : 'Choose Everything to see the rest.'}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
