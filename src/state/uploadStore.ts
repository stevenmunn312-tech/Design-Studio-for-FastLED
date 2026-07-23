import { create } from 'zustand'
import {
  checkBackend, listPorts, listCores, uploadSketch, uploadShow, locateCli, installCli, installCore,
  monitorSerial,
  type BackendHealth, type SerialPort, type ShowUploadFile,
} from '../utils/backendClient'
import { useProjectStore } from './projectStore'
import { useStreamStore } from './streamStore'

// ── Board catalogue ───────────────────────────────────────────────────────────
// Each board maps to an arduino-cli FQBN and the core that provides it. ESP32,
// RP2040 and Teensy are third-party cores (their board-manager URL is registered
// by the helper when their core is installed).
//
// `psram` lists the board's external-PSRAM build options (FQBN menu values):
// PSRAM is a chip-package option that can't be probed from the host before
// flashing, so the catalogue records which MCUs *can* have it and the generated
// firmware checks `psramFound()` at runtime. Boards without the field (AVR,
// RP2040, Teensy) have no PSRAM support.
export interface PsramOption { id: string; label: string; opt: string }
export interface Board { label: string; fqbn: string; core: string; thirdParty?: boolean; psram?: PsramOption[] }

export const BOARDS: Board[] = [
  { label: 'ESP32-S3',      fqbn: 'esp32:esp32:esp32s3',   core: 'esp32:esp32',   thirdParty: true,
    psram: [
      { id: 'opi',  label: 'OPI (R8 modules, e.g. N16R8)', opt: 'PSRAM=opi' },
      { id: 'qspi', label: 'QSPI (R2 modules, e.g. N8R2)', opt: 'PSRAM=enabled' },
    ] },
  { label: 'ESP32',         fqbn: 'esp32:esp32:esp32',     core: 'esp32:esp32',   thirdParty: true,
    psram: [
      { id: 'qspi', label: 'QSPI (WROVER modules)', opt: 'PSRAM=enabled' },
    ] },
  { label: 'Arduino Uno',   fqbn: 'arduino:avr:uno',       core: 'arduino:avr' },
  { label: 'Arduino Nano',  fqbn: 'arduino:avr:nano',      core: 'arduino:avr' },
  // Same arduino:avr core as Uno/Nano above (built-in board index, no
  // board-manager URL to register) — just a bigger chip with more pins.
  // Not yet hardware-validated by this project; see beta-support-matrix.md.
  { label: 'Arduino Mega (experimental)', fqbn: 'arduino:avr:mega', core: 'arduino:avr' },
  { label: 'Teensy 4.1',    fqbn: 'teensy:avr:teensy41',   core: 'teensy:avr',    thirdParty: true },
  { label: 'RP2040 (Pico)', fqbn: 'rp2040:rp2040:rpipico', core: 'rp2040:rp2040', thirdParty: true },
  // arduino:samd is also part of arduino-cli's built-in board index (Arduino's
  // own SAMD core, unlike the ESP32/RP2040/Teensy third-party packages above).
  // Not yet hardware-validated by this project; see beta-support-matrix.md.
  { label: 'Arduino Nano 33 IoT (experimental)', fqbn: 'arduino:samd:nano_33_iot', core: 'arduino:samd' },
]

export function boardByFqbn(fqbn: string): Board | undefined {
  return BOARDS.find((b) => b.fqbn === fqbn)
}

// Whether the helper's *active* engine is actually usable — fbuild needs no
// per-board core install, so its readiness is just "the binary is there";
// arduino-cli additionally needs a core installed per board, checked
// separately by callers (BoardPopup's per-row status).
export function engineReady(helper: BackendHealth | null | undefined): boolean {
  if (!helper) return false
  return helper.engine === 'fbuild' ? !!helper.fbuild : !!helper.arduinoCli
}

// ── Live upload status ────────────────────────────────────────────────────────
export type UploadPhase = 'idle' | 'compiling' | 'uploading' | 'done' | 'error' | 'working'
export interface UploadStatus { phase: UploadPhase; percent?: number; message: string }

const IDLE: UploadStatus = { phase: 'idle', message: '' }

