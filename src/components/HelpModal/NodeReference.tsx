import { useDeferredValue, useEffect, useRef } from 'react'
import type { NodeCategory, NodeDefinition, NodePort } from '../../types'
import { CATEGORIES, CATEGORY_COLOR, HARDWARE_CATEGORY, isInternalProperty, NODE_DESCRIPTIONS, NODE_LIBRARY, propertyDescription, propertyGroupsFor, propertyLabel, propertyMeta, portColor } from '../../state/nodeLibrary'
import { exposableInputsFor } from '../../state/propertyInputs'
import { useUiStore } from '../../state/uiStore'
import { useAudioStore } from '../../state/audio/audioStore'
import { insertLiveExample } from '../../utils/insertLiveExample'
import { exampleGraphSrc, mainPreviewSrc, nodeCardSrc } from '../../utils/nodeReferenceAssets'
import { exampleUsesMicrophone, liveExampleForNode } from './liveExamples'
import { nodeReferenceEntry } from './reference'
import { PORT_DESCRIPTIONS, TYPE_GLYPH } from './portCopy'
import styles from './NodeReference.module.css'

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  [...CATEGORIES, HARDWARE_CATEGORY].map((category) => [category.id, category.label]),
)

const CATEGORY_ORDER: NodeCategory[] = ['input', 'audio', 'signal', 'math', 'color', 'pattern', 'field', 'composite', 'show', 'output', 'hardware', 'note']

const NODE_INTRO_TYPE = '__using_nodes__'

// Properties the reference does not list: they are not settings the reader can
// go and change. `form` is the bench's answer to what the output physically
// is — there is no editor for it, so documenting its four options as a choice
// described a control that does not exist. Internal keys (part ids, generated
// identifiers) are hidden for the same reason.
const HIDDEN_PROPERTIES = new Set(['patternIds', 'patternSections', 'patternWeights', 'patternEnergy', 'patternEntry', 'sequence', 'form'])

const PROPERTY_LABELS: Record<string, string> = {
  bpm: 'BPM',
  colorOrder: 'Color Order',
  cx: 'Centre X',
  cy: 'Centre Y',
  dataPin: 'Data Pin',
  i2sBclk: 'I2S BCLK',
  i2sDout: 'I2S DOUT',
  i2sLrc: 'I2S LRC',
  i2sSck: 'I2S SCK',
  i2sSd: 'I2S SD',
  i2sWs: 'I2S WS',
  i2sMclk: 'I2S MCLK',
  i2sLrclk: 'I2S LRCLK',
  pinA: 'Pin A',
  pinB: 'Pin B',
  pinSW: 'Pin SW',
  psramMode: 'PSRAM Type',
  psramPolicy: 'PSRAM Policy',
  sdaPin: 'SDA Pin',
  sclPin: 'SCL Pin',
  serialRoute: 'Serial Connection',
  profileId: 'Board',
  x1: 'Start X',
  x2: 'End X',
  y1: 'Start Y',
  y2: 'End Y',
}

function humanizeText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\bI2s\b/g, 'I2S')
    .replace(/\bSd\b/g, 'SD')
    .replace(/\bCs\b/g, 'CS')
    .replace(/\bBpm\b/g, 'BPM')
    .replace(/\bRgb\b/g, 'RGB')
    .replace(/\bFft\b/g, 'FFT')
}

function capitalise(value: string): string {
  return value.split(' ').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

/** The label the inspector shows, or a readable form of the key when it has none. */
function displayPropertyLabel(nodeType: string, key: string): string {
  const label = propertyLabel(nodeType, key)
  if (label !== key) return capitalise(label)
  return PROPERTY_LABELS[key] ?? capitalise(humanizeText(key))
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, '')
}

function formatPropertyValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'string') {
    const lines = value.split('\n')
    if (lines.length > 1) return `${lines.length} lines`
    return value === '' ? 'Empty' : value
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return 'None yet'
    if (value.length <= 4) return value.map((item) => String(item)).join(', ')
    return `${value.length} entries`
  }
  if (value && typeof value === 'object') return 'Set in the node body'
  return 'None'
}

function propertyEntries(node: NodeDefinition): Array<[string, unknown]> {
  return Object.entries(node.defaultProperties ?? {})
    .filter(([key]) => !HIDDEN_PROPERTIES.has(key) && !isInternalProperty(key))
}

