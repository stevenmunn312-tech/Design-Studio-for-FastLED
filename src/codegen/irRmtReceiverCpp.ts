import { IR_REMOTE_REPEAT_HOLD_MS } from '../state/irRemote'

/**
 * ESP32-S3 capture adapter for the pinned IRremote decoder.
 *
 * IRremote's timer receiver does not support S3. RMT captures the demodulated
 * signal instead; only the main loop touches IRremote's raw buffer/decoders.
 * Keep this shared by the learner and every project generator.
 */
export function irRmtReceiverCpp(debug = false): string {
  return `
#if defined(CONFIG_IDF_TARGET_ESP32S3)
#include <esp_idf_version.h>
#if ESP_IDF_VERSION_MAJOR < 5
#error "ESP32-S3 IR receive requires Arduino-ESP32 3.x or newer."
#endif
#include <driver/rmt_rx.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

// Member functions avoid Arduino's prototype hoisting over RMT helper types.
class FlsIrRmtReceiver {
  // Allow both a leading idle half-symbol and the trailing end marker.
  static constexpr size_t SYMBOL_CAPACITY = RAW_BUFFER_LENGTH / 2 + 2;
  // NEC's leading mark is 9ms; an 8ms timeout would split it in two.
  static constexpr uint32_t IDLE_US = 12000;
  struct Frame { size_t count; int64_t completedAt; rmt_symbol_word_t symbols[SYMBOL_CAPACITY]; };
  rmt_channel_handle_t channel = nullptr;
  QueueHandle_t queue = nullptr;
  rmt_symbol_word_t symbols[SYMBOL_CAPACITY] = {};
  rmt_receive_config_t receiveConfig = {};
  int64_t lastEnd = 0;
  decode_type_t lastProtocol = UNKNOWN;
  uint16_t lastAddress = 0, lastCommand = 0;
  int64_t lastDecodedAt = 0;
  volatile esp_err_t receiveError = ESP_OK;
${debug ? '  volatile uint32_t captured = 0, dropped = 0;\n  uint32_t discarded = 0, lastReportAt = 0;' : ''}

  static bool received(rmt_channel_handle_t, const rmt_rx_done_event_data_t* event, void* context);

public:
  void begin(uint_fast8_t pin, bool) {
    // Do not call IrReceiver.begin(): it starts the unsupported sample timer.
    IrReceiver.setReceivePin(pin);
    pinMode(pin, INPUT);
    queue = xQueueCreate(4, sizeof(Frame));
    ESP_ERROR_CHECK(queue ? ESP_OK : ESP_ERR_NO_MEM);
    rmt_rx_channel_config_t config = {};
    config.gpio_num = static_cast<gpio_num_t>(pin);
    config.clk_src = RMT_CLK_SRC_DEFAULT;
    config.resolution_hz = 1000000; // durations are microseconds
    // RX and FastLED TX share the S3 RMT group interrupt. Automatic priority
    // (0) conflicts with FastLED's explicit level 3 at its first LED show.
#ifdef FL_RMT5_INTERRUPT_LEVEL
    config.intr_priority = FL_RMT5_INTERRUPT_LEVEL;
#else
    config.intr_priority = 3; // pinned FastLED RMT5 default
#endif
    // Two 48-symbol RX blocks hold every supported (up to 48-bit) protocol.
    config.mem_block_symbols = 96;
    ESP_ERROR_CHECK(rmt_new_rx_channel(&config, &channel));
    rmt_rx_event_callbacks_t callbacks = {};
    callbacks.on_recv_done = received;
    ESP_ERROR_CHECK(rmt_rx_register_event_callbacks(channel, &callbacks, this));
    receiveConfig.signal_range_min_ns = 1250;
    receiveConfig.signal_range_max_ns = IDLE_US * 1000;
    ESP_ERROR_CHECK(rmt_enable(channel));
    ESP_ERROR_CHECK(rmt_receive(channel, symbols, sizeof(symbols), &receiveConfig));
  }

  bool decode() {
${debug ? `    const uint32_t now = millis();
    if ((uint32_t)(now - lastReportAt) >= 1000u) {
      lastReportAt = now;
      Serial.print("FLS_IR_CAPTURE captured="); Serial.print(captured);
      Serial.print(" dropped="); Serial.print(dropped);
      Serial.print(" discarded="); Serial.println(discarded);
    }` : ''}
    ESP_ERROR_CHECK(receiveError); // report any re-arm failure outside the ISR
    Frame frame;
    if (!queue || xQueueReceive(queue, &frame, 0) != pdTRUE) return false;
    auto& raw = IrReceiver.irparams;
    raw.OverflowFlag = false;
    raw.rawbuf[0] = 0; // IRremote reserves entry zero; gap is a separate field.
    size_t length = 1, lastMarkLength = 1;
    uint32_t elapsed = 0, markEnd = 0;
    bool invalid = frame.count >= SYMBOL_CAPACITY;
    for (size_t i = 0; i < frame.count && i < SYMBOL_CAPACITY && !invalid; ++i) {
      for (int half = 0; half < 2; ++half) {
        const uint32_t duration = half ? frame.symbols[i].duration1 : frame.symbols[i].duration0;
        const bool high = half ? frame.symbols[i].level1 : frame.symbols[i].level0;
        if (duration == 0) break; // RMT end marker
        if (length == 1 && high) continue; // optional leading idle space
        // Demodulating receivers are active-low; timings must alternate.
        if (duration >= IDLE_US || high != (length % 2 == 0)) {
          // A final idle space is the normal end of a frame.
          if (high && duration >= IDLE_US) break;
          invalid = true;
          break;
        }
        if (length >= RAW_BUFFER_LENGTH) {
          // A maximum-length frame may still have a trailing idle space.
          if (high) continue;
          invalid = true;
          break;
        }
        const uint32_t ticks = (duration + MICROS_PER_TICK / 2) / MICROS_PER_TICK;
        const uint32_t maxTicks = static_cast<IRRawbufType>(~0u);
        raw.rawbuf[length++] = static_cast<IRRawbufType>(ticks > maxTicks ? maxTicks : (ticks ? ticks : 1));
        elapsed += duration;
        if (!high) { lastMarkLength = length; markEnd = elapsed; }
      }
    }
    if (invalid || lastMarkLength == 1) {
${debug ? '      ++discarded;\n      Serial.println("FLS_IR_RAW invalid=1");' : ''}
      // Never decode a truncated frame as a key. Capture is already re-armed.
      return false;
    }
    // End callback follows the last mark by the configured idle timeout.
    // Timestamp capture in the ISR, so a slow LED show cannot change repeats.
    const int64_t end = frame.completedAt - IDLE_US;
    const int64_t start = end - markEnd;
    const int64_t gap = lastEnd ? (start > lastEnd ? start - lastEnd : 0) : INT64_MAX;
    const uint16_t gapTicks = gap / MICROS_PER_TICK > UINT16_MAX ? UINT16_MAX : static_cast<uint16_t>(gap / MICROS_PER_TICK);
    lastEnd = end;
    raw.rawlen = static_cast<IRRawlenType>(lastMarkLength); // exclude trailing idle
    raw.initialGapTicks = gapTicks;
${debug ? `    Serial.print("FLS_IR_RAW len="); Serial.print(raw.rawlen);
    Serial.print(" gap_us="); Serial.print((uint32_t)gapTicks * MICROS_PER_TICK);
    Serial.print(" mark_us="); Serial.print(raw.rawlen > 1 ? (uint32_t)raw.rawbuf[1] * MICROS_PER_TICK : 0);
    Serial.print(" space_us="); Serial.print(raw.rawlen > 2 ? (uint32_t)raw.rawbuf[2] * MICROS_PER_TICK : 0);
    Serial.print(" stop_us="); Serial.println(raw.rawlen > 3 ? (uint32_t)raw.rawbuf[3] * MICROS_PER_TICK : 0);` : ''}
    // IRremote copies the previous decodedIRData into its repeat identity.
    // A noisy UNKNOWN capture must not poison the next short repeat. Use the
    // last recognized capture, bounded by capture time rather than loop time.
    const bool recent = lastProtocol != UNKNOWN && frame.completedAt - lastDecodedAt <= ${IR_REMOTE_REPEAT_HOLD_MS * 1000};
    IrReceiver.decodedIRData.protocol = recent ? lastProtocol : UNKNOWN;
    IrReceiver.decodedIRData.address = recent ? lastAddress : 0;
    IrReceiver.decodedIRData.command = recent ? lastCommand : 0;
#if defined(DECODE_NEC) || defined(DECODE_ONKYO)
    const bool necFamily = recent && (lastProtocol == NEC || lastProtocol == NEC2 || lastProtocol == APPLE || lastProtocol == ONKYO);
    // The demodulator can stretch the repeat's stop mark, and LED noise can
    // append extra pulses. Require the canonical NEC repeat header and a
    // bounded stop mark before trimming/normalizing this short repeat only.
    if (necFamily && raw.rawlen >= 4 && matchMark(raw.rawbuf[1], NEC_HEADER_MARK)
        && matchSpace(raw.rawbuf[2], NEC_REPEAT_HEADER_SPACE)
        && matchMarkWithGreaterRange(raw.rawbuf[3], NEC_BIT_MARK)) {
      raw.rawlen = 4;
      raw.rawbuf[3] = (NEC_BIT_MARK + MARK_EXCESS_MICROS + MICROS_PER_TICK / 2) / MICROS_PER_TICK;
    }
#endif
    IrReceiver.decodedIRData.rawlen = raw.rawlen;
    IrReceiver.decodedIRData.initialGapTicks = gapTicks;
    raw.StateForISR = IR_REC_STATE_STOP;
    const bool decoded = IrReceiver.decode();
${debug ? `    Serial.print("FLS_IR_DECODE protocol="); Serial.print(getProtocolString(IrReceiver.decodedIRData.protocol));
    Serial.print(" repeat="); Serial.println((IrReceiver.decodedIRData.flags & IRDATA_FLAGS_IS_REPEAT) ? 1 : 0);` : ''}
    if (IrReceiver.decodedIRData.protocol == UNKNOWN) {
#if defined(DECODE_NEC) || defined(DECODE_ONKYO)
      // A new full NEC command must supersede the old key even if damaged.
      if (raw.rawlen >= 4 && matchMark(raw.rawbuf[1], NEC_HEADER_MARK)
          && matchSpace(raw.rawbuf[2], NEC_HEADER_SPACE)) lastProtocol = UNKNOWN;
#endif
      IrReceiver.resume();
      return false;
    }
    if (decoded) {
      lastProtocol = IrReceiver.decodedIRData.protocol;
      lastAddress = IrReceiver.decodedIRData.address;
      lastCommand = IrReceiver.decodedIRData.command;
      lastDecodedAt = frame.completedAt;
    }
    return decoded;
  }

  void resume() {
    IrReceiver.resume();
  }
};
// Define outside the class: Xtensa misplaces literals for inline IRAM members.
bool IRAM_ATTR FlsIrRmtReceiver::received(rmt_channel_handle_t, const rmt_rx_done_event_data_t* event, void* context) {
  auto* self = static_cast<FlsIrRmtReceiver*>(context);
  Frame frame = {};
  frame.count = event->num_symbols;
  frame.completedAt = esp_timer_get_time();
  for (size_t i = 0; i < frame.count && i < SYMBOL_CAPACITY; ++i) {
    frame.symbols[i] = event->received_symbols[i];
  }
  BaseType_t wake = pdFALSE;
  // Queue owns the timings before the capture buffer is reused. If full,
  // drop this frame but keep listening; never wait for the LED render loop.
${debug ? '  ++self->captured;\n  if (xQueueSendFromISR(self->queue, &frame, &wake) != pdTRUE) ++self->dropped;' : '  xQueueSendFromISR(self->queue, &frame, &wake);'}
  // ESP-IDF explicitly supports rmt_receive from ISR context.
  self->receiveError = rmt_receive(self->channel, self->symbols, sizeof(self->symbols), &self->receiveConfig);
  return wake == pdTRUE;
}
static FlsIrRmtReceiver _flsIrRmtReceiver;
#define FLS_IR_RECEIVER _flsIrRmtReceiver
#else
#define FLS_IR_RECEIVER IrReceiver
#endif
`.trim()
}

export const IR_RMT_RECEIVER_CPP = irRmtReceiverCpp()
