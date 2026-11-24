import { rootGraphNodes, useGraphStore } from '../state/graphStore'
import { useAudioStore } from '../state/audio/audioStore'
import { STARTER_TEMPLATES, buildBoardAwareStarter, type StarterTemplate } from '../state/patterns/starterTemplates'
import { starterPlayerPatterns, starterShowPatterns, starterSlideshowPatterns } from '../state/patterns/starterShowPatterns'
import type { SavedPattern } from '../state/patterns/patternLibrary'
import { useMusicStore } from '../state/player/musicStore'
import { usePlayerTransport } from '../state/player/playerTransport'
import { waitForMusicLibraryRestore } from '../state/player/musicLibraryPersistence'
import { DEMO_TRACK_FILE, fetchDemoTrack } from '../state/player/demoTrack'
import { performanceOptionsFromProperties } from '../codegen/performanceGenerator'
import { useUiStore, BLANK_BENCH_SHELF_CATEGORY } from '../state/uiStore'
import { selectedPhysicalBoardProfile } from '../build/boards/boardProfiles'
import { micSupportedForBoardProfile } from '../build/pins/micPinDefaults'
import { retargetHardwarePins } from '../build/pins/pinRetarget'
import { useUploadStore } from '../state/upload/uploadStore'
import { useFirstProjectGuide } from '../state/firstProjectGuideStore'
import { uniqueProjectName, useProjectStore, type SavedProject } from '../state/projectStore'
import { blankWorkspace, captureWorkspace, hasAuthoredWorkspaceContent } from '../state/workspacePersistence'
import { nextDefaultProjectName } from './projectFileIO'
import { runTidy } from './tidyGraph'
import { PRIMARY_UPLOAD_TARGET_KEY } from '../state/uploadTargets'
import { nodeBodiesLoading } from './nodeBodyLoading'
import { insertLiveExample, type LiveExampleResult, type LiveExampleSpec } from './insertLiveExample'

interface StartFlowOptions {
  closeTemplates?: boolean
}

let startFlowGeneration = 0

/** The longest a starter's layout waits for its node bodies' code to load. */
const BODY_LOAD_WAIT_MS = 3000

/**
 * Let React Flow mount and measure a newly loaded graph before laying it out:
 * wait until every node body that loads on demand has arrived, then two more
 * frames for React Flow to measure the grown nodes, so Tidy spaces them at
 * their full size.
 */
function tidyLoadedTemplate(generation: number) {
  const started = performance.now()
  let settled = 0
  const step = () => {
    // A newer starter or blank canvas supersedes this pending layout.
    if (generation !== startFlowGeneration) return
    settled = nodeBodiesLoading() ? 0 : settled + 1
    if (settled < 2 && performance.now() - started < BODY_LOAD_WAIT_MS) {
      requestAnimationFrame(step)
      return
    }
    runTidy({ quiet: true })
    // Loading a starter, including its automatic layout, begins a fresh
    // workspace and should not create an Undo step.
    useGraphStore.temporal.getState().clear()
  }
  requestAnimationFrame(step)
}

/** `choice` is a Start Gallery pick; a help example is not one, so it leaves "Last start" alone. */
function finishStartFlow(choice: string | 'blank' | null, statusText: string, nodeIds?: string[], options?: StartFlowOptions) {
  const ui = useUiStore.getState()
  useGraphStore.temporal.getState().clear()
  // A new project for the first-project guide: what "Make it yours" compares
  // against, and no upload of it yet.
  useFirstProjectGuide.getState().noteFreshStart()
  if (choice !== null) ui.setLastStartChoice(choice)
  if (choice === 'blank') {
    ui.requestFitView(nodeIds)
  } else {
    // A starter or example is work to look at, so it opens on Graph with the
    // preview running it. Landing it on Hardware showed an empty bench whose
    // only cue was the Graph tab's 1.8 s flash. Blank Canvas alone lands on
    // Hardware (`landOnStartingWorkspace`), where naming a board is the work.
    ui.showGraphWithPreview()
    ui.revealGraphNodes(nodeIds)
  }
  ui.setStatus(statusText, 'success')
  if (options?.closeTemplates) ui.closeTemplates()
}

