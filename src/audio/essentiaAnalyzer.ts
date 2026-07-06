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

const SAMPLE_RATE = 44100

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (a: SongAnalysis) => void; reject: (e: Error) => void }>()
let idleTimer: ReturnType<typeof setTimeout> | null = null
let workerBroken = false

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
  if (workerBroken) return null
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  if (!worker) {
    try {
      worker = new Worker(new URL('./essentiaAnalyzer.worker.ts', import.meta.url), { type: 'module', name: 'essentia-analyzer' })
    } catch (err) {
      workerBroken = true
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
      workerBroken = true
      disposeWorker()
    }
    worker.onmessageerror = (e) => {
      const err = new Error(`essentia worker message error: ${formatWorkerError(e)}`)
      console.error('Essentia worker message error', e)
      for (const p of pending.values()) p.reject(err)
      pending.clear()
      workerBroken = true
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
): Promise<SongAnalysis> {
  const w = getWorker()
  if (!w) throw new Error('essentia worker unavailable')
  const id = nextId++

  return new Promise<SongAnalysis>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const req: AnalyzeRequest = { id, mono, sampleRate, durationMs, title }
    w.postMessage(req, [mono.buffer])
  })
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function analyzeSong(file: File, onProgress?: (p: number) => void): Promise<SongAnalysis> {
  const { mono, sampleRate, durationMs } = await decodeToMono(file, SAMPLE_RATE)
  // Decode is the only main-thread stage we can measure; the WASM passes run in
  // the worker as one opaque call, so progress jumps to "done" when it resolves.
  onProgress?.(0.3)
  const title = file.name.replace(/\.[^/.]+$/, '')
  try {
    return await analyzeViaWorker(mono, sampleRate, durationMs, title)
  } catch (err) {
    const message = formatWorkerError(err)
    console.warn(`Essentia worker failed; retrying on the main thread. ${message}`)
    onProgress?.(0.45)
    return analyzeDecodedSong(mono, sampleRate, durationMs, title)
  }
}
