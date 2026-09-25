import { describe, expect, it } from 'vitest'
import { shouldExpandPreviewAudioTools, type PreviewAudioChromeContext } from '../previewChrome'

const idle: PreviewAudioChromeContext = {
  stageMode: false,
  performanceMode: false,
  showMode: false,
  audioVisualizerLive: false,
  hasVu: false,
  hasPlaylist: false,
  hasAudioError: false,
}

describe('preview audio chrome', () => {
  it('stays compact when no audio or performance task is active', () => {
    expect(shouldExpandPreviewAudioTools(idle)).toBe(false)
  })

  it.each([
    'stageMode',
    'performanceMode',
    'showMode',
    'audioVisualizerLive',
    'hasVu',
    'hasPlaylist',
    'hasAudioError',
  ] as const)('expands when %s needs the controls', (key) => {
    expect(shouldExpandPreviewAudioTools({ ...idle, [key]: true })).toBe(true)
  })
})
