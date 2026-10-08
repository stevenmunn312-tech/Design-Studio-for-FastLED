/** Generate the normal-sketch gate for the DFPlayer Mini. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

const source = generateCpp([
  node('button', 'ButtonInput', { pin: 4 }),
  node('player', 'DFPlayerOutput', {
    partId: 'dfplayer-mini', uartRxPin: 16, uartTxPin: 17, busyPin: 27, track: 1, volume: 0.7,
  }),
  node('color', 'SolidColor', { r: 20, g: 40, b: 90 }),
  node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
], [
  edge('play', 'button', 'pressed', 'player', 'play'),
  edge('frame', 'color', 'frame', 'out', 'frame'),
])

for (const expected of [
  '_dfSerial_player.begin(9600, SERIAL_8N1, 16, 17);',
  '_dfSend(_dfSerial_player, 0x09, 2);',
  '_dfSend(_dfSerial_player, 0x12, _dfTrack_player);',
  'digitalRead(27) == LOW',
  'bool n_player_playing = _dfReady_player && digitalRead(27) == LOW;',
]) {
  if (!source.includes(expected)) throw new Error(`dfplayer: missing ${expected}`)
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/dfplayer-fixtures')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'dfplayer.ino'), source, 'utf8')
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify({
  dfplayer: {
    bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
  },
}, null, 2)}\n`, 'utf8')
console.log(`wrote DFPlayer compile fixture to ${outputDir}`)
