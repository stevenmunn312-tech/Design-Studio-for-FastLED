#include <Arduino.h>
#include <math.h>
#include "driver/i2s_std.h"

namespace {

constexpr gpio_num_t kBclkPin = GPIO_NUM_17;
constexpr gpio_num_t kLrcPin = GPIO_NUM_18;
constexpr gpio_num_t kDoutPin = GPIO_NUM_16;
constexpr uint32_t kSampleRate = 48000;
constexpr float kToneHz = 1000.0f;
constexpr int16_t kAmplitude = 3500;  // Deliberately modest speaker volume.
constexpr size_t kFramesPerBlock = 192;

i2s_chan_handle_t txChannel = nullptr;
int16_t samples[kFramesPerBlock * 2];
float phase = 0.0f;

void fail(const char* step, esp_err_t error) {
  Serial.printf("FAIL %s: %s (%d)\n", step, esp_err_to_name(error), error);
  while (true) delay(1000);
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("MAX98357A isolated I2S test");
  Serial.println("BCLK=GPIO17 LRC=GPIO18 DOUT=GPIO16");
  Serial.println("Expected sound: 1 kHz beep, one second on / one second off");

  i2s_chan_config_t channelConfig =
      I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_AUTO, I2S_ROLE_MASTER);
  esp_err_t error = i2s_new_channel(&channelConfig, &txChannel, nullptr);
  if (error != ESP_OK) fail("i2s_new_channel", error);

  i2s_std_config_t standardConfig = {};
  standardConfig.clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(kSampleRate);
  standardConfig.slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(
      I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO);
  standardConfig.gpio_cfg.mclk = I2S_GPIO_UNUSED;
  standardConfig.gpio_cfg.bclk = kBclkPin;
  standardConfig.gpio_cfg.ws = kLrcPin;
  standardConfig.gpio_cfg.dout = kDoutPin;
  standardConfig.gpio_cfg.din = I2S_GPIO_UNUSED;
  standardConfig.gpio_cfg.invert_flags.mclk_inv = false;
  standardConfig.gpio_cfg.invert_flags.bclk_inv = false;
  standardConfig.gpio_cfg.invert_flags.ws_inv = false;

  error = i2s_channel_init_std_mode(txChannel, &standardConfig);
  if (error != ESP_OK) fail("i2s_channel_init_std_mode", error);

  error = i2s_channel_enable(txChannel);
  if (error != ESP_OK) fail("i2s_channel_enable", error);

  Serial.println("I2S running");
}

void loop() {
  const uint32_t currentSecond = millis() / 1000U;
  const bool toneOn = (currentSecond & 1U) == 0;
  static uint32_t reportedSecond = UINT32_MAX;
  if (currentSecond != reportedSecond) {
    reportedSecond = currentSecond;
    Serial.printf("I2S OK - tone %s\n", toneOn ? "ON" : "OFF");
  }
  const float phaseStep = 2.0f * PI * kToneHz / kSampleRate;

  for (size_t frame = 0; frame < kFramesPerBlock; ++frame) {
    const int16_t sample = toneOn
        ? static_cast<int16_t>(sinf(phase) * kAmplitude)
        : 0;
    samples[frame * 2] = sample;
    samples[frame * 2 + 1] = sample;
    phase += phaseStep;
    if (phase >= 2.0f * PI) phase -= 2.0f * PI;
  }

  size_t bytesWritten = 0;
  const esp_err_t error = i2s_channel_write(
      txChannel, samples, sizeof(samples), &bytesWritten, portMAX_DELAY);
  if (error != ESP_OK) fail("i2s_channel_write", error);
}
