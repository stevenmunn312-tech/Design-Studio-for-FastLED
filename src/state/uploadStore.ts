import { create } from 'zustand'
import {
  checkBackend, listPorts, listCores, uploadSketch, uploadShow, locateCli, installCli, installCore,
  monitorSerial, checkCoreUpdates, upgradeCores as requestCoreUpgrade, setEngine as requestSetEngine,
  copyToSdCard, compileCheck,
  type BackendHealth, type SerialPort, type ShowUploadFile, type CoreUpdate,
} from '../utils/backendClient'
import { useProjectStore } from './projectStore'
import { useStreamStore } from './streamStore'
import { useGraphStore, rootGraphNodes } from './graphStore'
import { selectedBoardFlashMb } from '../build/boardProfiles'
import { BOARD_GPIO_BY_FQBN, type BoardGpio } from './boardGpio'

export type { BoardGpio, PinNote } from './boardGpio'

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

export interface Board {
  label: string
  fqbn: string
  core: string
  thirdParty?: boolean
  psram?: PsramOption[]
  /** Board-manager index URL — present on user-added custom boards, so their
   *  core can be installed/updated without a hardcoded `_CORE_URLS` entry. */
  boardUrl?: string
  /** Optional GPIO reference for a user-added board. Built-in boards use the
   *  complete BOARD_GPIO_BY_FQBN capability catalogue. */
  gpio?: BoardGpio
}