// Derive a compact status from the helper's streamed compile/upload log. The
// helper emits `=== … compile ===` / `=== … upload ===` markers, esptool prints
// `(NN %)` during the write, and each phase ends with `[… exit code: N]`.
export function parseStatus(log: string): UploadStatus {
  // A capacity overflow is a compile failure — the helper tags it `[size-error]`
  // so we can show a specific "won't fit" message instead of the generic one
  // (the console auto-opens with the full explanation).
  if (/\[size-error\]/.test(log)) {
    return { phase: 'error', message: "Won't fit — too big for this board" }
  }
  if (/\*\*\* FAILED|\*\*\* .*failed|\[error\]|exit code: [1-9]/i.test(log)) {
    return { phase: 'error', message: 'Error — see output' }
  }
  // Flash/RAM headroom parsed from the compile step (`[size] flash N% · ram M%`),
  // shown alongside the later phases; `[size-warning]` flags a tight fit.
  const sizeM = [...log.matchAll(/\[size\] flash (\d+)%/g)].pop()
  const sizeTag = sizeM ? ` · flash ${sizeM[1]}%${/\[size-warning\]/.test(log) ? ' ⚠' : ''}` : ''
  if (/Upload complete|All done|ready\.\n/i.test(log)) {
    return { phase: 'done', message: `Done${sizeTag}` }
  }
  const upIdx = log.lastIndexOf('upload ===')
  if (upIdx >= 0) {
    const pcts = [...log.slice(upIdx).matchAll(/\((\d+)\s*%\)/g)]
    const p = pcts.length ? Number(pcts[pcts.length - 1][1]) : undefined
    return { phase: 'uploading', percent: p, message: p != null ? `Uploading ${p}%` : 'Uploading…' }
  }
  if (/compile ===/.test(log)) return { phase: 'compiling', message: `Compiling…${sizeTag}` }
  return { phase: 'working', message: 'Working…' }
}

// ── Persistence ───────────────────────────────────────────────────────────────
const KEY = 'design-studio-for-fastled-upload'
interface Persisted { myBoards: string[]; selectedFqbn: string; selectedPort: string }
interface CachedSketchUpload { code: string; fqbnOpt?: string }

function load(): Persisted {
  const fallback: Persisted = { myBoards: BOARDS.map((b) => b.fqbn), selectedFqbn: BOARDS[0].fqbn, selectedPort: '' }
  try {
    const v = localStorage.getItem(KEY)
    if (!v) return fallback
    return { ...fallback, ...(JSON.parse(v) as Partial<Persisted>) }
  } catch {
    return fallback
  }
}

function projectSelection(fallback: Persisted): Pick<UploadState, 'selectedFqbn' | 'selectedPort'> {
  const { currentProjectId, projects } = useProjectStore.getState()
  const current = projects.find((project) => project.id === currentProjectId)
  return {
    selectedFqbn: current?.uploadTarget?.selectedFqbn || fallback.selectedFqbn,
    selectedPort: current?.uploadTarget?.selectedPort || fallback.selectedPort,
  }
}

function persistFallback(s: Pick<UploadState, 'myBoards' | 'selectedFqbn' | 'selectedPort'>) {
  persistedPrefs = { myBoards: s.myBoards, selectedFqbn: s.selectedFqbn, selectedPort: s.selectedPort }
  try { localStorage.setItem(KEY, JSON.stringify({ myBoards: s.myBoards, selectedFqbn: s.selectedFqbn, selectedPort: s.selectedPort })) } catch { /* quota */ }
}

// ── Store ─────────────────────────────────────────────────────────────────────
interface UploadState {
  // helper / hardware
  helper: BackendHealth | null | undefined   // undefined = still probing
  ports: SerialPort[]
  installedCores: string[]
  // selection (persisted)
  myBoards: string[]
  selectedFqbn: string
  selectedPort: string
  lastSketchByProject: Record<string, CachedSketchUpload>
  // run state
  busy: boolean
  status: UploadStatus
  log: string
  serialLog: string
  serialConnected: boolean
  serialError: string
  serialBaud: number
  // overlays
  boardPopupOpen: boolean
  setupWizardOpen: boolean
  deployPopupOpen: boolean
  cliPopupOpen: boolean
  consoleOpen: boolean
  codeViewOpen: boolean
  /** Matrix Output whose node-local Setup/Upload button opened the overlay. */
  activeOutputNodeId: string | null

