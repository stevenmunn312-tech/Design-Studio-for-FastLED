import { useMemo } from 'react'
import { rootGraphEdges, rootGraphNodes, useGraphStore } from '../../../state/graphStore'
import { nodeDisplayLabel } from '../../../state/nodeLibrary'
import { buildGraphDiagnostics } from '../../../utils/validateGraph'
import { debugProfileFor, debugTargetOf } from '../../../state/debug/debugProfiles'
import { debugContextFor, type MeterStep } from '../../../state/debug/debugProfile'
import { isolatedFor, readingsFor, useDebugSessionStore } from '../../../state/debug/debugSessionStore'
import styles from './DebugNodeBody.module.css'

const TONE_CLASS = { ok: styles.toneOk, suspect: styles.toneSuspect, fault: styles.toneFault } as const
const TONE_LABEL = { ok: 'Looks good', suspect: 'Worth checking', fault: 'Found a fault' } as const

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
          {findings.map((finding) => (
            <div key={finding.id} className={`${styles.finding} ${TONE_CLASS[finding.tone]}`}>
              <div className={styles.findingTitle}>{TONE_LABEL[finding.tone]}: {finding.title}</div>
              <div>{finding.detail}</div>
              {finding.repair && (
                <button type="button" className={styles.repair}
                  onClick={() => updateNodeProperties(finding.repair!.nodeId, finding.repair!.properties)}>
                  {finding.repair.label}
                </button>
              )}
            </div>
          ))}
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
