import { useEffect, useMemo, useState } from 'react'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { getSystemInfo, type BackendHealth, type CompileCheckResult, type SystemInfo } from '../../utils/backendClient'
import {
  buildHardwareValidationProfile,
  detectValidationRuntimeHighEntropy,
  formatHardwareValidationReport,
  hardwareValidationIssueUrl,
  validationActionLabel,
  type HardwareValidationAction,
  type HardwareValidationSubmission,
  type ValidationResult,
} from '../../utils/hardwareValidation'
import styles from './Upload.module.css'

function formatSystemInfoHostOs(info: SystemInfo): string {
  return info.os.includes(info.osVersion) ? info.os : `${info.os} build ${info.osVersion}`
}

const ACTIONS: HardwareValidationAction[] = [
  'normal-upload',
  'wiring-test',
  'live-stream',
  'generative-show',
  'microphone',
  'sd-show',
]

export default function HardwareValidationPopup({
  nodes,
  edges,
  selectedFqbn,
  helper,
  capacityResult,
  initialAction,
  onClose,
}: {
  nodes: StudioNode[]
  edges: StudioEdge[]
  selectedFqbn: string
  helper: BackendHealth | null | undefined
  capacityResult: CompileCheckResult | null
  initialAction: HardwareValidationAction
  onClose: () => void
}) {
  const [action, setAction] = useState(initialAction)
  const initialProfile = useMemo(() => buildHardwareValidationProfile({
    nodes, edges, selectedFqbn, helper, capacityResult, action: initialAction,
  }), [nodes, edges, selectedFqbn, helper, capacityResult, initialAction])
  const [hostOs, setHostOs] = useState(initialProfile.environment.hostOs)
  const [browser, setBrowser] = useState(initialProfile.environment.browser)
  const [results, setResults] = useState<Record<string, ValidationResult>>({})
  const [notes, setNotes] = useState('')
  const [recordedAt] = useState(() => new Date().toISOString())

  // Refine the placeholder OS/browser fields once better sources resolve, but
  // never clobber a value the tester has already edited. The local helper
  // (when reachable) reads the exact OS build straight from Python — the one
  // thing no browser API can expose; Client Hints (Chromium only) still cover
  // the exact browser build.
  useEffect(() => {
    let cancelled = false
    void Promise.all([
      getSystemInfo(),
      detectValidationRuntimeHighEntropy(initialProfile.environment),
    ]).then(([systemInfo, resolved]) => {
      if (cancelled) return
      const resolvedHostOs = systemInfo?.ok ? formatSystemInfoHostOs(systemInfo) : resolved.hostOs
      setHostOs((current) => (current === initialProfile.environment.hostOs ? resolvedHostOs : current))
      setBrowser((current) => (current === initialProfile.environment.browser ? resolved.browser : current))
    })
    return () => { cancelled = true }
  }, [initialProfile.environment])

  const profile = useMemo(() => buildHardwareValidationProfile({
    nodes,
    edges,
    selectedFqbn,
    helper,
    capacityResult,
    action,
    runtime: { ...initialProfile.environment, hostOs, browser },
  }), [nodes, edges, selectedFqbn, helper, capacityResult, action, initialProfile.environment, hostOs, browser])

  const submission: HardwareValidationSubmission = useMemo(() => ({
    profile,
    recordedAt,
    hostOs: hostOs.trim(),
    browser: browser.trim(),
    results,
    notes,
  }), [profile, recordedAt, hostOs, browser, results, notes])
  const report = useMemo(() => formatHardwareValidationReport(submission), [submission])
  const observedCount = profile.checks.filter((check) => (results[check.id] ?? 'not-tested') !== 'not-tested').length
  const exactEnvironment = hostOs.trim().length > 0
    && browser.trim().length > 0
    && !/please (add|enter)/i.test(hostOs)
    && !/please (add|enter)/i.test(browser)
  const readyToSubmit = observedCount > 0 && exactEnvironment

  function setResult(id: string, result: ValidationResult) {
    setResults((current) => ({ ...current, [id]: result }))
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report)
      useUiStore.getState().setStatus('Hardware validation report copied', 'success')
    } catch {
      useUiStore.getState().setStatus('Could not copy report — use Download JSON instead', 'error')
    }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(submission, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `fastled-hardware-validation-${profile.configurationKey}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function openGitHubReport() {
    if (!readyToSubmit) return
    window.open(hardwareValidationIssueUrl(report, profile), '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={`${styles.overlay} ${styles.validationOverlay}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className={`${styles.popup} ${styles.validationPopup}`} role="dialog" aria-modal="true" aria-labelledby="hardware-validation-title">
        <div className={styles.popupHeader}>
          <div>
            <div className={styles.wizardKicker}>Public beta evidence</div>
            <div id="hardware-validation-title" className={styles.wizardTitle}>Hardware validation report</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Close">×</button>
        </div>

        <p className={styles.validationIntro}>
          Studio found the exact hardware paths below that still need evidence. Nothing is submitted automatically. Review every field before opening the pre-filled GitHub report.
        </p>

        <div className={styles.validationPrivacy}>
          Included: board, engine, LED/layout settings, firmware capacity, your test answers, and notes. Excluded: serial-port name, project contents, generated code, Wi-Fi details, and device identifiers.
        </div>

        <label className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>Test path</span>
          <select className={styles.select} value={action} onChange={(event) => setAction(event.target.value as HardwareValidationAction)}>
            {ACTIONS.map((value) => <option key={value} value={value}>{validationActionLabel(value)}</option>)}
          </select>
        </label>

        <div className={styles.validationGapPanel} aria-label="Missing hardware coverage">
          <div className={styles.validationSectionHeader}>
            <span>Missing coverage</span>
            <span className={profile.gaps.length ? styles.missingBadge : styles.readyBadge}>
              {profile.gaps.length ? `${profile.gaps.length} gap${profile.gaps.length === 1 ? '' : 's'}` : 'Recorded path'}
            </span>
          </div>
          {profile.gaps.length === 0 ? (
            <div className={styles.validationGapReason}>This target and path match an existing hardware record. A repeat result is still useful regression evidence.</div>
          ) : profile.gaps.map((gap) => (
            <div key={gap.id} className={styles.validationGapRow}>
              <strong>{gap.label}</strong>
              <span>{gap.reason}</span>
            </div>
          ))}
        </div>

        <div className={styles.dualFieldRow}>
          <label className={styles.fieldBlock}>
            <span className={styles.fieldLabel}>Host OS + exact version/build</span>
            <input className={styles.textInput} value={hostOs} onChange={(event) => setHostOs(event.target.value)} />
          </label>
          <label className={styles.fieldBlock}>
            <span className={styles.fieldLabel}>Browser + exact version</span>
            <input className={styles.textInput} value={browser} onChange={(event) => setBrowser(event.target.value)} />
          </label>
        </div>

        <div className={styles.validationSectionHeader}>
          <span>What happened on the real hardware?</span>
          <span>{observedCount}/{profile.checks.length} answered</span>
        </div>
        <div className={styles.validationChecks}>
          {profile.checks.map((check) => (
            <label key={check.id} className={styles.validationCheckRow}>
              <span>
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
              </span>
              <select
                className={styles.validationResultSelect}
                aria-label={`${check.label} result`}
                value={results[check.id] ?? 'not-tested'}
                onChange={(event) => setResult(check.id, event.target.value as ValidationResult)}
              >
                <option value="not-tested">Not tested</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
              </select>
            </label>
          ))}
        </div>

        <label className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>Tester notes (optional)</span>
          <textarea
            className={styles.validationNotes}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Power supply, physical wiring, symptoms, timing observations, or anything the structured checks miss."
          />
        </label>

        <details className={styles.validationPreview}>
          <summary>Review the exact report text</summary>
          <pre>{report}</pre>
        </details>

        {!readyToSubmit && (
          <div className={styles.validationSubmitHint}>
            Enter exact OS/browser versions and mark at least one check Pass or Fail before opening the submission.
          </div>
        )}

        <div className={styles.validationActions}>
          <button className={`${styles.wizardButtonBase} ${styles.exportBtn}`} onClick={() => { void copyReport() }}>Copy report</button>
          <button className={`${styles.wizardButtonBase} ${styles.exportBtn}`} onClick={downloadJson}>Download JSON</button>
          <button
            className={`${styles.wizardButtonBase} ${styles.uploadBtn}`}
            disabled={!readyToSubmit}
            onClick={openGitHubReport}
            title={readyToSubmit ? 'Open a pre-filled GitHub issue for your final review and submission' : 'Complete the environment and at least one observed result first'}
          >
            Review on GitHub…
          </button>
        </div>
      </div>
    </div>
  )
}