// The boards below (past Uno/Nano/Mega/Nano 33 IoT) were added from fbuild's
// own board-support reference (BOARD_STATUS.md) to widen the fbuild catalogue.
// None are hardware-validated by this project yet — see beta-support-matrix.md,
// which already treats "all boards except ESP32-S3" as experimental. A few
// entries carry an extra inline caveat where the exact arduino-cli FQBN or
// fbuild/PlatformIO board id couldn't be verified against a real toolchain in
// this environment; fbuild (the preferred engine) is expected to work for all
// of them via `_PIO_BOARDS` in `backend/app.py` — arduino-cli fallback may not
// for the STM32/Zero entries flagged below.
export const BOARDS: Board[] = [
  { label: 'ESP32-S3',      fqbn: 'esp32:esp32:esp32s3',   core: 'esp32:esp32',   thirdParty: true,
    psram: [
      { id: 'opi',  label: 'OPI (R8 modules, e.g. N16R8)', opt: 'PSRAM=opi' },
      { id: 'qspi', label: 'QSPI (R2 modules, e.g. N8R2)', opt: 'PSRAM=enabled' },
    ],
  },
  { label: 'ESP32',         fqbn: 'esp32:esp32:esp32',     core: 'esp32:esp32',   thirdParty: true,
    psram: [
      { id: 'qspi', label: 'QSPI (WROVER modules)', opt: 'PSRAM=enabled' },
    ],
  },
  // The 30-pin DOIT-style DevKit built around an ESP32-WROOM-32D module (silk
  // "ESP-32D"). Same classic ESP32 silicon as the entry above — it gets its own
  // catalogue entry because its header only breaks out a subset of the pads, so
  // the pin picker and the Build Diagram board profile can be header-accurate.
  // WROOM-32D carries no external PSRAM, hence no `psram` options.
  { label: 'ESP32 DevKit v1 (ESP-32D, 30-pin)', fqbn: 'esp32:esp32:esp32doit-devkit-v1', core: 'esp32:esp32', thirdParty: true },
  { label: 'ESP32-S2',      fqbn: 'esp32:esp32:esp32s2',   core: 'esp32:esp32',   thirdParty: true },
  { label: 'ESP32-C3',      fqbn: 'esp32:esp32:esp32c3',   core: 'esp32:esp32',   thirdParty: true },
  { label: 'ESP32-C6',      fqbn: 'esp32:esp32:esp32c6',   core: 'esp32:esp32',   thirdParty: true },
  { label: 'ESP32-H2',      fqbn: 'esp32:esp32:esp32h2',   core: 'esp32:esp32',   thirdParty: true },

  // Named boards that have a physical profile in the Board node. The two lists
  // have to agree: a board offered on the canvas but absent here can be chosen
  // as a design target and then not as an upload target, which reads as a bug.
  // `uploadStore.test.ts` asserts every profile FQBN resolves to an entry.
  //
  // The PSRAM options below are what `arduino-cli board details` actually
  // reports per board, not what the module datasheet implies — LOLIN's two
  // carry PSRAM yet expose no PSRAM menu at all, and inventing one would append
  // an option the core rejects.
  { label: 'NodeMCU-32S',   fqbn: 'esp32:esp32:nodemcu-32s', core: 'esp32:esp32', thirdParty: true },
  // Listed by the ESP32-DevKitC V4 profile, which ships in WROOM and WROVER
  // builds. No PSRAM menu: the WROVER board definition enables it inherently.
  { label: 'ESP32 Wrover Module', fqbn: 'esp32:esp32:esp32wrover', core: 'esp32:esp32', thirdParty: true },
  { label: 'LOLIN S2 Mini', fqbn: 'esp32:esp32:lolin_s2_mini', core: 'esp32:esp32', thirdParty: true },
  { label: 'LOLIN S3',      fqbn: 'esp32:esp32:lolin_s3',   core: 'esp32:esp32',   thirdParty: true },
  { label: 'Adafruit Feather ESP32-S2', fqbn: 'esp32:esp32:adafruit_feather_esp32s2', core: 'esp32:esp32', thirdParty: true,
    psram: [{ id: 'qspi', label: 'QSPI (2 MB)', opt: 'PSRAM=enabled' }],
  },
  { label: 'Adafruit Feather ESP32-S3', fqbn: 'esp32:esp32:adafruit_feather_esp32s3', core: 'esp32:esp32', thirdParty: true,
    psram: [
      { id: 'opi',  label: 'OPI',                    opt: 'PSRAM=opi' },
      { id: 'qspi', label: 'QSPI (2 MB, stock part)', opt: 'PSRAM=enabled' },
    ],
  },
  { label: 'Adafruit QT Py ESP32-S2', fqbn: 'esp32:esp32:adafruit_qtpy_esp32s2', core: 'esp32:esp32', thirdParty: true,
    psram: [{ id: 'qspi', label: 'QSPI (2 MB)', opt: 'PSRAM=enabled' }],
  },
  { label: 'Adafruit Feather ESP32 V2', fqbn: 'esp32:esp32:adafruit_feather_esp32_v2', core: 'esp32:esp32', thirdParty: true },
  { label: 'LOLIN C3 Mini', fqbn: 'esp32:esp32:lolin_c3_mini', core: 'esp32:esp32', thirdParty: true },
  { label: 'Seeed XIAO ESP32-C3', fqbn: 'esp32:esp32:XIAO_ESP32C3', core: 'esp32:esp32', thirdParty: true },
  { label: 'Seeed XIAO ESP32-C6', fqbn: 'esp32:esp32:XIAO_ESP32C6', core: 'esp32:esp32', thirdParty: true },

  { label: 'ESP8266',       fqbn: 'esp8266:esp8266:nodemcuv2', core: 'esp8266:esp8266', thirdParty: true },
  { label: 'Adafruit Feather HUZZAH ESP8266', fqbn: 'esp8266:esp8266:huzzah', core: 'esp8266:esp8266', thirdParty: true },
  { label: 'LOLIN D1 Mini', fqbn: 'esp8266:esp8266:d1_mini', core: 'esp8266:esp8266', thirdParty: true },
  { label: 'Generic ESP8266', fqbn: 'esp8266:esp8266:generic', core: 'esp8266:esp8266', thirdParty: true },
  { label: 'WEMOS D1 R2', fqbn: 'esp8266:esp8266:d1', core: 'esp8266:esp8266', thirdParty: true },
  { label: 'Arduino Uno',   fqbn: 'arduino:avr:uno',       core: 'arduino:avr' },
  { label: 'Arduino Nano',  fqbn: 'arduino:avr:nano',      core: 'arduino:avr' },
  { label: 'Arduino Leonardo', fqbn: 'arduino:avr:leonardo', core: 'arduino:avr' },
  { label: 'Arduino Micro', fqbn: 'arduino:avr:micro', core: 'arduino:avr' },
  // Same arduino:avr core as Uno/Nano above (built-in board index, no
  // board-manager URL to register) — just a bigger chip with more pins.
  // Not yet hardware-validated by this project; see beta-support-matrix.md.
  { label: 'Arduino Mega (experimental)', fqbn: 'arduino:avr:mega', core: 'arduino:avr' },
  // Arduino's own MegaAVR core (0-series), part of arduino-cli's built-in
  // board index like arduino:samd below — no board-manager URL to register.
  { label: 'Arduino Nano Every', fqbn: 'arduino:megaavr:nona4809', core: 'arduino:megaavr' },
  { label: 'Teensy 4.1',    fqbn: 'teensy:avr:teensy41',   core: 'teensy:avr',    thirdParty: true },
  { label: 'Teensy 4.0',    fqbn: 'teensy:avr:teensy40',   core: 'teensy:avr',    thirdParty: true },
  { label: 'Teensy MicroMod', fqbn: 'teensy:avr:teensyMM', core: 'teensy:avr', thirdParty: true },
  { label: 'Teensy 3.6',    fqbn: 'teensy:avr:teensy36',   core: 'teensy:avr',    thirdParty: true },
  { label: 'Teensy 3.5',    fqbn: 'teensy:avr:teensy35',   core: 'teensy:avr',    thirdParty: true },
  // Teensy 3.1 and 3.2 are the same MK20DX256 board revision and share this fqbn.
  { label: 'Teensy 3.1 / 3.2', fqbn: 'teensy:avr:teensy31', core: 'teensy:avr',  thirdParty: true },
  { label: 'Teensy 3.0',    fqbn: 'teensy:avr:teensy30',   core: 'teensy:avr',    thirdParty: true },
  { label: 'Teensy LC',     fqbn: 'teensy:avr:teensyLC',   core: 'teensy:avr',    thirdParty: true },
  { label: 'RP2040 (Pico)', fqbn: 'rp2040:rp2040:rpipico', core: 'rp2040:rp2040', thirdParty: true },
  { label: 'RP2350 (Pico 2)', fqbn: 'rp2040:rp2040:rpipico2', core: 'rp2040:rp2040', thirdParty: true },
  { label: 'Raspberry Pi Pico W', fqbn: 'rp2040:rp2040:rpipicow', core: 'rp2040:rp2040', thirdParty: true },
  { label: 'Raspberry Pi Pico 2 W', fqbn: 'rp2040:rp2040:rpipico2w', core: 'rp2040:rp2040', thirdParty: true },
  { label: 'Adafruit KB2040', fqbn: 'rp2040:rp2040:adafruit_kb2040', core: 'rp2040:rp2040', thirdParty: true },
  // arduino:samd and arduino:sam are also part of arduino-cli's built-in board
  // index (Arduino's own cores, unlike the ESP32/RP2040/Teensy third-party
  // packages above). Not yet hardware-validated by this project; see
  // beta-support-matrix.md.
  { label: 'Arduino Nano 33 IoT (experimental)', fqbn: 'arduino:samd:nano_33_iot', core: 'arduino:samd' },
  { label: 'Arduino Nano 33 BLE', fqbn: 'arduino:mbed_nano:nano33ble', core: 'arduino:mbed_nano' },
  { label: 'Arduino Nano RP2040 Connect', fqbn: 'arduino:mbed_nano:nanorp2040connect', core: 'arduino:mbed_nano' },
  { label: 'Arduino Due',   fqbn: 'arduino:sam:arduino_due_x', core: 'arduino:sam' },
  // The exact fbuild/PlatformIO board id for a bare Arduino Zero (vs. the
  // Adafruit Feather M0 below, which shares the same SAMD21 chip) could not be
  // confirmed against a real toolchain here — flagged experimental until
  // someone validates the `_PIO_BOARDS` entry compiles.
  { label: 'Arduino Zero (experimental)', fqbn: 'arduino:samd:arduino_zero_native', core: 'arduino:samd' },
  { label: 'Adafruit Feather M0 (SAMD21)', fqbn: 'adafruit:samd:adafruit_feather_m0', core: 'adafruit:samd', thirdParty: true },
  { label: 'Adafruit QT Py M0 (SAMD21)', fqbn: 'adafruit:samd:adafruit_qtpy_m0', core: 'adafruit:samd', thirdParty: true },
  { label: 'Adafruit Feather M4 (SAMD51)', fqbn: 'adafruit:samd:adafruit_feather_m4', core: 'adafruit:samd', thirdParty: true },
  { label: 'Adafruit Grand Central M4 (SAMD51)', fqbn: 'adafruit:samd:adafruit_grandcentral_m4', core: 'adafruit:samd', thirdParty: true },
  { label: 'Adafruit Matrix Portal M4 (SAMD51)', fqbn: 'adafruit:samd:adafruit_matrixportal_m4', core: 'adafruit:samd', thirdParty: true },
  // STM32duino's Arduino core needs a `pnum` FQBN sub-option to pick the exact
  // chip variant (e.g. `:pnum=BLUEPILL_F103C8`), which this app doesn't set —
  // so the arduino-cli engine likely can't build these as-is. fbuild (the
  // preferred engine) builds them directly via `_PIO_BOARDS` in
  // `backend/app.py`, which is the reliable path for this group.
  { label: 'STM32F103C8 (Blue Pill, experimental)', fqbn: 'STMicroelectronics:stm32:bluepill_f103c8', core: 'STMicroelectronics:stm32', thirdParty: true },
  { label: 'STM32F411CE (Black Pill, experimental)', fqbn: 'STMicroelectronics:stm32:blackpill_f411ce', core: 'STMicroelectronics:stm32', thirdParty: true },
  { label: 'Nucleo F429ZI (experimental)', fqbn: 'STMicroelectronics:stm32:nucleo_f429zi', core: 'STMicroelectronics:stm32', thirdParty: true },
  { label: 'Nucleo F439ZI (experimental)', fqbn: 'STMicroelectronics:stm32:nucleo_f439zi', core: 'STMicroelectronics:stm32', thirdParty: true },
  { label: 'Arduino UNO R4 WiFi', fqbn: 'arduino:renesas_uno:unor4wifi', core: 'arduino:renesas_uno' },
  { label: 'Arduino UNO R4 Minima', fqbn: 'arduino:renesas_uno:minima', core: 'arduino:renesas_uno' },
  { label: 'nRF52840 DK', fqbn: 'adafruit:nrf52:pca10056', core: 'adafruit:nrf52', thirdParty: true },
  { label: 'Adafruit Feather nRF52840 Express', fqbn: 'adafruit:nrf52:feather52840', core: 'adafruit:nrf52', thirdParty: true },
  { label: 'Seeed XIAO nRF52840', fqbn: 'Seeeduino:nrf52:xiaonRF52840', core: 'Seeeduino:nrf52', thirdParty: true },
  { label: 'SparkFun Pro Micro 5V', fqbn: 'SparkFun:avr:promicro', core: 'SparkFun:avr', thirdParty: true },
]

