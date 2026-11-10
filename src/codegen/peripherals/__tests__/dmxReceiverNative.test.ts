/**
 * The emitted DMX512 receiver, compiled with the host `g++` against a model of
 * the ESP32 UART: a 128-byte FIFO, a break that stores one null byte, and the
 * full, idle, break and overflow interrupts. The sketch's own interrupt code
 * runs unchanged, so packet framing is tested without a board. Skipped where
 * no `g++` exists.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DMX_RECEIVER_HELPER_CPP } from '../dmxReceiverCpp'

const HAS_GPP = spawnSync('g++', ['--version']).status === 0

const UART_MODEL = `#include <cstdint>
#include <cstdio>
#include <cstring>
#define ESP32 1
#define ESP_IDF_VERSION_MAJOR 5
#define ESP_OK 0
#define OUTPUT 1
#define LOW 0
#define UART_PIN_NO_CHANGE (-1)
enum { UART_INTR_RXFIFO_FULL = 1, UART_INTR_BRK_DET = 1 << 7, UART_INTR_RXFIFO_TOUT = 1 << 8, UART_INTR_RXFIFO_OVF = 1 << 4 };
enum { UART_DATA_8_BITS, UART_PARITY_DISABLE, UART_STOP_BITS_2, UART_HW_FLOWCTRL_DISABLE, UART_SCLK_DEFAULT };
typedef int uart_port_t;
typedef int *intr_handle_t;
struct uart_config_t { int baud_rate, data_bits, parity, stop_bits, flow_ctrl, source_clk; };
struct uart_dev_t { uint8_t fifo[128]; uint32_t len, status, enabled, full; };
static uart_dev_t UART1;
static int intrToken;
static bool intrOn = true;
static void (*isr)(void *) = nullptr;
struct { int irq; } uart_periph_signal[3];
#define UART_LL_GET_HW(port) (&UART1)
static void pinMode(int, int) {}
static void digitalWrite(int, int) {}
static int uart_param_config(uart_port_t, const uart_config_t *) { return 0; }
static int uart_set_pin(uart_port_t, int, int, int, int) { return 0; }
static int esp_intr_alloc(int, int, void (*handler)(void *), void *, intr_handle_t *out) { isr = handler; *out = &intrToken; return ESP_OK; }
static void esp_intr_disable(intr_handle_t) { intrOn = false; }
static void esp_intr_enable(intr_handle_t) { intrOn = true; }
static uint32_t uart_ll_get_intsts_mask(uart_dev_t *hw) { return hw->status & hw->enabled; }
static void uart_ll_clr_intsts_mask(uart_dev_t *hw, uint32_t mask) { hw->status &= ~mask; }
static void uart_ll_ena_intr_mask(uart_dev_t *hw, uint32_t mask) { hw->enabled |= mask; }
static void uart_ll_disable_intr_mask(uart_dev_t *hw, uint32_t mask) { hw->enabled &= ~mask; }
static uint32_t uart_ll_get_rxfifo_len(uart_dev_t *hw) { return hw->len; }
static void uart_ll_rxfifo_rst(uart_dev_t *hw) { hw->len = 0; }
static void uart_ll_set_rxfifo_full_thr(uart_dev_t *hw, uint32_t thr) { hw->full = thr; }
static void uart_ll_set_rx_tout(uart_dev_t *, uint32_t) {}
static void uart_ll_read_rxfifo(uart_dev_t *hw, uint8_t *into, uint32_t count) {
  memcpy(into, hw->fifo, count);
  memmove(hw->fifo, hw->fifo + count, hw->len - count);
  hw->len -= count;
}
`

// `late` holds interrupts off, as a long critical section elsewhere would.
const HARNESS = `
static bool late = false;
static void service() { if (!late && intrOn && isr && uart_ll_get_intsts_mask(&UART1)) isr(nullptr); }
static void wire(uint8_t value) {
  if (UART1.len == sizeof(UART1.fifo)) UART1.status |= UART_INTR_RXFIFO_OVF;
  else UART1.fifo[UART1.len++] = value;
  if (UART1.len >= UART1.full) UART1.status |= UART_INTR_RXFIFO_FULL;
}
static void slot(uint8_t value) { wire(value); service(); }
static void brk() { wire(0); UART1.status |= UART_INTR_BRK_DET; service(); }
static void idle() { if (UART1.len) UART1.status |= UART_INTR_RXFIFO_TOUT; service(); }
static uint8_t channels[512];
static uint32_t seen = 0;
static void report(const char *label) {
  if (!_dmxTake(channels, &seen)) { printf("%s: none\\n", label); return; }
  int last = 511;
  while (last >= 0 && channels[last] == 0) last--;
  printf("%s: packet %u ch1=%u ch2=%u last=%d:%u\\n", label, (unsigned)seen, channels[0], channels[1], last + 1, last >= 0 ? channels[last] : 0);
}
static void packet(uint8_t startCode, int slots, uint8_t base) {
  brk();
  slot(startCode);
  for (int i = 0; i < slots; i++) slot((uint8_t)(base + i % 200));
}
int main() {
  _dmxBegin(1, 16, 21);
  report("before any packet");
  // Back to back, no idle time: each break ends the packet before it.
  packet(0, 512, 1); report("first, still open");
  packet(0, 512, 2); report("second break: first has no equal before it");
  packet(0, 512, 3); report("third break publishes the second");
  packet(0, 512, 4); report("fourth break publishes the third");
  report("nothing new");
  // A desk that pauses: the idle line publishes without waiting for a break.
  idle(); report("idle publishes the fourth");
  packet(0, 512, 5); report("break after idle adds nothing");
  idle(); report("idle publishes the fifth");
  // A text packet (start code 0x17) is not levels.
  packet(0x17, 512, 9); idle(); report("text packet skipped");
  packet(0, 512, 6); idle(); report("levels again");
  // A shorter universe takes one packet to be believed.
  packet(0, 24, 7); idle(); report("first short packet waits");
  packet(0, 24, 8); idle(); report("second short packet");
  // A slow sender pauses inside a packet: nothing partial is published.
  brk(); slot(0);
  for (int i = 0; i < 10; i++) slot(50);
  idle(); report("partial packet");
  for (int i = 0; i < 14; i++) slot(51);
  idle(); report("the rest arrives");
  // Interrupts held off across a break: the cut packet is dropped, then it recovers.
  packet(0, 24, 10); late = true; brk(); slot(0);
  for (int i = 0; i < 5; i++) slot(0);
  late = false; service();
  for (int i = 0; i < 19; i++) slot(0);
  idle(); report("late interrupt");
  packet(0, 24, 11); idle(); report("after the late interrupt");
  packet(0, 24, 12); idle(); report("recovered");
  // Interrupts held off past a full FIFO: wait for the next break.
  late = true; packet(0, 200, 13); late = false; service(); idle(); report("overflow");
  packet(0, 24, 14); idle(); report("after overflow");
}
`

describe.skipIf(!HAS_GPP)('DMX512 receiver native framing', () => {
  it('frames packets on breaks, publishes whole equal-length packets and recovers from faults', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dmx-receiver-'))
    try {
      const source = path.join(dir, 'dmx.cpp'), binary = path.join(dir, 'dmx')
      writeFileSync(source, [UART_MODEL, ...DMX_RECEIVER_HELPER_CPP, HARNESS].join('\n'))
      execFileSync('g++', ['-O1', '-Wall', '-Wno-unused-function', '-o', binary, source])
      expect(execFileSync(binary, { encoding: 'utf8' }).trim().split('\n')).toEqual([
        'before any packet: none',
        'first, still open: none',
        'second break: first has no equal before it: none',
        'third break publishes the second: packet 1 ch1=2 ch2=3 last=512:113',
        'fourth break publishes the third: packet 2 ch1=3 ch2=4 last=512:114',
        'nothing new: none',
        'idle publishes the fourth: packet 3 ch1=4 ch2=5 last=512:115',
        'break after idle adds nothing: none',
        'idle publishes the fifth: packet 4 ch1=5 ch2=6 last=512:116',
        'text packet skipped: none',
        'levels again: packet 5 ch1=6 ch2=7 last=512:117',
        'first short packet waits: none',
        'second short packet: packet 6 ch1=8 ch2=9 last=24:31',
        'partial packet: none',
        'the rest arrives: packet 7 ch1=50 ch2=50 last=24:51',
        'late interrupt: none',
        'after the late interrupt: none',
        'recovered: packet 8 ch1=12 ch2=13 last=24:35',
        'overflow: none',
        'after overflow: packet 9 ch1=14 ch2=15 last=24:37',
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
