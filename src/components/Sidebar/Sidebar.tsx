import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeLayer } from '../../hooks/useEscapeLayer'
import { autoConnectPlacedNode, canAddNodeType, SINGLETON_NODE_TYPES, useGraphStore, reachableGroupRegistry, playCollectionWith, type CollectionPlayerType } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { useAudioStore } from '../../state/audio/audioStore'
import { usePatternLibrary, withRegisteredGroups, type SavedPattern } from '../../state/patterns/patternLibrary'
import {
  buildLibraryBundle,
  bundledPatternFromLibrary,
  importLibraryBundle,
  libraryImportStatus,
  parseLibraryBundle,
  type LibraryImportSummary,
} from '../../state/library/libraryBundle'
import { copyLibraryLink, downloadLibraryFile, libraryFileName } from '../../utils/libraryShare'
import { PATTERN_FORM_TAGS, patternFormTags, type PatternFormTag } from '../../state/patterns/patternTags'
import PatternFormIcons from '../PatternTags/PatternFormIcons'
import { Icon, PortIcon } from '../icons/Icon'

function tagNames(tags: PatternFormTag[]): string {
  return tags.map((tag) => PATTERN_FORM_TAGS.find((entry) => entry.id === tag)?.label ?? tag).join(', ')
}
import { AUDIO_REACTIVE_CATEGORY_ID, STANDARD_CATEGORY_ID } from '../../state/patterns/bundledPatterns'
import { NODE_LIBRARY, CATEGORIES, CATEGORY_ACCENT_VAR, NODE_DESCRIPTIONS, categoryNodes } from '../../state/nodeLibrary'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import { ratingTier, usePatternRatingStore } from '../../state/patterns/patternRating'
import { revealPatternsFolder } from '../../utils/backendClient'
import { openCommunityTab, postToCommunityTab, suggestPatternFileName } from '../../utils/communityUpload'
import { captureSharePreview } from '../../utils/sharePreviewCapture'
import { runTidy } from '../../utils/tidyGraph'
import type { NodeDefinition } from '../../types'
import { isHardwareLibraryHiddenNodeType } from '../../build/hardware'
import styles from './Sidebar.module.css'

// Bumped to v2 so existing sessions (whose stored value predates Quick
// recipes becoming collapsible) fall through to the new 'recipes' default
// once, instead of staying stuck on whatever category they had open before.
/** The players "New collection, played by" offers, in the order a first show
 *  tends to grow: timed, then to music, then planned from it. */
const COLLECTION_PLAYERS: { type: CollectionPlayerType; label: string; title: string }[] = [
  { type: 'PatternSlideshow', label: 'Slideshow', title: 'Plays the collection on a timer, in order or at random' },
  { type: 'PatternMaster', label: 'Music Player', title: 'Picks patterns to match the music as it plays' },
  { type: 'PerformanceGenerator', label: 'Generator', title: 'Plans a timed show from an analysed song' },
]

const EXPANDED_KEY = 'design-studio-for-fastled-sidebar-expanded-v2'
const FAVOURITES_KEY = 'design-studio-for-fastled-sidebar-favourites'
const RECENT_KEY = 'design-studio-for-fastled-sidebar-recent'
const RECENT_LIMIT = 8
const SIDEBAR_NODE_LIBRARY = NODE_LIBRARY.filter((definition) => !isHardwareLibraryHiddenNodeType(definition.type))

