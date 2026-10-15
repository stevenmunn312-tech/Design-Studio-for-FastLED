import { example } from './example'
import type { NodeReferenceMap } from './types'

export const NOTE_REFERENCE: NodeReferenceMap = {
  Comment: {
    overview: [
      'Comment is a sticky note for the canvas. Write what a part of the patch does, why a value is what it is, or what to try next.',
      'It has no sockets and is never evaluated or exported, so notes cost nothing on the board. Colour notes to group them — one colour for audio, another for controls.',
    ],
    example: example({
      featured: 'Comment',
      title: 'Leave a note for your future self',
      nodes: {
        note: ['Comment', { text: 'Bass drives the swell; keep Smoothing above 0.6 or it twitches.', color: '#7cf3ff' }],
        pattern: ['Pacifica', { palette: 'ocean' }],
      },
      explanation: 'The Comment sits beside a running Pacifica with no wires. It records a design decision for whoever opens the project next, and stays outside the preview and the firmware.',
      preview: 'The {output} shows Pacifica unchanged. Editing, moving or deleting the Comment does not alter it.',
    }),
  },
}