/**
 * Land a freshly installed workspace on the tab that has work to offer.
 *
 * A project with nothing in it opens on Hardware, because choosing the board
 * and the parts is the only work there is — a blank Graph canvas asks for
 * wiring against hardware nobody has named. Anything with content is left
 * where it is, which is Graph, because that is where the hours go.
 *
 * Emptiness is counted without the Board node: every root graph carries one
 * whether or not a board was chosen, so a node count would never read zero.
 */
export function landOnStartingWorkspace() {
  const blank = rootGraphNodes(useGraphStore.getState())
    .every((node) => node.data.nodeType === 'Board')
  if (!blank) return
  // Through the action rather than `setState`, so a display editor left open
  // is dismissed with it — see the `leavingDisplayEditor` rule in uiStore.
  const ui = useUiStore.getState()
  ui.setWorkspaceMode('hardware')
  // The shelf is open — it is what the tab is for — with the LED outputs
  // alone unfolded: nothing is on the bench yet, so no other section is the
  // one being worked in, and a wall of open categories would bury the
  // controller the first decision is actually about.
  ui.setHardwareShelfCategory(BLANK_BENCH_SHELF_CATEGORY)
  // A new blank project is a new bench, so the controller nudge is owed again
  // even to someone who answered it on the last one.
  ui.restoreControllerHint()
  useUiStore.setState({ sidebarOpen: true })
}

/**
 * A show starter's or example's Pattern Collection opens holding the starter
 * show, and a slideshow starter's a few standard patterns. Pattern Master
 * runs on the wall clock until a track plays, so this is what the LED output
 * shows the moment the project lands; an empty collection opened black (and
 * a Pattern Browser's OLED said NO PATTERNS). Through `addPatternsToCollection`, as the picker
 * adds them, so each is a copy that remembers its library pattern and Update
 * from library still works.
 */
function seedCollection(patterns: (() => SavedPattern[]) | undefined) {
  if (!patterns) return
  const graph = useGraphStore.getState()
  const collection = graph.nodes.find((node) => node.data.nodeType === 'PatternCollection')
  if (!collection) return
  graph.addPatternsToCollection(collection.id, patterns())
}

/**
 * A show starter's or example's Music Library opens holding the bundled demo
 * track, analysed: what dropping that file on the library does, done for the
 * user, so the Performance Generator has a show to play from the first look.
 *
 * It fetches a file and decodes it, so it runs only for a trusted workspace,
 * and only for the project and start choice that asked: by the time the
 * track arrives the user may have opened something else. A track that cannot
 * be fetched leaves the library empty, with its own drop zone to say what to
 * do next.
 */
async function scanDemoTrack(wanted: boolean | undefined, generation: number) {
  if (!wanted || !useGraphStore.getState().trusted) return
  const projectId = useProjectStore.getState().currentProjectId
  const stillWanted = () => {
    const graph = useGraphStore.getState()
    return generation === startFlowGeneration
      && projectId === useProjectStore.getState().currentProjectId
      && graph.trusted
      && rootGraphNodes(graph).some((node) => node.data.nodeType === 'MusicLibrary')
  }
  let track: Blob
  try {
    track = await fetchDemoTrack()
  } catch {
    if (stillWanted()) {
      useUiStore.getState().setStatus('The demo track could not be loaded. Drop your own songs into the Music Library.', 'info')
    }
    return
  }
  // A new project's library is restored (to empty) asynchronously, and a
  // track added before that settles would be wiped by it.
  await waitForMusicLibraryRestore()
  if (!stillWanted()) return
  const music = useMusicStore.getState()
  if (music.entries.some((entry) => entry.file.name === DEMO_TRACK_FILE)) return
  // Analysed with the generator's own settings, as the library's drop zone does.
  const generator = rootGraphNodes(useGraphStore.getState())
    .find((node) => node.data.nodeType === 'PerformanceGenerator')
  music.addDemoTrack(track, performanceOptionsFromProperties(generator?.data.properties ?? {}))
}

