/** Run the emitted capture adapter with a fake RMT/queue, against actual C++.
 * Protocol decoding stays in pinned IRremote; this verifies its timing-buffer
 * contract and re-arming without needing a physical receiver. */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { IR_RMT_RECEIVER_CPP } from '../irRmtReceiverCpp'

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
#define CONFIG_IDF_TARGET_ESP32S3 1
#define ESP_IDF_VERSION_MAJOR 5
#define IRAM_ATTR
#define RAW_BUFFER_LENGTH 100
#define MICROS_PER_TICK 50
#define IR_REC_STATE_STOP 3
#define INPUT 0
#define pdFALSE 0
#define pdTRUE 1
#define ESP_OK 0
#define ESP_ERR_NO_MEM 1
#define ESP_ERROR_CHECK(result) assert((result) == ESP_OK)
using IRRawbufType = uint8_t;
using IRRawlenType = unsigned int;
using BaseType_t = int;
using QueueHandle_t = void*;
using rmt_channel_handle_t = void*;
using gpio_num_t = int;
constexpr int RMT_CLK_SRC_DEFAULT = 0;
struct rmt_symbol_word_t { uint32_t duration0:15, level0:1, duration1:15, level1:1; };
struct rmt_rx_done_event_data_t { size_t num_symbols; };
struct rmt_rx_channel_config_t { gpio_num_t gpio_num; int clk_src; uint32_t resolution_hz; size_t mem_block_symbols; int intr_priority; };
struct rmt_receive_config_t { uint32_t signal_range_min_ns, signal_range_max_ns; };
using Callback = bool (*)(rmt_channel_handle_t, const rmt_rx_done_event_data_t*, void*);
struct rmt_rx_event_callbacks_t { Callback on_recv_done; };
static Callback callback;
static void* context;
static rmt_symbol_word_t* buffer;
static size_t bufferCount, queueSize;
static unsigned char queued[32];
static bool ready;
static int arms, decodes;
static int groupPriority;
static int64_t now;
static int64_t esp_timer_get_time() { return now; }
static void pinMode(int pin, int mode) { assert(pin == 13 && mode == INPUT); }
static QueueHandle_t xQueueCreate(int count, size_t size) { assert(count == 1 && size <= sizeof(queued)); queueSize = size; return queued; }
static int xQueueSendFromISR(QueueHandle_t, const void* item, BaseType_t*) { assert(!ready); memcpy(queued, item, queueSize); ready = true; return pdTRUE; }
static int xQueueReceive(QueueHandle_t, void* item, int timeout) { assert(timeout == 0); if (!ready) return pdFALSE; memcpy(item, queued, queueSize); ready = false; return pdTRUE; }
static int rmt_new_rx_channel(const rmt_rx_channel_config_t* cfg, rmt_channel_handle_t* channel) { assert(cfg->gpio_num == 13 && cfg->resolution_hz == 1000000 && cfg->mem_block_symbols == 96); groupPriority = cfg->intr_priority; *channel = queued; return ESP_OK; }
static int rmt_rx_register_event_callbacks(rmt_channel_handle_t, const rmt_rx_event_callbacks_t* cfg, void* user) { callback = cfg->on_recv_done; context = user; return ESP_OK; }
static int rmt_enable(rmt_channel_handle_t) { return ESP_OK; }
static int rmt_receive(rmt_channel_handle_t, void* data, size_t bytes, const rmt_receive_config_t* cfg) { assert(cfg->signal_range_max_ns > 9000000); buffer = static_cast<rmt_symbol_word_t*>(data); bufferCount = bytes / sizeof(*buffer); ++arms; return ESP_OK; }
struct FakeDecoder {
  struct { uint8_t StateForISR; bool OverflowFlag; IRRawlenType rawlen; uint16_t initialGapTicks; IRRawbufType rawbuf[RAW_BUFFER_LENGTH]; } irparams = {};
  struct { IRRawlenType rawlen; uint16_t initialGapTicks; } decodedIRData = {};
  void setReceivePin(int pin) { assert(pin == 13); }
  void resume() { irparams.StateForISR = 0; }
  bool decode() {
    assert(irparams.StateForISR == IR_REC_STATE_STOP && !irparams.OverflowFlag);
    assert(decodedIRData.rawlen == irparams.rawlen && decodedIRData.initialGapTicks == irparams.initialGapTicks);
    ++decodes;
    return true;
  }
} IrReceiver;
`

const EXERCISES = `
static void feed(size_t count, int64_t completedAt) {
  now = completedAt;
  rmt_rx_done_event_data_t event = { count };
  callback(nullptr, &event, context);
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
  assert(FLS_IR_RECEIVER.decode());
  assert(IrReceiver.irparams.rawlen == 6 && IrReceiver.irparams.initialGapTicks == UINT16_MAX);
  const uint8_t expected[] = {0, 180, 90, 11, 11, 11};
  assert(memcmp(IrReceiver.irparams.rawbuf, expected, sizeof(expected)) == 0);
  FLS_IR_RECEIVER.resume();

  // A completed capture can wait behind an LED show; repeat spacing must
  // use capture timestamps rather than the delayed decode time.
  buffer[0] = {9000, 0, 2250, 1}; buffer[1] = {560, 0, 0, 1};
  feed(2, 200000); now = 999999;
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
  puts("OK");
}
`

describe.skipIf(!nativeGpp && !wslGpp)('S3 RMT capture native behavior', () => {
  it.each([undefined, 2])('shares FastLED priority %s, preserves timings and gaps, and re-arms on noise', (priority) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ir-rmt-'))
    const cleanupPath = path.resolve(directory)
    if (!cleanupPath.startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unexpected native-test directory')
    try {
      const source = path.join(directory, 'capture.cpp')
      const binary = path.join(directory, nativeGpp && process.platform === 'win32' ? 'capture.exe' : 'capture')
      // Platform headers are replaced by the fake hardware contract above.
      const adapter = IR_RMT_RECEIVER_CPP.replace(/^#include.*$/gm, '')
      const configuration = priority === undefined ? '' : `#define FL_RMT5_INTERRUPT_LEVEL ${priority}`
      writeFileSync(source, [configuration, HARNESS, adapter, EXERCISES].join('\n'))
      const args = ['-std=c++17', '-Wall', '-Wextra', '-Werror', source, '-o', binary]
      execFileSync(wslGpp ? 'wsl' : 'g++', wslGpp ? ['--exec', 'g++', ...args.map(compilerPath)] : args)
      const output = execFileSync(wslGpp ? 'wsl' : binary, wslGpp ? ['--exec', compilerPath(binary)] : [], { encoding: 'utf8' })
      expect(output.trim()).toBe('OK')
    } finally {
      rmSync(cleanupPath, { recursive: true, force: true })
    }
  }, 60_000)
})
