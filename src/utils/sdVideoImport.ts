// Turns a video file into the raw-frame clip the SD Video node plays.
//
// The browser does the decoding: an <video> element seeks to the middle of each
// output frame's slot and the picture is drawn, cover-fitted, onto a canvas the
// size of the LED canvas. Nothing here needs an encoder, which is why the
// sketch can play the result with plain file reads.

import {
  encodeSdv, SDV_MAX_FPS, SDV_MAX_SECONDS, SDV_MAX_SIDE, sdvFrameBytes,
} from '../state/evaluator/sdVideo'

export interface ImportedClip {
  bytes: Uint8Array
  w: number
  h: number
  fps: number
  frames: number
  truncated: boolean
}

/** Where a source picture lands on the LED canvas so that it fills it, centred
 *  and cropped, never stretched. */
export function coverRect(srcW: number, srcH: number, dstW: number, dstH: number) {
  const scale = Math.max(dstW / srcW, dstH / srcH)
  const w = srcW * scale, h = srcH * scale
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h }
}

/** How many frames a clip of `seconds` has at `fps`, and whether the import
 *  limit cut it short. */
export function clipFrameCount(seconds: number, fps: number): { frames: number; truncated: boolean } {
  const wanted = Math.max(1, Math.floor(seconds * fps))
  const most = SDV_MAX_SECONDS * fps
  return { frames: Math.min(wanted, most), truncated: wanted > most }
}

function waitFor(target: HTMLVideoElement, event: string, ms = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('The video stopped responding while decoding')) }, ms)
    const done = () => { cleanup(); resolve() }
    const fail = () => { cleanup(); reject(new Error('This browser could not decode that video')) }
    const cleanup = () => {
      clearTimeout(timer)
      target.removeEventListener(event, done)
      target.removeEventListener('error', fail)
    }
    target.addEventListener(event, done, { once: true })
    target.addEventListener('error', fail, { once: true })
  })
}

export async function decodeVideoToClip(
  file: File,
  size: { w: number; h: number },
  fps: number,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportedClip> {
  const w = Math.max(1, Math.min(SDV_MAX_SIDE, Math.round(size.w)))
  const h = Math.max(1, Math.min(SDV_MAX_SIDE, Math.round(size.h)))
  const rate = Math.max(1, Math.min(SDV_MAX_FPS, Math.round(fps)))
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'auto'
  video.src = url
  try {
    await waitFor(video, 'loadedmetadata')
    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
      throw new Error('That video has no picture or no length')
    }
    const { frames, truncated } = clipFrameCount(video.duration, rate)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Could not read video frames')
    const fit = coverRect(video.videoWidth, video.videoHeight, w, h)
    const frameBytes = sdvFrameBytes(w, h)
    const data = new Uint8Array(frameBytes * frames)
    for (let i = 0; i < frames; i++) {
      video.currentTime = Math.min(video.duration, (i + 0.5) / rate)
      await waitFor(video, 'seeked')
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(video, fit.x, fit.y, fit.w, fit.h)
      const rgba = ctx.getImageData(0, 0, w, h).data
      const base = i * frameBytes
      for (let p = 0; p < w * h; p++) {
        data[base + p * 3] = rgba[p * 4]
        data[base + p * 3 + 1] = rgba[p * 4 + 1]
        data[base + p * 3 + 2] = rgba[p * 4 + 2]
      }
      onProgress?.(i + 1, frames)
    }
    return { bytes: encodeSdv(w, h, rate, frames, data), w, h, fps: rate, frames, truncated }
  } finally {
    URL.revokeObjectURL(url)
    video.removeAttribute('src')
    video.load()
  }
}
