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
  it('removes every qualifier with an unread declaration', () => {
    const source = `static volatile uint32_t _frames = 0;
static int kept = 0;
void setup() {}
void loop() { leds(kept); }`
    const result = finishCpp(source)
    expect(result).not.toContain('volatile')
    expect(result).toContain('static int kept = 0;')
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
  it('folds a literal every call passes when it decides a branch', () => {
    const source = `static float fold(float x, uint8_t mode, int scale) {
  switch (mode) {
    case 1: return x * scale;
    case 2: return -x;
    default: return x;
  }
}
void setup() {}
void loop() { show(fold(1.0f, 2, 3)); show(fold(2.0f, 2, 3)); }`
    const result = finishCpp(source)
    expect(result).toContain('static float fold(float x, int scale) {')
    expect(result).toContain('return -x;')
    expect(result).not.toContain('switch')
    // `scale` decides nothing, so it stays an argument.
    expect(result).toContain('fold(1.0f, 3)')
  })
  it('keeps a literal that callers disagree on, or that a reference could change', () => {
    const source = `static int pick(int mode) { if (mode == 1) return 4; return 5; }
static bool paint(bool &full) { full = true; return true; }
void setup() {}
void loop() {
  bool full = false;
  if (paint(full) && full) show(pick(1));
  show(pick(2));
}`
    const result = finishCpp(source)
    expect(result).toContain('if (mode == 1)')
    expect(result).toContain('bool full = false;')
    expect(result).toContain('paint(full) && full')
  })
  it('folds constant flags, literal conditions, ternaries and known macros', () => {
    const source = `#define WIDE 16
static bool armed = false;
void setup() {}
void loop() {
  bool fire = armed && sensor();
  if (fire) shoot(); else idle();
  float k = WIDE > 1 ? 1.0f / (WIDE - 1) : 0.0f;
  show(armed ? 1 : 2, k);
}`
    const result = finishCpp(source)
    expect(result).not.toContain('armed')
    expect(result).not.toContain('sensor()')
    expect(result).not.toContain('shoot()')
    expect(result).toContain('idle();')
    expect(result).toContain('float k = 1.0f / (WIDE - 1);')
    expect(result).toContain('show(2, k);')
  })
  it('removes statements after a block-level return and empty pure branches', () => {
    const source = `static int last = 0;
static void begin(int pin) {
  if (last != -2) {
    return;
    reset();
    last = pin;
  }
  last = pin;
}
void setup() { begin(4); }
void loop() { if (last > 2) {} }`
    const result = finishCpp(source)
    expect(result).not.toContain('reset()')
    expect(result).not.toContain('if (last > 2)')
  })
  it('does not take a falling-through arm as its own body', () => {
    const result = specializeSwitch('switch(style) { case 1: case 2: draw(); break; default: other(); }', 'style', 1)
    expect(result).toContain('case 1:')
  })
  it('specializes a switch without changing nested loop breaks', () => {
    const result = specializeSwitch('switch(style) { case 1: { for (;;) { break; } draw(); break; } default: other(); break; }', 'style', 1)
    expect(result).toContain('for (;;) { break; }')
    expect(result).toContain('draw();')
    expect(result).not.toContain('other()')
    expect(result).not.toContain('switch')
  })
})
