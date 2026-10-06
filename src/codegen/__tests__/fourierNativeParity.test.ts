/**
 * The generated Fourier Epicycles block, compiled natively against a small
 * stand-in for FastLED's CRGB, must draw what the preview draws. It holds the
 * whole emitted sequence — table, pen sum, guide circles, trail fade and
 * substeps, pen head — to the preview, frame after frame, where a text test
 * can only check that each piece was emitted.
 *
 * With glibc's sinf and cosf the frames match byte for byte. Another maths
 * library may round a trig result differently, so a handful of pixels may
 * differ; the bound is 1% of the canvas. Skipped where no host `g++` exists.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generateCpp } from '../cppGenerator'
import { FOURIER_HELPER_CPP } from '../helpers/fourierHelperCpp'
import { evalFourierEpicycles } from '../../nodes/shapes/evaluate'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import type { Frame } from '../../state/palettes/ledColor'

const HAS_GPP = spawnSync('g++', ['--version']).status === 0

function node(id: string, nodeType: string, properties: Record<string, unknown>): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as unknown as StudioNode
}

const FASTLED_STAND_IN = `#include <cstdio>
#include <cmath>
#include <cstdint>
#include <algorithm>
using std::min; using std::max;
#define PROGMEM
#define pgm_read_float(p) (*(const float*)(p))
#define constrain(a,l,h) ((a)<(l)?(l):((a)>(h)?(h):(a)))
struct CRGB {
  uint8_t r=0,g=0,b=0;
  CRGB() {}
  CRGB(uint8_t R,uint8_t G,uint8_t B):r(R),g(G),b(B) {}
  CRGB& operator+=(const CRGB& o) { r=std::min(255,r+o.r); g=std::min(255,g+o.g); b=std::min(255,b+o.b); return *this; }
  static const CRGB Black;
};
const CRGB CRGB::Black(0,0,0);
static void fill_solid(CRGB* b,int n,CRGB c) { for(int i=0;i<n;i++) b[i]=c; }`

describe.skipIf(!HAS_GPP)('Fourier Epicycles native parity', () => {
  it.each([
    ['heart', 16, 240, 0.2, 32, true, true],
    ['star', 32, 300, 0.35, 12.5, true, false],
    ['infinity', 24, 120, -0.6, 32, false, true],
  ] as const)('draws %s on %i×%i like the preview after %i frames', (outline, size, frames, speed, harmonics, showCircles, showPen) => {
    const properties = { outline, maxHarmonics: 32, harmonics, speed, showCircles, showPen }
    const sketch = generateCpp(
      [node('fe', 'FourierEpicycles', properties), node('out', 'MatrixOutput', { form: 'matrix', width: size, height: size, dataPin: 5 })],
      [{ id: 'e', source: 'fe', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' } as unknown as StudioEdge],
    )
    const lines = sketch.split('\n')
    const start = lines.findIndex((line) => line.startsWith('  { /* Fourier Epicycles'))
    const end = lines.indexOf('  }', start)
    expect(start).toBeGreaterThanOrEqual(0)

    const dir = mkdtempSync(path.join(tmpdir(), 'fourier-parity-'))
    try {
      const source = path.join(dir, 'fourier.cpp'), binary = path.join(dir, 'fourier')
      writeFileSync(source, [
        FASTLED_STAND_IN,
        `#define WIDTH ${size}`, `#define HEIGHT ${size}`, '#define NUM_LEDS (WIDTH*HEIGHT)',
        FOURIER_HELPER_CPP,
        'static CRGB buf_fe[NUM_LEDS];',
        'static void frame(float t) {', ...lines.slice(start, end + 1), '}',
        `int main() { for(int i=0;i<${frames};i++) frame(i/60.0f);`,
        '  for(int i=0;i<NUM_LEDS;i++) printf("%d %d %d\\n",buf_fe[i].r,buf_fe[i].g,buf_fe[i].b); }',
      ].join('\n'))
      execFileSync('g++', ['-O2', '-o', binary, source])
      const native = execFileSync(binary, { encoding: 'utf8' }).trim().split('\n').map((line) => line.split(' ').map(Number))

      let preview: Frame = []
      for (let i = 0; i < frames; i++) {
        preview = evalFourierEpicycles(`native-${outline}`, null, {
          outline, customPoints: '', maxHarmonics: 32, harmonics, speed, scale: 0.8, thickness: 1.25,
          persistence: 0.995, color: { r: 255, g: 220, b: 80 }, showCircles, showPen,
        }, Math.fround(i / 60), size, size)
      }
      const differing = native.filter(([r, g, b], i) => {
        const px = preview[Math.floor(i / size)][i % size]
        return px.r !== r || px.g !== g || px.b !== b
      }).length
      expect(native.filter(([r]) => r > 0).length).toBeGreaterThan(size)
      expect(differing).toBeLessThanOrEqual(Math.floor(size * size * 0.01))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