  // helper / hardware
  refreshHelper: () => Promise<void>
  refreshPorts: () => Promise<void>
  refreshCores: () => Promise<void>
  // selection
  setMyBoards: (fqbns: string[]) => void
  toggleBoard: (fqbn: string) => void
  setSelectedFqbn: (fqbn: string) => void
  setSelectedPort: (port: string) => void
  // overlays
  openBoardPopup: () => void
  closeBoardPopup: () => void
  openSetupWizard: (nodeId?: string) => void
  closeSetupWizard: () => void
  openDeployPopup: (nodeId?: string) => void
  closeDeployPopup: () => void
  openCliPopup: () => void
  closeCliPopup: () => void
  openConsole: () => void
  closeConsole: () => void
  openCodeView: () => void
  closeCodeView: () => void
  // logging
  appendLog: (chunk: string) => void
  clearLog: () => void
  startSerial: () => Promise<void>
  stopSerial: () => void
  clearSerialLog: () => void
  setSerialBaud: (baud: number) => void
  // actions
  // `fqbnOpt` is an optional FQBN board option appended at upload time (e.g.
  // 'PSRAM=opi' when the MatrixOutput "Use PSRAM" toggle is on).
  // `cache: false` skips saving this sketch as the project's "re-upload last
  // sketch" target — used for one-off flashes like the live-stream receiver,
  // which shouldn't clobber the cached pattern sketch.
  runUpload: (code: string, fqbnOpt?: string, opts?: { cache?: boolean }) => Promise<void>
  runLastUpload: () => Promise<void>
  runShowUpload: (payload: { provisioner: string; player: string; files: ShowUploadFile[] }) => Promise<void>
  exportIno: (code: string, filename?: string) => void
  locate: (path: string) => Promise<{ ok: boolean; error?: string }>
  installCli: () => Promise<void>
  installCore: (core: string) => Promise<void>
}

let persistedPrefs = load()
const initialSelection = projectSelection(persistedPrefs)
let serialController: AbortController | null = null

function saveProjectSelection(selectedFqbn: string, selectedPort: string) {
  useProjectStore.getState().setProjectUploadTarget({ selectedFqbn, selectedPort })
}

