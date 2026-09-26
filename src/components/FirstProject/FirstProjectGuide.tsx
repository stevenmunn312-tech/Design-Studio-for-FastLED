import { useMemo, type CSSProperties } from 'react'
import { useGraphStore, useRootEdges, useRootNodes } from '../../state/graphStore'
import { useFirstProjectGuide } from '../../state/firstProjectGuideStore'
import { useCapacityStore } from '../../state/capacityStore'
import { boardByFqbn, useUploadStore } from '../../state/uploadStore'
import { useUiStore, type WorkspaceMode } from '../../state/uiStore'
import { summarizeCapacity } from '../../utils/capacityFormat'
import { describePort } from '../../utils/portStatus'
import { findDeployBlockingErrors } from '../../utils/validateGraph'
import { firstProjectSteps, type FirstProjectAction, type FirstProjectStep } from '../../utils/firstProjectSteps'
import styles from './FirstProjectGuide.module.css'

/**
 * The optional first-project sequence, as a small card over the workspace.
 * It never blocks anything and never loads anything by itself: each step
 * opens the tool that already does that job (Start Gallery, Graph, Hardware,
 * LED setup, Upload), and ticks itself once the project shows it was done.
 */
export default function FirstProjectGuide() {
  const visible = useFirstProjectGuide((s) => s.visible)
  const stageMode = useUiStore((s) => s.stageMode)
  if (!visible || stageMode) return null
  return <GuideCard />
}

function runAction(action: FirstProjectAction, outputId: string | undefined) {
  const ui = useUiStore.getState()
  switch (action) {
    case 'open-starters': ui.openTemplates(); break
    case 'open-graph': ui.setWorkspaceMode('graph'); break
    case 'open-hardware': ui.setWorkspaceMode('hardware'); break
    case 'led-setup': useUploadStore.getState().openSetupWizard(outputId); break
    case 'open-upload': ui.setWorkspaceMode('upload'); break
  }
}

/** The tab an action only navigates to, so it can go unsaid once you are there. */
const OPENS_TAB: Partial<Record<FirstProjectAction, WorkspaceMode>> = {
  'open-graph': 'graph',
  'open-hardware': 'hardware',
  'open-upload': 'upload',
}

/** `.sidebarHandle` in App.module.css. */
const SIDEBAR_HANDLE_WIDTH = 22

const MARK: Record<FirstProjectStep['state'], string> = { done: '✓', current: '›', skipped: '–', todo: '' }

function GuideCard() {
  const nodes = useRootNodes()
  const edges = useRootEdges()
  const displayDocuments = useGraphStore((s) => s.displayDocuments)
  const { collapsed, skipped, baseline, uploaded, hide, setCollapsed, skip, unskip, restart } = useFirstProjectGuide()
  const { helper, ports, portsScanned, selectedPort, selectedFqbn } = useUploadStore()
  const capacityStatus = useCapacityStore((s) => s.status)
  const capacityResult = useCapacityStore((s) => s.result)
  const capacitySubject = useCapacityStore((s) => s.subject)
  const capacityTarget = useCapacityStore((s) => s.target)
  // Upload's controls fill the left of that tab, and they are what the last
  // two steps send you to, so there the card keeps to the console's side.
  const workspaceMode = useUiStore((s) => s.workspaceMode)
  const side = workspaceMode === 'upload' ? styles.dockRight : ''
  // The left panel floats over the workspace rather than beside it, so the
  // card starts past it (and its handle) whenever it is showing.
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const sidebarWidth = useUiStore((s) => s.sidebarWidth)
  const displayEditorOpen = useUiStore((s) => s.designWorkspaceView.kind === 'display')
  const sidebarShowing = sidebarOpen && !displayEditorOpen && workspaceMode !== 'build'
  const placement = { '--guide-left': `${sidebarShowing ? sidebarWidth + SIDEBAR_HANDLE_WIDTH : 0}px` } as CSSProperties

  const graphBlockerCount = useMemo(
    () => findDeployBlockingErrors(nodes, edges, selectedFqbn, displayDocuments).length,
    [nodes, edges, selectedFqbn, displayDocuments],
  )
  const capacityVerdict = summarizeCapacity(
    boardByFqbn(selectedFqbn), capacityStatus, capacityResult, capacitySubject, capacityTarget?.preparationError,
  ).verdict
  const port = describePort({ helper, selectedPort, ports, portsScanned })
  const steps = firstProjectSteps({
    nodes, edges, baseline, graphBlockerCount, capacityVerdict, port, uploaded, skipped,
  })
  const doneCount = steps.filter((step) => step.state === 'done').length
  const finished = doneCount === steps.length
  const outputId = nodes.find((node) => node.data.nodeType === 'MatrixOutput')?.id
  const progress = `${doneCount} of ${steps.length}`

  if (collapsed) {
    return (
      <button
        type="button"
        className={`${styles.pill} ${side}`}
        style={placement}
        onClick={() => setCollapsed(false)}
        aria-label={`Show the first project guide, ${progress} done`}
      >
        <span className={styles.pillTitle}>First project</span>
        <span className={styles.pillCount}>{progress}</span>
      </button>
    )
  }

  return (
    <section className={`${styles.card} ${side}`} style={placement} aria-label="First project guide">
      <header className={styles.header}>
        <div>
          <div className={styles.kicker}>First project</div>
          <div className={styles.progress}>{finished ? 'All done' : `${progress} done`}</div>
        </div>
        <div className={styles.headerButtons}>
          <button type="button" className={styles.iconBtn} onClick={() => setCollapsed(true)} aria-label="Minimise the guide" title="Minimise">–</button>
          <button type="button" className={styles.iconBtn} onClick={hide} aria-label="Close the guide" title="Close — reopen it from the File menu">×</button>
        </div>
      </header>

      {finished ? (
        <p className={styles.finished}>Your first project is on your board. Everything from here is yours to change.</p>
      ) : null}

      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.id} className={`${styles.step} ${styles[step.state]}`} aria-current={step.state === 'current' ? 'step' : undefined}>
            <span className={styles.mark} aria-hidden="true">{MARK[step.state]}</span>
            <div className={styles.stepBody}>
              <div className={styles.stepTitle}>
                {step.title}
                {step.state === 'skipped' && <span className={styles.skippedTag}>Skipped</span>}
              </div>
              {step.state === 'current' && <p className={styles.detail}>{step.detail}</p>}
              {step.state === 'current' && (
                <div className={styles.actions}>
                  {step.actions.filter(({ action }) => OPENS_TAB[action] !== workspaceMode).map(({ action, label }, index) => (
                    <button
                      key={action}
                      type="button"
                      className={index === 0 ? styles.primaryBtn : styles.secondaryBtn}
                      onClick={() => runAction(action, outputId)}
                    >
                      {label}
                    </button>
                  ))}
                  <button type="button" className={styles.linkBtn} onClick={() => skip(step.id)}>Skip for now</button>
                </div>
              )}
              {step.state === 'skipped' && (
                <button type="button" className={styles.linkBtn} onClick={() => unskip(step.id)}>Back to it</button>
              )}
            </div>
          </li>
        ))}
      </ol>

      {(finished || skipped.length > 0) && (
        <footer className={styles.footer}>
          <button type="button" className={styles.linkBtn} onClick={restart}>Start the guide over</button>
        </footer>
      )}
    </section>
  )
}
