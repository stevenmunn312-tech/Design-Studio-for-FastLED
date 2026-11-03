export interface PreviewAudioChromeContext {
  stageMode: boolean
  showMode: boolean
  audioVisualizerLive: boolean
  hasVu: boolean
  hasPlaylist: boolean
  hasAudioError: boolean
}

/** Keep the idle preview quiet until audio or show controls have work
 * to do. A single Add Track action remains available in the compact state. */
export function shouldExpandPreviewAudioTools(context: PreviewAudioChromeContext): boolean {
  return context.stageMode
    || context.showMode
    || context.audioVisualizerLive
    || context.hasVu
    || context.hasPlaylist
    || context.hasAudioError
}
