// ── Essentia.js song analyzer (main-thread client) ────────────────────────────
// Offline song analysis using Essentia.js — a WebAssembly build of the Essentia
// C++ MIR library. Provides validated BPM/beat tracking (RhythmExtractor2013),
// real key detection (KeyExtractor), and danceability-aware mood estimation.
//
// The heavy Essentia passes run in `essentiaAnalyzer.worker.ts` so the UI stays
// responsive during "Analyse All". This module only decodes the file to mono
// PCM on the main thread (Web Audio's decodeAudioData is main-thread only),
// transfers the samples to the worker, and awaits the finished analysis. A
// single worker is lazily created and reused across songs; requests are matched
// to responses by an incrementing id.

import type { SongAnalysis } from '../types/showFile'
import { decodeToMono } from './songAnalysisCommon'
import { analyzeDecodedSong, formatWorkerError } from './essentiaCore'
import type { AnalyzeRequest, AnalyzeResponse } from './essentiaAnalyzer.worker'
import { recordPerfTask } from '../dev/perfMonitor'

const SAMPLE_RATE = 44100
const WORKER_RETRY_LIMIT = 1

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (a: SongAnalysis) => void; reject: (e: Error) => void }>()
let idleTimer: ReturnType<typeof setTimeout> | null = null

function workerEventMessage(e: ErrorEvent): string {
  const parts = [
    e.message || 'essentia worker error',
    e.filename ? `at ${e.filename}` : '',
    e.lineno ? `:${e.lineno}` : '',
    e.colno ? `:${e.colno}` : '',
  ].filter(Boolean)
  return parts.join('')
}

// Essentia's Emscripten heap grows to the analysis high-water mark and cannot
// shrink. Keeping the worker forever therefore pins hundreds of megabytes (or
// more for long tracks) in Chrome after analysis has finished. A short idle
// grace period lets Analyse All reuse one worker for consecutive songs, then
// releases the entire WASM heap once the batch is done.
function scheduleIdleShutdown() {
  if (pending.size > 0 || !worker) return
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (pending.size > 0) return
    worker?.terminate()
    worker = null
    idleTimer = null
  }, 5_000)
}

function disposeWorker() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  worker?.terminate()
  worker = null
}

function getWorker(): Worker | null {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  if (!worker) {
    try {
      worker = new Worker(new URL('./essentiaAnalyzer.worker.ts', import.meta.url), { type: 'module', name: 'essentia-analyzer' })
    } catch (err) {
      console.warn('Essentia worker could not be created; falling back to main-thread analysis.', err)
      return null
    }
    worker.onmessage = (e: MessageEvent<AnalyzeResponse>) => {
      const msg = e.data
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      if (msg.ok) p.resolve(msg.analysis)
      else p.reject(new Error(msg.error))
      scheduleIdleShutdown()
    }
    worker.onerror = (e) => {
      // A worker-level failure (e.g. WASM init) can't be tied to one request, so
      // fail every in-flight analysis and reset for a fresh worker next time.
      const err = new Error(workerEventMessage(e))
      console.error('Essentia worker crashed', e)
      for (const p of pending.values()) p.reject(err)
      pending.clear()
      disposeWorker()
    }
    worker.onmessageerror = (e) => {
      const err = new Error(`essentia worker message error: ${formatWorkerError(e)}`)
      console.error('Essentia worker message error', e)
      for (const p of pending.values()) p.reject(err)
      pending.clear()
      disposeWorker()
    }
  }
  return worker
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeWorker()
  })
}

async function analyzeViaWorker(
  mono: Float32Array,
  sampleRate: number,
  durationMs: number,
  title: string,
  retriesLeft = WORKER_RETRY_LIMIT,
): Promise<SongAnalysis> {
  const w = getWorker()
  if (!w) {
    if (retriesLeft > 0) {
      disposeWorker()
      return analyzeViaWorker(mono, sampleRate, durationMs, title, retriesLeft - 1)
    }
    throw new Error('essentia worker unavailable')
  }
  const id = nextId++

  return new Promise<SongAnalysis>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const workerMono = mono.slice()
    const req: AnalyzeRequest = { id, mono: workerMono, sampleRate, durationMs, title }
    w.postMessage(req, [workerMono.buffer])
  }).catch((err) => {
    if (retriesLeft <= 0) throw err
    disposeWorker()
    return analyzeViaWorker(mono, sampleRate, durationMs, title, retriesLeft - 1)
  })
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function analyzeSong(file: File, onProgress?: (p: number) => void): Promise<SongAnalysis> {
  const decodeStart = performance.now()
  const { mono, sampleRate, durationMs } = await decodeToMono(file, SAMPLE_RATE)
  recordPerfTask('musicDecode', performance.now() - decodeStart)
  // Decode is the only main-thread stage we can measure; the WASM passes run in
  // the worker as one opaque call, so progress jumps to "done" when it resolves.
  onProgress?.(0.3)
  const title = file.name.replace(/\.[^/.]+$/, '')
  try {
    const analyzeStart = performance.now()
    const analysis = await analyzeViaWorker(mono, sampleRate, durationMs, title)
    recordPerfTask('musicAnalyze', performance.now() - analyzeStart, { mode: 'worker' })
    return analysis
  } catch (err) {
    const message = formatWorkerError(err)
    console.warn(`Essentia worker failed; retrying on the main thread. ${message}`)
    onProgress?.(0.45)
    const analyzeStart = performance.now()
    const analysis = await analyzeDecodedSong(mono, sampleRate, durationMs, title)
    recordPerfTask('musicAnalyze', performance.now() - analyzeStart, { mode: 'main-thread' })
    return analysis
  }
}
