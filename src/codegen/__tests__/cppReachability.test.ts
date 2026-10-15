import { describe, expect, it } from 'vitest'
import { cppCode, cppUnits, pruneCpp, unreachableCppUnits } from '../cppReachability'
import { specializeCpp, specializeSwitch } from '../cppSpecialize'
import { finishCpp } from '../cppCleanup'

describe('generated C++ reachability', () => {
  it('keeps transitive calls, address-taken callbacks, types and array bounds', () => {
    const source = `#define COUNT 4
struct Value { int x; };
Value values[COUNT];
int leaf() { return values[0].x; }
void callback() { leaf(); }
int dead() { return 42; }
void setup() { attach(callback); }
void loop() {}`
    const result = pruneCpp(source)
    expect(result).toContain('int leaf()')
    expect(result).toContain('Value values[COUNT]')
    expect(result).toContain('#define COUNT 4')
    expect(result).not.toContain('int dead()')
    expect(unreachableCppUnits(result)).toEqual([])
  })
  it('splits functions with default arguments from their neighbours', () => {
    const source = `float wave(float bpm, float lo = 0, float hi = 255){ return lo + hi * bpm; }
float scale(float v, float s){ return v * s; }
float level(int n) noexcept { return n; }
const int table[2] = { 1, 2 };
void setup() { scale(1, table[0]); }
void loop() {}`
    const result = pruneCpp(source)
    expect(result).not.toContain('float wave(')
    expect(result).not.toContain('float level(')
    expect(result).toContain('float scale(')
    expect(result).toContain('const int table[2]')
  })
  it('drops unread locals and the pure helpers that only fed them', () => {
    const source = `static float axis(int raw) { float v = raw / 4095.0f; return v * 2.0f; }
static int counter = 0;
static int bump() { return ++counter; }
void setup() {}
void loop() {
  float unread = axis(analogRead(33));
  int effect = bump();
  float a = 1.0f, b = 2.0f;
  leds(b);
}`
    const result = finishCpp(source)
    expect(result).not.toContain('analogRead')
    expect(result).not.toContain('axis')
    // A call with effects still runs.
    expect(result).toContain('(void)(bump());')
    expect(result).toContain('float b = 2.0f;')
    expect(result).not.toContain('float a')
  })
  it('does not treat comments or strings as references', () => {
    const source = 'int unused; // unused\nvoid setup() { print("unused // { }"); }\nvoid loop() {}'
    expect(pruneCpp(source)).not.toContain('int unused;')
    expect(pruneCpp(source)).toContain('print("unused // { }")')
    expect(cppCode('R"tag({"quoted"})tag"')).not.toContain('quoted')
  })
  it('preserves library callbacks, configuration and initializer effects', () => {
    const source = `#define DECODE_NEC
int initialized = registerDevice();
Audio audio(true);
void audio_process_i2s() { process(); }
void setup() {}
void loop() {}`
    expect(pruneCpp(source)).toBe(source)
  })
  it('keeps overloads, prototypes, member definitions and multi-declarators together', () => {
    const source = `struct Device { void read(); };
void Device::read() { worker(); }
void worker();
void worker() {}
int first = 0, second = 1;
void setup() { Device d; d.read(); print(second); }
void loop() {}`
    expect(pruneCpp(source)).toBe(source)
    expect(cppUnits(source).find((unit) => unit.names.includes('first'))?.names).toEqual(['first', 'second'])
  })
})

describe('generation facts', () => {
  it('selects known board branches while preserving unknown library versions', () => {
    const source = `#if defined(ESP32)
#define AVAILABLE 1
#if LIB_VERSION >= 3
modern();
#else
legacy();
#endif
#elif defined(ESP8266)
wrongBoard();
#endif
#if AVAILABLE
network();
#endif`
    const result = specializeCpp(source, { ESP32: true, ESP8266: false })
    expect(result).not.toContain('wrongBoard')
    expect(result).not.toContain('defined(ESP32)')
    expect(result).toContain('#if LIB_VERSION >= 3')
    expect(result).toContain('network();')
    expect(result).not.toContain('#if AVAILABLE')
  })
  it('does not promote a macro from an unknown conditional branch', () => {
    expect(specializeCpp('#if UNKNOWN\n#define MAYBE 1\n#endif\n#if MAYBE\nkeep();\n#endif')).toContain('#if MAYBE')
  })
  it('specializes a switch without changing nested loop breaks', () => {
    const result = specializeSwitch('switch(style) { case 1: { for (;;) { break; } draw(); break; } default: other(); break; }', 'style', 1)
    expect(result).toContain('for (;;) { break; }')
    expect(result).toContain('draw();')
    expect(result).not.toContain('other()')
    expect(result).not.toContain('switch')
  })
})
