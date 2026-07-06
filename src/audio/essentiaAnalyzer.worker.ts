// ── Essentia.js analysis worker ───────────────────────────────────────────────
// Runs the CPU-heavy Essentia.js MIR passes (RhythmExtractor2013 'multifeature'
// beat tracking, per-band energy FFT loop, key + danceability) off the main
// thread so "Analyse All" doesn't freeze the UI. The main thread decodes the
// file to mono PCM (Web Audio's decodeAudioData is main-thread only) and
// transfers the samples here; this worker returns a finished `SongAnalysis`.
//
// Essentia is imported lazily so its multi-MB WASM stays in its own code-split
// chunk and the WASM backend is initialised once, then reused across songs.

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import type { SongAnalysis } from '../types/showFile'
import { analyzeDecodedSong, formatWorkerError } from './essentiaCore'

// ── Worker message protocol ────────────────────────────────────────────────────
export interface AnalyzeRequest {
  id:         number
  mono:       Float32Array
  sampleRate: number
  durationMs: number
  title:      string
}
export type AnalyzeResponse =
  | { id: number; ok: true;  analysis: SongAnalysis }
  | { id: number; ok: false; error: string }

self.onmessage = async (e: MessageEvent<AnalyzeRequest>) => {
  const { id, mono, sampleRate, durationMs, title } = e.data
  try {
    const analysis = await analyzeDecodedSong(mono, sampleRate, durationMs, title)
    self.postMessage({ id, ok: true, analysis } satisfies AnalyzeResponse)
  } catch (err) {
    self.postMessage({ id, ok: false, error: formatWorkerError(err) } satisfies AnalyzeResponse)
  }
}
