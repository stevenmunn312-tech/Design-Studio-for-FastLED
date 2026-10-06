/** Run the emitted capture adapter with a fake RMT/queue, against actual C++.
 * Protocol decoding stays in pinned IRremote; this verifies its timing-buffer
 * contract and re-arming without needing a physical receiver. */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { irRmtReceiverCpp } from '../peripherals/irRmtReceiverCpp'

const nativeGpp = spawnSync('g++', ['--version']).status === 0
const wslGpp = !nativeGpp && process.platform === 'win32'
  && spawnSync('wsl', ['--exec', 'g++', '--version']).status === 0
const compilerPath = (value: string) => wslGpp
  ? value.replace(/\\/g, '/').replace(/^([a-z]):/i, (_, drive: string) => `/mnt/${drive.toLowerCase()}`)
  : value

const HARNESS = `
#include <cassert>
#include <cstdint>
#include <cstddef>
#include <cstring>
#include <cstdio>
#include <string>
#include <sstream>
#define CONFIG_IDF_TARGET_ESP32S3 1
#define ESP_IDF_VERSION_MAJOR 5
#define IRAM_ATTR
#define RAW_BUFFER_LENGTH 100
#define MICROS_PER_TICK 50
#define DECODE_NEC
#define MARK_EXCESS_MICROS 20
#define NEC_HEADER_MARK 9000
#define NEC_HEADER_SPACE 4500
#define NEC_REPEAT_HEADER_SPACE 2250
#define NEC_BIT_MARK 560
#define IR_REC_STATE_STOP 3
#define INPUT 0
#define pdFALSE 0
#define pdTRUE 1
#define ESP_OK 0
#define ESP_ERR_NO_MEM 1
#define ESP_ERROR_CHECK(result) assert((result) == ESP_OK)
#define IRDATA_FLAGS_IS_REPEAT 1
#define millis() (static_cast<uint32_t>(::now / 1000))
#define getProtocolString(protocol) "decoded"
static bool inIsr = false;
struct SerialSink {
  std::string log;
  template<typename T> void print(T value) { assert(!inIsr); std::ostringstream stream; stream << value; log += stream.str(); }
  template<typename T> void println(T value) { print(value); log += "\\n"; }
};
[[maybe_unused]] static SerialSink Serial;
using IRRawbufType = uint8_t;
using IRRawlenType = unsigned int;
using BaseType_t = int;
using esp_err_t = int;
using QueueHandle_t = void*;
using rmt_channel_handle_t = void*;
using gpio_num_t = int;
enum decode_type_t { UNKNOWN, NEC, NEC2, APPLE, ONKYO, SONY };
static bool matchMark(uint16_t ticks, uint16_t micros) { const int measured = ticks * 50 - 20; return measured > (micros / 4) * 3 && measured <= (micros / 4) * 5; }
static bool matchSpace(uint16_t ticks, uint16_t micros) { const int measured = ticks * 50 + 20; return measured > (micros / 4) * 3 && measured <= (micros / 4) * 5; }
static bool matchMarkWithGreaterRange(uint16_t ticks, uint16_t micros) { const int measured = ticks * 50 - 20; return measured > (micros / 4) * 2 && measured <= (micros / 4) * 6; }
constexpr int RMT_CLK_SRC_DEFAULT = 0;
struct rmt_symbol_word_t { uint32_t duration0:15, level0:1, duration1:15, level1:1; };
struct rmt_rx_done_event_data_t { size_t num_symbols; rmt_symbol_word_t* received_symbols; };
struct rmt_rx_channel_config_t { gpio_num_t gpio_num; int clk_src; uint32_t resolution_hz; size_t mem_block_symbols; int intr_priority; };
struct rmt_receive_config_t { uint32_t signal_range_min_ns, signal_range_max_ns; };
using Callback = bool (*)(rmt_channel_handle_t, const rmt_rx_done_event_data_t*, void*);
struct rmt_rx_event_callbacks_t { Callback on_recv_done; };
static Callback callback;
static void* context;
static rmt_symbol_word_t* buffer;
static size_t bufferCount, queueSize;
static unsigned char queued[4][256];
static size_t queueHead, queueCount;
static bool receiving;
static int arms, decodes;
static int groupPriority;
static int64_t now;
static int64_t esp_timer_get_time() { return now; }
static void pinMode(int pin, int mode) { assert(pin == 13 && mode == INPUT); }
static QueueHandle_t xQueueCreate(int count, size_t size) { assert(count == 4 && size <= sizeof(queued[0])); queueSize = size; return queued; }
static int xQueueSendFromISR(QueueHandle_t, const void* item, BaseType_t*) { if (queueCount == 4) return pdFALSE; memcpy(queued[(queueHead + queueCount) % 4], item, queueSize); ++queueCount; return pdTRUE; }
static int xQueueReceive(QueueHandle_t, void* item, int timeout) { assert(timeout == 0); if (!queueCount) return pdFALSE; memcpy(item, queued[queueHead], queueSize); queueHead = (queueHead + 1) % 4; --queueCount; return pdTRUE; }
static int rmt_new_rx_channel(const rmt_rx_channel_config_t* cfg, rmt_channel_handle_t* channel) { assert(cfg->gpio_num == 13 && cfg->resolution_hz == 1000000 && cfg->mem_block_symbols == 96); groupPriority = cfg->intr_priority; *channel = queued; return ESP_OK; }
static int rmt_rx_register_event_callbacks(rmt_channel_handle_t, const rmt_rx_event_callbacks_t* cfg, void* user) { callback = cfg->on_recv_done; context = user; return ESP_OK; }
static int rmt_enable(rmt_channel_handle_t) { return ESP_OK; }
static int rmt_receive(rmt_channel_handle_t, void* data, size_t bytes, const rmt_receive_config_t* cfg) { assert(!receiving && cfg->signal_range_max_ns > 9000000); receiving = true; buffer = static_cast<rmt_symbol_word_t*>(data); bufferCount = bytes / sizeof(*buffer); ++arms; return ESP_OK; }
struct FakeDecoder {
  struct { uint8_t StateForISR; bool OverflowFlag; IRRawlenType rawlen; uint16_t initialGapTicks; IRRawbufType rawbuf[RAW_BUFFER_LENGTH]; } irparams = {};
  struct { IRRawlenType rawlen; uint16_t initialGapTicks; decode_type_t protocol; uint16_t address, command; bool repeat; uint8_t flags; } decodedIRData = {};
  bool necMode = false;
  uint16_t nextCommand = 64;
  void setReceivePin(int pin) { assert(pin == 13); }
  void resume() { irparams.StateForISR = 0; }
  bool decode() {
    assert(irparams.StateForISR == IR_REC_STATE_STOP && !irparams.OverflowFlag);
    assert(decodedIRData.rawlen == irparams.rawlen && decodedIRData.initialGapTicks == irparams.initialGapTicks);
    ++decodes;
    if (!necMode) { decodedIRData.protocol = SONY; return true; }
    if (irparams.rawlen == 68 && matchSpace(irparams.rawbuf[2], NEC_HEADER_SPACE)) {
      decodedIRData.protocol = NEC; decodedIRData.address = 0; decodedIRData.command = nextCommand; decodedIRData.repeat = false;
    } else if (irparams.rawlen == 4 && matchMark(irparams.rawbuf[1], NEC_HEADER_MARK)
        && matchSpace(irparams.rawbuf[2], NEC_REPEAT_HEADER_SPACE) && matchMark(irparams.rawbuf[3], NEC_BIT_MARK)) {
      decodedIRData.repeat = true; // identity comes from adapter's seeded previous decode
    } else {
      decodedIRData.protocol = UNKNOWN; decodedIRData.address = decodedIRData.command = 0; decodedIRData.repeat = false;
    }
    return true;
  }
} IrReceiver;
`

