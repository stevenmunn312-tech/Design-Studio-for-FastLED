/*
 * DMX512 receive on an ESP32 UART, with no library.
 *
 * A DMX packet is a break (the line held low for at least 88 µs), a mark, a
 * start code and up to 512 slots, at 250 kbaud 8N2. Only the break marks where
 * a packet starts, and a desk may send the next break straight after the last
 * slot, so the receiver has to know which bytes were in the UART when the
 * break arrived. ESP-IDF's UART driver cannot say: it queues the break event
 * ahead of the bytes still in the hardware FIFO. So the sketch lets the public
 * driver configure the port (`uart_param_config`, `uart_set_pin`) and reads
 * the FIFO in its own interrupt, through the same `uart_ll` accessors the
 * Arduino core is built on.
 *
 * The interrupt empties the FIFO into the packet first, then acts on what
 * raised it:
 * - a break ends the packet being received and starts the next. The UART
 *   stores the break itself as one null byte, which is dropped;
 * - an idle line (`RX_IDLE_BITS`) publishes a packet that is already whole,
 *   so a desk that pauses between packets is not read a packet late.
 *   Receiving carries on, since a slow sender may pause between slots;
 * - a FIFO overflow abandons the packet and waits for the next break.
 *
 * A packet is published only when it is as long as the one before it. A desk
 * sends a fixed length, so this costs one packet at start-up, and it is what
 * rejects a packet cut short: if the interrupt runs late, bytes of the next
 * packet are already in the FIFO behind the break and cannot be told apart.
 * Only packets with the null start code are lighting levels; RDM and text
 * packets are skipped. One line per board (validation refuses a second
 * transceiver), so the state is plain statics and every DMX512 node reads the
 * same latest packet. The transceiver's driver-enable pin is held low: the
 * sketch only listens.
 */

/** Idle bit times that publish a packet in progress: about nine slots. */
const RX_IDLE_BITS = 100

export const DMX_RECEIVER_INCLUDES_CPP: readonly string[] = [
  '#if defined(ESP32)',
  '#include <driver/uart.h>',
  '#include <esp_idf_version.h>',
  '#include <esp_intr_alloc.h>',
  '#include <hal/uart_ll.h>',
  '#include <soc/uart_periph.h>',
  '#endif',
]

