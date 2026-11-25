// The LED output frame the preview evaluated last, for the one reader that
// needs every frame without owning an evaluation of its own: the first-launch
// showcase, which shows the running show as bare lights over the workspace.
//
// The preview writes it once per evaluated frame. It holds LED values, after
// the output's Gamma and before the Board's master brightness. It is a
// reference to the preview's own frame, never a copy, so a reader draws it
// and keeps nothing.
//
// Not the preview store: that publishes for node thumbnails at a slower
// cadence, and a subscription per frame would re-render what only needs to be
// drawn.
//
// While the preview worker evaluates, the frame arrives packed, and nothing
// but the showcase reads it, so the preview hands over how to unpack it
// (`tapTerminalFrameLazily`) and the work happens only when it is read.
import type { Frame } from '../../state/palettes/ledColor'

let value: Frame | null = null
let pending: (() => Frame | null) | null = null

export const terminalFrameTap: { frame: Frame | null } = {
  get frame() {
    if (pending) {
      value = pending()
      pending = null
    }
    return value
  },
  set frame(frame: Frame | null) {
    pending = null
    value = frame
  },
}

/** Set the frame to what `read` returns, read only if someone asks. */
export function tapTerminalFrameLazily(read: () => Frame | null): void {
  pending = read
}
