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
      'Debug helps you test one hardware part on your own bench. Wire the part’s Debug socket to it, or choose Debug this part on the part in the Hardware view. The node then lists what Checks already know about the part, the usual causes of trouble, and how to isolate it.',
      'Measure lists low-voltage meter checks with what to expect. Type in your readings or answer Yes or No, and the verdict names the likely fault, with a one-click fix where the fix is a setting. Test on the board uploads a short test sketch that drives only this part and reports back live, then offers to put your project back.',
      'It is a workshop tool, not part of the design. Its wire carries no signal, so the preview and the firmware are the same with or without it, and it is never saved. It never asks you to measure mains or open a power supply.',
    ],
    steps: [
      'Add a Debug node from Tools. Parts with checks show a Debug socket on their bottom edge while it is on the canvas.',
      'Wire one part’s Debug socket into Part.',
      'Isolate the part as the checklist says, then work through Measure, or run the test sketch from Test on the board.',
    ],
    inputs: {
      part: 'The one part under test, from its Debug socket. Test parts one at a time: a single Debug node takes a single part.',
    },
    outcome: 'Nothing changes on the LEDs. Debug reports on the part it is wired to and leaves the project as it was.',
    example: example({
      featured: 'Debug',
      title: 'Check a knob that does nothing',
      nodes: {
        knob: ['PotInput', { pin: 34 }],
        debug: ['Debug'],
        pattern: ['Juggle'],
      },
      wires: ['knob.debug > debug.part'],
      explanation: 'The Potentiometer’s Debug socket feeds the Debug node, which lists the pot’s wiring checks and its test sketch. Juggle runs on, untouched: Debug adds nothing to the preview or the sketch, and is dropped when the project is saved.',
      preview: 'The {output} shows Juggle unchanged.',
      workflow: true,
    }),
  },
}