export function startTemplate(template: StarterTemplate, options?: StartFlowOptions) {
  const generation = ++startFlowGeneration
  const graph = useGraphStore.getState()
  const { nodes, edges } = buildBoardAwareStarter(
    template,
    rootGraphNodes(graph),
    useUploadStore.getState().selectedFqbn,
  )
  useGraphStore.getState().loadGraph(nodes, edges)
  seedCollection(template.playerPatterns ? starterPlayerPatterns
    : template.showPatterns ? starterShowPatterns
    : template.slideshowPatterns ? starterSlideshowPatterns
      : undefined)
  finishStartFlow(
    template.id,
    `Loaded "${template.name}" starter`,
    nodes.filter((node) => !node.hidden).map((node) => node.id),
    options,
  )
  tidyLoadedTemplate(generation)
  void scanDemoTrack(template.demoTrack, generation)
  if (template.activateMicrophone) {
    const ui = useUiStore.getState()
    if (ui.testSignal) ui.toggleTestSignal()
    const boardProfile = selectedPhysicalBoardProfile(useGraphStore.getState().nodes)
    if (micSupportedForBoardProfile(boardProfile)) {
      void useAudioStore.getState().startAudio().catch(() => {
        ui.setStatus('Microphone could not start. Check browser permission and the selected audio input.', 'error')
      })
    } else {
      useAudioStore.getState().stopAudio()
    }
  }
}

function findTemplate(id: string): StarterTemplate {
  const template = STARTER_TEMPLATES.find((entry) => entry.id === id)
  if (!template) throw new Error(`Unknown starter template: ${id}`)
  return template
}

export function startTemplateById(id: string, options?: StartFlowOptions) {
  startTemplate(findTemplate(id), options)
}

const DEFAULT_PROJECT_NAME = /^new project(\(\d+\))?$/i

/**
 * The blank, default-named project a first visit or File > New Project leaves
 * open. Nothing in it is anyone's work, so a start choice takes it over
 * instead of opening a second project beside it; otherwise every first visit
 * left an empty "New Project" in Recent Projects. Null when the open project
 * is named, or has anything in it.
 */
function reusableBlankProject(): SavedProject | null {
  const { projects, currentProjectId } = useProjectStore.getState()
  const current = projects.find((project) => project.id === currentProjectId)
  if (!current || !DEFAULT_PROJECT_NAME.test(current.name.trim())) return null
  if (hasAuthoredWorkspaceContent(useGraphStore.getState()) || hasAuthoredWorkspaceContent(current.workspace)) return null
  return current
}

/**
 * Make a new project the one autosave writes to, before a start choice loads.
 *
 * Loading into the open project would overwrite it, and its file, under its
 * own name. Instead the open project is offered a save and keeps what it had,
 * and the start choice opens as a project of its own. Returns false when the
 * person cancels.
 *
 * The new project is a draft until the person saves it, and a draft left with
 * Continue without saving is replaced rather than kept: trying one starter
 * after another leaves one project, not "Juggle 2", "Juggle 3"….
 */