function groupedPropertyEntries(node: NodeDefinition): Array<{ label: string; entries: Array<[string, unknown]> }> {
  const entries = propertyEntries(node)
  const valueByKey = new Map(entries)
  const groups = propertyGroupsFor(node.type)
  if (groups && groups.length > 0) {
    const grouped = new Set(groups.flatMap((group) => group.keys))
    const remaining = entries.filter(([key]) => !grouped.has(key))
    return [...groups
      .map((group) => ({
        label: group.label,
        entries: group.keys
          .map((key) => [key, valueByKey.get(key)] as [string, unknown])
          .filter((entry) => valueByKey.has(entry[0])),
      }))
      .filter((group) => group.entries.length > 0),
      ...(remaining.length ? [{ label: 'Settings', entries: remaining }] : []),
    ]
  }
  return entries.length > 0 ? [{ label: 'Settings', entries }] : []
}

function categoryLabel(category: NodeCategory): string {
  return CATEGORY_LABELS[category] ?? capitalise(humanizeText(category))
}

// One glyph per live port dataType. `shows` and `sdcard` are deliberately
// absent: SD Card and Performance Generator are both portless now, so nothing
// carries either type and an entry for them described wiring that cannot exist.
function nodeDataType(node: NodeDefinition): string {
  return node.outputs[0]?.dataType ?? node.inputs[0]?.dataType ?? 'control'
}

function nodeGlyph(node: NodeDefinition): string {
  return TYPE_GLYPH[nodeDataType(node)] ?? '·'
}

function nodeCode(node: NodeDefinition): string {
  return node.type
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.slice(0, 3).toUpperCase())
    .join('-')
}

function matchesNode(node: NodeDefinition, search: string): boolean {
  if (!search) return true
  const haystack = [
    node.label,
    node.type,
    node.category,
    NODE_DESCRIPTIONS[node.type] ?? '',
    ...node.inputs.map((input) => `${input.label} ${input.dataType}`),
    ...node.outputs.map((output) => `${output.label} ${output.dataType}`),
    ...Object.keys(node.defaultProperties ?? {}),
  ].join(' ').toLowerCase()
  return haystack.includes(search)
}

function searchRank(node: NodeDefinition, search: string): number {
  const label = node.label.toLowerCase()
  const type = node.type.toLowerCase()
  if (label === search || type === search) return 0
  if (label.startsWith(search) || type.startsWith(search)) return 1
  if (label.includes(search) || type.includes(search)) return 2
  return 3
}

function describePort(dataType: string, direction: 'input' | 'output'): string {
  const value = PORT_DESCRIPTIONS[dataType] ?? `a ${humanizeText(dataType)} value`
  return direction === 'input' ? `Accepts ${value}.` : `Provides ${value}.`
}

/** Fallback for a property with no written description: say what the control is. */
function describeProperty(node: NodeDefinition, key: string): string {
  const meta = propertyMeta(node.type, key)
  const name = displayPropertyLabel(node.type, key)
  if (meta?.control === 'slider') return `${name}, from ${formatNumber(meta.min)} to ${formatNumber(meta.max)}.`
  if (meta?.control === 'select') return `${name}: ${meta.options.join(', ')}.`
  return `${name}.`
}

function MainPreviewImage({ node, alt }: { node: NodeDefinition; alt: string }) {
  return <img src={mainPreviewSrc(node.type)} alt={alt} loading="lazy" />
}

function ExampleGraphFigure({ node, alt }: { node: NodeDefinition; alt: string }) {
  return (
    <figure className={`${styles.captureFigure} ${styles.captureFigureWide}`}>
      <div className={styles.captureFrame}>
        <img className={styles.captureImage} src={exampleGraphSrc(node.type)} alt={alt} loading="lazy" />
      </div>
    </figure>
  )
}

function NodeCardImage({ node }: { node: NodeDefinition }) {
  return (
    <img
      className={`${styles.nodeCardImage} ${styles.nodeCardImageNarrow}`}
      src={nodeCardSrc(node.type)}
      alt={`${node.label} node as it appears on the canvas`}
      loading="lazy"
    />
  )
}