export const useUploadStore = create<UploadState>((set, get) => ({
  helper: undefined,
  ports: [],
  installedCores: [],
  myBoards: persistedPrefs.myBoards,
  selectedFqbn: initialSelection.selectedFqbn,
  selectedPort: initialSelection.selectedPort,
  lastSketchByProject: {},
  busy: false,
  status: IDLE,
  log: '',
  serialLog: '',
  serialConnected: false,
  serialError: '',
  serialBaud: 115200,
  boardPopupOpen: false,
  setupWizardOpen: false,
  deployPopupOpen: false,
  cliPopupOpen: false,
  consoleOpen: false,
  codeViewOpen: false,
  activeOutputNodeId: null,

  refreshHelper: async () => {
    const h = await checkBackend()
    set({ helper: h })
    // Ports/cores enumeration degrades gracefully on its own (empty lists), so
    // just gate on the helper being reachable at all, not on a specific engine.
    if (h?.ok) { get().refreshPorts(); get().refreshCores() }
  },

  refreshPorts: async () => {
    const ports = await listPorts()
    set({ ports })
    // Default to the first detected board when nothing is chosen, or when the
    // previously selected port has disappeared from the list (e.g. the board
    // re-enumerated on a different port after a replug). Otherwise
    // `selectedPort` keeps pointing at a port that no longer exists while the
    // <select> silently falls back to displaying the first option — making it
    // look like the right port is selected when uploads still target the
    // stale one.
    const { selectedPort } = get()
    const stillPresent = selectedPort && ports.some((p) => p.address === selectedPort)
    if (!stillPresent && ports[0]) get().setSelectedPort(ports[0].address)
  },

  refreshCores: async () => set({ installedCores: await listCores() }),

  setMyBoards: (fqbns) => { set({ myBoards: fqbns }); persistFallback({ ...get(), myBoards: fqbns }) },
  toggleBoard: (fqbn) => {
    const has = get().myBoards.includes(fqbn)
    const myBoards = has ? get().myBoards.filter((f) => f !== fqbn) : [...get().myBoards, fqbn]
    // Keep the active selection valid.
    let selectedFqbn = get().selectedFqbn
    if (!myBoards.includes(selectedFqbn)) selectedFqbn = myBoards[0] ?? ''
    const selectedPort = get().selectedPort
    set({ myBoards, selectedFqbn })
    persistFallback({ ...get(), myBoards, selectedFqbn, selectedPort })
    saveProjectSelection(selectedFqbn, selectedPort)
  },
  setSelectedFqbn: (fqbn) => {
    const selectedPort = get().selectedPort
    set({ selectedFqbn: fqbn })
    persistFallback({ ...get(), selectedFqbn: fqbn, selectedPort })
    saveProjectSelection(fqbn, selectedPort)
  },
  setSelectedPort: (port) => {
    const selectedFqbn = get().selectedFqbn
    set({ selectedPort: port })
    persistFallback({ ...get(), selectedFqbn, selectedPort: port })
    saveProjectSelection(selectedFqbn, port)
  },

  openBoardPopup: () => { set({ boardPopupOpen: true }); get().refreshPorts(); get().refreshCores() },
  closeBoardPopup: () => set({ boardPopupOpen: false }),
  openSetupWizard: (nodeId) => { set({ setupWizardOpen: true, activeOutputNodeId: nodeId ?? null }); get().refreshPorts(); get().refreshCores() },
  closeSetupWizard: () => set({ setupWizardOpen: false }),
  openDeployPopup: (nodeId) => { set({ deployPopupOpen: true, activeOutputNodeId: nodeId ?? null }); get().refreshPorts(); get().refreshCores() },
  closeDeployPopup: () => set({ deployPopupOpen: false }),
  openCliPopup: () => set({ cliPopupOpen: true, boardPopupOpen: false }),
  closeCliPopup: () => set({ cliPopupOpen: false }),
  openConsole: () => set({ consoleOpen: true }),
  closeConsole: () => { get().stopSerial(); set({ consoleOpen: false }) },
  openCodeView: () => set({ codeViewOpen: true }),
  closeCodeView: () => set({ codeViewOpen: false }),

  appendLog: (chunk) => set((s) => ({ log: (s.log + chunk).slice(-60000) })),
  clearLog: () => set({ log: '' }),
  clearSerialLog: () => set({ serialLog: '' }),
  setSerialBaud: (serialBaud) => set({ serialBaud }),
  stopSerial: () => {
    serialController?.abort()
    serialController = null
    set({ serialConnected: false })
  },
  startSerial: async () => {
    const { selectedPort, serialBaud, busy, serialConnected } = get()
    if (!selectedPort || busy || serialConnected) return
    serialController?.abort()
    const controller = new AbortController()
    serialController = controller
    set({ serialConnected: true, serialError: '' })
    try {
      await monitorSerial(selectedPort, serialBaud, (chunk) => set((s) => ({
        serialLog: (s.serialLog + chunk).slice(-60000),
      })), controller.signal)
    } catch (err) {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : String(err)
        set((s) => ({ serialError: message, serialLog: `${s.serialLog}[error] ${message}\n` }))
      }
    } finally {
      if (serialController === controller) serialController = null
      set({ serialConnected: false })
    }
  },

  runUpload: async (code, fqbnOpt, opts) => {
    const { selectedFqbn, selectedPort, busy, helper } = get()
    if (busy) return
    if (!engineReady(helper)) { set({ cliPopupOpen: true }); return }
    if (!selectedPort) { set({ boardPopupOpen: true }); return }
    // The board only has one serial port — a live stream and a compile+flash
    // can't hold it at once, so an upload always wins and reclaims it.
    useStreamStore.getState().stop()
    const currentProjectId = useProjectStore.getState().currentProjectId
    if (currentProjectId && opts?.cache !== false) {
      set((s) => ({
        lastSketchByProject: {
          ...s.lastSketchByProject,
          [currentProjectId]: { code, fqbnOpt },
        },
      }))
    }
    get().stopSerial()
    const fqbn = fqbnOpt ? `${selectedFqbn}:${fqbnOpt}` : selectedFqbn
    set({ busy: true, log: `Uploading to ${selectedPort} (${fqbn})…\n`, status: { phase: 'working', message: 'Starting…' } })
    try {
      await uploadSketch(code, fqbn, selectedPort, (chunk) => {
        const log = (get().log + chunk).slice(-60000)
        const status = parseStatus(log)
        set({ log, status })
        if (status.phase === 'error') set({ consoleOpen: true })
      })
      // Settle on a terminal status from the full log.
      const final = parseStatus(get().log)
      set({ status: final.phase === 'uploading' || final.phase === 'working' ? { phase: 'done', message: 'Done' } : final })
      if (get().status.phase === 'error') set({ consoleOpen: true })
    } catch (err) {
      get().appendLog(`\n[error] ${err}\n`)
      set({ status: { phase: 'error', message: 'Error — helper offline?' }, consoleOpen: true })
    } finally {
      set({ busy: false })
    }
  },

  runLastUpload: async () => {
    const currentProjectId = useProjectStore.getState().currentProjectId
    const cached = currentProjectId ? get().lastSketchByProject[currentProjectId] : undefined
    if (!cached) return
    await get().runUpload(cached.code, cached.fqbnOpt)
  },

  runShowUpload: async (payload) => {
    const { selectedFqbn, selectedPort, busy, helper } = get()
    if (busy) return
    if (!engineReady(helper)) { set({ cliPopupOpen: true }); return }
    if (!selectedPort) { set({ boardPopupOpen: true }); return }
    get().stopSerial()
    useStreamStore.getState().stop()
    set({ busy: true, consoleOpen: true, log: `Provisioning show to ${selectedPort} (${selectedFqbn})…\n`, status: { phase: 'working', message: 'Provisioning…' } })
    try {
      await uploadShow({ fqbn: selectedFqbn, port: selectedPort, ...payload }, (chunk) => {
        const log = (get().log + chunk).slice(-60000)
        const status = parseStatus(log)
        set({ log, status })
        if (status.phase === 'error') set({ consoleOpen: true })
      })
      const final = parseStatus(get().log)
      set({ status: final.phase === 'error' ? final : { phase: 'done', message: 'Done' } })
    } catch (err) {
      get().appendLog(`\n[error] ${err}\n`)
      set({ status: { phase: 'error', message: 'Error — helper offline?' }, consoleOpen: true })
    } finally {
      set({ busy: false })
    }
  },

  exportIno: (code, filename = 'fastled_pattern.ino') => {
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  locate: async (path) => {
    const res = await locateCli(path)
    if (res.ok) { set({ cliPopupOpen: false }); await get().refreshHelper() }
    return res
  },

  installCli: async () => {
    if (get().busy) return
    set({ busy: true, consoleOpen: true, log: get().log + '\n=== Installing arduino-cli ===\n', status: { phase: 'working', message: 'Installing CLI…' } })
    try {
      await installCli((chunk) => get().appendLog(chunk))
      await get().refreshHelper()
      const ok = !!get().helper?.arduinoCli
      set({ status: ok ? { phase: 'done', message: 'CLI installed' } : { phase: 'error', message: 'Install failed' }, cliPopupOpen: !ok })
    } catch (err) {
      get().appendLog(`\n[error] ${err}\n`)
      set({ status: { phase: 'error', message: 'Install failed' } })
    } finally {
      set({ busy: false })
    }
  },

  installCore: async (core) => {
    if (get().busy) return
    set({ busy: true, consoleOpen: true, log: get().log + `\n=== Installing ${core} ===\n`, status: { phase: 'working', message: `Installing ${core}…` } })
    try {
      await installCore(core, (chunk) => get().appendLog(chunk))
      await get().refreshCores()
      const ok = get().installedCores.includes(core)
      set({ status: ok ? { phase: 'done', message: `${core} installed` } : { phase: 'error', message: 'Core install failed' } })
    } catch (err) {
      get().appendLog(`\n[error] ${err}\n`)
      set({ status: { phase: 'error', message: 'Core install failed' } })
    } finally {
      set({ busy: false })
    }
  },
}))

useProjectStore.subscribe(() => {
  const next = projectSelection(persistedPrefs)
  const current = useUploadStore.getState()
  if (current.selectedFqbn === next.selectedFqbn && current.selectedPort === next.selectedPort) return
  useUploadStore.setState({ selectedFqbn: next.selectedFqbn, selectedPort: next.selectedPort })
})
