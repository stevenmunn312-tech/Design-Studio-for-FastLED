/**
 * ESP32-S3 capture adapter for the pinned IRremote decoder.
 *
 * IRremote's timer receiver does not support S3. RMT captures the demodulated
 * signal instead; only the main loop touches IRremote's raw buffer/decoders.
 * Keep this shared by the learner and every project generator.
 */
export const IR_RMT_RECEIVER_CPP = `
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
  struct Frame { size_t count; int64_t completedAt; };
  rmt_channel_handle_t channel = nullptr;
  QueueHandle_t queue = nullptr;
  rmt_symbol_word_t symbols[SYMBOL_CAPACITY] = {};
  rmt_receive_config_t receiveConfig = {};
  int64_t lastEnd = 0;

  static bool IRAM_ATTR received(rmt_channel_handle_t, const rmt_rx_done_event_data_t* event, void* context) {
    auto* self = static_cast<FlsIrRmtReceiver*>(context);
    const Frame frame = { event->num_symbols, esp_timer_get_time() };
    BaseType_t wake = pdFALSE;
    xQueueSendFromISR(self->queue, &frame, &wake);
    return wake == pdTRUE;
  }

public:
  void begin(uint_fast8_t pin, bool) {
    // Do not call IrReceiver.begin(): it starts the unsupported sample timer.
    IrReceiver.setReceivePin(pin);
    pinMode(pin, INPUT);
    queue = xQueueCreate(1, sizeof(Frame));
    ESP_ERROR_CHECK(queue ? ESP_OK : ESP_ERR_NO_MEM);
    rmt_rx_channel_config_t config = {};
    config.gpio_num = static_cast<gpio_num_t>(pin);
    config.clk_src = RMT_CLK_SRC_DEFAULT;
    config.resolution_hz = 1000000; // durations are microseconds
    // Two 48-symbol RX blocks hold every supported (up to 48-bit) protocol.
    config.mem_block_symbols = 96;
    ESP_ERROR_CHECK(rmt_new_rx_channel(&config, &channel));
    rmt_rx_event_callbacks_t callbacks = {};
    callbacks.on_recv_done = received;
    ESP_ERROR_CHECK(rmt_rx_register_event_callbacks(channel, &callbacks, this));
    receiveConfig.signal_range_min_ns = 1250;
    receiveConfig.signal_range_max_ns = IDLE_US * 1000;
    ESP_ERROR_CHECK(rmt_enable(channel));
    resume();
  }

  bool decode() {
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
        const uint32_t duration = half ? symbols[i].duration1 : symbols[i].duration0;
        const bool high = half ? symbols[i].level1 : symbols[i].level0;
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
      // Never decode a truncated frame as a key. Re-arm even on noise/overflow.
      resume();
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
    IrReceiver.decodedIRData.rawlen = raw.rawlen;
    IrReceiver.decodedIRData.initialGapTicks = gapTicks;
    raw.StateForISR = IR_REC_STATE_STOP;
    return IrReceiver.decode();
  }

  void resume() {
    IrReceiver.resume();
    ESP_ERROR_CHECK(rmt_receive(channel, symbols, sizeof(symbols), &receiveConfig));
  }
};
static FlsIrRmtReceiver _flsIrRmtReceiver;
#define FLS_IR_RECEIVER _flsIrRmtReceiver
#else
#define FLS_IR_RECEIVER IrReceiver
#endif
`.trim()