function PortPanel({ title, ports, direction, descriptions, emptyText }: {
  title: string
  ports: readonly NodePort[]
  direction: 'input' | 'output'
  descriptions?: Record<string, string>
  emptyText: string
}) {
  return (
    <section className={styles.referencePanel}>
      <div className={styles.panelLabel}>{title}</div>
      {ports.length === 0 ? (
        <p className={styles.panelEmpty}>{emptyText}</p>
      ) : ports.map((port) => (
        <div className={styles.portCard} key={port.id}>
          <div className={styles.portTitle}>
            <i style={{ background: portColor(port.dataType) }} />
            <b>{port.label}</b>
            <code>{port.dataType}</code>
          </div>
          <p>{descriptions?.[port.id] ?? describePort(port.dataType, direction)}</p>
        </div>
      ))}
    </section>
  )
}

function PropertyPanel({ node, note }: { node: NodeDefinition; note?: string }) {
  const groups = groupedPropertyEntries(node)
  return (
    <section className={styles.referencePanel}>
      <div className={styles.panelLabel}>Properties</div>
      {groups.length === 0 ? (
        <p className={styles.panelEmpty}>No settings. Everything this node does comes through its sockets.</p>
      ) : (
        <div className={styles.propertyGroupsDetailed}>
          {groups.map((group) => (
            <div className={styles.propertyGroup} key={group.label}>
              <h3>{group.label}</h3>
              {group.entries.map(([key, value]) => (
                <dl className={styles.definitionList} key={key}>
                  <div className={styles.definitionItem}>
                    <dt>{displayPropertyLabel(node.type, key)} <span className={styles.defaultValue}>Default: {formatPropertyValue(value)}</span></dt>
                    <dd>{propertyDescription(node.type, key) ?? describeProperty(node, key)}</dd>
                  </div>
                </dl>
              ))}
            </div>
          ))}
        </div>
      )}
      {note && <p className={styles.panelNote}>{note}</p>}
    </section>
  )
}

/**
 * The sockets Expose input… reveals.
 *
 * Most replace the property of the same name, which the property list already
 * explains, so they are named once as chips under one sentence; only a socket
 * the entry writes about gets a card of its own.
 */
function OptionalInputsPanel({ node, written }: { node: NodeDefinition; written?: Record<string, string> }) {
  const sockets = exposableInputsFor(node.type)
  const described = sockets.filter((port) => written?.[port.id])
  const named = sockets.filter((port) => !written?.[port.id])
  const hasProperty = named.some((port) => port.kind === 'property')
  const hasAction = named.some((port) => port.kind === 'action')
  return (
    <section className={styles.referencePanel}>
      <div className={styles.panelLabel}>Optional inputs</div>
      <p className={styles.panelLead}>
        Expose input… on the node shows these sockets.
        {hasProperty && ' A property socket replaces the property of the same name while wired, so another node can drive it live.'}
        {hasAction && ' An action socket acts on each press: wire a button, a remote key or a beat.'}
      </p>
      {named.length > 0 && (
        <ul className={styles.socketChips}>
          {named.map((port) => (
            <li key={port.id}><i style={{ background: portColor(port.dataType) }} />{port.label}</li>
          ))}
        </ul>
      )}
      {described.map((port) => (
        <div className={styles.portCard} key={port.id}>
          <div className={styles.portTitle}>
            <i style={{ background: portColor(port.dataType) }} />
            <b>{port.label}</b>
            <code>{port.dataType}</code>
          </div>
          <p>{written?.[port.id]}</p>
        </div>
      ))}
    </section>
  )
}

function openLiveExample(node: NodeDefinition) {
  const example = liveExampleForNode(node)
  const ui = useUiStore.getState()
  const usesMicrophone = exampleUsesMicrophone(example)
  const result = insertLiveExample(example, ui.viewCenter)
  useUiStore.setState({
    helpOpen: false,
    previewPanelOpen: true,
    // Microphone examples must demonstrate the real input path, even if the
    // user previously left the global FFT demo signal enabled.
    ...(usesMicrophone ? { testSignal: false } : {}),
  })
  window.setTimeout(() => {
    useUiStore.getState().requestFitView(result.nodeIds)
  }, 80)
  const outputKeys = new Set(example.nodes.filter((entry) => entry.type === 'MatrixOutput').map((entry) => entry.key))
  const outputInputOccupied = result.skippedConnections.some((edge) =>
    outputKeys.has(edge.target) && edge.targetHandle === 'frame')
  ui.setStatus(outputInputOccupied
    ? `${node.label} example added — the LED output is already in use; connect the final frame when ready`
    : `${node.label} example added${usesMicrophone ? ' — microphone starting' : ''}`, 'success')
  if (usesMicrophone) {
    void useAudioStore.getState().startAudio().catch(() => {
      ui.setStatus('Microphone could not start. Check browser permission and the selected audio input.', 'error')
    })
  }
}