export const DMX_RECEIVER_HELPER_CPP: readonly string[] = [
  '// DMX512 receiver: one line, read in the UART interrupt (no library).',
  '#if defined(ESP32)',
  'static uart_dev_t *_dmxUart = nullptr;',
  'static intr_handle_t _dmxIntr = nullptr;',
  'static uint8_t _dmxRx[514];              // start code, 512 slots, the break\'s null',
  'static volatile int16_t _dmxRxHead = -1;  // -1 until a break starts a packet',
  'static volatile int16_t _dmxRxLength = 0;     // the last packet: start code and slots',
  'static volatile bool _dmxRxPublished = false;',
  'static uint8_t _dmxPacket[512];',
  'static volatile uint16_t _dmxPacketSlots = 0;',
  'static volatile uint32_t _dmxPacketCount = 0;',
  'static void _dmxPublish(int16_t bytes) {',
  '  if (_dmxRxPublished || bytes != _dmxRxLength || _dmxRx[0] != 0) return;',
  '  uint16_t slots = (uint16_t)(bytes - 1 > 512 ? 512 : bytes - 1);',
  '  memcpy(_dmxPacket, _dmxRx + 1, slots);',
  '  _dmxPacketSlots = slots;',
  '  _dmxRxPublished = true;',
  '  _dmxPacketCount = _dmxPacketCount + 1;',
  '}',
  'static void _dmxIsr(void *) {',
  '  uint32_t status = uart_ll_get_intsts_mask(_dmxUart);',
  '  while (status) {',
  '    uint32_t waiting = uart_ll_get_rxfifo_len(_dmxUart);',
  '    int16_t head = _dmxRxHead;',
  '    uint32_t take = 0;',
  '    if (head >= 0) {',
  '      uint32_t room = (uint32_t)(sizeof(_dmxRx) - head);',
  '      take = waiting < room ? waiting : room;',
  '      if (take) uart_ll_read_rxfifo(_dmxUart, _dmxRx + head, take);',
  '      head = (int16_t)(head + take);',
  '    }',
  '    if (waiting > take) uart_ll_rxfifo_rst(_dmxUart);',
  '    uart_ll_clr_intsts_mask(_dmxUart, status);',
  '    if (status & UART_INTR_RXFIFO_OVF) {',
  '      uart_ll_rxfifo_rst(_dmxUart);',
  '      head = -1;',
  '    } else if (status & UART_INTR_BRK_DET) {',
  '      if (head > 1) {',
  '        _dmxPublish((int16_t)(head - 1));',
  '        _dmxRxLength = (int16_t)(head - 1);',
  '      }',
  '      head = 0;',
  '      _dmxRxPublished = false;',
  '    } else if ((status & UART_INTR_RXFIFO_TOUT) && head > 0) {',
  '      _dmxPublish(head);',
  '    }',
  '    _dmxRxHead = head;',
  '    status = uart_ll_get_intsts_mask(_dmxUart);',
  '  }',
  '}',
  'static void _dmxBegin(int port, int rxPin, int enablePin) {',
  '  if (_dmxUart) return;',
  '  pinMode(enablePin, OUTPUT);',
  '  digitalWrite(enablePin, LOW);  // driver off, receiver on',
  '  uart_config_t config = {};',
  '  config.baud_rate = 250000;',
  '  config.data_bits = UART_DATA_8_BITS;',
  '  config.parity = UART_PARITY_DISABLE;',
  '  config.stop_bits = UART_STOP_BITS_2;',
  '  config.flow_ctrl = UART_HW_FLOWCTRL_DISABLE;',
  '#if ESP_IDF_VERSION_MAJOR >= 5',
  '  config.source_clk = UART_SCLK_DEFAULT;',
  '#else',
  '  config.source_clk = UART_SCLK_APB;',
  '#endif',
  '  uart_param_config((uart_port_t)port, &config);',
  '  uart_set_pin((uart_port_t)port, UART_PIN_NO_CHANGE, rxPin, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);',
  '  uart_dev_t *uart = UART_LL_GET_HW(port);',
  '  uart_ll_disable_intr_mask(uart, 0xFFFFFFFFu);',
  '  uart_ll_set_rxfifo_full_thr(uart, 64);',
  `  uart_ll_set_rx_tout(uart, ${RX_IDLE_BITS});`,
  '  uart_ll_rxfifo_rst(uart);',
  '  uart_ll_clr_intsts_mask(uart, 0xFFFFFFFFu);',
  '  _dmxUart = uart;',
  '  if (esp_intr_alloc(uart_periph_signal[port].irq, 0, _dmxIsr, nullptr, &_dmxIntr) != ESP_OK) return;',
  '  uart_ll_ena_intr_mask(uart, UART_INTR_RXFIFO_FULL | UART_INTR_RXFIFO_TOUT | UART_INTR_BRK_DET | UART_INTR_RXFIFO_OVF);',
  '}',
  '// Copies the latest packet into `channels` when one arrived since `*seen`.',
  'static bool _dmxTake(uint8_t *channels, uint32_t *seen) {',
  '  if (!_dmxIntr || _dmxPacketCount == *seen) return false;',
  '  esp_intr_disable(_dmxIntr);',
  '  uint16_t slots = _dmxPacketSlots;',
  '  memcpy(channels, _dmxPacket, slots);',
  '  memset(channels + slots, 0, 512 - slots);',
  '  *seen = _dmxPacketCount;',
  '  esp_intr_enable(_dmxIntr);',
  '  return true;',
  '}',
  '#endif',
]
