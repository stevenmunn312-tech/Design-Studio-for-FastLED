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
  Debug: {
    overview: [
      'Debug helps you test one hardware part on your own bench. Wire a part’s Debug output to it, and it gathers what is known about that part in your project, the usual causes of trouble, and the checks that tell them apart.',
      'It is a workshop tool, not part of the design. Its wire carries no signal, so the preview and the firmware are the same with or without it, and it is never saved: close the project and it is gone.',
      'Its meter steps stay on the low-voltage side of your build. It never asks you to measure mains or open a power supply.',
    ],
    inputs: {
      part: 'The one part under test. Test parts one at a time: a single Debug node takes a single part.',
    },
    outcome: 'Nothing changes on the LEDs. Debug reports on the part it is wired to and leaves the project as it was.',
    example: example({
      featured: 'Debug',
      title: 'Keep a test bench beside the design',
      nodes: {
        debug: ['Debug'],
        pattern: ['Juggle'],
      },
      explanation: 'The Debug node sits beside a running Juggle. It adds nothing to the preview or the sketch, and it is dropped when the project is saved.',
      preview: 'The {output} shows Juggle unchanged.',
      workflow: true,
    }),
  },
}