function NodeArticle({ node }: { node: NodeDefinition }) {
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  const entry = nodeReferenceEntry(node)
  const example = liveExampleForNode(node)
  const properties = propertyEntries(node)
  const optionalInputs = exposableInputsFor(node.type)
  const mainInputs = node.inputs.filter((port) => !optionalInputs.some((optional) => optional.id === port.id))
  const workflow = example.previewMode === 'workflow'
  const counts = [
    `${mainInputs.length} ${mainInputs.length === 1 ? 'input' : 'inputs'}`,
    ...(optionalInputs.length ? [`${optionalInputs.length} optional`] : []),
    `${node.outputs.length} ${node.outputs.length === 1 ? 'output' : 'outputs'}`,
    `${properties.length} ${properties.length === 1 ? 'property' : 'properties'}`,
  ]
  return (
    <article className={styles.article} style={{ '--node-accent': accent } as React.CSSProperties}>
      <div className={styles.breadcrumb}>{categoryLabel(node.category)} nodes <span>/</span> {node.label}</div>
      <header className={styles.articleHeader}>
        <div>
          <div className={styles.eyebrow}><i style={{ background: accent }} />{node.subcategory ?? categoryLabel(node.category)}</div>
          <h1>{node.label}</h1>
          <p>{NODE_DESCRIPTIONS[node.type]}</p>
        </div>
        <div className={styles.articleMeta}>{counts.join(' · ')}</div>
      </header>

      <div className={styles.introGrid}>
        <figure className={styles.nodeCapture}>
          <div className={styles.nodeCaptureFrame}>
            <NodeCardImage node={node} />
          </div>
        </figure>
        <section className={styles.overviewPanel}>
          <div className={styles.sectionKicker}>What it does</div>
          <h2>Overview</h2>
          {entry.overview.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>
      </div>

      {entry.steps && (
        <section className={styles.manualSection}>
          <h2>Set up and connect</h2>
          <ol>{entry.steps.map((step) => <li key={step}><p>{step}</p></li>)}</ol>
        </section>
      )}

      <div className={styles.portRow}>
        <PortPanel
          title="Inputs"
          ports={mainInputs}
          direction="input"
          descriptions={entry.inputs}
          emptyText={optionalInputs.length ? 'None until you expose one below.' : 'None — this node starts a signal chain.'}
        />
        <PortPanel
          title="Outputs"
          ports={node.outputs}
          direction="output"
          descriptions={entry.outputs}
          emptyText="None — this node ends its chain."
        />
      </div>
      {optionalInputs.length > 0 && <OptionalInputsPanel node={node} written={entry.inputs} />}
      <PropertyPanel node={node} note={entry.propertyNote} />

      <section className={styles.exampleSection}>
        <div className={styles.sectionHeading}>
          <div>
            <div className={styles.sectionKicker}>Example</div>
            <h2>{example.title}</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>{example.path}</span>
            <button className={styles.tryLiveButton} type="button" onClick={() => openLiveExample(node)}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <ExampleGraphFigure node={node} alt={`Example graph on the canvas: ${example.path}`} />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>{example.explanation}</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>{workflow ? 'Result' : 'Main preview'}</div>
          <h2>{workflow ? 'What changes' : 'What you should see'}</h2>
          <p>{example.previewDescription}</p>
        </div>
        <figure className={styles.previewCapture}>
          {workflow ? (
            <div className={styles.workflowOutcome}>
              <span>Workflow</span>
              <b>{node.label}</b>
              <p>{entry.outcome ?? 'Its result shows on the bench, in the Build Diagram or in the upload, rather than in the LED preview.'}</p>
            </div>
          ) : (
            <MainPreviewImage node={node} alt={`The LED preview of the ${node.label} example`} />
          )}
        </figure>
      </section>
    </article>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className={styles.guideKey}>{children}</kbd>
}

function UsingNodesArticle() {
  return (
    <article className={`${styles.article} ${styles.usingNodesArticle}`} style={{ '--node-accent': '#5ad1ff' } as React.CSSProperties}>
      <div className={styles.breadcrumb}>Node reference <span>/</span> Introduction</div>
      <header className={styles.articleHeader}>
        <div>
          <div className={styles.eyebrow}><i style={{ background: '#5ad1ff' }} />Getting started</div>
          <h1>Using Nodes</h1>
          <p>Start with the small set of canvas actions used in every design: add nodes, connect compatible ports, edit values, and organise a growing patch.</p>
        </div>
        <div className={styles.articleMeta}>Add · connect · edit · organise</div>
      </header>

      <section className={styles.nodeBasicsFlow} aria-label="Basic node flow">
        <div className={styles.flowCard}>
          <span className={styles.flowNumber}>1</span>
          <b>Source</b>
          <small>Make a signal, colour, palette, field, or frame.</small>
        </div>
        <span className={styles.flowArrow} aria-hidden="true">→</span>
        <div className={styles.flowCard}>
          <span className={styles.flowNumber}>2</span>
          <b>Shape it</b>
          <small>Wire values into patterns, math nodes, and effects.</small>
        </div>
        <span className={styles.flowArrow} aria-hidden="true">→</span>
        <div className={styles.flowCard}>
          <span className={styles.flowNumber}>3</span>
          <b>LED output</b>
          <small>Send the final frame to preview, export, or hardware.</small>
        </div>
      </section>

      <section className={styles.manualSection}>
        <h2>Read a node</h2>
        <div className={styles.guideGrid}>
          <div className={styles.guideCard}>
            <h3><span>●</span> Inputs and outputs</h3>
            <p>Inputs are on the left; outputs are on the right. Port colour identifies the data type, so matching colours are a useful first check. Drag from an output to a compatible input to create a connection, called a noodle.</p>
          </div>
          <div className={styles.guideCard}>
            <h3><span>◫</span> Controls and preview</h3>
            <p>Edit sliders, switches, and menus directly on the node. A connected input overrides its local editor, which becomes unavailable until you unplug that input. Collapse frame, colour, and palette previews when you need more canvas space.</p>
          </div>
        </div>
      </section>

      <section className={styles.manualSection}>
        <h2>Add or spawn nodes</h2>
        <ol className={styles.guideSteps}>
          <li><b>Choose from the library:</b> click a node card to add it near the view centre, or drag the card to an exact canvas position.</li>
          <li><b>Search at the canvas:</b> press <Key>Ctrl/Cmd</Key>+<Key>K</Key> to search at the view centre, double-click empty canvas to search at the pointer, or right-click and choose <b>Add Node</b>.</li>
          <li><b>Continue from an output:</b> drag a noodle from an output to empty canvas. Search is filtered to compatible next nodes and connects your choice automatically. When needed, it can offer a short conversion chain.</li>
          <li><b>Insert into a connection:</b> drop a compatible library node—or drag a loose, unconnected node—onto a noodle. Studio splices it between the two connected nodes.</li>
          <li><b>Start with a complete example:</b> use Quick recipes in the sidebar or <b>✦ Start</b> when you would rather modify a working patch.</li>
        </ol>
      </section>

      <section className={styles.manualSection}>
        <h2>Select and move</h2>
        <div className={styles.guideGrid}>
          <div className={styles.guideCard}>
            <h3>Single and multi-select</h3>
            <p>Click a node to select it. Hold <Key>Shift</Key> while clicking to add or remove nodes from the selection, or hold <Key>Shift</Key> and drag on empty canvas to draw a selection box. <Key>Ctrl/Cmd</Key> + <Key>A</Key> selects every node; <Key>Esc</Key> clears the selection.</p>
          </div>
          <div className={styles.guideCard}>
            <h3>Move and navigate</h3>
            <p>Drag any selected node to move the whole selection. Drag empty background to pan; scroll or pinch to zoom. Drag the MiniMap viewport to jump around a large graph.</p>
          </div>
        </div>
      </section>

      <section className={styles.manualSection}>
        <h2>Copy, paste, duplicate, and delete</h2>
        <dl className={styles.actionList}>
          <div>
            <dt><Key>Ctrl/Cmd</Key> + <Key>C</Key></dt>
            <dd>Copies the selected node or multi-selection. Connections whose two ends are both selected are copied with it.</dd>
          </div>
          <div>
            <dt><Key>Ctrl/Cmd</Key> + <Key>V</Key></dt>
            <dd>Pastes the copied patch near the centre of the current view and keeps its internal wiring intact.</dd>
          </div>
          <div>
            <dt><Key>Ctrl/Cmd</Key> + <Key>D</Key></dt>
            <dd>Quickly duplicates the focused node with a small offset. Use copy and paste when you want to duplicate a whole selection.</dd>
          </div>
          <div>
            <dt><Key>Delete</Key> / <Key>Backspace</Key></dt>
            <dd>Deletes every selected node and its attached noodles. You can also use <b>Delete</b> in a node menu or <b>Delete Selected</b> in the canvas menu.</dd>
          </div>
        </dl>
        <p className={styles.guideCallout}><b>Mistake?</b> Use <Key>Ctrl/Cmd</Key> + <Key>Z</Key> to undo and <Key>Ctrl/Cmd</Key> + <Key>Y</Key> (or <Key>Ctrl/Cmd</Key> + <Key>Shift</Key> + <Key>Z</Key>) to redo.</p>
      </section>

      <section className={styles.manualSection}>
        <h2>Wire and rewire</h2>
        <div className={styles.guideGrid}>
          <div className={styles.guideCard}>
            <h3>Connect with typed ports</h3>
            <p>Start at an output and release on a compatible input. Each input accepts one noodle, so a new connection replaces the one already there. Hover a port to confirm its label and data type; incompatible ports will not connect.</p>
          </div>
          <div className={styles.guideCard}>
            <h3>Unplug or reroute</h3>
            <p>Grab a connected input port and drag. Release on empty canvas to unplug it, or release on a compatible output to reroute it. Right-click a node and choose <b>Disconnect All</b> to remove every noodle attached to that node.</p>
          </div>
        </div>
      </section>

      <section className={styles.manualSection}>
        <h2>Organise and reuse</h2>
        <div className={styles.guideGrid}>
          <div className={styles.guideCard}>
            <h3>Tidy the graph</h3>
            <p>Use <b>▦</b> (Tidy) in the canvas controls, beside the minimap, or <b>Tidy Graph</b> in the canvas menu. When two or more nodes are selected, only that selection is arranged; otherwise the whole graph is tidied.</p>
          </div>
          <div className={styles.guideCard}>
            <h3>Make a reusable group</h3>
            <p>Select a patch and press <Key>Ctrl/Cmd</Key> + <Key>G</Key>, use the floating <b>Group</b> button, or open a selected node's context menu. Double-click the finished Group to enter it and use <b>← Main</b> to return. Groups can be saved to the <b>Pattern Library</b>.</p>
          </div>
          <div className={styles.guideCard}>
            <h3>Use the node menu</h3>
            <p>Right-click a node for context actions such as Copy, Duplicate, Disconnect All, Group, presets, Randomize Look, Mutate, Reset, and Delete. The available actions depend on the node and selection.</p>
          </div>
          <div className={styles.guideCard}>
            <h3>Test an effect safely</h3>
            <p>Compatible frame and field effects expose <b>bypass</b> for quick A/B testing. Nodes with bounded float inputs may expose <b>clamp inputs</b> to keep wired signals in a safe range.</p>
          </div>
        </div>
      </section>

      <section className={styles.manualSection}>
        <h2>A reliable first patch</h2>
        <p className={styles.guideCallout}>Add <b>Juggle</b> and <b>LED Matrix</b>, then connect <b>Juggle.frame → LED Matrix.frame</b>. If the LED Preview animates, the graph is complete. Set Count to 5, raise Speed, splice in Trails, then splice in Transform. This two-node patch uses the same editing workflow as a full show.</p>
      </section>
    </article>
  )
}

export default function NodeReference() {
  const helpNodeReference = useUiStore((state) => state.helpNodeReference)
  const setHelpNodeReference = useUiStore((state) => state.setHelpNodeReference)
  const selectedType = helpNodeReference.selectedType
  const search = helpNodeReference.search
  const expandedCategory = helpNodeReference.expandedCategory
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())
  const visibleNodes = NODE_LIBRARY.filter((node) => matchesNode(node, deferredSearch))
  const orderedVisibleNodes = deferredSearch
    ? [...visibleNodes].sort((a, b) => searchRank(a, deferredSearch) - searchRank(b, deferredSearch) || a.label.localeCompare(b.label))
    : CATEGORY_ORDER.flatMap((group) => visibleNodes.filter((node) => node.category === group))
  const showingIntroduction = selectedType === '' || selectedType === NODE_INTRO_TYPE
  const selectedNode = showingIntroduction
    ? undefined
    : orderedVisibleNodes.find((node) => node.type === selectedType) ?? orderedVisibleNodes[0]
  const categoryCounts = CATEGORY_ORDER.reduce<Record<string, number>>((acc, group) => {
    acc[group] = NODE_LIBRARY.filter((node) => node.category === group).length
    return acc
  }, {})

  const readerRef = useRef<HTMLDivElement>(null)
  const articleKey = showingIntroduction ? NODE_INTRO_TYPE : selectedNode?.type
  useEffect(() => {
    const reader = readerRef.current
    if (!reader) return
    if (typeof reader.scrollTo === 'function') {
      reader.scrollTo({ top: 0 })
      return
    }
    reader.scrollTop = 0
  }, [articleKey])

  return (
    <div className={styles.reference}>
      <aside className={styles.directory} aria-label="Node reference index">
        <div className={styles.directoryHeader}>
          <div>
            <div className={styles.referenceTitle}>Node reference</div>
            <div className={styles.referenceText}>Patch manual</div>
          </div>
          <div className={styles.directoryStats}>
            <span>{NODE_LIBRARY.length} modules</span>
            <span>{CATEGORY_ORDER.length} banks</span>
          </div>
        </div>
        <div className={styles.searchWrap}>
          <label htmlFor="node-reference-search">Find module</label>
          <input
            id="node-reference-search"
            value={search}
            onChange={(event) => setHelpNodeReference({ search: event.target.value })}
            className={styles.search}
            placeholder="Search nodes…"
            type="search"
          />
        </div>
        <nav className={styles.nodeIndex}>
          <button
            type="button"
            className={`${styles.introIndexItem} ${showingIntroduction ? styles.introIndexItemActive : ''}`}
            onClick={() => setHelpNodeReference({ selectedType: NODE_INTRO_TYPE })}
          >
            <span className={styles.introIndexGlyph}>◎</span>
            <span className={styles.indexCopy}>
              <span className={styles.indexTopline}><b>Using Nodes</b><code>START</code></span>
              <small>Introduction</small>
              <em>Add, select, wire, copy, group, and organise nodes.</em>
            </span>
          </button>
          {CATEGORY_ORDER.map((group) => {
            const nodes = orderedVisibleNodes.filter((node) => node.category === group)
            if (deferredSearch && nodes.length === 0) return null
            const open = deferredSearch ? nodes.length > 0 : expandedCategory === group
            return (
              <section className={styles.indexCategory} style={{ '--category-accent': CATEGORY_COLOR[group] ?? '#9aa0a6' } as React.CSSProperties} key={group}>
                <button
                  className={styles.indexCategoryHeader}
                  type="button"
                  aria-expanded={open}
                  onClick={() => setHelpNodeReference({ expandedCategory: open ? null : group })}
                >
                  <span><i />{categoryLabel(group)} <b>{categoryCounts[group]}</b></span>
                  <span className={styles.indexChevron}>{open ? '▴' : '▾'}</span>
                </button>
                {open && (
                  <div className={styles.indexModules}>
                    {nodes.map((node) => (
                      <button
                        key={node.type}
                        type="button"
                        className={`${styles.indexItem} ${selectedNode?.type === node.type ? styles.indexItemActive : ''}`}
                        onClick={() => {
                          setHelpNodeReference({
                            selectedType: node.type,
                            expandedCategory: node.category,
                          })
                        }}
                      >
                        <span className={styles.indexGlyph}>{nodeGlyph(node)}</span>
                        <span className={styles.indexCopy}>
                          <span className={styles.indexTopline}><b>{node.label}</b><code>{nodeCode(node)}</code></span>
                          <small>{nodeDataType(node)}{node.subcategory ? ` · ${node.subcategory}` : ''}</small>
                          <em>{NODE_DESCRIPTIONS[node.type] ?? node.label}</em>
                        </span>
                        <span className={styles.indexGrip}>⠿</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
          {orderedVisibleNodes.length === 0 && <div className={styles.noResults}>No nodes match “{search}”.</div>}
        </nav>
      </aside>

      <div className={styles.reader} ref={readerRef}>
        {showingIntroduction && <UsingNodesArticle />}
        {selectedNode && <NodeArticle key={selectedNode.type} node={selectedNode} />}
      </div>
    </div>
  )
}
