import type { ReactNode } from 'react'
import type { PhysicalBoardProfile } from '../../build/boardProfiles'
import type { BuildBomRow, BuildConnectionRow } from '../../build/buildExports'
import type { ElectricalPlanSummary } from '../../build/electricalPlan'
import type { HardwareManifestItem } from '../../build/hardwareManifest'
import PhysicalAssemblyDiagram, { type PhysicalDiagramConnection } from './PhysicalAssemblyDiagram'
import { powerZoneBands } from './physicalDiagramLayout'
import type { BuildSectionLayers } from './diagramSections'
import styles from './BuildDiagramWorkspace.module.css'

/**
 * Print / PDF document.
 *
 * The screen sheet is one tall scrolling canvas — printing it directly gave a
 * portrait page clipped at 1120px wide with the PSU zones sliced across page
 * breaks. The printed reference is instead composed as fixed landscape pages,
 * each holding one thing that has to be read as a whole: the signal wiring, one
 * PSU zone, then the tables a builder ticks off. Every page scales its drawing
 * to the page box, so nothing is ever cut in half.
 */

const WIRING_LAYERS: BuildSectionLayers = { signalWires: true, levelShifter: true, powerDistribution: false }
const POWER_LAYERS: BuildSectionLayers = { signalWires: false, levelShifter: false, powerDistribution: true }

