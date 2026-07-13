import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'public', 'node-reference')
const GENERATED_TS = path.join(ROOT, 'src', 'components', 'HelpModal', 'nodeReferenceAssets.generated.ts')
const ENV = typeof process !== 'undefined' ? process.env : {}
const RUNTIME_OPTIONS = globalThis.__NODE_REFERENCE_CAPTURE_OPTIONS ?? {}
const APP_URL = ENV.NODE_REFERENCE_APP_URL ?? 'http://127.0.0.1:5173'
const DEMO_AUDIO_PATH = ENV.NODE_REFERENCE_AUDIO_PATH
  ?? 'C:\\Users\\User\\Downloads\\Organic Soup - Old Timers - 2017 - MP3 (1)\\01 - Organic Soup - Old Timers (2016 Edit).mp3'
const FILTER_NODE_TYPES = Array.isArray(RUNTIME_OPTIONS.nodeTypes)
  ? RUNTIME_OPTIONS.nodeTypes.map(String)
  : String(ENV.NODE_REFERENCE_NODE_TYPES ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
const SKIP_CATEGORIES = Boolean(RUNTIME_OPTIONS.skipCategories) || ENV.NODE_REFERENCE_SKIP_CATEGORIES === '1'

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {}

  try {
    return require('playwright')
  } catch {}

  const searchRoots = [
    ENV.CODEX_NODE_MODULES,
    path.join(ROOT, 'node_modules'),
    'C:\\Users\\User\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules',
  ].filter(Boolean)

  for (const root of searchRoots) {
    try {
      const modulePath = path.join(root, 'playwright', 'index.js')
      const scopedRequire = createRequire(modulePath)
      return scopedRequire('playwright')
    } catch {}
  }

  throw new Error('Unable to load Playwright. Set CODEX_NODE_MODULES to a node_modules folder containing playwright.')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureCleanOutput(reset = true) {
  if (reset) await fs.rm(OUT_DIR, { recursive: true, force: true })
  await fs.mkdir(path.join(OUT_DIR, 'categories'), { recursive: true })
  await fs.mkdir(path.join(OUT_DIR, 'nodes'), { recursive: true })
}

function generatedTs(assets) {
  return `export interface NodeReferenceImageSet {
  node: string
  graph: string
  preview: string
}

export interface NodeReferenceAssets {
  categories: Record<string, string>
  nodes: Record<string, NodeReferenceImageSet>
}

export const NODE_REFERENCE_ASSETS: NodeReferenceAssets = ${JSON.stringify(assets, null, 2)} as const
`
}

async function main() {
  const { chromium } = await loadPlaywright()
  const partialCapture = FILTER_NODE_TYPES.length > 0 || SKIP_CATEGORIES
  await ensureCleanOutput(!partialCapture)
  let demoAudio = null
  try {
    const bytes = await fs.readFile(DEMO_AUDIO_PATH)
    demoAudio = {
      name: path.basename(DEMO_AUDIO_PATH),
      mimeType: 'audio/mpeg',
      bytes: Array.from(bytes),
    }
  } catch {}

  let browser
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
  } catch {
    browser = await chromium.launch({ headless: true })
  }

  const page = await browser.newPage({
    viewport: { width: 1680, height: 1040 },
    deviceScaleFactor: 1,
  })

  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('#node-library')
  await page.waitForSelector('#preview-panel canvas')
  await page.evaluate(async () => {
    await document.fonts.ready
  })

  await page.evaluate(async (demoAudioFile) => {
    const [
      nodeLib,
      nodeDefaultsMod,
      tidyMod,
      perfMod,
    ] = await Promise.all([
      import('/src/state/nodeLibrary.ts'),
      import('/src/state/nodeDefaults.ts'),
      import('/src/utils/tidyGraph.ts'),
      import('/src/codegen/performanceGenerator.ts'),
    ])

    const { NODE_LIBRARY, CATEGORIES, portColor, propertyGroupsFor } = nodeLib
    const { resolveDefaultProperties } = nodeDefaultsMod
    const { runTidy } = tidyMod
    const { generateShow } = perfMod
    const useGraphStore = window.useGraphStore
    const useUiStore = window.useUiStore
    const useShowPlayback = window.useShowPlayback
    const useMusicStore = window.useMusicStore

    if (!useGraphStore || !useUiStore || !useShowPlayback || !useMusicStore) {
      throw new Error('Node reference capture requires DEV store handles on window.')
    }

    const defByType = new Map(NODE_LIBRARY.map((node) => [node.type, node]))
    const graphIds = () => ({
      root: { id: 'root', name: 'Main' },
    })

    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    const resetUi = () => {
      useUiStore.setState({
        helpOpen: false,
        recoverOpen: false,
        templatesOpen: false,
        projectsOpen: false,
        sidebarOpen: true,
        previewPanelOpen: false,
        stageMode: false,
        performanceMode: false,
        preview3d: false,
        previewStyle: 'standard',
        testSignal: true,
        uiEffectsEnabled: true,
        signalPathDimEnabled: true,
        reducedMotion: true,
        highContrast: false,
        theme: 'dark',
      })
      document.documentElement.dataset.reducedMotion = ''
      delete document.documentElement.dataset.theme
      delete document.documentElement.dataset.highContrast
      delete document.documentElement.dataset.uiEffects
    }

    const clearStores = () => {
      useShowPlayback.setState({
        nodeId: null,
        show: null,
        posMs: 0,
        useGroupInputs: false,
        playing: false,
      })
      useMusicStore.setState({ entries: [] })
    }

    const propsFor = (type, extra = {}) => {
      const def = defByType.get(type)
      return {
        ...resolveDefaultProperties(type, def?.defaultProperties ?? {}),
        ...extra,
      }
    }

    const portType = (type, portId, direction) => {
      const def = defByType.get(type)
      const ports = direction === 'output' ? (def?.outputs ?? []) : (def?.inputs ?? [])
      return ports.find((port) => port.id === portId)?.dataType ?? 'float'
    }

    const node = (type, id, x, y, extraProps = {}) => {
      const def = defByType.get(type)
      if (!def) throw new Error(`Unknown node type: ${type}`)
      return {
        id,
        type: 'studioNode',
        position: { x, y },
        data: {
          label: def.label,
          nodeType: def.type,
          category: def.category,
          properties: propsFor(type, extraProps),
          inputs: def.inputs,
          outputs: def.outputs,
        },
      }
    }

    const edge = (sourceType, source, sourceHandle, target, targetHandle) => ({
      id: `e-${source}-${sourceHandle}-${target}-${targetHandle}`,
      source,
      sourceHandle,
      target,
      targetHandle,
      type: 'glowEdge',
      reconnectable: 'target',
      style: { stroke: portColor(portType(sourceType, sourceHandle, 'output')) },
    })

    const sourceSpecForType = (dataType, nodeType, index) => {
      const presets = {
        audio: { type: 'MicInput', key: 'mic' },
        bool: { type: 'Interval', key: 'interval' },
        color: { type: 'CHSV', key: 'chsv' },
        field: { type: 'DistanceField', key: 'distance' },
        float: { type: 'Wave', key: 'wave' },
        frame: { type: 'Noise', key: 'noise' },
        palette: { type: 'PaletteSelector', key: 'palette' },
        music: { type: 'MusicLibrary', key: 'library' },
        patternset: { type: 'PatternCollection', key: 'collection' },
        sdcard: { type: 'SDCard', key: 'sdcard' },
        shows: { type: 'PerformanceGenerator', key: 'performance' },
        transitionset: { type: 'TransitionSet', key: 'transitions' },
      }
      const fallback = {
        audio: { type: 'MicInput', key: 'mic-fallback' },
        bool: { type: 'Trigger', key: 'trigger-fallback' },
        color: { type: 'BlendColors', key: 'blendcolors-fallback' },
        field: { type: 'FieldNoise', key: 'fieldnoise-fallback' },
        float: { type: 'Counter', key: 'counter-fallback' },
        frame: { type: 'GradientFrame', key: 'gradient-fallback' },
        palette: { type: 'CustomPalette', key: 'custompalette-fallback' },
        music: { type: 'MusicLibrary', key: 'library-fallback' },
        patternset: { type: 'PatternCollection', key: 'collection-fallback' },
        sdcard: { type: 'SDCard', key: 'sdcard-fallback' },
        shows: { type: 'PerformanceGenerator', key: 'performance-fallback' },
        transitionset: { type: 'TransitionSet', key: 'transitions-fallback' },
      }
      const primary = presets[dataType] ?? { type: 'Wave', key: 'value' }
      const alt = fallback[dataType] ?? primary
      const chosen = primary.type === nodeType ? alt : primary
      return { type: chosen.type, id: `${chosen.key}-${index}` }
    }

    const groupPattern = (groupId, patternType, name, patternProps = {}) => {
      const patternId = `${groupId}-${patternType.toLowerCase()}`
      return {
        meta: { id: groupId, name },
        content: {
          nodes: [
            node(patternType, patternId, 40, 80, patternProps),
            {
              id: `${groupId}-out`,
              type: 'studioNode',
              position: { x: 320, y: 120 },
              data: {
                label: 'Group Output',
                nodeType: 'GroupOutput',
                category: 'output',
                properties: {},
                inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
                outputs: [],
              },
            },
          ],
          edges: [
            edge(patternType, patternId, 'frame', `${groupId}-out`, 'frame'),
          ],
        },
      }
    }

    const showCollectionExtras = () => {
      const a = groupPattern('group-rainbow', 'Rainbow', 'Rainbow Sweep')
      const b = groupPattern('group-fire', 'Fire2012', 'Fire Core')
      return {
        patternIds: [a.meta.id, b.meta.id],
        graphs: {
          ...graphIds(),
          [a.meta.id]: a.meta,
          [b.meta.id]: b.meta,
        },
        graphData: {
          [a.meta.id]: a.content,
          [b.meta.id]: b.content,
        },
      }
    }

    const fakeAnalysis = (title = 'Node Reference Demo') => {
      const durationMs = 24000
      const beats = []
      for (let t = 0; t <= durationMs; t += 500) beats.push(t)
      const sections = [
        { startMs: 0, endMs: 4000, type: 'intro', energy: 0.28 },
        { startMs: 4000, endMs: 9000, type: 'verse', energy: 0.45 },
        { startMs: 9000, endMs: 13000, type: 'buildup', energy: 0.65 },
        { startMs: 13000, endMs: 19000, type: 'drop', energy: 0.9 },
        { startMs: 19000, endMs: 24000, type: 'outro', energy: 0.35 },
      ]
      const sectionAt = (t) => sections.find((section) => t >= section.startMs && t < section.endMs) ?? sections[0]
      const energy = []
      for (let t = 0; t <= durationMs; t += 100) {
        const section = sectionAt(t)
        const phase = t / 1000
        const pulse = (Math.sin(phase * 2.4) + 1) / 2
        const bass = Math.min(1, section.energy * 0.55 + pulse * 0.45)
        const mids = Math.min(1, section.energy * 0.45 + ((Math.sin(phase * 3.2 + 1.4) + 1) / 2) * 0.35)
        const treble = Math.min(1, section.energy * 0.35 + ((Math.sin(phase * 5.1 + 2.1) + 1) / 2) * 0.4)
        energy.push({
          t,
          bass,
          mids,
          treble,
          overall: Math.min(1, (bass + mids + treble) / 3),
        })
      }
      return {
        title,
        durationMs,
        beats: { timestamps: beats, bpm: 120, confidence: 0.92 },
        energy,
        sections,
        mood: { energy: 0.72, valence: 0.58, key: 'A minor' },
      }
    }

    const seedMusicEntry = (patternIds) => {
      const file = demoAudioFile?.bytes
        ? new File([new Uint8Array(demoAudioFile.bytes)], demoAudioFile.name, { type: demoAudioFile.mimeType ?? 'audio/mpeg' })
        : new File(['demo'], 'Node Reference Demo.mp3', { type: 'audio/mpeg' })
      const title = (file.name || 'Node Reference Demo')
        .replace(/\.[^.]+$/, '')
        .replace(/\s*-\s*\d+\s*-\s*/g, ' - ')
      const analysis = fakeAnalysis(title)
      const show = generateShow(analysis, {}, patternIds, patternIds.map(() => []), ['crossfade', 'zoom', 'ripple'])
      useMusicStore.setState({
        entries: [{
          id: 'demo-track',
          file,
          analysis,
          show,
          status: 'done',
          progress: 1,
        }],
      })
      return show
    }

    const openPropertyGroups = (nodeType) => {
      const groups = propertyGroupsFor(nodeType) ?? []
      if (groups.length === 0) return
      const key = `fastled-studio.propGroupsOpen.${nodeType}`
      const state = Object.fromEntries(groups.map((group) => [group.key, true]))
      localStorage.setItem(key, JSON.stringify(state))
    }

    const layoutScene = async (scene) => {
      clearStores()
      resetUi()
      openPropertyGroups(scene.targetType)
      useGraphStore.getState().loadGraph(scene.nodes, scene.edges, scene.workspace)
      await nextFrame()
      await nextFrame()
      if (scene.afterLoad) scene.afterLoad()
      await wait(150)
      runTidy()
      useGraphStore.getState().selectNode(scene.targetId)
      useUiStore.getState().requestFitView()
      await nextFrame()
      await nextFrame()
      await wait(350)

      window.__nodeRefScene = {
        targetId: scene.targetId,
        nodeIds: scene.nodes.map((entry) => entry.id),
      }
    }

    const genericScene = (targetType, primaryOutput) => {
      const def = defByType.get(targetType)
      const inputs = def?.inputs ?? []
      const target = node(targetType, 'target', 420, 220)
      const nodes = []
      const edges = []
      const workspace = { graphData: {}, graphs: graphIds(), activeGraphId: 'root' }

      const pushSource = (input, index) => {
        const spec = sourceSpecForType(input.dataType, targetType, index)
        const source = node(spec.type, spec.id, 120, 80 + index * 160)
        nodes.push(source)
        edges.push(edge(spec.type, source.id, defByType.get(spec.type)?.outputs[0]?.id ?? 'out', 'target', input.id))
      }

      switch (primaryOutput) {
        case 'audio': {
          const fft = node('FFTAnalyzer', 'fft', 660, 150)
          const bars = node('SpectrumBars', 'bars', 940, 150)
          const out = node('MatrixOutput', 'out', 1220, 150)
          nodes.push(target, fft, bars, out)
          edges.push(edge(targetType, 'target', 'audio', 'fft', 'audio'))
          edges.push(edge('FFTAnalyzer', 'fft', 'bass', 'bars', 'bass'))
          edges.push(edge('FFTAnalyzer', 'fft', 'mids', 'bars', 'mids'))
          edges.push(edge('FFTAnalyzer', 'fft', 'treble', 'bars', 'treble'))
          edges.push(edge('SpectrumBars', 'bars', 'frame', 'out', 'frame'))
          break
        }
        case 'bool': {
          const base = node('Noise', 'base', 660, 110)
          const flash = node('BeatFlash', 'flash', 940, 110)
          const out = node('MatrixOutput', 'out', 1220, 110)
          nodes.push(target, base, flash, out)
          edges.push(edge(targetType, 'target', def.outputs[0].id, 'flash', 'beat'))
          edges.push(edge('Noise', 'base', 'frame', 'flash', 'frame'))
          edges.push(edge('BeatFlash', 'flash', 'frame', 'out', 'frame'))
          inputs.forEach(pushSource)
          break
        }
        case 'color': {
          const solid = node('SolidColor', 'solid', 760, 150)
          const out = node('MatrixOutput', 'out', 1040, 150)
          nodes.push(target, solid, out)
          edges.push(edge(targetType, 'target', def.outputs[0].id, 'solid', 'color'))
          edges.push(edge('SolidColor', 'solid', 'frame', 'out', 'frame'))
          inputs.forEach(pushSource)
          break
        }
        case 'palette': {
          const noise = node('Noise', 'noise', 760, 150)
          const out = node('MatrixOutput', 'out', 1040, 150)
          nodes.push(target, noise, out)
          edges.push(edge(targetType, 'target', def.outputs[0].id, 'noise', 'paletteIn'))
          edges.push(edge('Noise', 'noise', 'frame', 'out', 'frame'))
          inputs.forEach(pushSource)
          break
        }
        case 'field': {
          const toFrame = node('FieldToFrame', 'toframe', 760, 150)
          const out = node('MatrixOutput', 'out', 1040, 150)
          nodes.push(target, toFrame, out)
          edges.push(edge(targetType, 'target', def.outputs[0].id, 'toframe', 'field'))
          edges.push(edge('FieldToFrame', 'toframe', 'frame', 'out', 'frame'))
          inputs.forEach(pushSource)
          break
        }
        case 'float': {
          const base = node('Noise', 'base', 760, 40)
          const bright = node('BrightnessMod', 'bright', 1040, 40)
          const out = node('MatrixOutput', 'out', 1320, 40)
          nodes.push(target, base, bright, out)
          edges.push(edge(targetType, 'target', def.outputs[0].id, 'bright', 'brightness'))
          edges.push(edge('Noise', 'base', 'frame', 'bright', 'frame'))
          edges.push(edge('BrightnessMod', 'bright', 'frame', 'out', 'frame'))
          inputs.forEach(pushSource)
          break
        }
        case 'transitionset':
        case 'patternset':
        case 'music':
        case 'shows':
        case 'sdcard':
          throw new Error(`Special scene required for ${targetType}`)
        case 'frame':
        default: {
          const out = node('MatrixOutput', 'out', 940, 150)
          nodes.push(target, out)
          edges.push(edge(targetType, 'target', def.outputs[0].id, 'out', 'frame'))
          inputs.forEach(pushSource)
          break
        }
      }

      return { targetId: 'target', targetType, nodes, edges, workspace }
    }

    const generativeShowScene = (targetType) => {
      const extras = showCollectionExtras()
      const collectionProps = { patternIds: extras.patternIds, patternSections: {} }
      const collection = node('PatternCollection', targetType === 'PatternCollection' ? 'target' : 'collection', 140, 180, collectionProps)
      const master = node('PatternMaster', targetType === 'PatternMaster' ? 'target' : 'master', 480, 180)
      const transitions = node('TransitionSet', targetType === 'TransitionSet' ? 'target' : 'transitions', 480, 420, { transitions: ['crossfade', 'zoom', 'ripple'] })
      const out = node('MatrixOutput', 'out', 860, 180)
      const nodes = [collection, master, transitions, out]
      const edges = [
        edge('PatternCollection', collection.id, 'patternset', master.id, 'patternset'),
        edge('TransitionSet', transitions.id, 'transitions', master.id, 'transitions'),
        edge('PatternMaster', master.id, 'frame', 'out', 'frame'),
      ]
      return {
        targetId: targetType === 'PatternCollection' ? collection.id : targetType === 'PatternMaster' ? master.id : transitions.id,
        targetType,
        nodes,
        edges,
        workspace: {
          graphData: extras.graphData,
          graphs: extras.graphs,
          activeGraphId: 'root',
        },
      }
    }

    const musicSyncScene = (targetType) => {
      const extras = showCollectionExtras()
      const library = node('MusicLibrary', targetType === 'MusicLibrary' ? 'target' : 'library', 60, 40)
      const collection = node('PatternCollection', 'collection', 60, 360, { patternIds: extras.patternIds, patternSections: {} })
      const transitions = node('TransitionSet', 'transitions', 400, 360, { transitions: ['crossfade', 'zoom', 'ripple'] })
      const performance = node('PerformanceGenerator', targetType === 'PerformanceGenerator' ? 'target' : 'performance', 400, 40, targetType === 'PerformanceGenerator' ? { showInMainPreview: true } : {})
      const sd = node('SDCard', targetType === 'SDCard' ? 'target' : 'sdcard', 780, 40)
      const out = node('MatrixOutput', 'out', 1120, 40)
      const nodes = [library, collection, transitions, performance, sd, out]
      const edges = [
        edge('MusicLibrary', library.id, 'music', performance.id, 'music'),
        edge('PatternCollection', collection.id, 'patternset', performance.id, 'patternset'),
        edge('TransitionSet', transitions.id, 'transitions', performance.id, 'transitions'),
        edge('PerformanceGenerator', performance.id, 'shows', sd.id, 'shows'),
        edge('SDCard', sd.id, 'sdcard', out.id, 'sdcard'),
      ]
      return {
        targetId: targetType === 'MusicLibrary' ? library.id : targetType === 'PerformanceGenerator' ? performance.id : sd.id,
        targetType,
        nodes,
        edges,
        workspace: {
          graphData: extras.graphData,
          graphs: extras.graphs,
          activeGraphId: 'root',
        },
        afterLoad: () => {
          const show = seedMusicEntry(extras.patternIds)
          useShowPlayback.setState({
            nodeId: performance.id,
            show,
            posMs: 11250,
            useGroupInputs: false,
            playing: false,
          })
        },
      }
    }

    const matrixOutputScene = () => {
      const noise = node('Noise', 'noise', 80, 120)
      const hue = node('HueShift', 'hue', 420, 120)
      const out = node('MatrixOutput', 'target', 760, 120)
      return {
        targetId: 'target',
        targetType: 'MatrixOutput',
        nodes: [noise, hue, out],
        edges: [
          edge('Noise', 'noise', 'frame', 'hue', 'frame'),
          edge('HueShift', 'hue', 'frame', 'target', 'frame'),
        ],
        workspace: { graphData: {}, graphs: graphIds(), activeGraphId: 'root' },
      }
    }

    const commentScene = () => {
      const comment = node('Comment', 'target', 320, 20, {
        text: 'Document timing and palette choices here.',
        color: '#ffcc55',
      })
      const rainbow = node('Rainbow', 'rainbow', 60, 260)
      const trails = node('Trails', 'trails', 400, 260)
      const out = node('MatrixOutput', 'out', 740, 260)
      return {
        targetId: 'target',
        targetType: 'Comment',
        nodes: [comment, rainbow, trails, out],
        edges: [
          edge('Rainbow', 'rainbow', 'frame', 'trails', 'frame'),
          edge('Trails', 'trails', 'frame', 'out', 'frame'),
        ],
        workspace: { graphData: {}, graphs: graphIds(), activeGraphId: 'root' },
      }
    }

    const buildScene = (targetType) => {
      const def = defByType.get(targetType)
      if (!def) throw new Error(`Unknown node type: ${targetType}`)
      if (targetType === 'PatternCollection' || targetType === 'PatternMaster' || targetType === 'TransitionSet') {
        return generativeShowScene(targetType)
      }
      if (targetType === 'MusicLibrary' || targetType === 'PerformanceGenerator' || targetType === 'SDCard') {
        return musicSyncScene(targetType)
      }
      if (targetType === 'MatrixOutput') return matrixOutputScene()
      if (targetType === 'Comment') return commentScene()
      return genericScene(targetType, def.outputs[0]?.dataType ?? 'frame')
    }

    const boxFor = (selector, padding = 18) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        x: Math.max(0, Math.floor(rect.left - padding)),
        y: Math.max(0, Math.floor(rect.top - padding)),
        width: Math.ceil(rect.width + padding * 2),
        height: Math.ceil(rect.height + padding * 2),
      }
    }

    const graphClip = (padding = 54) => {
      const scene = window.__nodeRefScene
      if (!scene) return null
      const rects = scene.nodeIds
        .map((id) => document.querySelector(`.react-flow__node[data-id="${id}"]`)?.getBoundingClientRect())
        .filter(Boolean)
      if (rects.length === 0) return null
      const left = Math.min(...rects.map((rect) => rect.left))
      const top = Math.min(...rects.map((rect) => rect.top))
      const right = Math.max(...rects.map((rect) => rect.right))
      const bottom = Math.max(...rects.map((rect) => rect.bottom))
      return {
        x: Math.max(0, Math.floor(left - padding)),
        y: Math.max(0, Math.floor(top - padding)),
        width: Math.ceil(right - left + padding * 2),
        height: Math.ceil(bottom - top + padding * 2),
      }
    }

    const ensureAllView = () => {
      const allTab = Array.from(document.querySelectorAll('#node-library [role="tab"]'))
        .find((button) => button.textContent?.trim() === 'All')
      allTab?.click()
    }

    const categoryClip = async (categoryId) => {
      ensureAllView()
      await wait(120)
      const label = CATEGORIES.find((category) => category.id === categoryId)?.label
      if (!label) throw new Error(`Unknown category ${categoryId}`)
      const button = Array.from(document.querySelectorAll('#node-library button'))
        .find((candidate) => candidate.textContent?.includes(label))
      if (!button) throw new Error(`Unable to find category ${label}`)
      button.click()
      await wait(180)
      button.scrollIntoView({ block: 'start' })
      await wait(120)
      const section = button.closest('div')
      if (!section) throw new Error(`Unable to find section for ${label}`)
      const rect = section.getBoundingClientRect()
      return {
        x: Math.max(0, Math.floor(rect.left - 12)),
        y: Math.max(0, Math.floor(rect.top - 12)),
        width: Math.ceil(rect.width + 24),
        height: Math.min(520, Math.ceil(rect.height + 24)),
      }
    }

    window.__nodeRefCapture = {
      catalog: NODE_LIBRARY.map((node) => ({
        type: node.type,
        label: node.label,
        category: node.category,
      })),
      categories: CATEGORIES.map((category) => ({ id: category.id, label: category.label })),
      prepareScene: async (nodeType) => {
        const scene = buildScene(nodeType)
        await layoutScene(scene)
      },
      nodeClip: () => boxFor(`.react-flow__node[data-id="${window.__nodeRefScene?.targetId}"]`),
      graphClip,
      previewClip: () => boxFor('[data-node-ref-preview="true"]', 0),
      showPreview: async () => {
        useUiStore.setState({ previewPanelOpen: true })
        await nextFrame()
        await nextFrame()
        await wait(250)
        const header = document.querySelector('#preview-panel [aria-label="Preview telemetry"]')
        const previewFrame = header?.parentElement
        if (previewFrame) previewFrame.setAttribute('data-node-ref-preview', 'true')
      },
      categoryClip,
    }
  }, demoAudio)

  const { catalog, categories } = await page.evaluate(() => ({
    catalog: window.__nodeRefCapture.catalog,
    categories: window.__nodeRefCapture.categories,
  }))
  const assets = { categories: {}, nodes: {} }

  if (!SKIP_CATEGORIES) {
    for (const category of categories) {
      const clip = await page.evaluate((categoryId) => window.__nodeRefCapture.categoryClip(categoryId), category.id)
      const rel = `/node-reference/categories/${category.id}.png`
      const dest = path.join(OUT_DIR, 'categories', `${category.id}.png`)
      await page.screenshot({ path: dest, clip })
      assets.categories[category.id] = rel
    }
  }

  const captureCatalog = FILTER_NODE_TYPES.length > 0
    ? catalog.filter((item) => FILTER_NODE_TYPES.includes(item.type))
    : catalog

  for (const item of captureCatalog) {
    await page.evaluate((nodeType) => window.__nodeRefCapture.prepareScene(nodeType), item.type)
    await sleep(200)

    const nodeDir = path.join(OUT_DIR, 'nodes', item.type)
    await fs.mkdir(nodeDir, { recursive: true })

    const nodeClip = await page.evaluate(() => window.__nodeRefCapture.nodeClip())
    const graphClip = await page.evaluate(() => window.__nodeRefCapture.graphClip())
    if (!nodeClip || !graphClip) {
      const sceneDebug = await page.evaluate(() => ({
        scene: window.__nodeRefScene ?? null,
        nodeIds: Array.from(document.querySelectorAll('.react-flow__node')).map((el) => el.getAttribute('data-id')),
        previewPresent: !!document.querySelector('[data-node-ref-preview="true"]'),
      }))
      throw new Error(`Missing clip for ${item.type}: node=${!!nodeClip} graph=${!!graphClip} debug=${JSON.stringify(sceneDebug)}`)
    }

    await page.screenshot({ path: path.join(nodeDir, 'node.png'), clip: nodeClip })
    await page.screenshot({ path: path.join(nodeDir, 'graph.png'), clip: graphClip })

    await page.evaluate(() => window.__nodeRefCapture.showPreview())
    const previewClip = await page.evaluate(() => window.__nodeRefCapture.previewClip())
    if (!previewClip) throw new Error(`Missing preview clip for ${item.type}`)
    await page.screenshot({ path: path.join(nodeDir, 'preview.png'), clip: previewClip })

    assets.nodes[item.type] = {
      node: `/node-reference/nodes/${item.type}/node.png`,
      graph: `/node-reference/nodes/${item.type}/graph.png`,
      preview: `/node-reference/nodes/${item.type}/preview.png`,
    }
  }

  if (!partialCapture) {
    await fs.writeFile(GENERATED_TS, generatedTs(assets))
  }
  await browser.close()
}

try {
  await main()
} catch (error) {
  console.error(error)
  if (typeof process !== 'undefined') process.exitCode = 1
  throw error
}
