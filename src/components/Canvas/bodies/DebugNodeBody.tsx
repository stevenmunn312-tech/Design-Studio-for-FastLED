import { useMemo, useState } from 'react'
import { rootGraphEdges, rootGraphNodes, useGraphStore } from '../../../state/graphStore'
import { nodeDisplayLabel } from '../../../state/nodeLibrary'
import { buildGraphDiagnostics } from '../../../utils/validateGraph'
import { debugProfileFor, debugTargetOf } from '../../../state/debug/debugProfiles'
import { debugContextFor, type MeterStep } from '../../../state/debug/debugProfile'
import { isolatedFor, readingsFor, useDebugSessionStore } from '../../../state/debug/debugSessionStore'
import { debugRunBlocker, hasProjectToRestore, useDebugRunStore } from '../../../state/debug/debugRunStore'
import { useUploadStore } from '../../../state/upload/uploadStore'
import { useUiStore } from '../../../state/uiStore'
import type { DebugContext, DebugFinding, DebugProbe } from '../../../state/debug/debugProfile'
import styles from './DebugNodeBody.module.css'

const TONE_CLASS = { ok: styles.toneOk, suspect: styles.toneSuspect, fault: styles.toneFault } as const
const TONE_LABEL = { ok: 'Looks good', suspect: 'Worth checking', fault: 'Found a fault' } as const

function FindingCard({ finding, onRepair }: { finding: DebugFinding; onRepair: (finding: DebugFinding) => void }) {
  return (
    <div className={`${styles.finding} ${TONE_CLASS[finding.tone]}`}>
      <div className={styles.findingTitle}>{TONE_LABEL[finding.tone]}: {finding.title}</div>
      <div>{finding.detail}</div>
      {finding.repair && (
        <button type="button" className={styles.repair} onClick={() => onRepair(finding)}>{finding.repair.label}</button>
      )}
    </div>
  )
}

/**
 * Section 4–5: upload the part's diagnostic sketch and read it live. Asks
 * before uploading, because the probe replaces the project on the board until
 * the project is uploaded again.
 */