const EXERCISES = `
static void feed(size_t count, int64_t completedAt) {
  assert(receiving);
  receiving = false;
  now = completedAt;
  rmt_rx_done_event_data_t event = { count, buffer };
  const int previousArms = arms;
  inIsr = true;
  callback(nullptr, &event, context);
  inIsr = false;
  assert(arms == previousArms + 1); // re-arm without waiting for decode/resume
}
int main() {
  FLS_IR_RECEIVER.begin(13, false);
  // FastLED allocates its TX channel on the first show, after IR begins.
  // ESP-IDF rejects differing configured priorities in the shared RMT group.
#ifdef FL_RMT5_INTERRUPT_LEVEL
  assert(groupPriority == FL_RMT5_INTERRUPT_LEVEL);
#else
  assert(groupPriority == 3);
#endif
  assert(arms == 1 && bufferCount == 52);
  assert(!FLS_IR_RECEIVER.decode() && arms == 1);

  // NEC timings, including a trailing idle space: reserve index 0 and round
  // to IRremote's 50us ticks without treating the 9ms header as a frame end.
  buffer[0] = {9000, 0, 4500, 1}; buffer[1] = {560, 0, 560, 1}; buffer[2] = {560, 0, 12000, 1};
  feed(3, 100000);
  // Simulate the LED loop being busy until AFTER the first short repeat.
  // Both frames must survive, including the initial frame's owned timings.
  buffer[0] = {9000, 0, 2250, 1}; buffer[1] = {560, 0, 0, 1};
  feed(2, 200000); now = 999999;
  const int capturedArms = arms;
  assert(FLS_IR_RECEIVER.decode());
  assert(IrReceiver.irparams.rawlen == 6 && IrReceiver.irparams.initialGapTicks == UINT16_MAX);
  const uint8_t expected[] = {0, 180, 90, 11, 11, 11};
  assert(memcmp(IrReceiver.irparams.rawbuf, expected, sizeof(expected)) == 0);
  FLS_IR_RECEIVER.resume();
  assert(arms == capturedArms); // decoder resume must not restart active RX

  // A completed capture can wait behind an LED show; repeat spacing must
  // use capture timestamps rather than the delayed decode time.
  assert(FLS_IR_RECEIVER.decode());
  assert(IrReceiver.irparams.rawlen == 4 && IrReceiver.irparams.initialGapTicks == 1763);
  FLS_IR_RECEIVER.resume();

  // Leading idle and a long gap, with RMT's zero-duration terminator.
  buffer[0] = {300, 1, 9000, 0}; buffer[1] = {4500, 1, 560, 0}; buffer[2] = {0, 1, 0, 0};
  feed(3, 5000000);
  assert(FLS_IR_RECEIVER.decode());
  assert(IrReceiver.irparams.rawlen == 4 && IrReceiver.irparams.initialGapTicks == UINT16_MAX);
  assert(IrReceiver.irparams.rawbuf[1] == 180 && IrReceiver.irparams.rawbuf[2] == 90);
  FLS_IR_RECEIVER.resume();

  // A full 48-bit protocol exactly fills the decoder buffer. A rounded
  // trailing idle must not falsely turn that valid frame into overflow.
  buffer[0] = {9000, 0, 4500, 1};
  for (size_t i = 1; i <= 48; ++i) buffer[i] = {560, 0, 560, 1};
  buffer[49] = {560, 0, 11999, 1};
  feed(50, 6000000);
  assert(FLS_IR_RECEIVER.decode() && IrReceiver.irparams.rawlen == 100);
  FLS_IR_RECEIVER.resume();

  // The same maximum-length frame with leading idle has an extra symbol.
  buffer[0] = {300, 1, 9000, 0}; buffer[1] = {4500, 1, 560, 0};
  for (size_t i = 2; i <= 49; ++i) buffer[i] = {560, 1, 560, 0};
  buffer[50] = {11999, 1, 0, 0};
  feed(51, 6500000);
  assert(FLS_IR_RECEIVER.decode() && IrReceiver.irparams.rawlen == 100);
  FLS_IR_RECEIVER.resume();

  const int goodDecodes = decodes;
  int previousArms = arms;
  feed(bufferCount, 7000000); // full/truncated RMT buffer
  assert(!FLS_IR_RECEIVER.decode() && arms == ++previousArms);
  feed(0, 7100000); // empty noise event
  assert(!FLS_IR_RECEIVER.decode() && arms == ++previousArms);
  buffer[0] = {12000, 0, 0, 1}; feed(1, 7200000); // stuck-low timeout
  assert(!FLS_IR_RECEIVER.decode() && arms == ++previousArms);
  buffer[0] = {560, 0, 560, 0}; feed(1, 7300000); // malformed levels
  assert(!FLS_IR_RECEIVER.decode() && arms == ++previousArms);
  assert(decodes == goodDecodes);

  // A prolonged render stall fills the bounded queue. Dropping excess
  // captures must neither stop RX nor overwrite older queued timings.
  buffer[0] = {9000, 0, 2250, 1}; buffer[1] = {560, 0, 0, 1};
  previousArms = arms;
  for (int i = 0; i < 6; ++i) feed(2, 8000000 + i * 110000);
  assert(arms == previousArms + 6 && queueCount == 4);
  memset(buffer, 0, bufferCount * sizeof(*buffer));
  for (int i = 0; i < 4; ++i) {
    assert(FLS_IR_RECEIVER.decode() && IrReceiver.irparams.rawlen == 4);
    if (i) assert(IrReceiver.irparams.initialGapTicks == 1963);
    FLS_IR_RECEIVER.resume();
  }
  assert(!FLS_IR_RECEIVER.decode());
  buffer[0] = {9000, 0, 2250, 1}; buffer[1] = {560, 0, 0, 1};
  feed(2, 8700000);
  assert(FLS_IR_RECEIVER.decode()); // capture recovers after saturation
  FLS_IR_RECEIVER.resume();

  IrReceiver.necMode = true;
  // Hardware trace: a valid full NEC key followed by a 750-800us stop mark
  // rejected by the pinned decoder's strict 560us mark tolerance.
  buffer[0] = {9200, 0, 4350, 1};
  for (size_t i = 1; i <= 32; ++i) buffer[i] = {650, 0, 500, 1};
  buffer[33] = {650, 0, 12000, 1}; feed(34, 10000000);
  assert(FLS_IR_RECEIVER.decode() && IrReceiver.decodedIRData.command == 64);
  FLS_IR_RECEIVER.resume();
  assert(!matchMark(15, NEC_BIT_MARK) && !matchMark(16, NEC_BIT_MARK));
  for (int stop = 750; stop <= 800; stop += 50) {
    buffer[0] = {9200, 0, 2100, 1}; buffer[1] = {static_cast<uint32_t>(stop), 0, 12000, 1};
    feed(2, now + 110000);
    assert(FLS_IR_RECEIVER.decode() && IrReceiver.decodedIRData.protocol == NEC && IrReceiver.decodedIRData.repeat);
    assert(IrReceiver.decodedIRData.command == 64);
    FLS_IR_RECEIVER.resume();
  }
  // A malformed capture must not poison the next valid repeat's identity.
  buffer[0] = {6000, 0, 350, 1}; buffer[1] = {500, 0, 150, 1}; buffer[2] = {500, 0, 12000, 1};
  feed(3, now + 110000);
  assert(!FLS_IR_RECEIVER.decode());
  buffer[0] = {9200, 0, 2100, 1}; buffer[1] = {800, 0, 150, 1}; buffer[2] = {500, 0, 12000, 1};
  feed(3, now + 110000); // canonical repeat followed by trailing glitches
  assert(FLS_IR_RECEIVER.decode() && IrReceiver.decodedIRData.protocol == NEC && IrReceiver.irparams.rawlen == 4);
  FLS_IR_RECEIVER.resume();
  // Strongly malformed stop marks and stale repeats remain rejected.
  buffer[0] = {9200, 0, 2100, 1}; buffer[1] = {2100, 0, 12000, 1}; feed(2, now + 110000);
  assert(!FLS_IR_RECEIVER.decode());
  buffer[1] = {800, 0, 12000, 1}; feed(2, now + 300000);
  assert(!FLS_IR_RECEIVER.decode());

  // An undecodable full NEC command invalidates the previous button.
  buffer[0] = {9200, 0, 4350, 1};
  for (size_t i = 1; i <= 32; ++i) buffer[i] = {650, 0, 500, 1};
  buffer[33] = {650, 0, 12000, 1}; feed(34, now + 1000000);
  assert(FLS_IR_RECEIVER.decode()); FLS_IR_RECEIVER.resume();
  buffer[0] = {9200, 0, 4350, 1}; buffer[1] = {650, 0, 12000, 1}; feed(2, now + 110000);
  assert(!FLS_IR_RECEIVER.decode());
  buffer[0] = {9200, 0, 2100, 1}; buffer[1] = {800, 0, 12000, 1}; feed(2, now + 110000);
  assert(!FLS_IR_RECEIVER.decode());
  // On-button trace: a NEC header with only 30 captured bit pairs (len=64).
  // Never invent the missing bits or let its repeat replay the previous key.
  buffer[0] = {9350, 0, 4250, 1};
  for (size_t i = 1; i <= 30; ++i) buffer[i] = {850, 0, 300, 1};
  buffer[31] = {700, 0, 12000, 1}; feed(32, now + 1000000);
  assert(!FLS_IR_RECEIVER.decode() && IrReceiver.irparams.rawlen == 64);
  buffer[0] = {9450, 0, 1850, 1}; buffer[1] = {850, 0, 12000, 1}; feed(2, now + 110000);
  assert(!FLS_IR_RECEIVER.decode());
  IrReceiver.nextCommand = 25;
  buffer[0] = {9200, 0, 4350, 1};
  for (size_t i = 1; i <= 32; ++i) buffer[i] = {650, 0, 500, 1};
  buffer[33] = {650, 0, 12000, 1}; feed(34, now + 1000000);
  assert(FLS_IR_RECEIVER.decode() && IrReceiver.decodedIRData.command == 25);
  FLS_IR_RECEIVER.resume();
  buffer[0] = {9200, 0, 2100, 1}; buffer[1] = {800, 0, 12000, 1}; feed(2, now + 110000);
  assert(FLS_IR_RECEIVER.decode() && IrReceiver.decodedIRData.command == 25);
  puts("OK");
}
`