const INTENT_TAGS: Record<string, string[]> = {
  Audio: ['audio', 'source', 'hardware'],
  MicInput: ['audio', 'hardware'],
  DMXInput: ['dmx', 'art-net', 'lighting console'],
  DMXChannel: ['dmx', 'decoder', 'channel'],
  RTCInput: ['clock', 'schedule', 'time', 'rtc', 'ntp', 'ds3231', 'date'],
  ScheduleTrigger: ['schedule', 'time', 'trigger'],
  FFTAnalyzer: ['audio', 'reactive'],
  BeatDetect: ['audio', 'trigger'],
  AudioFeatures: ['audio', 'analysis'],
  Vibe: ['audio', 'reactive', 'milkdrop'],
  Waveform: ['audio', 'reactive', 'oscilloscope'],
  PitchDetect: ['audio', 'pitch', 'note', 'key'],
  SongStructure: ['audio', 'trigger', 'downbeat', 'drop', 'mood'],
  Wave: ['motion', 'signal', 'ramp', 'counter', 'beatsin', 'bpm', 'lfo'],
  Random: ['variation', 'signal'],
  SampleHold: ['trigger', 'variation'],
  HueCycle: ['color', 'motion'],
  PaletteSelector: ['color', 'palette'],
  SolidColor: ['color', 'base'],
  Text: ['text', 'display'],
  GradientFrame: ['color', 'base'],
  Noise: ['texture', 'motion'],
  Rainbow: ['color', 'starter'],
  Fire: ['classic', 'starter', 'fire2012', 'smoke'],
  SpectrumVisualizer: ['audio', 'spectrum', 'visualizer', 'equalizer', 'bars'],
  ColorTrails: ['audio', 'fluid', 'feedback'],
  Animartrix: ['audio', 'stefan petrick', 'water', 'kaleidoscope', 'spiral'],
  Brightness: ['utility', 'dimmer'],
  Fade: ['utility', 'motion'],
  HueShift: ['color', 'motion'],
  Trails: ['motion', 'feedback'],
  Blend: ['composite', 'layer'],
  Transition: ['composite', 'scene'],
  PatternCollection: ['show', 'playlist'],
  // Music Source lives on this node, so the sources are how people look for it.
  PatternMaster: ['show', 'music', 'mp3', 'internet radio', 'radio stations', 'bluetooth', 'stream', 'performance'],
  PatternSlideshow: ['show', 'playlist', 'ambient', 'no music'],
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
    actionLabel: 'Add this recipe',
    nodes: [
      { key: 'mic-hardware', type: 'MicInput', dx: -340, dy: -80 },
      { key: 'mic', type: 'Audio', dx: -340, dy: -80, props: { sourceId: '$mic-hardware' } },
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
    actionLabel: 'Add this recipe',
    nodes: [
      { key: 'mic-hardware', type: 'MicInput', dx: -440, dy: -140 },
      { key: 'mic', type: 'Audio', dx: -440, dy: -140, props: { sourceId: '$mic-hardware' } },
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
    actionLabel: 'Add this recipe',
    nodes: [
      { key: 'mic-hardware', type: 'MicInput', dx: -420, dy: -80 },
      { key: 'mic', type: 'Audio', dx: -420, dy: -80, props: { sourceId: '$mic-hardware' } },
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

function moduleType(def: NodeDefinition) {
  return def.outputs[0]?.dataType ?? def.inputs[0]?.dataType ?? 'control'
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

/** Remember the section the user deliberately opened.
 *
 *  Only the header click calls this. The search auto-open and the empty-graph
 *  steer to Quick recipes are transient navigation, and persisting those (as a
 *  blanket write-on-every-change effect used to) meant clearing the canvas once
 *  permanently replaced the user's remembered section with `recipes` — it then
 *  reopened there on every later load, full graph or not. */
function saveExpanded(id: string | null): void {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(id))
  } catch {
    // storage full/unavailable — non-critical, skip
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
  const isEmptyGraph = useGraphStore((s) => s.nodes.every((node) => node.data.nodeType === 'Board'))
  const instantiatePattern = useGraphStore((s) => s.instantiatePattern)
  const createCollectionFromPatterns = useGraphStore((s) => s.createCollectionFromPatterns)
  const addPatternsToCollection = useGraphStore((s) => s.addPatternsToCollection)
  const collectionNodeSignature = useGraphStore((s) => s.nodes
    .filter((node) => node.data.nodeType === 'PatternCollection')
    .map((node) => node.id)
    .join('|'))
  const patterns = usePatternLibrary((s) => s.patterns)
  const patternCategories = usePatternLibrary((s) => s.categories)
  const renamePattern = usePatternLibrary((s) => s.renamePattern)
  const deletePattern = usePatternLibrary((s) => s.deletePattern)
  const createPatternCategory = usePatternLibrary((s) => s.createCategory)
  const deletePatternCategory = usePatternLibrary((s) => s.deleteCategory)
  const movePattern = usePatternLibrary((s) => s.movePattern)
  const tagPattern = usePatternLibrary((s) => s.tagPattern)
  const ratingsByPatternId = usePatternRatingStore((s) => s.ratingsByPatternId)
  const userRatingsByPatternId = usePatternRatingStore((s) => s.userRatingsByPatternId)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const requestPrompt = useUiStore((s) => s.requestPrompt)
  const viewCenter = useUiStore((s) => s.viewCenter)
  const setStatus = useUiStore((s) => s.setStatus)
  const openHardwareShelf = useUiStore((s) => s.openHardwareShelf)
  const openRatings = useUiStore((s) => s.openRatings)
  const setDraggingNodeType = useUiStore((s) => s.setDraggingNodeType)
  // One-bank-at-a-time accordion. We still persist the last opened section,
  // but unlike the old multi-open drawer this keeps the library scan tight.
  // A blank canvas starts fully collapsed (see the isEmptyGraph effect below);
  // seeding that here rather than only in the effect avoids a first frame with
  // a section flashing open.
  const [expandedId, setExpandedId] = useState<string | null>(() => (
    isEmptyGraph ? null : loadExpanded() ?? 'recipes'
  ))
  const [favourites, setFavourites] = useState<string[]>(() => loadStringArray(FAVOURITES_KEY))
  const [recent, setRecent] = useState<string[]>(() => loadStringArray(RECENT_KEY))
  const [openPatternCategories, setOpenPatternCategories] = useState<Set<string>>(
    () => new Set([STANDARD_CATEGORY_ID, AUDIO_REACTIVE_CATEGORY_ID]),
  )
  const [creatingPatternCategory, setCreatingPatternCategory] = useState(false)
  const [patternCategoryDraft, setPatternCategoryDraft] = useState('')
  const [patternShelfDrop, setPatternShelfDrop] = useState<string | null>(null)
  const [selectedPatternIds, setSelectedPatternIds] = useState<Set<string>>(new Set())
  const [patternSelectionAnchor, setPatternSelectionAnchor] = useState<string | null>(null)
  const [patternContextMenu, setPatternContextMenu] = useState<{ x: number; y: number } | null>(null)

  // `expandedId` is persisted from `toggle` (the user's own click) rather than
  // by an effect on every change — see saveExpanded.
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
    (defs: NodeDefinition[]) => defs.filter((def) => !isHardwareLibraryHiddenNodeType(def.type) && nodeMatchesQuery(def)),
    [nodeMatchesQuery],
  )
  const favouriteDefs = favourites
    .map((type) => SIDEBAR_NODE_LIBRARY.find((def) => def.type === type))
    .filter((def): def is NodeDefinition => !!def)
    .filter((def) => nodeMatchesQuery(def))
  const recentDefs = recent
    .map((type) => SIDEBAR_NODE_LIBRARY.find((def) => def.type === type))
    .filter((def): def is NodeDefinition => !!def)
    .filter((def) => nodeMatchesQuery(def))
  /*
   * Hardware-owned modules, findable where people look for them.
   *
   * A Button added from the Hardware bench puts a Button node in the graph, and
   * someone who saw it there later searches this library for "button" and finds
   * nothing — then finds it in Help, which confirms it exists and still does not
   * say where it came from.
   *
   * These appear only while searching. Listing them in the categories would put
   * entries in the library that cannot be dropped on the canvas, which is what
   * hiding them was protecting against; but a search is someone asking a
   * question, and the answer is "the Hardware bench, and here is the way there".
   */
  const hardwareMatches = query === '' ? [] : NODE_LIBRARY
    .filter((def) => isHardwareLibraryHiddenNodeType(def.type) && nodeMatchesQuery(def))

  const visibleRecipes = RECIPE_CARDS.filter((recipe) => (
    query === '' || `${recipe.title} ${recipe.kicker} ${recipe.description}`.toLowerCase().includes(query)
  ))

  // True while the empty-graph steer (below) owns the open section: the user
  // has not clicked a header or taken a node since it ran. Lets the steer tell
  // the page's own async project load apart from the user's work.
  const steerOwnsSection = useRef(false)

  const toggle = (id: string) => {
    steerOwnsSection.current = false
    const next = expandedId === id ? null : id
    saveExpanded(next)
    setExpandedId(next)
  }

  const rememberRecent = (type: string) => {
    setRecent((prev) => [type, ...prev.filter((entry) => entry !== type)].slice(0, RECENT_LIMIT))
  }

  const toggleFavourite = (type: string) => {
    setFavourites((prev) => prev.includes(type) ? prev.filter((entry) => entry !== type) : [type, ...prev])
  }

  const handleDragStart = (e: React.DragEvent, type: string) => {
    steerOwnsSection.current = false
    e.dataTransfer.setData('application/studio-node', type)
    e.dataTransfer.effectAllowed = 'copy'
    setDraggingNodeType(type)

    const def = SIDEBAR_NODE_LIBRARY.find((node) => node.type === type)
    if (!def || typeof e.dataTransfer.setDragImage !== 'function') return
    const ghost = document.createElement('div')
    ghost.className = styles.dragGhost
    ghost.style.setProperty('--accent', CATEGORY_ACCENT_VAR[def.category])
    const copy = document.createElement('span')
    copy.className = styles.dragGhostCopy
    const name = document.createElement('strong')
    name.textContent = def.label
    const typeLabel = document.createElement('small')
    typeLabel.textContent = `${moduleType(def)} node`
    copy.append(name, typeLabel)
    ghost.append(copy)
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
  // Every import — a dropped file, the file picker, pasted JSON or a pasted
  // share link — goes through the library bundle, so a bundle, a bare saved
  // pattern and a community pattern JSON all land the same way. Nothing
  // imported is remembered as known content: the trust question is asked
  // when it reaches the canvas, as for any dropped pattern.
  const importLibraryText = (text: string, into?: LibraryImportSummary): LibraryImportSummary | null => {
    const parsed = parseLibraryBundle(text)
    if (parsed.error !== undefined) return null
    const summary = importLibraryBundle(parsed.bundle, { origin: 'imported', position: dropPos() })
    if (!into) return summary
    into.patterns += summary.patterns
    into.palettes += summary.palettes
    into.collections += summary.collections
    into.renamed.push(...summary.renamed)
    return into
  }
  const importLibraryFiles = async (list: ArrayLike<File>) => {
    const files = Array.from(list).filter((f) => f.name.toLowerCase().endsWith('.json'))
    const summary: LibraryImportSummary = { patterns: 0, palettes: 0, collections: 0, renamed: [] }
    let readable = 0
    for (const file of files) {
      try {
        if (importLibraryText(await file.text(), summary)) readable += 1
      } catch {
        // unreadable file — skip it
      }
    }
    if (readable > 0) setStatus(libraryImportStatus(summary), 'success')
    else if (files.length > 0) setStatus('No valid pattern or library files found', 'error')
  }
  const handlePatternDrop = async (e: React.DragEvent) => {
    if (e.dataTransfer.files.length === 0) return
    e.preventDefault()
    setPatternDragOver(false)
    await importLibraryFiles(e.dataTransfer.files)
  }

  // The library's own Import… popup: a pasted share link or JSON, or a file.
  const [libraryImportOpen, setLibraryImportOpen] = useState(false)
  const [libraryImportDraft, setLibraryImportDraft] = useState('')
  const libraryFileInputRef = useRef<HTMLInputElement>(null)
  const closeLibraryImport = () => {
    setLibraryImportOpen(false)
    setLibraryImportDraft('')
  }
  useEscapeLayer(closeLibraryImport, libraryImportOpen)
  const commitLibraryImport = () => {
    const text = libraryImportDraft.trim()
    if (!text) return
    const parsed = parseLibraryBundle(text)
    if (parsed.error !== undefined) {
      setStatus(parsed.error, 'error')
      return
    }
    const summary = importLibraryBundle(parsed.bundle, { origin: text.includes('#library=') ? 'link' : 'imported', position: dropPos() })
    setStatus(libraryImportStatus(summary), 'success')
    closeLibraryImport()
  }
  const handleLibraryFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    void importLibraryFiles(files).finally(() => {
      event.target.value = ''
      closeLibraryImport()
    })
  }

  const exportPatterns = (chosen: SavedPattern[]) => {
    if (chosen.length === 0) return
    const graphData = useGraphStore.getState().graphData
    const name = chosen.length === 1 ? chosen[0].name : `${chosen.length} patterns`
    downloadLibraryFile(
      { patterns: chosen.map((pattern) => bundledPatternFromLibrary(pattern, graphData)) },
      libraryFileName(name, chosen.length === 1 ? 'pattern' : 'library'),
    )
    setStatus(chosen.length === 1 ? `Exported “${chosen[0].name}”` : `Exported ${chosen.length} patterns`, 'success')
    setPatternContextMenu(null)
  }

  const copyPatternLink = async (chosen: SavedPattern[]) => {
    if (chosen.length === 0) return
    setPatternContextMenu(null)
    const graphData = useGraphStore.getState().graphData
    const bundle = buildLibraryBundle({ patterns: chosen.map((pattern) => bundledPatternFromLibrary(pattern, graphData)) })
    const result = await copyLibraryLink(bundle)
    if (!result.copied) {
      await requestPrompt({
        title: 'Pattern link',
        message: result.warning ?? 'Copy this link:',
        inputLabel: 'Share URL',
        initialValue: result.url,
        readOnly: true,
        selectText: true,
        monospace: true,
        confirmLabel: 'Close',
        cancelLabel: null,
      })
      return
    }
    setStatus(result.warning ?? 'Pattern link copied to clipboard', result.warning ? 'info' : 'success')
  }

  const handleRevealFolder = async () => {
    const ok = await revealPatternsFolder()
    if (!ok) setStatus('Build tools are not running — can’t open the saved-pattern folder', 'error')
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
  // `withRegisteredGroups` installs the nested groups an imported pattern
  // carries before the store clones its subgraph; a pattern made here is
  // returned untouched.
  const handleAddPattern = (p: SavedPattern) => instantiatePattern(withRegisteredGroups(p), dropPos(), true)
  // A collection on its own is a list nobody plays. Offered with a player it
  // is a show: the player lands beside it, wired to it and on to the LED
  // output, so the three steps the help promised are one.
  const handleCreateCollection = (playWith?: CollectionPlayerType) => {
    const chosen = selectedPatternIds.size > 0
      ? patterns.filter((pattern) => selectedPatternIds.has(pattern.id))
      : patterns
    if (chosen.length === 0) {
      setStatus('Pattern Library is empty', 'error')
      return
    }
    const def = NODE_LIBRARY.find((n) => n.type === 'PatternCollection')
    if (!def) {
      setStatus('Pattern Collection node is unavailable', 'error')
      return
    }
    const before = new Set(useGraphStore.getState().nodes.map((node) => node.id))
    createCollectionFromPatterns(
      chosen.map(withRegisteredGroups),
      dropPos(),
      resolveDefaultProperties(def.type, def.defaultProperties),
      true,
    )
    const collection = useGraphStore.getState().nodes.find((node) => !before.has(node.id) && node.data.nodeType === 'PatternCollection')
    const player = playWith && collection ? playCollectionWith(collection.id, playWith) : null
    const played = player
      ? `, played by ${NODE_LIBRARY.find((n) => n.type === playWith)?.label ?? playWith}`
      : ''
    setStatus(`Created collection with ${chosen.length} pattern${chosen.length === 1 ? '' : 's'}${played}`, 'success')
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

  const handleSharePattern = async (pattern: SavedPattern) => {
    const ok = await requestConfirm({
      title: 'Share on the community site?',
      message: `Share “${pattern.name}” on designstudioforfastled.com? It shares hardware-agnostic — no board, pins, or chipset are included.`,
      confirmLabel: 'Share',
      cancelLabel: 'Cancel',
    })
    if (!ok) return

    // A saved pattern can itself contain Group nodes referencing other saved
    // groups — carry their content alongside the subgraph so the site can
    // resolve them, instead of leaving unresolvable references behind.
    // An imported pattern carries its own nested groups (`groups`) rather than
    // relying on this workspace's graphData, so they resolve from either.
    const groups = reachableGroupRegistry(pattern.subgraph.nodes, { ...useGraphStore.getState().graphData, ...(pattern.groups ?? {}) })
    const patternJson = JSON.stringify({ name: pattern.name, subgraph: pattern.subgraph, groups })
    if (new Blob([patternJson]).size > 2 * 1024 * 1024) {
      setStatus('This pattern is over the community upload limit of 2 MB', 'error')
      return
    }

    const tab = openCommunityTab()
    if (!tab.opened) {
      setStatus('The community page was blocked. Allow pop-ups for Design Studio and try again.', 'error')
      return
    }

    setStatus('Generating a preview clip for the community site…', 'info')
    const previewMedia = await captureSharePreview({ nodes: pattern.subgraph.nodes, edges: pattern.subgraph.edges, groups }) ?? undefined
    const personalRating = usePatternRatingStore.getState().userRatingsByPatternId[pattern.id]

    await postToCommunityTab(tab.target, {
      name: pattern.name,
      fileName: suggestPatternFileName(pattern.name),
      patternJson,
      controller: 'Other',
      ledCount: 256,
      previewMedia,
      personalRating,
    })

    setStatus(`"${pattern.name}" is opening on the community site`, 'success')
  }

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
  const displayPatternIds = [
    ...(openPatternCategories.has('__unsorted__') ? uncategorizedPatterns.map((pattern) => pattern.id) : []),
    ...patternCategories.flatMap((category) => (
      openPatternCategories.has(category.id)
        ? (patternsByCategory.get(category.id) ?? []).map((pattern) => pattern.id)
        : []
    )),
  ]
  const selectedPatterns = patterns.filter((pattern) => selectedPatternIds.has(pattern.id))
  const editableSelectedPatterns = selectedPatterns.filter((pattern) => !pattern.bundled)
  const collectionNodeIds = collectionNodeSignature.split('|').filter(Boolean)

  useEffect(() => {
    const validIds = new Set(patterns.map((pattern) => pattern.id))
    setSelectedPatternIds((current) => {
      const next = new Set([...current].filter((id) => validIds.has(id)))
      return next.size === current.size ? current : next
    })
    if (patternSelectionAnchor && !validIds.has(patternSelectionAnchor)) setPatternSelectionAnchor(null)
  }, [patternSelectionAnchor, patterns])

  useEffect(() => {
    if (!patternContextMenu) return
    const close = () => setPatternContextMenu(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
    }
  }, [patternContextMenu])
  useEscapeLayer(() => setPatternContextMenu(null), patternContextMenu !== null)

  const handlePatternSelection = (
    event: Pick<React.MouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>,
    patternId: string,
  ) => {
    if (event.shiftKey && patternSelectionAnchor) {
      const anchorIndex = displayPatternIds.indexOf(patternSelectionAnchor)
      const targetIndex = displayPatternIds.indexOf(patternId)
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const range = displayPatternIds.slice(
          Math.min(anchorIndex, targetIndex),
          Math.max(anchorIndex, targetIndex) + 1,
        )
        setSelectedPatternIds((current) => new Set(
          event.ctrlKey || event.metaKey ? [...current, ...range] : range,
        ))
        return
      }
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedPatternIds((current) => {
        const next = new Set(current)
        if (next.has(patternId)) next.delete(patternId)
        else next.add(patternId)
        return next
      })
    } else {
      setSelectedPatternIds(new Set([patternId]))
    }
    setPatternSelectionAnchor(patternId)
  }

  const showPatternContextMenu = (patternId: string, clientX: number, clientY: number) => {
    if (!selectedPatternIds.has(patternId)) {
      setSelectedPatternIds(new Set([patternId]))
      setPatternSelectionAnchor(patternId)
    }
    setPatternContextMenu({
      x: Math.max(8, Math.min(clientX, window.innerWidth - 250)),
      y: Math.max(8, Math.min(clientY, window.innerHeight - 320)),
    })
  }

  const openPatternContextMenu = (event: React.MouseEvent, patternId: string) => {
    event.preventDefault()
    event.stopPropagation()
    showPatternContextMenu(patternId, event.clientX, event.clientY)
  }

  /**
   * Bulk "best displayed on", across whatever is selected.
   *
   * Tagging is a curation pass, not an authoring step — people will happily
   * mark twenty patterns while browsing the shelf and resent being asked once
   * per save. A tag counts as on only when every editable pattern in the
   * selection carries it, so the button always states the whole selection
   * rather than the first item in it.
   */
  const selectionTagState = (tag: PatternFormTag): 'on' | 'mixed' | 'off' => {
    const carrying = editableSelectedPatterns.filter((pattern) => patternFormTags(pattern.bestOn).includes(tag))
    if (carrying.length === 0) return 'off'
    return carrying.length === editableSelectedPatterns.length ? 'on' : 'mixed'
  }

  const toggleSelectionTag = (tag: PatternFormTag) => {
    if (editableSelectedPatterns.length === 0) return
    // Mixed resolves upward: the click that follows a partial state is far more
    // often "make them all this" than "clear the ones that have it".
    const clearing = selectionTagState(tag) === 'on'
    for (const pattern of editableSelectedPatterns) {
      const current = patternFormTags(pattern.bestOn)
      tagPattern(pattern.id, clearing
        ? current.filter((entry) => entry !== tag)
        : current.includes(tag) ? current : [...current, tag])
    }
    const label = PATTERN_FORM_TAGS.find((entry) => entry.id === tag)?.label ?? tag
    setStatus(
      clearing
        ? `Cleared ${label} from ${editableSelectedPatterns.length} pattern${editableSelectedPatterns.length === 1 ? '' : 's'}`
        : `Marked ${editableSelectedPatterns.length} pattern${editableSelectedPatterns.length === 1 ? '' : 's'} best on ${label}`,
      'success',
    )
  }

  const addSelectedPatternsToCanvas = () => {
    selectedPatterns.forEach((pattern, index) => {
      const position = dropPos()
      instantiatePattern(withRegisteredGroups(pattern), { x: position.x + index * 24, y: position.y + index * 18 }, true)
    })
    setStatus(`Added ${selectedPatterns.length} pattern${selectedPatterns.length === 1 ? '' : 's'} to the canvas`, 'success')
    setPatternContextMenu(null)
  }

  const addSelectedPatternsToCollection = (collectionNodeId: string) => {
    if (selectedPatterns.length === 0) return
    addPatternsToCollection(collectionNodeId, selectedPatterns.map(withRegisteredGroups))
    setStatus(`Added ${selectedPatterns.length} pattern${selectedPatterns.length === 1 ? '' : 's'} to the collection`, 'success')
    setPatternContextMenu(null)
  }

  const createCollectionFromSelection = (playWith?: CollectionPlayerType) => {
    if (selectedPatterns.length === 0) return
    handleCreateCollection(playWith)
    setPatternContextMenu(null)
  }

  const deleteSelectedPatterns = async () => {
    if (editableSelectedPatterns.length === 0) return
    const bundledKept = selectedPatterns.length - editableSelectedPatterns.length
    const ok = await requestConfirm({
      title: `Delete ${editableSelectedPatterns.length} library pattern${editableSelectedPatterns.length === 1 ? '' : 's'}?`,
      message: editableSelectedPatterns.length === 1
        ? `Delete “${editableSelectedPatterns[0].name}” from the library?${bundledKept > 0 ? ' Bundled patterns will be kept.' : ''}`
        : `Delete ${editableSelectedPatterns.length} saved patterns from the library?${bundledKept > 0 ? ' Bundled patterns will be kept.' : ''}`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
    if (!ok) return
    await Promise.all(editableSelectedPatterns.map((pattern) => deletePattern(pattern.id)))
    setSelectedPatternIds((current) => {
      const next = new Set(current)
      editableSelectedPatterns.forEach((pattern) => next.delete(pattern.id))
      return next
    })
    setPatternContextMenu(null)
    setStatus(`Deleted ${editableSelectedPatterns.length} pattern${editableSelectedPatterns.length === 1 ? '' : 's'}`, 'success')
  }
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

  // Landing on an empty graph (fresh load, cleared canvas, new project) opens
  // the first category and nothing else: a blank canvas with every section
  // shut named none of the ways to add a node, and an open category is the
  // library saying "drag one of these". The remembered section is untouched
  // (see saveExpanded), so the next load of a real graph still comes back to
  // it.
  //
  // On page load the graph store is empty until the async project bootstrap
  // installs the saved workspace, so the steer fires first and the real graph
  // lands under it. When nodes appear and the user has not touched the
  // library since the steer, that is the load, not their work: come back to
  // the remembered section. A node they dragged in clears the flag, so the
  // section they are working from stays put.
  useEffect(() => {
    if (isEmptyGraph) {
      steerOwnsSection.current = true
      setExpandedId(CATEGORIES[0].id)
    } else if (steerOwnsSection.current) {
      steerOwnsSection.current = false
      setExpandedId(loadExpanded() ?? 'recipes')
    }
  }, [isEmptyGraph])

  const handleAddNode = (type: string) => {
    steerOwnsSection.current = false
    const def = SIDEBAR_NODE_LIBRARY.find((n) => n.type === type)
    if (!def) return
    // Pass `centreOnDrop` so the node settles vertically centred on the drop
    // point once React Flow measures its (variable) height, rather than hanging
    // below it — i.e. it ends up half its height above where the top-left lands.
    const id = `${type}-${Date.now()}`
    addNode({
      id,
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
    autoConnectPlacedNode(id)
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
        hidden: ['MicInput', 'LineInput'].includes(spec.type),
        selectable: !['MicInput', 'LineInput'].includes(spec.type),
        draggable: !['MicInput', 'LineInput'].includes(spec.type),
        data: {
          label: def.label,
          nodeType: def.type,
          category: def.category,
          properties: resolveDefaultProperties(def.type, Object.fromEntries(Object.entries({
            ...def.defaultProperties,
            ...spec.props,
          }).map(([key, value]) => [
            key,
            typeof value === 'string' && value.startsWith('$')
              ? nodeIdByKey.get(value.slice(1)) ?? ''
              : value,
          ]))),
          inputs: def.inputs,
          outputs: def.outputs,
        },
      })
      rememberRecent(spec.type)
    }
    for (const spec of recipe.nodes.filter((node) => node.type === 'Audio')) {
      const audioId = nodeIdByKey.get(spec.key)
      const sourceRef = typeof spec.props?.sourceId === 'string' && spec.props.sourceId.startsWith('$')
        ? nodeIdByKey.get(spec.props.sourceId.slice(1))
        : undefined
      if (audioId && sourceRef) useGraphStore.getState().updateNodeProperty(audioId, 'sourceId', sourceRef)
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
        ? `${recipe.title} recipe added — wire it into your existing LED output when ready`
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
        <span className={styles.moduleGlyph} data-output-type={outputType} aria-hidden="true"><PortIcon dataType={outputType} /></span>
        <span className={styles.moduleCopy}>
          <span className={styles.moduleTopline}>
            <span className={styles.moduleName}>{n.label}</span>
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
            <Icon name="star" />
          </button>
          <span className={styles.moduleGrip} aria-hidden="true">⠿</span>
        </span>
      </li>
    )
  }

  // LED outputs, displays and the other physical outputs are added from the
  // bench, so the Output section here holds only the few graph-side ones. A
  // permanent signpost saves a new user's first search for "LED".
  const outputsOnHardwareRow = (
    <div className={styles.hardwareMatches}>
      <button
        type="button"
        className={styles.hardwareMatch}
        onClick={() => openHardwareShelf('MatrixOutput')}
        title="LED outputs, displays, relays and the other physical outputs are added from the Hardware tab"
      >
        <span className={styles.hardwareMatchName}>LED outputs are on the Hardware tab</span>
        <span className={styles.hardwareMatchHint}>Open &rarr;</span>
      </button>
    </div>
  )

  const renderSection = (
    id: string,
    label: string,
    accent: string,
    defs: NodeDefinition[],
    opts?: { emptyMessage?: string; lead?: React.ReactNode },
  ) => {
    if (defs.length === 0 && !opts?.emptyMessage) return null
    const open = expandedId === id
    return (
      <div key={id} className={styles.category}>
        <button
          className={styles.categoryHeader}
          style={{ '--accent': accent } as React.CSSProperties}
          onClick={() => toggle(id)}
          aria-expanded={open}
        >
          <span className={styles.drawerLabel}>
            <span className={styles.drawerLight} aria-hidden="true" />
            {label}
          </span>
          <span
            className={styles.chevron}
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            ▾
          </span>
        </button>
        {open && opts?.lead}
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
      <ul className={`${styles.nodeList} ${styles.patternList}`} role="listbox" aria-multiselectable="true">
        {entries.map((pattern) => {
          const renaming = renamingId === pattern.id
          const selected = selectedPatternIds.has(pattern.id)
          const rating = ratingsByPatternId[pattern.id]
          const userRating = userRatingsByPatternId[pattern.id]
          const scoreTier = rating && !rating.failed && !rating.skipped ? ratingTier(rating.overall) : 'bad'
          const tags = patternFormTags(pattern.bestOn)
          return (
            <li
              key={pattern.id}
              className={`${styles.nodeItem} ${styles.patternItem} ${selected ? styles.patternItemSelected : ''}`}
              style={{ '--accent': 'var(--accent-library)' } as React.CSSProperties}
              draggable={!renaming}
              role="option"
              tabIndex={renaming ? -1 : 0}
              aria-selected={selected}
              aria-label={pattern.name}
              onDragStart={(event) => {
                if (!selected) {
                  setSelectedPatternIds(new Set([pattern.id]))
                  setPatternSelectionAnchor(pattern.id)
                }
                handlePatternDragStart(event, pattern)
              }}
              onClick={(event) => { if (!renaming) handlePatternSelection(event, pattern.id) }}
              onDoubleClick={() => { if (!renaming) handleAddPattern(pattern) }}
              onContextMenu={(event) => { if (!renaming) openPatternContextMenu(event, pattern.id) }}
              onKeyDown={(event) => {
                if (renaming) return
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleAddPattern(pattern)
                } else if (event.key === ' ') {
                  event.preventDefault()
                  handlePatternSelection(event, pattern.id)
                } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  showPatternContextMenu(pattern.id, rect.left + 22, rect.top + rect.height / 2)
                }
              }}
              title={renaming
                ? undefined
                : `${pattern.name}
${pattern.bundled ? 'Bundled pattern · ' : ''}${pattern.origin ? `Imported${pattern.origin === 'link' ? ' from a share link' : ''} · ` : ''}${tags.length ? `Best on ${tagNames(tags)} · ` : ''}Click to select · double-click to add · drag to place`}
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
                    else if (event.key === 'Escape') {
                      // The field answers this Escape; the layer beneath stays open.
                      event.preventDefault()
                      cancelRename()
                    }
                  }}
                />
              ) : (
                <>
                  <span className={styles.patternName}>{pattern.name}</span>
                  {pattern.origin && (
                    <span
                      className={styles.patternOrigin}
                      title={pattern.origin === 'link' ? 'Imported from a share link' : 'Imported from a file or pasted JSON'}
                    >
                      Imported
                    </span>
                  )}
                  <PatternFormIcons bestOn={pattern.bestOn} />
                  {/* Fixed-width columns, always present, so symbols and scores line up down the list. */}
                  <span className={styles.patternUserRating} title={userRating ? `Your rating: ${userRating} of 5 stars` : undefined}>
                    {userRating ? `★${userRating}` : null}
                  </span>
                  <span
                    className={rating ? `${styles.patternRating} ${styles[`patternRating_${scoreTier}`]}` : styles.patternRating}
                    title={!rating ? undefined : rating.failed ? 'Studio could not assess this pattern' : rating.skipped ? 'Allow this pattern’s code to run before Studio can judge it' : `${rating.verdictLabel} · Studio Score ${rating.overall}`}
                  >
                    {!rating ? null : rating.failed || rating.skipped ? '—' : rating.overall}
                  </span>
                  {!pattern.bundled && (
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
                        <Icon name="edit" size={12} />
                      </button>
                      <button
                        className={styles.patternBtn}
                        aria-label={`Share ${pattern.name} on the community site`}
                        title="Share on designstudioforfastled.com"
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleSharePattern(pattern)
                        }}
                      >
                        <Icon name="external" size={12} />
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
                        <Icon name="close" size={12} />
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
    <>
    <aside className={styles.sidebar} id="node-library">
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.headerTitle}>Node Library</span>
          <span className={styles.headerMeta}>Click or drag to add</span>
        </div>
      </div>
      <div className={styles.searchWrap}>
        <div className={styles.searchLabel}>Find a node</div>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search nodes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className={styles.scroll}>
        {hardwareMatches.length > 0 && (
          <div className={styles.hardwareMatches}>
            <p className={styles.hardwareMatchesLead}>On the Hardware tab</p>
            {hardwareMatches.map((def) => (
              <button
                key={def.type}
                type="button"
                className={styles.hardwareMatch}
                onClick={() => openHardwareShelf(def.type)}
                title={`${def.label} is added from the Hardware tab`}
              >
                <span className={styles.hardwareMatchName}>{def.label}</span>
                <span className={styles.hardwareMatchHint}>Added from Hardware &rarr;</span>
              </button>
            ))}
          </div>
        )}
        {query === '' && visibleRecipes.length > 0 && (
          <div className={styles.category}>
            <button
              className={styles.categoryHeader}
              style={{ '--accent': 'var(--accent-recipes)' } as React.CSSProperties}
              onClick={() => toggle('recipes')}
              aria-expanded={expandedId === 'recipes'}
            >
              <span className={styles.drawerLabel}>
                <span className={styles.drawerLight} aria-hidden="true" />
                Quick recipes
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
          emptyMessage: 'No favourites yet — click the star on a node to pin it here.',
        } : undefined)}
        {renderSection('recent', 'Recent', 'var(--accent-recent)', recentDefs, query === '' ? {
          emptyMessage: 'No recently used nodes yet.',
        } : undefined)}

        {CATEGORIES.map(({ id, label }) => {
          const nodes = filteredByView(categoryNodes(id))
          if (nodes.length === 0) return null
          return renderSection(id, label, CATEGORY_ACCENT_VAR[id], nodes,
            id === 'output' ? { lead: outputsOnHardwareRow } : undefined)
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
              aria-expanded={expandedId === 'library'}
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
              title={selectedPatternIds.size > 0
                ? `Create a Pattern Collection containing the ${selectedPatternIds.size} selected patterns`
                : 'Create a Pattern Collection containing all saved patterns'}
              onClick={() => handleCreateCollection()}
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
              aria-label="Open Pattern Insights"
              title="Ask Studio to judge your saved patterns and set your own ratings"
              onClick={openRatings}
              disabled={patterns.length === 0}
            >
              <Icon name="star" />
            </button>
            <button
              className={styles.revealBtn}
              type="button"
              aria-label="Import patterns, palettes or collections"
              title="Import a pattern file, library bundle, pasted JSON or share link"
              aria-expanded={libraryImportOpen}
              onClick={() => {
                if (expandedId !== 'library') toggle('library')
                setLibraryImportOpen((open) => !open)
              }}
            >
              ⤒
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
              aria-label={expandedId === 'library' ? 'Collapse Pattern Library' : 'Expand Pattern Library'}
              aria-expanded={expandedId === 'library'}
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
                        event.preventDefault()
                        setCreatingPatternCategory(false)
                        setPatternCategoryDraft('')
                      }
                    }}
                  />
                  <button className={styles.shelfConfirmBtn} type="button" onClick={commitPatternCategory}>Add</button>
                </div>
              )}
              {libraryImportOpen && (
                <div className={styles.libraryImport} role="group" aria-label="Import into Pattern Library">
                  <textarea
                    className={`${styles.libraryImportText} nodrag`}
                    value={libraryImportDraft}
                    autoFocus
                    rows={3}
                    aria-label="Paste a share link or library JSON"
                    placeholder="Paste a share link or pattern JSON…"
                    onChange={(event) => setLibraryImportDraft(event.target.value)}
                  />
                  <div className={styles.libraryImportRow}>
                    <button
                      className={styles.shelfConfirmBtn}
                      type="button"
                      disabled={!libraryImportDraft.trim()}
                      onClick={commitLibraryImport}
                    >
                      Import
                    </button>
                    <button
                      className={styles.shelfConfirmBtn}
                      type="button"
                      onClick={() => libraryFileInputRef.current?.click()}
                    >
                      Choose file…
                    </button>
                    <button className={styles.shelfConfirmBtn} type="button" onClick={closeLibraryImport}>Cancel</button>
                    <input
                      ref={libraryFileInputRef}
                      type="file"
                      accept=".json,.fastled-pattern.json,.fastled-library.json,.fastled-collection.json,.fastled-palette.json"
                      multiple
                      style={{ display: 'none' }}
                      aria-label="Choose pattern or library files"
                      onChange={handleLibraryFileChange}
                    />
                  </div>
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
    {patternContextMenu && createPortal(
      <div
        className={styles.patternContextMenu}
        role="menu"
        aria-label="Pattern actions"
        style={{ left: patternContextMenu.x, top: patternContextMenu.y }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.patternContextSummary}>
          <strong>{selectedPatterns.length} selected</strong>
          <span>{editableSelectedPatterns.length} editable</span>
        </div>
        <button type="button" role="menuitem" autoFocus onClick={addSelectedPatternsToCanvas}>
          <span aria-hidden="true">↗</span>
          Add to canvas
        </button>
        <div className={styles.patternContextLabel}>Add to collection</div>
        {collectionNodeIds.map((nodeId, index) => (
          <button
            key={nodeId}
            type="button"
            role="menuitem"
            onClick={() => addSelectedPatternsToCollection(nodeId)}
          >
            <span aria-hidden="true">＋</span>
            Pattern Collection {index + 1}
          </button>
        ))}
        <button type="button" role="menuitem" onClick={() => createCollectionFromSelection()}>
          <span aria-hidden="true">◇</span>
          New collection
        </button>
        <div className={styles.patternContextLabel}>New collection, played by</div>
        {COLLECTION_PLAYERS.map((player) => (
          <button
            key={player.type}
            type="button"
            role="menuitem"
            title={player.title}
            onClick={() => createCollectionFromSelection(player.type)}
          >
            <span aria-hidden="true">▶</span>
            {player.label}
          </button>
        ))}
        <div className={styles.patternContextDivider} />
        <button
          type="button"
          role="menuitem"
          title="Save the selection as a pattern file you can send to someone, nested groups included"
          onClick={() => exportPatterns(selectedPatterns)}
        >
          <span aria-hidden="true">⤓</span>
          Export pattern file…
        </button>
        <button
          type="button"
          role="menuitem"
          title="Copy a link that imports the selection into another Studio's Pattern Library"
          onClick={() => void copyPatternLink(selectedPatterns)}
        >
          <Icon name="link" />
          Copy share link
        </button>
        <div className={styles.patternContextDivider} />
        <div className={styles.patternContextLabel}>Best displayed on</div>
        {PATTERN_FORM_TAGS.map((tag) => {
          const state = selectionTagState(tag.id)
          return (
            <button
              key={tag.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={state === 'on' ? true : state === 'mixed' ? 'mixed' : false}
              className={state === 'off' ? undefined : styles.patternContextChecked}
              disabled={editableSelectedPatterns.length === 0}
              title={editableSelectedPatterns.length === 0 ? 'Bundled patterns cannot be tagged' : tag.hint}
              onClick={() => toggleSelectionTag(tag.id)}
            >
              <span aria-hidden="true">{state === 'on' ? '✓' : state === 'mixed' ? '–' : ' '}</span>
              {tag.label}
            </button>
          )
        })}
        <div className={styles.patternContextDivider} />
        <button
          type="button"
          role="menuitem"
          className={styles.patternContextDanger}
          onClick={() => void deleteSelectedPatterns()}
          disabled={editableSelectedPatterns.length === 0}
          title={editableSelectedPatterns.length === 0 ? 'Bundled patterns cannot be deleted' : undefined}
        >
          <span aria-hidden="true">×</span>
          Delete{editableSelectedPatterns.length > 1 ? ` ${editableSelectedPatterns.length} patterns` : ''}
        </button>
      </div>,
      document.body,
    )}
    </>
  )
}

export default memo(Sidebar)
