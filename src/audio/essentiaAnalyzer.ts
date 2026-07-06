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
import type { AnalyzeRequest, AnalyzeResponse } from './essentiaAnalyzer.worker'

const SAMPLE_RATE = 44100

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (a: SongAnalysis) => void; reject: (e: Error) => void }>()
let idleTimer: ReturnType<typeof setTimeout> | null = null

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

function getWorker(): Worker {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  if (!worker) {
    worker = new Worker(new URL('./essentiaAnalyzer.worker.ts', import.meta.url), { type: 'module' })
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
      const err = new Error(e.message || 'essentia worker error')
      for (const p of pending.values()) p.reject(err)
      pending.clear()
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = null
      worker?.terminate()
      worker = null
    }
  }
  return worker
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (idleTimer) clearTimeout(idleTimer)
    worker?.terminate()
    worker = null
    idleTimer = null
  })
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function analyzeSong(file: File, onProgress?: (p: number) => void): Promise<SongAnalysis> {
  const { mono, sampleRate, durationMs } = await decodeToMono(file, SAMPLE_RATE)
  // Decode is the only main-thread stage we can measure; the WASM passes run in
  // the worker as one opaque call, so progress jumps to "done" when it resolves.
  onProgress?.(0.3)
  const title = file.name.replace(/\.[^/.]+$/, '')
  const w = getWorker()
  const id = nextId++

  return new Promise<SongAnalysis>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const req: AnalyzeRequest = { id, mono, sampleRate, durationMs, title }
    // Transfer the PCM buffer (zero-copy); `mono` is not used again here.
    w.postMessage(req, [mono.buffer])
  })
}