describe.skipIf(!nativeGpp && !wslGpp)('S3 RMT capture native behavior', () => {
  it.each([
    { priority: undefined, debug: false }, { priority: 2, debug: false }, { priority: undefined, debug: true },
  ])('shares FastLED priority $priority and captures queued repeats with debug=$debug', ({ priority, debug }) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ir-rmt-'))
    const cleanupPath = path.resolve(directory)
    if (!cleanupPath.startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unexpected native-test directory')
    try {
      const source = path.join(directory, 'capture.cpp')
      const binary = path.join(directory, nativeGpp && process.platform === 'win32' ? 'capture.exe' : 'capture')
      // Platform headers are replaced by the fake hardware contract above.
      const adapter = irRmtReceiverCpp(debug).replace(/^#include.*$/gm, '')
      const configuration = priority === undefined ? '' : `#define FL_RMT5_INTERRUPT_LEVEL ${priority}`
      const exercises = debug ? EXERCISES.replace('  puts("OK");', `
        assert(Serial.log.find("FLS_IR_CAPTURE captured=") != std::string::npos);
        assert(Serial.log.find("FLS_IR_RAW len=") != std::string::npos);
        assert(Serial.log.find(" mark_us=9350 space_us=4250 bit_mark_us=850 stop_us=700") != std::string::npos);
        assert(Serial.log.find("FLS_IR_TIMINGS len=64 data_us=9350,4250,850,300,") != std::string::npos);
        assert(Serial.log.find(",850,300,700\\n") != std::string::npos);
        assert(Serial.log.find("FLS_IR_DECODE protocol=") != std::string::npos);
        puts("OK");`) : EXERCISES
      writeFileSync(source, [configuration, HARNESS, adapter, exercises].join('\n'))
      const args = ['-std=c++17', '-Wall', '-Wextra', '-Werror', source, '-o', binary]
      execFileSync(wslGpp ? 'wsl' : 'g++', wslGpp ? ['--exec', 'g++', ...args.map(compilerPath)] : args)
      const output = execFileSync(wslGpp ? 'wsl' : binary, wslGpp ? ['--exec', compilerPath(binary)] : [], { encoding: 'utf8' })
      expect(output.trim()).toBe('OK')
    } finally {
      rmSync(cleanupPath, { recursive: true, force: true })
    }
  }, 60_000)
})
