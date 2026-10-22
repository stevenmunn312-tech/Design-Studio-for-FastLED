// ── Baked spectrum track ──────────────────────────────────────────────────────
// A song's per-frame FastLED equalizer bins (EqualizerSpectrum: 16 log bins,
// 90–5120 Hz, each adaptively normalised to 0–1), quantised to one byte per bin
// and stored base64 so a song analysis and its show stay small enough to save
// with the project. The firmware reads the same bytes from the AENV trailer.

import { EQ_NUM_BINS } from './fastledReactive'

/** Bins per frame: the device equalizer's, so baked and live spectra match. */
export const SPECTRUM_TRACK_BINS = EQ_NUM_BINS

export interface SpectrumTrack {
  rateHz: number
  /** Base64 of frameCount × SPECTRUM_TRACK_BINS bytes, 0–255 per bin. */
  data: string
}

const CHUNK = 0x8000

export function encodeSpectrumBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** The bytes a base64 track holds; the detector tracks share this decoder. */
export function decodeBase64Bytes(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const decoded = new WeakMap<object, Uint8Array>()

/** Decode `owner`'s base64 spectrum once and cache it on `owner`, because the
 *  preview samples a show's spectrum every frame. */
export function spectrumBytes(owner: object, data: string): Uint8Array {
  const cached = decoded.get(owner)
  if (cached) return cached
  const bytes = decodeBase64Bytes(data)
  decoded.set(owner, bytes)
  return bytes
}
