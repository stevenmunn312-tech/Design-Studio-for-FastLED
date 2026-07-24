import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { canAddNodeType, SINGLETON_NODE_TYPES, useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { useAudioStore } from '../../state/audioStore'
import { usePatternLibrary, importPatternFile, type SavedPattern } from '../../state/patternLibrary'
import { AUDIO_REACTIVE_CATEGORY_ID, STANDARD_CATEGORY_ID } from '../../state/bundledPatterns'
import { NODE_LIBRARY, CATEGORIES, CATEGORY_ACCENT_VAR, NODE_DESCRIPTIONS, categoryNodes } from '../../state/nodeLibrary'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import { revealPatternsFolder } from '../../utils/backendClient'
import { runTidy } from '../../utils/tidyGraph'
import type { NodeDefinition } from '../../types'
import styles from './Sidebar.module.css'

// Bumped to v2 so existing sessions (whose stored value predates Quick
// recipes becoming collapsible) fall through to the new 'recipes' default
// once, instead of staying stuck on whatever category they had open before.
const EXPANDED_KEY = 'design-studio-for-fastled-sidebar-expanded-v2'
const FAVOURITES_KEY = 'design-studio-for-fastled-sidebar-favourites'
const RECENT_KEY = 'design-studio-for-fastled-sidebar-recent'
const VIEW_KEY = 'design-studio-for-fastled-sidebar-view'
const RECENT_LIMIT = 8

const BEGINNER_NODE_TYPES = new Set([
  'MicInput', 'FFTAnalyzer', 'BeatDetect',
  'Wave', 'Counter', 'Random', 'SampleHold',
  'HueCycle', 'HSVToRGB', 'PaletteSelector',
  'SolidColor', 'Text', 'GradientFrame', 'Noise', 'Rainbow', 'Fire2012', 'SpectrumBars', 'SpectrumVisualizer', 'ColorTrails', 'Animartrix',
  'Brightness', 'Fade', 'HueShift', 'Trails', 'Blend', 'Transition',
  'PatternCollection', 'PatternMaster', 'PerformanceGenerator', 'SDCard',
  'MatrixOutput',
])

const INTENT_TAGS: Record<string, string[]> = {
  MicInput: ['audio', 'hardware'],
  FFTAnalyzer: ['audio', 'reactive'],
  BeatDetect: ['audio', 'trigger'],
  AudioFeatures: ['audio', 'analysis'],
  Wave: ['motion', 'signal'],
  Counter: ['motion', 'timing'],
  Random: ['variation', 'signal'],
  SampleHold: ['trigger', 'variation'],
  HueCycle: ['color', 'motion'],
  PaletteSelector: ['color', 'palette'],
  SolidColor: ['color', 'base'],
  Text: ['text', 'display'],
  GradientFrame: ['color', 'base'],
  Noise: ['texture', 'motion'],
  Rainbow: ['color', 'starter'],
  Fire2012: ['classic', 'starter'],
  SpectrumBars: ['audio', 'visualizer'],
  SpectrumVisualizer: ['audio', 'spectrum', 'visualizer'],
  ColorTrails: ['audio', 'fluid', 'feedback'],
  Animartrix: ['audio', 'stefan petrick', 'water', 'kaleidoscope', 'spiral'],
  Brightness: ['utility', 'dimmer'],
  Fade: ['utility', 'motion'],
  HueShift: ['color', 'motion'],
  Trails: ['motion', 'feedback'],
  Blend: ['composite', 'layer'],
  Transition: ['composite', 'scene'],
  PatternCollection: ['show', 'playlist'],
  PatternMaster: ['show', 'performance'],
  PerformanceGenerator: ['show', 'music-sync'],
  SDCard: ['show', 'offline'],
  MatrixOutput: ['hardware', 'terminal'],
}

interface RecipeCard {
  id: string
  title: string
  kicker: string
  description: string
  actionLabel: string
  nodes: Array<{ key: string; type: string; dx: number; dy: number; props?: Record<string, unknown> }>
  edges: Array<{ source: string; sourceHandle: string; target: string; targetHandle: string }>
}

const RECIPE_CARDS: RecipeCard[] = [
  {
    id: 'live-spectrum',
    title: 'Live spectrum',
    kicker: 'Continuous response',
    description: 'See how continuous microphone energy becomes pixels, then add memory with Trails.',
    actionLabel: 'Add guided patch',
    nodes: [
      { key: 'mic', type: 'MicInput', dx: -340, dy: -80 },
      { key: 'spectrum', type: 'SpectrumVisualizer', dx: -100, dy: -40 },
      { key: 'trails', type: 'Trails', dx: 180, dy: -20, props: { decay: 0.32 } },
      { key: 'out', type: 'MatrixOutput', dx: 400, dy: -20 },
      {
        key: 'guide', type: 'Comment', dx: -340, dy: -280,
        props: {
          text: 'HOW IT WORKS\nMic sends Audio to the visualizer. Trails remembers recent frames.\nTry Spectrum Style, then Trails Decay.',
          color: '#74d7ff',
        },
      },
    ],
    edges: [
      { source: 'mic', sourceHandle: 'audio', target: 'spectrum', targetHandle: 'audio' },
      { source: 'spectrum', sourceHandle: 'frame', target: 'trails', targetHandle: 'frame' },
      { source: 'trails', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  },
  {
    id: 'beat-colour-jump',
    title: 'Beat colour jump',
    kicker: 'Discrete events',
    description: 'Learn event-driven wiring: each detected beat captures and holds one new palette colour.',
    actionLabel: 'Add guided patch',
    nodes: [
      { key: 'mic', type: 'MicInput', dx: -440, dy: -140 },
      { key: 'beat', type: 'BeatDetect', dx: -220, dy: -140 },
      { key: 'rand', type: 'Random', dx: -440, dy: 40, props: { min: 0, max: 1 } },
      { key: 'hold', type: 'SampleHold', dx: -220, dy: 40 },
      { key: 'sample', type: 'PaletteSampler', dx: 20, dy: 40, props: { palette: 'party' } },
      { key: 'solid', type: 'SolidColor', dx: 260, dy: 40 },
      { key: 'out', type: 'MatrixOutput', dx: 500, dy: 40 },
      {
        key: 'guide', type: 'Comment', dx: -440, dy: -320,
        props: {
          text: 'EVENT RECIPE\nBeat Detect sends a pulse. Sample & Hold grabs Random only on that pulse.\nTry another palette in Palette Sampler.',
          color: '#ffd166',
        },
      },
    ],
    edges: [
      { source: 'mic', sourceHandle: 'audio', target: 'beat', targetHandle: 'audio' },
      { source: 'rand', sourceHandle: 'value', target: 'hold', targetHandle: 'value' },
      { source: 'beat', sourceHandle: 'beat', target: 'hold', targetHandle: 'trigger' },
      { source: 'hold', sourceHandle: 'result', target: 'sample', targetHandle: 't' },
      { source: 'sample', sourceHandle: 'color', target: 'solid', targetHandle: 'color' },
      { source: 'solid', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  },
  {
    id: 'percussion-trails',
    title: 'Percussion trails',
    kicker: 'Separated transients',
    description: 'Split kick, snare, and hi-hat into separate controls, then turn their shockwaves into trails.',
    actionLabel: 'Add guided patch',
    nodes: [
      { key: 'mic', type: 'MicInput', dx: -420, dy: -80 },
      { key: 'percussion', type: 'PercussionDetect', dx: -200, dy: -80, props: { sensitivity: 0.62, decay: 0.55, separation: 0.7 } },
      { key: 'shock', type: 'KickShock', dx: 60, dy: -20, props: { palette: 'volcano', energy: 0.85, thickness: 1.25, spawnSpread: 0.25 } },
      { key: 'trails', type: 'Trails', dx: 300, dy: -20, props: { decay: 0.36 } },
      { key: 'out', type: 'MatrixOutput', dx: 520, dy: -20 },
      {
        key: 'guide', type: 'Comment', dx: -420, dy: -280,
        props: {
          text: 'THREE TRIGGERS\nKick, Snare and Hi-Hat are separate signals. Kick Shock gives each a visual role.\nTry Sensitivity, then Trails Decay.',
          color: '#ff9f6e',
        },
      },
    ],
    edges: [
      { source: 'mic', sourceHandle: 'audio', target: 'percussion', targetHandle: 'audio' },
      { source: 'percussion', sourceHandle: 'kick', target: 'shock', targetHandle: 'kick' },
      { source: 'percussion', sourceHandle: 'snare', target: 'shock', targetHandle: 'snare' },
      { source: 'percussion', sourceHandle: 'hihat', target: 'shock', targetHandle: 'hihat' },
      { source: 'shock', sourceHandle: 'frame', target: 'trails', targetHandle: 'frame' },
      { source: 'trails', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  },
]

const TYPE_GLYPH: Record<string, string> = {
  frame: '▦', palette: '≋', color: '●', audio: '⌁', float: '∿', bool: '◆',
  field: '⌖', music: '♫', shows: '▶', sdcard: '▣', patternset: '◫', transitionset: '⇄',
}

function moduleType(def: NodeDefinition) {
  return def.outputs[0]?.dataType ?? def.inputs[0]?.dataType ?? 'control'
}

function moduleGlyph(def: NodeDefinition) {
  return TYPE_GLYPH[moduleType(def)] ?? '·'
}

function moduleCode(def: NodeDefinition) {
  return def.type
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.slice(0, 3).toUpperCase())
    .join('-')
}

function loadExpanded(): string | null {
  try {
    const stored = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? 'null') as unknown
    if (typeof stored === 'string') return stored
    if (Array.isArray(stored)) return typeof stored[0] === 'string' ? stored[0] : null
    return null
  } catch {
    return null
  }
}

function loadStringArray(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function loadView(): 'beginner' | 'all' {
  try {
    return JSON.parse(localStorage.getItem(VIEW_KEY) ?? '"all"') === 'beginner' ? 'beginner' : 'all'
  } catch {
    return 'all'
  }
}

function Sidebar() {
  const addNode = useGraphStore((s) => s.addNode)
  const onConnect = useGraphStore((s) => s.onConnect)
  // Availability only changes when one of the singleton node types is added or
  // removed. Subscribing to the full node array made every drag position update
  // re-render the entire library rack.
  const singletonSignature = useGraphStore((s) =>
    [...SINGLETON_NODE_TYPES]
      .filter((type) => s.nodes.some((node) => node.data.nodeType === type))
      .join('|')
  )
  const presentSingletons = useMemo(() => new Set(singletonSignature.split('|').filter(Boolean)), [singletonSignature])
  const isEmptyGraph = useGraphStore((s) => s.nodes.length === 0)
  const instantiatePattern = useGraphStore((s) => s.instantiatePattern)
  const createCollectionFromPatterns = useGraphStore((s) => s.createCollectionFromPatterns)
  const patterns = usePatternLibrary((s) => s.patterns)
  const patternCategories = usePatternLibrary((s) => s.categories)
  const renamePattern = usePatternLibrary((s) => s.renamePattern)
  const deletePattern = usePatternLibrary((s) => s.deletePattern)
  const createPatternCategory = usePatternLibrary((s) => s.createCategory)
  const deletePatternCategory = usePatternLibrary((s) => s.deleteCategory)
  const movePattern = usePatternLibrary((s) => s.movePattern)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const viewCenter = useUiStore((s) => s.viewCenter)
  const setStatus = useUiStore((s) => s.setStatus)
  const openRatings = useUiStore((s) => s.openRatings)
  const setDraggingNodeType = useUiStore((s) => s.setDraggingNodeType)
  // One-bank-at-a-time accordion. We still persist the last opened section,
  // but unlike the old multi-open drawer this keeps the library scan tight.
  const [expandedId, setExpandedId] = useState<string | null>(() => loadExpanded() ?? 'recipes')
  const [viewMode, setViewMode] = useState<'beginner' | 'all'>(() => loadView())
  const [favourites, setFavourites] = useState<string[]>(() => loadStringArray(FAVOURITES_KEY))
  const [recent, setRecent] = useState<string[]>(() => loadStringArray(RECENT_KEY))
  const [openPatternCategories, setOpenPatternCategories] = useState<Set<string>>(
    () => new Set([STANDARD_CATEGORY_ID, AUDIO_REACTIVE_CATEGORY_ID]),
  )
  const [creatingPatternCategory, setCreatingPatternCategory] = useState(false)
  const [patternCategoryDraft, setPatternCategoryDraft] = useState('')
  const [patternShelfDrop, setPatternShelfDrop] = useState<string | null>(null)

  // Persist on every change so the layout survives reloads.
  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify(expandedId))
    } catch {
      // storage full/unavailable — non-critical, skip
    }
  }, [expandedId])
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(viewMode)) } catch { /* ignore */ }
  }, [viewMode])
  useEffect(() => {
    try { localStorage.setItem(FAVOURITES_KEY, JSON.stringify(favourites)) } catch { /* ignore */ }
  }, [favourites])
  useEffect(() => {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)) } catch { /* ignore */ }
  }, [recent])
  const [search, setSearch] = useState('')
  // Inline rename: the pattern id currently being edited + its draft name.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const query = search.trim().toLowerCase()

  const isVisibleInView = useCallback(
    (def: NodeDefinition) => viewMode === 'all' || BEGINNER_NODE_TYPES.has(def.type),
    [viewMode],
  )
  const nodeMatchesQuery = useCallback((def: NodeDefinition) => {
    if (query === '') return true
    const haystack = [
      def.label,
      def.type,
      NODE_DESCRIPTIONS[def.type] ?? '',
      ...(INTENT_TAGS[def.type] ?? []),
      def.subcategory ?? '',
    ].join(' ').toLowerCase()
    return haystack.includes(query)
  }, [query])
  const filteredByView = useCallback(
    (defs: NodeDefinition[]) => defs.filter((def) => isVisibleInView(def) && nodeMatchesQuery(def)),
    [isVisibleInView, nodeMatchesQuery],
  )
  const favouriteDefs = favourites
    .map((type) => NODE_LIBRARY.find((def) => def.type === type))
    .filter((def): def is NodeDefinition => !!def)
    .filter((def) => nodeMatchesQuery(def))
  const recentDefs = recent
    .map((type) => NODE_LIBRARY.find((def) => def.type === type))
    .filter((def): def is NodeDefinition => !!def)
    .filter((def) => nodeMatchesQuery(def))
  const visibleRecipes = RECIPE_CARDS.filter((recipe) => (
    query === '' || `${recipe.title} ${recipe.kicker} ${recipe.description}`.toLowerCase().includes(query)
  ))

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id))

  const rememberRecent = (type: string) => {
    setRecent((prev) => [type, ...prev.filter((entry) => entry !== type)].slice(0, RECENT_LIMIT))
  }

  const toggleFavourite = (type: string) => {
    setFavourites((prev) => prev.includes(type) ? prev.filter((entry) => entry !== type) : [type, ...prev])
  }

  const handleDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('application/studio-node', type)
    e.dataTransfer.effectAllowed = 'copy'
    setDraggingNodeType(type)

    const def = NODE_LIBRARY.find((node) => node.type === type)
    if (!def || typeof e.dataTransfer.setDragImage !== 'function') return
    const ghost = document.createElement('div')
    ghost.className = styles.dragGhost
    ghost.style.setProperty('--accent', CATEGORY_ACCENT_VAR[def.category])
    const glyph = document.createElement('span')
    glyph.className = styles.dragGhostGlyph
    glyph.textContent = moduleGlyph(def)
    const copy = document.createElement('span')
    copy.className = styles.dragGhostCopy
    const name = document.createElement('strong')
    name.textContent = def.label
    const typeLabel = document.createElement('small')
    typeLabel.textContent = `${moduleType(def)} module`
    copy.append(name, typeLabel)
    ghost.append(glyph, copy)
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 22, 24)
    window.setTimeout(() => ghost.remove(), 0)
  }

  const handlePatternDragStart = (e: React.DragEvent, pattern: SavedPattern) => {
    e.dataTransfer.setData('application/studio-pattern', pattern.id)
    e.dataTransfer.effectAllowed = pattern.bundled ? 'copy' : 'copyMove'
  }

  // Importing pattern files dragged in from the OS (e.g. a `.json` shared by
  // someone else, or one copied out of the "My Patterns" disk folder). Only
  // reacts to real OS files — internal node/pattern drags carry no `files`,
  // so they pass through untouched.
  const [patternDragOver, setPatternDragOver] = useState(false)
  const handlePatternDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setPatternDragOver(true)
    }
  }
  const handlePatternDragLeave = () => setPatternDragOver(false)
  const handlePatternDrop = async (e: React.DragEvent) => {
    if (e.dataTransfer.files.length === 0) return
    e.preventDefault()
    setPatternDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.json'))
    let imported = 0
    for (const file of files) {
      try {
        const name = importPatternFile(JSON.parse(await file.text()))
        if (name) imported++
      } catch {
        // not valid JSON / not a saved pattern — skip it
      }
    }
    if (imported > 0) setStatus(`Imported ${imported} pattern${imported === 1 ? '' : 's'}`, 'success')
    else if (files.length > 0) setStatus('No valid pattern files found in drop', 'error')
  }

  const handleRevealFolder = async () => {
    const ok = await revealPatternsFolder()
    if (!ok) setStatus('Upload helper offline — can’t open the saved-pattern folder', 'error')
  }

  const togglePatternCategory = (id: string) => {
    setOpenPatternCategories((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const commitPatternCategory = () => {
    const name = patternCategoryDraft.trim()
    if (!name) {
      setCreatingPatternCategory(false)
      setPatternCategoryDraft('')
      return
    }
    const id = createPatternCategory(name)
    if (!id) {
      setStatus('Choose a unique shelf name', 'error')
      return
    }
    setOpenPatternCategories((current) => new Set([...current, id]))
    setCreatingPatternCategory(false)
    setPatternCategoryDraft('')
    setStatus(`Created “${name}” shelf`, 'success')
  }

  const handlePatternShelfDragOver = (event: React.DragEvent, categoryId: string) => {
    if (!event.dataTransfer.types.includes('application/studio-pattern')) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setPatternShelfDrop(categoryId)
  }

  const handlePatternShelfDrop = (event: React.DragEvent, categoryId: string | null) => {
    const patternId = event.dataTransfer.getData('application/studio-pattern')
    if (!patternId) return
    event.preventDefault()
    event.stopPropagation()
    setPatternShelfDrop(null)
    const pattern = patterns.find((entry) => entry.id === patternId)
    if (!pattern || pattern.bundled) return
    movePattern(patternId, categoryId)
    const shelf = categoryId
      ? patternCategories.find((entry) => entry.id === categoryId)?.name ?? 'shelf'
      : 'New & Unsorted'
    setStatus(`Moved “${pattern.name}” to ${shelf}`, 'success')
  }

  // Drop click-added nodes at the centre of the visible canvas (with a little
  // jitter so repeats don't stack), so they land on screen wherever the user
  // has panned — not at a fixed coordinate that may be off-screen.
  const dropPos = () => ({
    x: viewCenter.x + (Math.random() - 0.5) * 80,
    y: viewCenter.y + (Math.random() - 0.5) * 80,
  })
  const handleAddPattern = (p: SavedPattern) => instantiatePattern(p, dropPos(), true)
  const handleCreateCollection = () => {
    if (patterns.length === 0) {
      setStatus('Pattern Library is empty', 'error')
      return
    }
    const def = NODE_LIBRARY.find((n) => n.type === 'PatternCollection')
    if (!def) {
      setStatus('Pattern Collection node is unavailable', 'error')
      return
    }
    createCollectionFromPatterns(
      patterns,
      dropPos(),
      resolveDefaultProperties(def.type, def.defaultProperties),
      true,
    )
    setStatus(`Created collection with ${patterns.length} pattern${patterns.length === 1 ? '' : 's'}`, 'success')
  }

  const startRename = (p: SavedPattern) => {
    setRenamingId(p.id)
    setDraftName(p.name)
  }
  const commitRename = () => {
    if (renamingId) {
      const name = draftName.trim()
      if (name) renamePattern(renamingId, name)
    }
    setRenamingId(null)
  }
  const cancelRename = () => setRenamingId(null)

  const visiblePatterns = patterns.filter(
    (p) => query === '' || p.name.toLowerCase().includes(query)
  )
  const uncategorizedPatterns = visiblePatterns.filter((pattern) => !pattern.categoryId)
  const patternsByCategory = useMemo(() => new Map(
    patternCategories.map((category) => [
      category.id,
      visiblePatterns.filter((pattern) => pattern.categoryId === category.id),
    ]),
  ), [patternCategories, visiblePatterns])
  const visibleSectionIds = useMemo(() => [
    ...(favouriteDefs.length > 0 ? ['favourites'] : []),
    ...(recentDefs.length > 0 ? ['recent'] : []),
    ...CATEGORIES
      .filter(({ id }) => filteredByView(categoryNodes(id)).length > 0)
      .map(({ id }) => id),
    ...(visiblePatterns.length > 0 || query === '' ? ['library'] : []),
  ], [favouriteDefs.length, filteredByView, recentDefs.length, query, visiblePatterns.length])

  useEffect(() => {
    if (query === '') return
    if (expandedId && visibleSectionIds.includes(expandedId)) return
    setExpandedId(visibleSectionIds[0] ?? null)
  }, [expandedId, query, visibleSectionIds])

  // Landing on an empty graph (fresh load, cleared canvas, new project) is
  // exactly when a new/returning user most needs a starting point — steer
  // them to Quick recipes regardless of whatever section they last had open.
  useEffect(() => {
    if (isEmptyGraph) setExpandedId('recipes')
  }, [isEmptyGraph])

  const searchStatus = query === ''
    ? `${viewMode === 'all' ? NODE_LIBRARY.length : BEGINNER_NODE_TYPES.size} modules`
    : `${CATEGORIES.reduce((count, category) => count + filteredByView(categoryNodes(category.id)).length, 0) + visiblePatterns.length + visibleRecipes.length} matches`

  const handleAddNode = (type: string) => {
    const def = NODE_LIBRARY.find((n) => n.type === type)
    if (!def) return
    // Pass `centreOnDrop` so the node settles vertically centred on the drop
    // point once React Flow measures its (variable) height, rather than hanging
    // below it — i.e. it ends up half its height above where the top-left lands.
    addNode({
      id: `${type}-${Date.now()}`,
      type: 'studioNode',
      position: dropPos(),
      data: {
        label: def.label,
        nodeType: def.type,
        category: def.category,
        properties: resolveDefaultProperties(def.type, def.defaultProperties),
        inputs: def.inputs,
        outputs: def.outputs,
      },
    }, true)
    rememberRecent(type)
  }

  const handleRecipeDrop = (recipe: RecipeCard) => {
    const usesMicrophone = recipe.nodes.some((node) => node.type === 'MicInput')
    if (usesMicrophone && useUiStore.getState().testSignal) useUiStore.getState().toggleTestSignal()
    const existing = useGraphStore.getState().nodes
    const singletonByType = new Map(existing.map((node) => [String(node.data.nodeType), node]))
    const omittedSingletons = new Set<string>()
    const nodeIdByKey = new Map<string, string>()
    for (const spec of recipe.nodes) {
      if (SINGLETON_NODE_TYPES.has(spec.type) && singletonByType.has(spec.type)) {
        const existingNode = singletonByType.get(spec.type)
        if (existingNode) nodeIdByKey.set(spec.key, existingNode.id)
        if (spec.type === 'MatrixOutput') omittedSingletons.add(spec.type)
        continue
      }
      const def = NODE_LIBRARY.find((entry) => entry.type === spec.type)
      if (!def || !canAddNodeType(useGraphStore.getState().nodes, spec.type)) continue
      const id = `${spec.type}-${Date.now()}-${spec.key}`
      nodeIdByKey.set(spec.key, id)
      addNode({
        id,
        type: 'studioNode',
        position: { x: viewCenter.x + spec.dx, y: viewCenter.y + spec.dy },
        data: {
          label: def.label,
          nodeType: def.type,
          category: def.category,
          properties: resolveDefaultProperties(def.type, { ...def.defaultProperties, ...spec.props }),
          inputs: def.inputs,
          outputs: def.outputs,
        },
      })
      rememberRecent(spec.type)
    }
    for (const edge of recipe.edges) {
      const source = nodeIdByKey.get(edge.source)
      const target = nodeIdByKey.get(edge.target)
      if (!source || !target) continue
      if (omittedSingletons.has('MatrixOutput') && edge.target === 'out') continue
      onConnect({
        source,
        sourceHandle: edge.sourceHandle,
        target,
        targetHandle: edge.targetHandle,
      })
    }
    runTidy()
    if (usesMicrophone) {
      void useAudioStore.getState().startAudio().catch(() => {
        setStatus('Microphone could not start. Check browser permission and the selected audio input.', 'error')
      })
    }
    setStatus(
      omittedSingletons.has('MatrixOutput')
        ? `${recipe.title} recipe added — wire it into your existing Matrix Output when ready`
        : `${recipe.title} recipe added`,
      'success',
    )
  }

  const renderModule = (n: NodeDefinition) => {
    const enabled = !SINGLETON_NODE_TYPES.has(n.type) || !presentSingletons.has(n.type)
    const accent = CATEGORY_ACCENT_VAR[n.category]
    const outputType = moduleType(n)
    const description = NODE_DESCRIPTIONS[n.type] ?? n.label
    const tags = (INTENT_TAGS[n.type] ?? []).slice(0, 2)
    const favourite = favourites.includes(n.type)
    return (
      <li
        key={n.type}
        className={styles.nodeItem}
        style={{ '--accent': accent } as React.CSSProperties}
        draggable={enabled}
        aria-disabled={!enabled}
        role="button"
        tabIndex={enabled ? 0 : -1}
        aria-label={`Add ${n.label}`}
        onDragStart={(e) => handleDragStart(e, n.type)}
        onDragEnd={() => setDraggingNodeType(null)}
        onClick={() => { if (enabled) handleAddNode(n.type) }}
        onKeyDown={(e) => {
          if (enabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            handleAddNode(n.type)
          }
        }}
        title={enabled
          ? `${NODE_DESCRIPTIONS[n.type] ?? n.label}\nClick to add · drag to place`
          : `${n.label} already exists on this canvas`}
      >
        <span className={styles.moduleGlyph} data-output-type={outputType} aria-hidden="true">{moduleGlyph(n)}</span>
        <span className={styles.moduleCopy}>
          <span className={styles.moduleTopline}>
            <span className={styles.moduleName}>{n.label}</span>
            <span className={styles.moduleCode}>{moduleCode(n)}</span>
          </span>
          <span className={styles.moduleType}>
            {outputType} {n.subcategory ? `· ${n.subcategory}` : ''}
          </span>
          <span className={styles.moduleDesc}>{description}</span>
          {tags.length > 0 && (
            <span className={styles.moduleTags}>
              {tags.map((tag) => <span key={tag} className={styles.moduleTag}>{tag}</span>)}
            </span>
          )}
        </span>
        <span className={styles.moduleActions}>
          <button
            type="button"
            className={`${styles.favouriteBtn} ${favourite ? styles.favouriteBtnActive : ''}`}
            aria-label={favourite ? `Remove ${n.label} from favourites` : `Add ${n.label} to favourites`}
            title={favourite ? 'Remove from favourites' : 'Add to favourites'}
            onClick={(e) => {
              e.stopPropagation()
              toggleFavourite(n.type)
            }}
          >
            ★
          </button>
          <span className={styles.moduleGrip} aria-hidden="true">⠿</span>
        </span>
      </li>
    )
  }

  const renderSection = (
    id: string,
    label: string,
    accent: string,
    defs: NodeDefinition[],
    opts?: { emptyMessage?: string },
  ) => {
    if (defs.length === 0 && !opts?.emptyMessage) return null
    const open = expandedId === id
    return (
      <div key={id} className={styles.category}>
        <button
          className={styles.categoryHeader}
          style={{ '--accent': accent } as React.CSSProperties}
          onClick={() => toggle(id)}
        >
          <span className={styles.drawerLabel}>
            <span className={styles.drawerLight} aria-hidden="true" />
            {label}
            <span className={styles.drawerCount}>{defs.length}</span>
          </span>
          <span
            className={styles.chevron}
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            ▾
          </span>
        </button>
        {open && (
          defs.length === 0 ? (
            <div className={styles.patternDropHint}>{opts?.emptyMessage}</div>
          ) : (
            <ul className={styles.nodeList}>
              {defs.flatMap((def, index) => {
                const items = []
                if (def.subcategory && def.subcategory !== defs[index - 1]?.subcategory) {
                  items.push(
                    <li key={`sub-${id}-${def.subcategory}`} className={styles.subHeader} aria-hidden="true">
                      {def.subcategory}
                    </li>
                  )
                }
                items.push(renderModule(def))
                return items
              })}
            </ul>
          )
        )}
      </div>
    )
  }

  const renderPatternRows = (entries: SavedPattern[], emptyMessage: string) => (
    entries.length === 0 ? (
      <div className={styles.patternDropHint}>{emptyMessage}</div>
    ) : (
      <ul className={`${styles.nodeList} ${styles.patternList}`}>
        {entries.map((pattern) => {
          const renaming = renamingId === pattern.id
          return (
            <li
              key={pattern.id}
              className={`${styles.nodeItem} ${styles.patternItem}`}
              style={{ '--accent': 'var(--accent-library)' } as React.CSSProperties}
              draggable={!renaming}
              onDragStart={(event) => handlePatternDragStart(event, pattern)}
              onClick={() => { if (!renaming) handleAddPattern(pattern) }}
              title={renaming
                ? undefined
                : `${pattern.name}\n${pattern.bundled ? 'Included beta pattern · ' : ''}Click to add · drag to place`}
            >
              {renaming ? (
                <input
                  className={`${styles.renameInput} nodrag`}
                  value={draftName}
                  autoFocus
                  aria-label="Rename pattern"
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitRename()
                    else if (event.key === 'Escape') cancelRename()
                  }}
                />
              ) : (
                <>
                  <span className={styles.patternName}>{pattern.name}</span>
                  {pattern.bundled ? (
                    <span className={styles.patternBadge} title="Included with the beta release">included</span>
                  ) : (
                    <span className={styles.patternActions}>
                      <button
                        className={styles.patternBtn}
                        aria-label={`Rename ${pattern.name}`}
                        title="Rename"
                        onClick={(event) => {
                          event.stopPropagation()
                          startRename(pattern)
                        }}
                      >
                        ✎
                      </button>
                      <button
                        className={styles.patternBtn}
                        aria-label={`Delete ${pattern.name} from library`}
                        title="Delete from library"
                        onClick={(event) => {
                          event.stopPropagation()
                          void (async () => {
                            const ok = await requestConfirm({
                              title: 'Delete library pattern?',
                              message: `Delete “${pattern.name}” from the library?`,
                              confirmLabel: 'Delete',
                              cancelLabel: 'Cancel',
                              tone: 'danger',
                            })
                            if (ok) await deletePattern(pattern.id)
                          })()
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
    )
  )

  return (
    <aside className={styles.sidebar} id="node-library">
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.headerTitle}>Node Library</span>
          <span className={styles.headerMeta}>Patch rack</span>
        </div>
        <div className={styles.headerStats} aria-label="Library status">
          <span className={styles.headerChip}>{searchStatus}</span>
          <span className={styles.headerChip}>{patterns.length} saved</span>
          <span className={styles.headerChip}>{CATEGORIES.length} banks</span>
        </div>
      </div>
      <div className={styles.searchWrap}>
        <div className={styles.searchLabel}>Find module</div>
        <div className={styles.viewToggle} role="tablist" aria-label="Library scope">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'beginner'}
            className={`${styles.scopeBtn} ${viewMode === 'beginner' ? styles.scopeBtnActive : ''}`}
            onClick={() => setViewMode('beginner')}
          >
            Beginner
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'all'}
            className={`${styles.scopeBtn} ${viewMode === 'all' ? styles.scopeBtnActive : ''}`}
            onClick={() => setViewMode('all')}
          >
            All
          </button>
        </div>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search nodes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className={styles.scroll}>
        {query === '' && visibleRecipes.length > 0 && (
          <div className={styles.category}>
            <button
              className={styles.categoryHeader}
              style={{ '--accent': 'var(--accent-recipes)' } as React.CSSProperties}
              onClick={() => toggle('recipes')}
            >
              <span className={styles.drawerLabel}>
                <span className={styles.drawerLight} aria-hidden="true" />
                Quick recipes
                <span className={styles.drawerCount}>{visibleRecipes.length}</span>
              </span>
              <span
                className={styles.chevron}
                style={{ transform: expandedId === 'recipes' ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                ▾
              </span>
            </button>
            {expandedId === 'recipes' && (
              <div className={styles.recipeCards}>
                {visibleRecipes.map((recipe) => (
                  <button
                    key={recipe.id}
                    type="button"
                    className={styles.recipeCard}
                    onClick={() => handleRecipeDrop(recipe)}
                  >
                    <span className={styles.recipeKicker}>{recipe.kicker}</span>
                    <span className={styles.recipeTitle}>{recipe.title}</span>
                    <span className={styles.recipeDesc}>{recipe.description}</span>
                    <span className={styles.recipeAction}>{recipe.actionLabel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {renderSection('favourites', 'Favourites', 'var(--accent-favourites)', favouriteDefs, query === '' ? {
          emptyMessage: 'No favourites yet — click the ★ on a module to pin it here.',
        } : undefined)}
        {renderSection('recent', 'Recent rack', 'var(--accent-recent)', recentDefs, query === '' ? {
          emptyMessage: 'No recently used modules yet.',
        } : undefined)}

        {CATEGORIES.map(({ id, label }) => {
          const nodes = filteredByView(categoryNodes(id))
          if (nodes.length === 0) return null
          return renderSection(id, label, CATEGORY_ACCENT_VAR[id], nodes)
        })}

        {/* Pattern Library — bundled examples plus persistent saved pattern groups. Always
            rendered (even empty) so it doubles as a drop target for importing
            pattern files dragged in from the OS. */}
        <div
          className={`${styles.category} ${patternDragOver ? styles.dropTarget : ''}`}
          onDragOver={handlePatternDragOver}
          onDragLeave={handlePatternDragLeave}
          onDrop={handlePatternDrop}
        >
          <div
            className={styles.categoryHeader}
            style={{ '--accent': 'var(--accent-library)' } as React.CSSProperties}
          >
            <button
              className={styles.categoryHeaderBtn}
              onClick={() => toggle('library')}
            >
              <span className={styles.drawerLabel}>
                <span className={styles.drawerLight} aria-hidden="true" />
                Pattern Library
                <span className={styles.drawerCount}>{patterns.length}</span>
              </span>
            </button>
            <button
              className={styles.revealBtn}
              type="button"
              aria-label="Add Pattern Library shelf"
              title="Add a shelf"
              onClick={() => setCreatingPatternCategory(true)}
            >
              ＋
            </button>
            <button
              className={styles.collectionBtn}
              type="button"
              aria-label="Create Pattern Collection from Pattern Library"
              title="Create a Pattern Collection containing all saved patterns"
              onClick={handleCreateCollection}
              disabled={patterns.length === 0}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="3" width="8" height="3.2" rx="0.8" />
                <rect x="2" y="9.2" width="8" height="3.2" rx="0.8" />
                <path d="M12 5.1h2.5" />
                <path d="M13.25 3.85v2.5" />
                <path d="M10 10.8h4.5" />
              </svg>
            </button>
            <button
              className={styles.revealBtn}
              type="button"
              aria-label="Rate my patterns"
              title="Rate every saved pattern for quality"
              onClick={openRatings}
              disabled={patterns.length === 0}
            >
              ★
            </button>
            <button
              className={styles.revealBtn}
              aria-label="Reveal saved-pattern folder"
              title="Reveal saved-pattern folder on disk"
              onClick={handleRevealFolder}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
                <path d="M1.5 3.5a1 1 0 0 1 1-1h3.4l1.2 1.6h6.4a1 1 0 0 1 1 1v7.9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
              </svg>
            </button>
            <button
              className={styles.categoryHeaderBtn}
              style={{ flex: '0 0 auto' }}
              onClick={() => toggle('library')}
            >
              <span
                className={styles.chevron}
                style={{ transform: expandedId === 'library' ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                ▾
              </span>
            </button>
          </div>
          {expandedId === 'library' && (
            <div className={styles.patternLibraryBody}>
              {creatingPatternCategory && (
                <div className={styles.newShelfRow}>
                  <input
                    className={`${styles.renameInput} nodrag`}
                    value={patternCategoryDraft}
                    autoFocus
                    aria-label="New shelf name"
                    placeholder="Shelf name"
                    onChange={(event) => setPatternCategoryDraft(event.target.value)}
                    onBlur={() => { if (!patternCategoryDraft.trim()) setCreatingPatternCategory(false) }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitPatternCategory()
                      else if (event.key === 'Escape') {
                        setCreatingPatternCategory(false)
                        setPatternCategoryDraft('')
                      }
                    }}
                  />
                  <button className={styles.shelfConfirmBtn} type="button" onClick={commitPatternCategory}>Add</button>
                </div>
              )}

              <section className={styles.patternShelf}>
                <div
                  className={`${styles.patternShelfHeader} ${patternShelfDrop === '__unsorted__' ? styles.patternShelfDrop : ''}`}
                  onDragOver={(event) => handlePatternShelfDragOver(event, '__unsorted__')}
                  onDragLeave={() => setPatternShelfDrop(null)}
                  onDrop={(event) => handlePatternShelfDrop(event, null)}
                >
                  <button type="button" onClick={() => togglePatternCategory('__unsorted__')}>
                    <span className={styles.shelfChevron}>{openPatternCategories.has('__unsorted__') ? '▾' : '▸'}</span>
                    New &amp; Unsorted
                  </button>
                  <span className={styles.drawerCount}>{uncategorizedPatterns.length}</span>
                </div>
                {openPatternCategories.has('__unsorted__')
                  && renderPatternRows(uncategorizedPatterns, 'Newly saved patterns appear here')}
              </section>

              {patternCategories.map((category) => {
                const categoryPatterns = patternsByCategory.get(category.id) ?? []
                const open = openPatternCategories.has(category.id)
                return (
                  <section key={category.id} className={styles.patternShelf}>
                    <div
                      className={`${styles.patternShelfHeader} ${patternShelfDrop === category.id ? styles.patternShelfDrop : ''}`}
                      onDragOver={(event) => handlePatternShelfDragOver(event, category.id)}
                      onDragLeave={() => setPatternShelfDrop(null)}
                      onDrop={(event) => handlePatternShelfDrop(event, category.id)}
                    >
                      <button type="button" onClick={() => togglePatternCategory(category.id)}>
                        <span className={styles.shelfChevron}>{open ? '▾' : '▸'}</span>
                        {category.name}
                      </button>
                      <span className={styles.shelfMeta}>
                        <span className={styles.drawerCount}>{categoryPatterns.length}</span>
                        {!category.builtIn && (
                          <button
                            type="button"
                            className={styles.patternBtn}
                            aria-label={`Remove ${category.name} shelf`}
                            title="Remove shelf; patterns return to New & Unsorted"
                            onClick={() => {
                              void (async () => {
                                const ok = await requestConfirm({
                                  title: 'Remove Pattern Library shelf?',
                                  message: `Remove “${category.name}”? Its patterns will move to New & Unsorted.`,
                                  confirmLabel: 'Remove shelf',
                                  cancelLabel: 'Cancel',
                                  tone: 'danger',
                                })
                                if (ok) deletePatternCategory(category.id)
                              })()
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    </div>
                    {open && renderPatternRows(
                      categoryPatterns,
                      category.id === AUDIO_REACTIVE_CATEGORY_ID
                        ? 'No audio-reactive patterns match this search'
                        : 'Drag patterns onto this shelf',
                    )}
                  </section>
                )
              })}

              <div className={styles.patternDropHint}>Drag pattern .json files here to import</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

export default memo(Sidebar)
