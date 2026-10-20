// ── Song analysis worker ──────────────────────────────────────────────────────
// Runs the FastLED-based whole-song analysis (fastledSongAnalysis) off the main
// thread so "Analyse All" does not freeze the UI. The main thread decodes the
// file to mono PCM (decodeAudioData is main-thread only) and transfers it here.

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import type { SongAnalysisCore } from '../types/showFile'
import { analyzeSongSamples } from './fastledSongAnalysis'

export interface AnalyzeRequest {
  id:         number
  mono:       Float32Array
  sampleRate: number
  durationMs: number
  title:      string
}
export type AnalyzeResponse =
  | { id: number; ok: true;  analysis: SongAnalysisCore }
  | { id: number; ok: false; error: string }

self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  const { id, mono, sampleRate, durationMs, title } = e.data
  try {
    const analysis = analyzeSongSamples(mono, sampleRate, durationMs, title)
    self.postMessage({ id, ok: true, analysis } satisfies AnalyzeResponse)
  } catch (err) {
    const error = err instanceof Error ? err.stack || err.message : String(err)
    self.postMessage({ id, ok: false, error } satisfies AnalyzeResponse)
  }
}