export interface BuildPrintSheetsProps {
  boardProfile: PhysicalBoardProfile
  /** Hardware in the chosen export scope. */
  items: HardwareManifestItem[]
  /** Electrical plan for exactly those items. */
  plan: ElectricalPlanSummary
  connections: PhysicalDiagramConnection[]
  connectionRows: BuildConnectionRow[]
  bomRows: BuildBomRow[]
  projectName?: string
  targetLabel: string
  exportScope: 'current-view' | 'complete-build'
  exportScopeLabel: string
  status: string
  readiness: Array<{ label: string; value: string }>
  powerSummary: Array<{ label: string; value: string }>
  printedAt?: Date
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function WireSwatch({ className }: { className: string }) {
  return (
    <svg className={styles.printSwatch} viewBox="0 0 28 8" aria-hidden="true">
      <line x1="1" y1="4" x2="27" y2="4" className={className} />
    </svg>
  )
}

/**
 * The on-sheet legend only names +5V / GND / SIGNAL, but the drawing also uses a
 * distinct colour per microphone signal and per control module, and those are
 * hover-only on screen. On paper there is nothing to hover, so each page names
 * every colour it can actually draw.
 */
function PrintLegend({ entries, note }: { entries: Array<{ className: string; label: string }>; note: string }) {
  return (
    <div className={styles.printLegend}>
      {entries.map((entry) => (
        <span key={entry.label}><WireSwatch className={entry.className} /> {entry.label}</span>
      ))}
      <span className={styles.printLegendNote}>{note}</span>
    </div>
  )
}

function PrintPage({
  title,
  subtitle,
  footer,
  flow = false,
  children,
}: {
  title: string
  subtitle?: string
  footer: string
  /** Table pages run over as many pages as they need; drawing pages are one page each. */
  flow?: boolean
  children: ReactNode
}) {
  return (
    <section className={`${styles.printPage} ${flow ? styles.printPageFlow : ''}`}>
      <header className={styles.printPageHeader}>
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </header>
      <div className={styles.printPageBody}>{children}</div>
      <footer className={styles.printPageFooter}>{footer}</footer>
    </section>
  )
}

export default function BuildPrintSheets({
  boardProfile,
  items,
  plan,
  connections,
  connectionRows,
  bomRows,
  projectName,
  targetLabel,
  exportScope,
  exportScopeLabel,
  status,
  readiness,
  powerSummary,
  printedAt,
}: BuildPrintSheetsProps) {
  const outputs = items.filter((item) => item.kind === 'matrix-output')
  const hasMicrophone = items.some((item) => item.kind === 'mic-input')
  const hasControls = items.some((item) => item.kind === 'button-input' || item.kind === 'pot-input' || item.kind === 'encoder-input')
  const bands = outputs.length > 0 ? powerZoneBands(outputs, plan, POWER_LAYERS) : []
  const footer = [
    projectName ? `Project ${projectName}` : 'Design Studio for FastLED',
    boardProfile.label,
    status,
    plan.ruleSetVersion,
    formatDate(printedAt ?? new Date()),
  ].join(' · ')

  return (
    <div className={styles.printDocument} data-build-print-document="true">
      <PrintPage title="Build reference" subtitle={exportScopeLabel} footer={footer}>
        <div className={styles.printSummary}>
          <div>
            <h1 className={styles.printTitle}>{projectName ?? 'Design Studio for FastLED build'}</h1>
            <dl className={styles.printFacts}>
              <div><dt>Controller</dt><dd>{boardProfile.label}</dd></div>
              <div><dt>Upload target</dt><dd>{targetLabel}</dd></div>
              <div><dt>Board data</dt><dd>{boardProfile.confidence.replace(/-/g, ' ')}</dd></div>
              <div><dt>Status</dt><dd>{status}</dd></div>
              <div><dt>Rule set</dt><dd>{plan.ruleSetVersion}</dd></div>
              <div><dt>Scope</dt><dd>{exportScopeLabel}</dd></div>
            </dl>
            <h2 className={styles.printHeading}>Readiness</h2>
            <dl className={styles.printFacts}>
              {readiness.map((entry) => (
                <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>
              ))}
            </dl>
          </div>
          <div>
            <h2 className={styles.printHeading}>Power</h2>
            {powerSummary.length === 0
              ? <p className={styles.printNote}>No supported 5 V LED output needs an external supply.</p>
              : <dl className={styles.printFacts}>
                {powerSummary.map((entry) => (
                  <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>
                ))}
              </dl>}
            <h2 className={styles.printHeading}>Sheets</h2>
            <ol className={styles.printContents}>
              <li>Signal wiring — controller, level shifting and every data / control run</li>
              {bands.map((band, index) => (
                <li key={band.supplyId}>Power — PSU zone {index + 1} of {bands.length}, {band.feedCount} fused feed{band.feedCount === 1 ? '' : 's'}</li>
              ))}
              <li>Connection schedule — {connectionRows.length} runs</li>
              <li>Parts list — {bomRows.length} lines</li>
            </ol>
            <p className={styles.printNote}>
              Check every rating against the parts you actually buy before applying power. Grounds are one common net;
              keep separate PSU +5 V zones isolated from each other.
            </p>
          </div>
        </div>
      </PrintPage>

      <PrintPage
        title="Signal wiring"
        subtitle={`${boardProfile.label} · ${connections.length} GPIO route${connections.length === 1 ? '' : 's'}`}
        footer={footer}
      >
        <div className={styles.printDiagram}>
          <PhysicalAssemblyDiagram
            boardProfile={boardProfile}
            items={items}
            plan={plan}
            connections={connections}
            layers={WIRING_LAYERS}
            exportScope={exportScope}
            selectedItemId="controller"
            onSelectItem={() => undefined}
          />
        </div>
        <PrintLegend
          entries={[
            { className: styles.signalWire, label: 'LED data' },
            { className: styles.logicPowerWire, label: 'USB controller power' },
            ...(hasMicrophone ? [
              { className: styles.microphoneBclkWire, label: 'Mic BCLK' },
              { className: styles.microphoneWsWire, label: 'Mic WS' },
              { className: styles.microphoneDoutWire, label: 'Mic DOUT' },
            ] : []),
            ...(hasControls ? [
              { className: styles.controlWireA, label: 'Control module 1' },
              { className: styles.controlWireB, label: 'Control module 2' },
              { className: styles.controlWireC, label: 'Control module 3' },
            ] : []),
          ]}
          note="GND / +5V / 3V3 are shared nets drawn as symbols — bond every GND together. Power feeds are on the power sheet."
        />
      </PrintPage>

      {bands.map((band, index) => (
        <PrintPage
          key={band.supplyId}
          title={`Power — PSU zone ${index + 1} of ${bands.length}`}
          subtitle={`${band.feedCount} fused feed${band.feedCount === 1 ? '' : 's'} · capacitor at every injection point`}
          footer={footer}
        >
          <div className={styles.printDiagram}>
            <PhysicalAssemblyDiagram
              boardProfile={boardProfile}
              items={outputs}
              plan={plan}
              connections={[]}
              layers={POWER_LAYERS}
              crop={band}
              exportScope={exportScope}
              selectedItemId=""
              onSelectItem={() => undefined}
            />
          </div>
          <PrintLegend
            entries={[
              { className: styles.powerWire, label: 'Fused +5 V feed' },
              { className: styles.groundWire, label: 'Ground return' },
            ]}
            note={bands.length > 1
              ? 'Keep the +5 V of each PSU zone isolated; every zone ground is bonded to the common ground, which is the wire leaving the top or bottom of this sheet.'
              : 'Every ground on this sheet is the one common net shared with the controller and level shifter.'}
          />
        </PrintPage>
      ))}

      <PrintPage title="Connection schedule" subtitle={`${connectionRows.length} runs`} footer={footer} flow>
        <table className={styles.printTable}>
          <thead>
            <tr><th>From</th><th>Terminal</th><th>To</th><th>Terminal</th><th>Purpose</th><th aria-label="Done" /></tr>
          </thead>
          <tbody>
            {connectionRows.map((row, index) => (
              <tr key={`${row.from}-${row.fromTerminal}-${row.to}-${row.toTerminal}-${index}`}>
                <td>{row.from}</td>
                <td>{row.fromTerminal}</td>
                <td>{row.to}</td>
                <td>{row.toTerminal}</td>
                <td>{row.purpose}</td>
                <td className={styles.printTick} />
              </tr>
            ))}
          </tbody>
        </table>
      </PrintPage>

      <PrintPage title="Parts list" subtitle={`${bomRows.length} lines`} footer={footer} flow>
        <table className={styles.printTable}>
          <thead>
            <tr><th>Qty</th><th>Item</th><th>Specification</th><th>Source</th><th aria-label="Have" /></tr>
          </thead>
          <tbody>
            {bomRows.map((row, index) => (
              <tr key={`${row.item}-${index}`}>
                <td>{row.quantity}</td>
                <td>{row.item}</td>
                <td>{row.specification}</td>
                <td>{row.status}</td>
                <td className={styles.printTick} />
              </tr>
            ))}
          </tbody>
        </table>
      </PrintPage>
    </div>
  )
}
