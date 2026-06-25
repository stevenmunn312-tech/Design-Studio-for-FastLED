// ── Essentia.js song analyzer (main-thread client) ────────────────────────────
// A drop-in alternative to the built-in DSP analyzer (`musicAnalyzer.ts`),
// producing the same `SongAnalysis` shape but using Essentia.js — a WebAssembly
// build of the Essentia C++ MIR library — for materially better results on the
// pre-planned export path: validated BPM/beat tracking (RhythmExtractor2013),
// real key detection (KeyExtractor), and danceability-aware mood.
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

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./essentiaAnalyzer.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<AnalyzeResponse>) => {
      const msg = e.data
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      if (msg.ok) p.resolve(msg.analysis)
      else p.reject(new Error(msg.error))
    }
    worker.onerror = (e) => {
      // A worker-level failure (e.g. WASM init) can't be tied to one request, so
      // fail every in-flight analysis and reset for a fresh worker next time.
      const err = new Error(e.message || 'essentia worker error')
      for (const p of pending.values()) p.reject(err)
      pending.clear()
      worker?.terminate()
      worker = null
    }
  }
  return worker
}

// ── Public API (mirrors musicAnalyzer.analyzeSong) ────────────────────────────
export async function analyzeSong(file: File): Promise<SongAnalysis> {
  const { mono, sampleRate, durationMs } = await decodeToMono(file, SAMPLE_RATE)
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
