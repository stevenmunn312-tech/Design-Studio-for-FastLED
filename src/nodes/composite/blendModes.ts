// The blend modes the Blend and Frame Feedback nodes offer, one list each for
// the select, the preview and the sketch. Every mode runs through the shared
// byte kernel (`blendMix8` in shared/integerPatterns.ts), `normal` included.
import { BLEND_MODES } from '../shared/integerPatterns'

/** Blend's modes: normal replaces, then each mode the kernel knows. */
export const BLEND_NODE_MODES: readonly string[] = ['normal', ...BLEND_MODES]

/** Frame Feedback's modes; anything else blends as screen. */
export const FEEDBACK_BLEND_MODES: readonly string[] = ['normal', 'screen', 'add', 'multiply', 'difference', 'lighten']
