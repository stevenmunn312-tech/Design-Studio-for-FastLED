import { useEffect, useMemo, useState } from 'react'
import { boardProfileById, compatibleBoardProfilesForFqbn } from '../../build/boardProfiles'
import { ensureBuildProfile, fingerprintValue } from '../../build/buildProfile'
import { buildHardwareManifest, type HardwareManifestItem } from '../../build/hardwareManifest'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { boardByFqbn, useUploadStore } from '../../state/uploadStore'
import styles from './BuildDiagramWorkspace.module.css'

function formatFactValue(value: unknown): string {
  if (value == null) return 'Unknown'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function itemFingerprint(
  item: HardwareManifestItem,
  selectedFqbn: string,
  physicalBoardProfileId: string | undefined,
): string {
  return fingerprintValue({
    selectedFqbn,
    physicalBoardProfileId,
    item: {
      id: item.id,
      kind: item.kind,
      supported: item.supported,
      facts: item.facts,
      pins: item.pins.map((pin) => ({
        propertyKey: pin.propertyKey,
        pin: pin.pin,
        requirement: pin.requirement,
      })),
    },
  })
}

function BoardPreview({ svg, label }: { svg: string; label: string }) {
  return (
    <div
      className={styles.boardPreview}
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export default function BuildDiagramWorkspace() {
  const nodes = useGraphStore((state) => state.nodes)
  const edges = useGraphStore((state) => state.edges)
  const storedBuildProfile = useGraphStore((state) => state.buildProfile)
  const updateBuildProfile = useGraphStore((state) => state.updateBuildProfile)
  const closeBuildDiagram = useUiStore((state) => state.closeBuildDiagram)
  const selectedFqbn = useUploadStore((state) => state.selectedFqbn)
  const manifest = useMemo(() => buildHardwareManifest(nodes, edges, selectedFqbn), [nodes, edges, selectedFqbn])
  const buildProfile = ensureBuildProfile(storedBuildProfile)
  const boardOptions = useMemo(() => compatibleBoardProfilesForFqbn(selectedFqbn), [selectedFqbn])
  const exactBoard = boardProfileById(buildProfile.physicalBoardProfileId ?? '')
  const selectedTarget = boardByFqbn(selectedFqbn)
  const [selectedItemId, setSelectedItemId] = useState<string>('controller')
  const [isolatedItemId, setIsolatedItemId] = useState<string | null>(null)

  const primaryItems = manifest.primaryItems
  const visiblePrimaryItems = useMemo(() => {
    const items = primaryItems.filter((item) => buildProfile.visibility?.[item.id] !== false)
    if (isolatedItemId) return items.filter((item) => item.id === isolatedItemId)
    return items
  }, [buildProfile.visibility, isolatedItemId, primaryItems])

  useEffect(() => {
    const availableIds = new Set(['controller', ...visiblePrimaryItems.map((item) => item.id)])
    if (!availableIds.has(selectedItemId)) {
      setSelectedItemId(visiblePrimaryItems[0]?.id ?? 'controller')
    }
  }, [selectedItemId, visiblePrimaryItems])

  const selectedItem = selectedItemId === 'controller'
    ? manifest.controller
    : manifest.items.find((item) => item.id === selectedItemId) ?? manifest.controller

  const completedCount = primaryItems.filter((item) => {
    const done = buildProfile.done?.[item.id]
    return done?.fingerprint === itemFingerprint(item, selectedFqbn, buildProfile.physicalBoardProfileId)
  }).length

  const connectionRows = exactBoard
    ? (selectedItemId === 'controller' ? visiblePrimaryItems : [selectedItem]).flatMap((item) =>
        item.kind === 'controller'
          ? []
          : item.pins.map((pin) => ({
              id: `${item.id}:${pin.propertyKey}`,
              title: item.title,
              left: `GPIO ${pin.pin}`,
              right: pin.label,
            })))
    : []

  const patchBuildProfile = (recipe: (current: ReturnType<typeof ensureBuildProfile>) => ReturnType<typeof ensureBuildProfile>) => {
    updateBuildProfile((current) => recipe(ensureBuildProfile(current)))
  }

  const toggleVisibility = (itemId: string) => {
    patchBuildProfile((current) => {
      const visibility = { ...(current.visibility ?? {}) }
      if (visibility[itemId] === false) delete visibility[itemId]
      else visibility[itemId] = false
      return {
        ...current,
        visibility: Object.keys(visibility).length > 0 ? visibility : undefined,
      }
    })
    if (isolatedItemId === itemId) setIsolatedItemId(null)
  }

  const toggleDone = (item: HardwareManifestItem) => {
    const fingerprint = itemFingerprint(item, selectedFqbn, buildProfile.physicalBoardProfileId)
    patchBuildProfile((current) => {
      const done = { ...(current.done ?? {}) }
      if (done[item.id]?.fingerprint === fingerprint) delete done[item.id]
      else done[item.id] = { fingerprint, completedAt: Date.now() }
      return {
        ...current,
        done: Object.keys(done).length > 0 ? done : undefined,
      }
    })
  }

  const selectExactBoard = (profileId: string) => {
    patchBuildProfile((current) => ({
      ...current,
      physicalBoardProfileId: profileId,
    }))
  }

  return (
    <section className={styles.workspace} aria-label="Build Diagram workspace">
      <aside className={styles.sidebar}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>Build Diagram</h2>
            <p className={styles.panelSubtitle}>Physical hardware and installation facts for this project.</p>
          </div>
          <button type="button" className={styles.backButton} onClick={closeBuildDiagram}>
            Back to Design
          </button>
        </div>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Controller target</h3>
          <p className={styles.copy}>
            {selectedTarget?.label ?? 'No board target selected'}{selectedFqbn ? ` · ${selectedFqbn}` : ''}
          </p>
          <p className={styles.copyMuted}>
            Exact physical board profiles stay separate from the compile target. Build Diagram needs the exact board before it can trust physical wiring.
          </p>
        </section>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Exact board</h3>
          {boardOptions.length === 0 ? (
            <p className={styles.warningText}>
              Diagram profile unavailable for this target family. Build Diagram will stay in planning-only mode until a reviewed physical board profile exists.
            </p>
          ) : (
            <div className={styles.optionList}>
              {boardOptions.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={`${styles.optionCard} ${buildProfile.physicalBoardProfileId === profile.id ? styles.optionCardActive : ''}`}
                  onClick={() => selectExactBoard(profile.id)}
                >
                  <span className={styles.optionTitle}>{profile.label}</span>
                  <span className={styles.optionMeta}>{profile.confidence.replace(/-/g, ' ')}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.rowBetween}>
            <h3 className={styles.cardTitle}>Hardware items</h3>
            <span className={styles.progressPill}>{completedCount}/{primaryItems.length} done</span>
          </div>
          <div className={styles.hardwareList}>
            {primaryItems.length === 0 ? (
              <p className={styles.copyMuted}>Add Matrix Output routes or supported hardware-input nodes to populate the build list.</p>
            ) : primaryItems.map((item) => {
              const isVisible = buildProfile.visibility?.[item.id] !== false
              const fingerprint = itemFingerprint(item, selectedFqbn, buildProfile.physicalBoardProfileId)
              const done = buildProfile.done?.[item.id]
              const isDone = done?.fingerprint === fingerprint
              const isStale = !!done && !isDone
              return (
                <div key={item.id} className={`${styles.hardwareRow} ${selectedItemId === item.id ? styles.hardwareRowActive : ''}`}>
                  <button type="button" className={styles.hardwareMain} onClick={() => setSelectedItemId(item.id)}>
                    <span className={styles.hardwareTitle}>{item.title}</span>
                    <span className={styles.hardwareSubtitle}>{item.subtitle}</span>
                    {isStale && <span className={styles.staleNotice}>Wiring changed—recheck this connection.</span>}
                  </button>
                  <div className={styles.hardwareActions}>
                    <button type="button" className={styles.smallButton} onClick={() => toggleVisibility(item.id)}>
                      {isVisible ? 'Hide' : 'Show'}
                    </button>
                    <button type="button" className={styles.smallButton} onClick={() => setIsolatedItemId(isolatedItemId === item.id ? null : item.id)}>
                      {isolatedItemId === item.id ? 'Unisolate' : 'Isolate'}
                    </button>
                    <button type="button" className={`${styles.smallButton} ${isDone ? styles.smallButtonDone : ''}`} onClick={() => toggleDone(item)}>
                      {isDone ? 'Done' : 'Mark done'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {manifest.unsupportedItems.length > 0 && (
          <section className={styles.card}>
            <h3 className={styles.cardTitle}>Not yet supported</h3>
            <ul className={styles.flatList}>
              {manifest.unsupportedItems.map((item) => (
                <li key={item.id}>{item.title}: {item.subtitle}</li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      <main className={styles.diagramPane}>
        <div className={styles.diagramHeader}>
          <div>
            <h2 className={styles.panelTitle}>Diagram</h2>
            <p className={styles.panelSubtitle}>
              {exactBoard
                ? `${exactBoard.label} selected. Controller rendering is gated behind that exact-board choice.`
                : 'Select an exact board profile to unlock controller-aware wiring details.'}
            </p>
          </div>
          <button type="button" className={styles.resetButton} onClick={() => setIsolatedItemId(null)} disabled={!isolatedItemId}>
            Show all
          </button>
        </div>

        {!exactBoard ? (
          <div className={styles.emptyState}>
            <h3 className={styles.emptyTitle}>Exact board required</h3>
            <p className={styles.copy}>
              The graph already defines logical GPIO numbers and hardware roles. Build Diagram now needs the exact physical controller board before it can show trustworthy physical references.
            </p>
          </div>
        ) : (
          <div className={styles.diagramCanvas}>
            <button
              type="button"
              className={`${styles.controllerCard} ${selectedItemId === 'controller' ? styles.diagramCardActive : ''}`}
              onClick={() => setSelectedItemId('controller')}
            >
              <BoardPreview svg={exactBoard.previewSvg} label={exactBoard.label} />
              <span className={styles.diagramCardTitle}>{exactBoard.label}</span>
              <span className={styles.diagramCardMeta}>{exactBoard.confidence.replace(/-/g, ' ')}</span>
            </button>
            <div className={styles.diagramItems}>
              {visiblePrimaryItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.diagramCard} ${selectedItemId === item.id ? styles.diagramCardActive : ''}`}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  <span className={styles.diagramCardTitle}>{item.title}</span>
                  <span className={styles.diagramCardMeta}>{item.subtitle}</span>
                  {item.pins.length > 0 && (
                    <span className={styles.diagramCardPins}>
                      {item.pins.map((pin) => `GPIO ${pin.pin}`).join(' · ')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <aside className={styles.detailPane}>
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Selected item</h3>
          <p className={styles.copy}><strong>{selectedItem.title}</strong></p>
          <p className={styles.copyMuted}>{selectedItem.subtitle}</p>
          {selectedItemId !== 'controller' && !exactBoard && (
            <p className={styles.warningText}>Select an exact board profile before pin definitions or controller-side connections appear here.</p>
          )}
          {selectedItem.pins.length > 0 && exactBoard && (
            <ul className={styles.flatList}>
              {selectedItem.pins.map((pin) => (
                <li key={`${selectedItem.id}-${pin.propertyKey}`} className={styles.pinRow}>
                  <strong>GPIO {pin.pin}</strong> · {pin.label}
                </li>
              ))}
            </ul>
          )}
          {Object.keys(selectedItem.facts).length > 0 && (
            <dl className={styles.factList}>
              {Object.entries(selectedItem.facts).map(([key, value]) => (
                <div key={key} className={styles.factRow}>
                  <dt>{key}</dt>
                  <dd>{formatFactValue(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Readiness</h3>
          <ul className={styles.flatList}>
            <li>Requirements calculated: pending the electrical rule engine</li>
            <li>Signal ready: {exactBoard ? 'exact board selected; physical pin rendering still pending' : 'blocked by exact-board selection'}</li>
            <li>Power ready: pending the calculated electrical plan and owned-parts validation</li>
            <li>Build ready: pending Signal ready and Power ready</li>
          </ul>
        </section>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Connections</h3>
          {connectionRows.length === 0 ? (
            <p className={styles.copyMuted}>Controller-side connections appear here after an exact board is selected.</p>
          ) : (
            <ul className={styles.flatList}>
              {connectionRows.map((row) => (
                <li key={row.id}>
                  <strong>{row.title}</strong>: {row.left} → {row.right}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Exports</h3>
          <p className={styles.copyMuted}>
            Current-view and complete-build exports will be enabled once the normalized assembly and BOM layers are in place.
          </p>
        </section>
      </aside>
    </section>
  )
}