function DebugRunSection({ nodeId, probe, ctx, onRepair }: {
  nodeId: string; probe: DebugProbe; ctx: DebugContext; onRepair: (finding: DebugFinding) => void
}) {
  const run = useDebugRunStore((s) => (s.run?.debugNodeId === nodeId ? s.run : null))
  const otherRun = useDebugRunStore((s) => Boolean(s.run && s.run.debugNodeId !== nodeId && ['uploading', 'running'].includes(s.run.phase)))
  const start = useDebugRunStore((s) => s.start)
  const stop = useDebugRunStore((s) => s.stop)
  const restoreProject = useDebugRunStore((s) => s.restoreProject)
  const dismiss = useDebugRunStore((s) => s.dismiss)
  const busy = useUploadStore((s) => s.busy)
  // Read so the blocker below is recomputed when any of them changes.
  useUploadStore((s) => s.selectedPort)
  useUiStore((s) => s.activeBoardId)
  useGraphStore((s) => s.trusted)
  const [confirming, setConfirming] = useState(false)
  const blocker = debugRunBlocker(nodeId)
  const answers = useDebugSessionStore((s) => readingsFor(s, nodeId))
  const setReading = useDebugSessionStore((s) => s.setReading)
  const findings = run?.fields ? probe.interpret(ctx, run.fields, answers) : []
  const questions = run?.fields && probe.questions ? probe.questions(run.fields) : []

  return (
    <section className={styles.section} aria-label="Test on the board">
      <h4>Test on the board</h4>
      {!run && !confirming && (
        <>
          <div className={styles.how}>Upload a short test sketch that drives only this part and reports back here.</div>
          <button type="button" className={styles.repair} disabled={Boolean(blocker) || busy || otherRun}
            title={blocker ?? undefined} onClick={() => setConfirming(true)}>Run diagnostic</button>
          {(blocker || otherRun) && <div className={styles.how}>{otherRun ? 'Another Debug node is testing; stop it first.' : blocker}</div>}
        </>
      )}
      {!run && confirming && (
        <div className={styles.step}>
          <div className={styles.unplug}>This replaces your project on the board until you upload it again.</div>
          <div className={styles.yesno}>
            <button type="button" className={styles.repair} onClick={() => { setConfirming(false); void start(nodeId) }}>Upload diagnostic</button>
            <button type="button" className={styles.answer} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
      {run?.phase === 'uploading' && <div className={styles.how}>Uploading the diagnostic… the Output console shows progress.</div>}
      {run && run.phase !== 'uploading' && (
        <>
          {run.error && <div className={`${styles.finding} ${styles.toneFault}`}>{run.error}</div>}
          {run.phase === 'running' && <div className={styles.stepTitle}>{probe.instruction}</div>}
          {run.phase === 'running' && !run.fields && !run.error && <div className={styles.how}>Waiting for the board to report…</div>}
          {run.fields && (
            <dl className={styles.readout} aria-live="polite">
              {probe.readout(run.fields).map((row) => (
                <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
              ))}
            </dl>
          )}
          {questions.map((question) => (
            <div key={question.id} className={styles.step} role="group" aria-label={question.question}>
              <div className={styles.stepTitle}>{question.question}</div>
              <div className={styles.yesno}>
                {question.choices.map((choice) => {
                  const chosen = answers[`probe-${question.id}`] === choice.value
                  return (
                    <button key={choice.value} type="button" className={chosen ? styles.answerOn : styles.answer} aria-pressed={chosen}
                      onClick={() => setReading(nodeId, `probe-${question.id}`, chosen ? undefined : choice.value)}>
                      {choice.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {findings.map((finding) => <FindingCard key={finding.id} finding={finding} onRepair={onRepair} />)}
          <div className={styles.yesno}>
            {run.phase === 'running' && <button type="button" className={styles.answer} onClick={stop}>Stop</button>}
            {run.phase !== 'running' && <button type="button" className={styles.answer} onClick={dismiss}>Close</button>}
            {run.phase !== 'running' && hasProjectToRestore() && (
              <button type="button" className={styles.repair} disabled={busy} onClick={() => void restoreProject()}>Re-upload project</button>
            )}
          </div>
          {run.phase === 'stopped' && !hasProjectToRestore() && (
            <div className={styles.how}>The diagnostic is still on the board. Upload your project again from Upload when you are done.</div>
          )}
        </>
      )}
    </section>
  )
}

/** A typed reading. Uncontrolled, committed on blur or Enter, blank clears:
 *  a reading has no range to clamp to, and "not measured yet" matters. */
function ReadingInput({ step, value, onCommit }: {
  step: MeterStep; value: number | undefined; onCommit: (value: number | undefined) => void
}) {
  const unit = step.kind === 'ohms' ? 'Ω' : 'V'
  return (
    <label className={styles.reading}>
      <input
        key={value ?? 'blank'}
        className={`nodrag ${styles.readingInput}`}
        type="number"
        inputMode="decimal"
        step="any"
        defaultValue={value ?? ''}
        placeholder="reading"
        aria-label={`${step.title}, in ${step.kind === 'ohms' ? 'ohms' : 'volts'}`}
        onBlur={(event) => {
          const raw = event.currentTarget.value.trim()
          const parsed = Number(raw)
          onCommit(raw === '' || !Number.isFinite(parsed) ? undefined : parsed)
        }}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      />
      <span>{unit}</span>
    </label>
  )
}

export default function DebugNodeBody({ nodeId }: { nodeId: string }) {
  const rootNodes = useGraphStore(rootGraphNodes)
  const rootEdges = useGraphStore(rootGraphEdges)
  const updateNodeProperties = useGraphStore((s) => s.updateNodeProperties)
  const readings = useDebugSessionStore((s) => readingsFor(s, nodeId))
  const isolated = useDebugSessionStore((s) => isolatedFor(s, nodeId))
  const setReading = useDebugSessionStore((s) => s.setReading)
  const setIsolated = useDebugSessionStore((s) => s.setIsolated)
  const clear = useDebugSessionStore((s) => s.clear)

  const target = debugTargetOf(nodeId, rootNodes, rootEdges)
  const profile = target ? debugProfileFor(target) : undefined
  const ctx = useMemo(() => (target ? debugContextFor(target, rootNodes) : null), [target, rootNodes])
  const projectChecks = useMemo(() => (target
    ? buildGraphDiagnostics(rootNodes, rootEdges).filter((entry) => entry.nodeIds?.includes(target.id))
    : []), [target, rootNodes, rootEdges])

  if (!target || !profile || !ctx) {
    return (
      <div className={`nodrag ${styles.body}`}>
        <p className={styles.empty}>
          {target
            ? `${nodeDisplayLabel(target.data.nodeType, target.data.properties as Record<string, unknown>, target.data.label)} has no checks here yet.`
            : 'Wire a part’s Debug socket into Part, or choose Debug this part on a part in the Hardware view. Test one part at a time.'}
        </p>
      </div>
    )
  }

  const repair = (finding: DebugFinding) => {
    if (finding.repair) updateNodeProperties(finding.repair.nodeId, finding.repair.properties)
  }
  const partName = nodeDisplayLabel(target.data.nodeType, ctx.props, target.data.label)
  const steps = profile.meterSteps(ctx)
  const findings = profile.interpret(ctx, readings)
  const isolation = profile.isolation(ctx)

  return (
    <div className={`nodrag nowheel ${styles.body}`}>
      <div className={styles.target}>
        <strong>{partName}</strong>
        <span>on {ctx.boardLabel} · {ctx.logicVolts} V logic</span>
      </div>

      {projectChecks.length > 0 && (
        <section className={styles.section} aria-label="Project checks">
          <h4>In your project</h4>
          <ul className={styles.list}>
            {projectChecks.map((entry) => <li key={entry.id}>{entry.title}{entry.fix ? ` — ${entry.fix}` : ''}</li>)}
          </ul>
        </section>
      )}

      <details className={styles.section}>
        <summary>Common issues</summary>
        <ul className={styles.list}>
          {profile.commonIssues.map((issue) => (
            <li key={issue.symptom}><strong>{issue.symptom}</strong> {issue.cause} {issue.fix}</li>
          ))}
        </ul>
      </details>

      <section className={styles.section} aria-label="Isolate the part">
        <h4>Isolate the part</h4>
        {isolation.map((text, index) => (
          <label key={text} className={styles.check}>
            <input type="checkbox" checked={isolated[index] === true}
              onChange={(event) => setIsolated(nodeId, index, event.currentTarget.checked)} />
            <span>{text}</span>
          </label>
        ))}
      </section>

      {profile.probe && <DebugRunSection nodeId={nodeId} probe={profile.probe} ctx={ctx} onRepair={repair} />}

      <section className={styles.section} aria-label="Measure">
        <h4>Measure</h4>
        {steps.map((step) => (
          <div key={step.id} className={styles.step}>
            <div className={styles.stepTitle}>{step.title}</div>
            {step.power === 'off' && <div className={styles.unplug}>Unplug power first.</div>}
            <div className={styles.how}>{step.how}</div>
            {step.kind === 'yesno' ? (
              <div className={styles.yesno} role="group" aria-label={step.question}>
                <span>{step.question}</span>
                {[true, false].map((answer) => (
                  <button key={String(answer)} type="button"
                    className={readings[step.id] === answer ? styles.answerOn : styles.answer}
                    aria-pressed={readings[step.id] === answer}
                    onClick={() => setReading(nodeId, step.id, readings[step.id] === answer ? undefined : answer)}>
                    {answer ? 'Yes' : 'No'}
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.measure}>
                <span className={styles.expect}>Expect {step.expect}</span>
                <ReadingInput step={step}
                  value={typeof readings[step.id] === 'number' ? readings[step.id] as number : undefined}
                  onCommit={(value) => setReading(nodeId, step.id, value)} />
              </div>
            )}
          </div>
        ))}
      </section>

      {findings.length > 0 && (
        <section className={styles.section} aria-label="Verdict" aria-live="polite">
          <h4>Verdict</h4>
          {findings.map((finding) => <FindingCard key={finding.id} finding={finding} onRepair={repair} />)}
        </section>
      )}

      <details className={styles.section}>
        <summary>If you have a scope or logic analyser</summary>
        <ul className={styles.list}>{profile.scopeTips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
      </details>

      {(Object.keys(readings).length > 0 || Object.keys(isolated).length > 0) && (
        <button type="button" className={styles.clear} onClick={() => clear(nodeId)}>Clear readings</button>
      )}
    </div>
  )
}