async function beginStartProject(name: string, options?: { carryUploadTarget?: boolean }): Promise<boolean> {
  const reusable = reusableBlankProject()
  if (reusable) {
    const others = useProjectStore.getState().projects.filter((project) => project.id !== reusable.id)
    useProjectStore.getState().renameProject(reusable.id, uniqueProjectName(others, name), { draft: true })
    return true
  }
  const { projects, currentProjectId } = useProjectStore.getState()
  const current = projects.find((project) => project.id === currentProjectId)
  const primaryTarget = current?.uploadTargets?.[PRIMARY_UPLOAD_TARGET_KEY]
  const ui = useUiStore.getState()
  let replaces = current?.draft ? current.id : undefined
  if (hasAuthoredWorkspaceContent(useGraphStore.getState())) {
    if (current) {
      const decision = await ui.requestNewProjectDecision(current.name, 'starting a new project', `new project "${name}"`)
      if (decision === 'cancel') return false
      if (decision === 'yes') {
        useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()), { userSave: true })
        replaces = undefined
      }
    } else {
      // No project holds this graph, so nothing can save it.
      const ok = await ui.requestConfirm({
        title: 'Replace current graph?',
        message: 'The current graph is not in a project, so starting here discards it. Continue?',
        confirmLabel: 'Discard and start',
        cancelLabel: 'Cancel',
        tone: 'danger',
      })
      if (!ok) return false
    }
  }
  useProjectStore.getState().createProject(name, blankWorkspace(), {
    uploadTargets: options?.carryUploadTarget && primaryTarget
      ? { [PRIMARY_UPLOAD_TARGET_KEY]: primaryTarget } : undefined,
    draft: true,
    replaces,
  })
  return true
}

/** Open a starter as a new project named after it. */
export async function openStarterProject(template: StarterTemplate | string, options?: StartFlowOptions): Promise<boolean> {
  const starter = typeof template === 'string' ? findTemplate(template) : template
  // A starter is built against the open project's board, so the new project
  // keeps that project's upload target too.
  if (!await beginStartProject(starter.name, { carryUploadTarget: true })) return false
  startTemplate(starter, options)
  return true
}

/** What an embed link that names no starter, or one that does not exist,
 *  opens: the patch in the README's overview picture. */
export const EMBED_DEFAULT_STARTER = 'field-warp'

/**
 * Open the starter an embedded demo asked for (`&starter=<starter id>`), as the
 * session's one project. See docs/design/embed-mode.md.
 */
export function openEmbedStarter(requested: string): Promise<boolean> {
  const known = STARTER_TEMPLATES.some((template) => template.id === requested)
  return openStarterProject(known ? requested : EMBED_DEFAULT_STARTER)
}

/**
 * Open a node-reference example as a new project named after its node.
 *
 * It used to drop beside whatever was open, so a reader who clicked Try it
 * live on a finished project got the example tangled into their work. Now it
 * is a start choice like a starter: the open project is offered a save, the
 * example lands alone on a fresh canvas with the project's board, its bench
 * parts take that board's pins, and the canvas tidies itself once React Flow
 * has measured the nodes. Resolves to null when the person cancels.
 */
export async function openExampleProject(example: LiveExampleSpec, projectName: string): Promise<LiveExampleResult | null> {
  if (!await beginStartProject(projectName, { carryUploadTarget: true })) return null
  const generation = ++startFlowGeneration
  const graph = useGraphStore.getState()
  graph.loadGraph([], [])
  const result = insertLiveExample(example, { x: 0, y: 0 })
  seedCollection(example.showPatterns ? starterShowPatterns : undefined)
  // As a starter is: every part, the LED output included, takes the board's
  // pins. Through the store action the wired LED output would count as a
  // fixture and keep its library default, which an SD Card's chip select then
  // lands on too.
  const nodes = rootGraphNodes(useGraphStore.getState())
  const profile = selectedPhysicalBoardProfile(nodes)
  useGraphStore.setState({
    nodes: retargetHardwarePins(nodes, profile, profile?.compatibleFqbns[0] ?? useUploadStore.getState().selectedFqbn).nodes,
  })
  const { name } = useProjectStore.getState().projects.find((project) => project.id === useProjectStore.getState().currentProjectId) ?? { name: projectName }
  finishStartFlow(null, `Opened "${name}"`, result.addedNodeIds)
  tidyLoadedTemplate(generation)
  void scanDemoTrack(example.demoTrack, generation)
  return result
}

/** Open a blank canvas as a new, default-named project. */
export async function openBlankProject(options?: StartFlowOptions): Promise<boolean> {
  // An open blank default project is kept under its own name, not renamed to
  // the next free default.
  const name = reusableBlankProject()?.name
    ?? nextDefaultProjectName(useProjectStore.getState().projects.map((project) => project.name))
  if (!await beginStartProject(name)) return false
  startBlankCanvas(options)
  return true
}