export function boardByFqbn(fqbn: string): Board | undefined {
  return BOARDS.find((b) => b.fqbn === fqbn) ?? useUploadStore.getState().customBoards.find((b) => b.fqbn === fqbn)
}

/** GPIO capability reference for a built-in board, or an optional custom-board
 *  table. Custom boards without one use conservative numeric entry. */
export function boardGpioInfo(fqbn: string): BoardGpio | undefined {
  return BOARD_GPIO_BY_FQBN[fqbn] ?? boardByFqbn(fqbn)?.gpio
}

/** Built-in catalogue plus any user-added custom boards, in display order. */
export function allBoards(): Board[] {
  return [...BOARDS, ...useUploadStore.getState().customBoards]
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
  // Builds are serialized on one shared project directory, so a request can be
  // refused without anything being compiled. That is not a build error and the
  // sketch is fine — checked before the generic rule below so it can say what
  // actually happened and what to do, rather than "Error — see output".
  if (/\*\*\* DID NOT RUN \*\*\*/.test(log)) {
    return { phase: 'error', message: 'Another build is running — try again' }
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
  // Queued behind another build — the helper serializes them on one shared
  // project directory and emits `[waiting]` while it holds. Checked after the
  // compile marker because a run that got the lock has moved past this.
  if (/\[waiting\]/.test(log)) return { phase: 'working', message: 'Queued behind another build…' }
  return { phase: 'working', message: 'Working…' }
}

// ── Persistence ───────────────────────────────────────────────────────────────
const KEY = 'design-studio-for-fastled-upload'
interface Persisted { myBoards: string[]; selectedFqbn: string; selectedPort: string; customBoards: Board[]; cardReader: boolean; verboseOutput: boolean }
interface CachedSketchUpload { code: string; fqbnOpt?: string }

function load(): Persisted {
  const fallback: Persisted = { myBoards: BOARDS.map((b) => b.fqbn), selectedFqbn: BOARDS[0].fqbn, selectedPort: '', customBoards: [], cardReader: false, verboseOutput: false }
  try {
    const v = localStorage.getItem(KEY)
    if (!v) return fallback
    const parsed = { ...fallback, ...(JSON.parse(v) as Partial<Persisted>) }
    // A custom board's core must also be selectable, so a stale save (e.g.
    // the board was removed elsewhere) doesn't leave `myBoards` pointing at
    // a core with nothing behind it.
    const customFqbns = new Set(parsed.customBoards.map((b) => b.fqbn))
    parsed.myBoards = parsed.myBoards.filter((f) => BOARDS.some((b) => b.fqbn === f) || customFqbns.has(f))
    return parsed
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

function persistFallback(s: Pick<UploadState, 'myBoards' | 'selectedFqbn' | 'selectedPort' | 'customBoards' | 'cardReader' | 'verboseOutput'>) {
  persistedPrefs = {
    myBoards: s.myBoards, selectedFqbn: s.selectedFqbn, selectedPort: s.selectedPort,
    customBoards: s.customBoards, cardReader: s.cardReader, verboseOutput: s.verboseOutput,
  }
  try { localStorage.setItem(KEY, JSON.stringify(persistedPrefs)) } catch { /* quota */ }
}

/**
 * A pause in the upload while the user physically moves the SD card.
 *
 * `insert` also carries the drive list and needs one chosen; `reinsert` is an
 * acknowledgement, since by then the card is out of the reader and there is
 * nothing left to enumerate.
 */
export interface SdPrompt {
  stage: 'insert' | 'reinsert'
  /** What the copy will write, so the dialog can say so before it happens. */
  fileCount: number
  totalBytes: number
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
  /** User-added boards (custom board-manager URL), merged with the built-in
   *  catalogue by `allBoards()`/`boardByFqbn()`. */
  customBoards: Board[]
  lastSketchByProject: Record<string, CachedSketchUpload>
  // core-update check (arduino-cli engine only)
  checkingUpdates: boolean
  availableUpdates: CoreUpdate[]
  updatesPopupOpen: boolean
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
  /** Board profile id whose pinout view is open, or null. Holds the id rather
   *  than a boolean so the view survives a board change underneath it. */
  pinoutProfileId: string | null
  setupWizardOpen: boolean
  deployPopupOpen: boolean
  cliPopupOpen: boolean
  consoleOpen: boolean
  codeViewOpen: boolean
  /** LED output whose node-local Setup/Upload button opened the overlay. */
  activeOutputNodeId: string | null

  // helper / hardware
  refreshHelper: () => Promise<void>
  refreshPorts: () => Promise<void>
  refreshCores: () => Promise<void>
  /** Switch the helper's build engine. `fbuild` manages its own per-board
   *  toolchains; `arduino-cli` additionally supports custom boards-by-URL and
   *  core update checks. Only takes effect when that engine's binary exists. */
  setEngine: (engine: 'fbuild' | 'arduino-cli') => Promise<void>
  // selection
  setMyBoards: (fqbns: string[]) => void
  toggleBoard: (fqbn: string) => void
  setSelectedFqbn: (fqbn: string) => void
  setSelectedPort: (port: string) => void
  // custom boards (add-by-URL)
  addCustomBoard: (input: { label: string; fqbn: string; core: string; boardUrl: string }) => { ok: boolean; error?: string }
  removeCustomBoard: (fqbn: string) => void
  // overlays
  openBoardPopup: () => void
  closeBoardPopup: () => void
  openPinout: (profileId: string) => void
  closePinout: () => void
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
  runShowUpload: (payload: { player: string; files: ShowUploadFile[] }) => Promise<void>

  /** Whether the user has a card reader — persisted, because it describes their
   *  desk rather than this upload. Chooses the card-reader path over serial. */
  cardReader: boolean
  /** Show the toolchain's own chatter in the output console, not just the
   *  build's. Persisted, because whether someone wants compiler warnings is a
   *  standing preference rather than a per-upload one. */
  verboseOutput: boolean
  setCardReader: (on: boolean) => void
  setVerboseOutput: (on: boolean) => void
  /** The open card-swap prompt, or null. Driven by `runShowUpload`. */
  sdPrompt: SdPrompt | null
  /** Answer the open prompt: a drive path to continue, or null to cancel. */
  resolveSdPrompt: (drive: string | null) => void
  exportIno: (code: string, filename?: string) => void
  locate: (path: string) => Promise<{ ok: boolean; error?: string }>
  installCli: () => Promise<void>
  installCore: (core: string) => Promise<void>
  // core updates (arduino-cli engine only)
  checkForUpdates: () => Promise<void>
  closeUpdatesPopup: () => void
  upgradeCores: (cores?: string[]) => Promise<void>
}

// Resolves the open card-swap prompt. Module-level rather than store state
// for the same reason uiStore's dialog resolver is: a function in a Zustand
// store would be compared by identity on every render.
let sdPromptResolver: ((drive: string | null) => void) | null = null

let persistedPrefs = load()
const initialSelection = projectSelection(persistedPrefs)
let serialController: AbortController | null = null

// An error status sticks around until the user notices it, then quietly
// reverts to the normal idle button — otherwise a red "Error" button is
// permanent until the next upload attempt.
const ERROR_RESET_MS = 5000
let errorResetTimer: ReturnType<typeof setTimeout> | null = null

function scheduleErrorReset(set: (partial: Partial<UploadState>) => void, get: () => UploadState) {
  if (errorResetTimer) clearTimeout(errorResetTimer)
  errorResetTimer = setTimeout(() => {
    errorResetTimer = null
    if (get().status.phase === 'error') set({ status: IDLE })
  }, ERROR_RESET_MS)
}

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
  customBoards: persistedPrefs.customBoards,
  cardReader: persistedPrefs.cardReader,
  verboseOutput: persistedPrefs.verboseOutput,
  sdPrompt: null,
  lastSketchByProject: {},
  checkingUpdates: false,
  availableUpdates: [],
  updatesPopupOpen: false,
  busy: false,
  status: IDLE,
  log: '',
  serialLog: '',
  serialConnected: false,
  serialError: '',
  serialBaud: 115200,
  boardPopupOpen: false,
  pinoutProfileId: null,
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

  setEngine: async (engine) => {
    if (get().busy) return
    const res = await requestSetEngine(engine)
    if (res.ok) await get().refreshHelper()
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
  addCustomBoard: ({ label, fqbn, core, boardUrl }) => {
    const l = label.trim(), f = fqbn.trim(), c = core.trim(), u = boardUrl.trim()
    if (!l || !f || !c || !u) return { ok: false, error: 'Label, FQBN, core, and board URL are all required.' }
    if (BOARDS.some((b) => b.fqbn === f) || get().customBoards.some((b) => b.fqbn === f)) {
      return { ok: false, error: `A board with FQBN "${f}" already exists.` }
    }
    const board: Board = { label: l, fqbn: f, core: c, boardUrl: u, thirdParty: true }
    const customBoards = [...get().customBoards, board]
    const myBoards = [...get().myBoards, f]
    set({ customBoards, myBoards })
    persistFallback({ ...get(), customBoards, myBoards })
    return { ok: true }
  },
  removeCustomBoard: (fqbn) => {
    const customBoards = get().customBoards.filter((b) => b.fqbn !== fqbn)
    const myBoards = get().myBoards.filter((f) => f !== fqbn)
    let selectedFqbn = get().selectedFqbn
    if (selectedFqbn === fqbn) selectedFqbn = myBoards[0] ?? ''
    const selectedPort = get().selectedPort
    set({ customBoards, myBoards, selectedFqbn })
    persistFallback({ ...get(), customBoards, myBoards, selectedFqbn, selectedPort })
    saveProjectSelection(selectedFqbn, selectedPort)
  },
  setSelectedPort: (port) => {
    const selectedFqbn = get().selectedFqbn
    set({ selectedPort: port })
    persistFallback({ ...get(), selectedFqbn, selectedPort: port })
    saveProjectSelection(selectedFqbn, port)
  },

  openBoardPopup: () => { set({ boardPopupOpen: true }); get().refreshPorts(); get().refreshCores() },
  closeBoardPopup: () => set({ boardPopupOpen: false }),
  openPinout: (profileId) => set({ pinoutProfileId: profileId }),
  closePinout: () => set({ pinoutProfileId: null }),
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
      // The module's own flash size, when the chosen board profile records one.
      // The FQBN cannot say it: `esp32:esp32:esp32s3` is generic and resolves to
      // the 8MB N8 board id, so a 16MB part built against half its flash.
      const flashMb = selectedBoardFlashMb(rootGraphNodes(useGraphStore.getState()))
      await uploadSketch(code, fqbn, selectedPort, (chunk) => {
        const log = (get().log + chunk).slice(-60000)
        const status = parseStatus(log)
        set({ log, status })
        if (status.phase === 'error') set({ consoleOpen: true })
      }, undefined, flashMb)
      // Settle on a terminal status from the full log.
      const final = parseStatus(get().log)
      set({ status: final.phase === 'uploading' || final.phase === 'working' ? { phase: 'done', message: 'Done' } : final })
      // Pop the output/serial console open whenever an upload finishes, not
      // just on failure, so the result is always visible without an extra click.
      set({ consoleOpen: true })
    } catch (err) {
      get().appendLog(`\n[error] ${err}\n`)
      set({ status: { phase: 'error', message: 'Error — helper offline?' }, consoleOpen: true })
    } finally {
      set({ busy: false })
      if (get().status.phase === 'error') scheduleErrorReset(set, get)
    }
  },

  runLastUpload: async () => {
    const currentProjectId = useProjectStore.getState().currentProjectId
    const cached = currentProjectId ? get().lastSketchByProject[currentProjectId] : undefined
    if (!cached) return
    await get().runUpload(cached.code, cached.fqbnOpt)
  },

  setCardReader: (on) => { set({ cardReader: on }); persistFallback({ ...get(), cardReader: on }) },

  setVerboseOutput: (on) => { set({ verboseOutput: on }); persistFallback({ ...get(), verboseOutput: on }) },

  resolveSdPrompt: (drive) => {
    sdPromptResolver?.(drive)
    sdPromptResolver = null
    set({ sdPrompt: null })
  },

  runShowUpload: async (payload) => {
    const { selectedFqbn, selectedPort, busy, helper, cardReader } = get()
    if (busy) return
    if (!engineReady(helper)) { set({ cliPopupOpen: true }); return }
    if (!selectedPort) { set({ boardPopupOpen: true }); return }
    get().stopSerial()
    useStreamStore.getState().stop()

    const onLog = (chunk: string) => {
      const log = (get().log + chunk).slice(-60000)
      const status = parseStatus(log)
      set({ log, status })
      if (status.phase === 'error') set({ consoleOpen: true })
    }

    /* Pause the upload while the user moves the card. Resolves to the chosen
     * drive, or null if they cancelled.
     *
     * The dialog finds the drives itself, and keeps looking: it is asking the
     * user to plug something in *now*, so a list gathered here would be a
     * snapshot from before they were asked — and empty nearly every time. */
    const askForCard = (stage: 'insert' | 'reinsert') => {
      const totalBytes = payload.files.reduce((n, f) => n + f.data.size, 0)
      set({ sdPrompt: { stage, fileCount: payload.files.length, totalBytes } })
      return new Promise<string | null>((resolve) => { sdPromptResolver = resolve })
    }

    set({
      busy: true,
      consoleOpen: true,
      log: `Uploading show to ${selectedPort} (${selectedFqbn})…\n`,
      status: { phase: 'working', message: 'Uploading…' },
    })
    try {
      // The card-reader path writes the files directly and then flashes the
      // player with nothing to transfer. It is offered rather than chosen for
      // the user because only they know whether a reader is on the desk — and
      // a wrong guess here is minutes of serial transfer, or a dialog asking
      // for hardware that isn't there.
      let viaReader = false
      if (cardReader) {
        // Compile the player before asking for the card.
        //
        // On the serial path the build already happens first, so a player that
        // will not fit costs one compile to discover. Here the flash comes
        // last — after two card swaps — so without this the user does the
        // whole dance and *then* learns the design overflows DRAM. The live
        // capacity meter is no help: it measures the normal sketch, not the
        // player, so a show whose player will not link reads as comfortable.
        //
        // It is close to free on the success path — the real build that
        // follows compiles identical source and hits the engine's cache.
        get().appendLog('\n=== Checking the player fits ===\n')
        try {
          const fit = await compileCheck(payload.player, selectedFqbn)
          if (!fit.ok) {
            get().appendLog(
              fit.overflow
                ? '\n*** The player will not fit on this board — nothing was written or flashed ***\n'
                  + '  Remove patterns from the collection or reduce the matrix size.\n'
                : `\n*** Could not build the player — nothing was written or flashed ***\n${fit.error ?? ''}\n`,
            )
            set({ status: { phase: 'error', message: fit.overflow ? "Won't fit" : 'Build failed' }, consoleOpen: true })
            return
          }
          get().appendLog('  Fits — asking for the card.\n')
        } catch {
          // The helper went away mid-check. Fall through rather than block:
          // the real build is about to run anyway and will report properly.
          get().appendLog('  [warn] could not pre-check the player; continuing.\n')
        }

        const drive = await askForCard('insert')
        if (drive === null) {
          // Cancelling the card swap cancels the upload. Falling through to
          // serial instead would silently do the slow thing they opted out of.
          set({ status: { phase: 'idle', message: '' } })
          get().appendLog('\nCancelled — nothing was written or flashed.\n')
          return
        }
        await copyToSdCard({ drive, files: payload.files }, onLog)
        if (parseStatus(get().log).phase === 'error') {
          set({ status: { phase: 'error', message: 'Card write failed' }, consoleOpen: true })
          return
        }
        // Acknowledgement only — the flash needs the board, not the card, but
        // a player that boots without one has nothing to play.
        await askForCard('reinsert')
        viaReader = true
      }

      await uploadShow(
        {
          fqbn: selectedFqbn,
          port: selectedPort,
          player: payload.player,
          // Already written by hand — the flash is all that is left.
          files: viaReader ? [] : payload.files,
        },
        onLog,
      )
      const final = parseStatus(get().log)
      set({ status: final.phase === 'error' ? final : { phase: 'done', message: 'Done' } })
    } catch (err) {
      get().appendLog(`\n[error] ${err}\n`)
      set({ status: { phase: 'error', message: 'Error — helper offline?' }, consoleOpen: true })
    } finally {
      sdPromptResolver = null
      set({ busy: false, sdPrompt: null })
      if (get().status.phase === 'error') scheduleErrorReset(set, get)
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
      if (get().status.phase === 'error') scheduleErrorReset(set, get)
    }
  },

  installCore: async (core) => {
    if (get().busy) return
    const url = allBoards().find((b) => b.core === core && b.boardUrl)?.boardUrl
    set({ busy: true, consoleOpen: true, log: get().log + `\n=== Installing ${core} ===\n`, status: { phase: 'working', message: `Installing ${core}…` } })
    try {
      await installCore(core, (chunk) => get().appendLog(chunk), undefined, url)
      await get().refreshCores()
      const ok = get().installedCores.includes(core)
      set({ status: ok ? { phase: 'done', message: `${core} installed` } : { phase: 'error', message: 'Core install failed' } })
    } catch (err) {
      get().appendLog(`\n[error] ${err}\n`)
      set({ status: { phase: 'error', message: 'Core install failed' } })
    } finally {
      set({ busy: false })
      if (get().status.phase === 'error') scheduleErrorReset(set, get)
    }
  },

  checkForUpdates: async () => {
    if (get().checkingUpdates || get().busy) return
    set({ checkingUpdates: true })
    try {
      const urls = get().customBoards.map((b) => b.boardUrl).filter((u): u is string => !!u)
      const updates = await checkCoreUpdates(urls)
      set({ availableUpdates: updates, updatesPopupOpen: true })
    } finally {
      set({ checkingUpdates: false })
    }
  },
  closeUpdatesPopup: () => set({ updatesPopupOpen: false }),
  upgradeCores: async (cores) => {
    if (get().busy) return
    const list = cores ?? get().availableUpdates.map((u) => u.core)
    const urls = get().customBoards.map((b) => b.boardUrl).filter((u): u is string => !!u)
    set({
      busy: true, consoleOpen: true, updatesPopupOpen: false,
      log: get().log + `\n=== Updating ${list.length ? list.join(', ') : 'all boards'} ===\n`,
      status: { phase: 'working', message: 'Updating…' },
    })
    try {
      await requestCoreUpgrade(list, urls, (chunk) => get().appendLog(chunk))
      await get().refreshCores()
      const updated = await checkCoreUpdates(urls)
      set({ availableUpdates: updated, status: { phase: 'done', message: 'Update complete' } })
    } catch (err) {
      get().appendLog(`\n[error] ${err}\n`)
      set({ status: { phase: 'error', message: 'Update failed' } })
    } finally {
      set({ busy: false })
      if (get().status.phase === 'error') scheduleErrorReset(set, get)
    }
  },
}))

useProjectStore.subscribe(() => {
  const next = projectSelection(persistedPrefs)
  const current = useUploadStore.getState()
  if (current.selectedFqbn === next.selectedFqbn && current.selectedPort === next.selectedPort) return
  useUploadStore.setState({ selectedFqbn: next.selectedFqbn, selectedPort: next.selectedPort })
})
