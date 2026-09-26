import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
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
 * The optional first-project sequence, as a strip along the foot of the
 * workspace. It never blocks anything and never loads anything by itself:
 * each step opens the tool that already does that job (Start Gallery, Graph,
 * Hardware, LED setup, Upload), and ticks itself once the project shows it
 * was done.
 *
 * A strip rather than a floating card because the canvas between the two side
 * panels is narrow on a laptop — a card there sat on the very node the step
 * asked you to change. The strip shows only the current step; the whole list
 * opens above it on request, and the canvas frames its nodes above the strip
 * (`stripHeight`).
 */
export default function FirstProjectGuide() {
  const visible = useFirstProjectGuide((s) => s.visible)
  const stageMode = useUiStore((s) => s.stageMode)
  const setStripHeight = useFirstProjectGuide((s) => s.setStripHeight)
  const showing = visible && !stageMode
  useEffect(() => { if (!showing) setStripHeight(0) }, [showing, setStripHeight])
  if (!showing) return null
  return <GuideStrip />
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

/** `.sidebarHandle` / `.previewHandle` in App.module.css. */
const PANEL_HANDLE_WIDTH = 22

const MARK: Record<FirstProjectStep['state'], string> = { done: '✓', current: '›', skipped: '–', todo: '' }

function GuideStrip() {
  const nodes = useRootNodes()
  const edges = useRootEdges()
  const displayDocuments = useGraphStore((s) => s.displayDocuments)
  const { listOpen, skipped, baseline, uploaded, hide, setListOpen, skip, unskip, restart, setStripHeight } = useFirstProjectGuide()
  const { helper, ports, portsScanned, selectedPort, selectedFqbn } = useUploadStore()
  const capacityStatus = useCapacityStore((s) => s.status)
  const capacityResult = useCapacityStore((s) => s.result)
  const capacitySubject = useCapacityStore((s) => s.subject)
  const capacityTarget = useCapacityStore((s) => s.target)
  const workspaceMode = useUiStore((s) => s.workspaceMode)
  // Both side panels float over the workspace rather than beside it, so the
  // strip spans only the part of it that is actually visible.
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const sidebarWidth = useUiStore((s) => s.sidebarWidth)
  const previewPanelOpen = useUiStore((s) => s.previewPanelOpen)
  const previewWidth = useUiStore((s) => s.previewWidth)
  const displayEditorOpen = useUiStore((s) => s.designWorkspaceView.kind === 'display')
  const hasSidebar = !displayEditorOpen && workspaceMode !== 'build'
  const left = hasSidebar ? (sidebarOpen ? sidebarWidth : 0) + PANEL_HANDLE_WIDTH : 0
  // Build Diagram's main region already ends at an open preview's left edge;
  // only its handle overlays that workspace. The other workspaces sit beneath
  // the floating preview and must reserve the panel itself as well.
  const previewOverlayWidth = workspaceMode === 'build' ? 0 : (previewPanelOpen ? previewWidth : 0)
  const right = displayEditorOpen ? 0 : previewOverlayWidth + PANEL_HANDLE_WIDTH
  const placement = { '--guide-left': `${left}px`, '--guide-right': `${right}px` } as CSSProperties

  const stripRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const measure = () => setStripHeight(Math.ceil(strip.getBoundingClientRect().height))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(strip)
    return () => observer.disconnect()
  }, [setStripHeight])

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
  const current = steps.find((step) => step.state === 'current')
  const outputId = nodes.find((node) => node.data.nodeType === 'MatrixOutput')?.id
  const progress = `${doneCount} of ${steps.length} done`
  const actions = current?.actions.filter(({ action }) => OPENS_TAB[action] !== workspaceMode) ?? []

  return (
    <div className={styles.dock} style={placement}>
      {listOpen && (
        <section className={styles.list} aria-label="First project steps">
          <ol className={styles.steps}>
            {steps.map((step) => (
              <li key={step.id} className={`${styles.step} ${styles[step.state]}`} aria-current={step.state === 'current' ? 'step' : undefined}>
                <span className={styles.mark} aria-hidden="true">{MARK[step.state]}</span>
                <span className={styles.stepTitle}>{step.title}</span>
                {step.state === 'skipped' && (
                  <button type="button" className={styles.linkBtn} onClick={() => unskip(step.id)}>Back to it</button>
                )}
              </li>
            ))}
          </ol>
          {(finished || skipped.length > 0) && (
            <button type="button" className={styles.linkBtn} onClick={restart}>Start the guide over</button>
          )}
        </section>
      )}

      <section ref={stripRef} className={styles.strip} aria-label="First project guide">
        <div className={styles.progressBlock}>
          <span className={styles.kicker}>First project</span>
          <span className={styles.progress}>{progress}</span>
        </div>

        <div className={styles.now}>
          {current ? (
            <>
              <span className={styles.nowTitle}>{current.title}</span>
              <span className={styles.nowDetail}>{current.detail}</span>
            </>
          ) : finished ? (
            <span className={styles.finished}>Your first project is on your board. Everything from here is yours to change.</span>
          ) : (
            <span className={styles.nowDetail}>The rest is skipped for now. Open All steps to go back to one.</span>
          )}
        </div>

        <div className={styles.actions}>
          {actions.map(({ action, label }, index) => (
            <button
              key={action}
              type="button"
              className={index === 0 ? styles.primaryBtn : styles.secondaryBtn}
              onClick={() => runAction(action, outputId)}
            >
              {label}
            </button>
          ))}
          {current && (
            <button type="button" className={styles.linkBtn} onClick={() => skip(current.id)}>Skip for now</button>
          )}
          <button
            type="button"
            className={styles.secondaryBtn}
            aria-expanded={listOpen}
            onClick={() => setListOpen(!listOpen)}
          >
            {listOpen ? 'Hide steps' : 'All steps'}
          </button>
          <button type="button" className={styles.iconBtn} onClick={hide} aria-label="Close the guide" title="Close — reopen it from the File menu">×</button>
        </div>
      </section>
    </div>
  )
}