export function startBlankCanvas(options?: StartFlowOptions) {
  startFlowGeneration += 1
  useGraphStore.getState().loadGraph([], [])
  // Nothing on the bench yet, so nothing in the shelf is the category you
  // were last working in; the LED outputs are the first thing it will need.
  useUiStore.getState().setHardwareShelfCategory(BLANK_BENCH_SHELF_CATEGORY)
  finishStartFlow('blank', 'Started with a blank canvas', undefined, options)
  landOnStartingWorkspace()
}

/** The board and matrix the first-launch showcase plays its show on. */
export const SHOWCASE_BOARD_PROFILE = 'generic-esp32-s3-n16r8-44pin-dual-usbc'
export const SHOWCASE_MATRIX_SIZE = 32
/** How long the show waits for the demo track before giving up. */
const SHOWCASE_TRACK_WAIT_MS = 15_000

/**
 * Start the show the first-launch showcase plays: the Music Player starter as
 * a project of its own, with its demo track running. Resolves false when the
 * person cancels the save prompt or the track never loads, having said why.
 *
 * It is a start choice like any starter, so open work is offered a save first.
 * A first visit has a blank project, which a starter replaces without asking.
 *
 * The starter is then set up for the screen it is about to be shown on:
 *  - the ESP32-S3 N16R8, the board this show is built for, with every part's
 *    pins assigned again for it (the starter took them from whichever board
 *    was open, and the SD card would sit on a pin the S3 does not have);
 *  - a 32 x 32 matrix, the showcase opener's size, so the lights do not
 *    change size when the show takes over;
 *  - the Graph workspace with the preview open and running, because the
 *    preview evaluates at full rate, and owns the music player, only then.
 */
export async function openShowcaseShow(): Promise<boolean> {
  if (!await openStarterProject('generative-show', { closeTemplates: true })) return false
  const board = useGraphStore.getState().nodes.find((node) => node.data.nodeType === 'Board')
  if (board) useGraphStore.getState().selectBoardProfile(board.id, SHOWCASE_BOARD_PROFILE)
  const placed = rootGraphNodes(useGraphStore.getState())
  const profile = selectedPhysicalBoardProfile(placed)
  if (profile) {
    useGraphStore.setState({
      nodes: retargetHardwarePins(placed, profile, profile.compatibleFqbns[0] ?? useUploadStore.getState().selectedFqbn).nodes,
    })
  }
  const graph = useGraphStore.getState()
  const output = graph.nodes.find((node) => node.data.nodeType === 'MatrixOutput')
  if (output) graph.updateNodeProperties(output.id, { width: SHOWCASE_MATRIX_SIZE, height: SHOWCASE_MATRIX_SIZE })
  // Setting the show up is not something to undo into.
  useGraphStore.temporal.getState().clear()

  const ui = useUiStore.getState()
  ui.showGraphWithPreview()
  if (!ui.evaluationRunning) ui.toggleEvaluation()

  // `localTrack` is the track the transport under the preview has loaded.
  for (let waited = 0; waited < SHOWCASE_TRACK_WAIT_MS && !usePlayerTransport.getState().localTrack; waited += 150) {
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  const transport = usePlayerTransport.getState()
  if (!transport.localTrack) {
    ui.setStatus('The demo track did not load, so the show has no music to follow', 'error')
    return false
  }
  if (!transport.playing) {
    transport.dispatchControls({ sourceId: 'showcase', playPause: true, previous: false, next: false })
  }
  return true
}

/**
 * Lay the showcase's project out for the canvas the person is about to see.
 * The starter laid itself out under the showcase, before its matrix and board
 * changed; not an Undo step.
 */
export function settleShowcaseProject() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    runTidy({ quiet: true, scope: 'all' })
    useGraphStore.temporal.getState().clear()
  }))
}
