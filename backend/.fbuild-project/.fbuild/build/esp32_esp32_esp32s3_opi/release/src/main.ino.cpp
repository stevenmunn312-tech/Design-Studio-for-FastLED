#include <Arduino.h>
// Auto-generated function prototypes
void* _psAlloc(size_t n);
void _audioFFT(float* re, float* im, int n);
float _audioNoiseGate(float raw, float& floor, float& smooth);
void setupAudio();
void updateAudio();
void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt);
float prnd(float n);
float _fsin8(float x);
float _fcos8(float x);
float _fsin16(float x);
float _fbeatsin8(float bpm, float lo, float hi);
float _fbeatsin16(float bpm, float lo, float hi);
float _fscale8(float v, float s);
float _fqadd8(float a, float b);
float _fqsub8(float a, float b);
float _ftriwave8(float x);
float _fquadwave8(float x);
float _fcubicwave8(float x);
float _fease8InOutQuad(float x);
float _fease8InOutCubic(float x);
float _fblend8(float a, float b, float amt);
float _flerp8by8(float a, float b, float frac);
float _flerp16by16(float a, float b, float frac);
float _fsqrt16(float x);
float _fnscale8(float v, float s);
float mapFloat(float x, float inMin, float inMax, float outMin, float outMax);
CRGB kelvinToRGB(float kelvin);
float _worleyHash(int x, int y);
void render_p0(uint32_t ms);
void render_p1(uint32_t ms);
void render_p2(uint32_t ms);
void render_p3(uint32_t ms);
void render_p4(uint32_t ms);
void render_p5(uint32_t ms);
void render_p6(uint32_t ms);
void render_p7(uint32_t ms);
void render_p8(uint32_t ms);
void render_p9(uint32_t ms);
void render_p10(uint32_t ms);
void render_p11(uint32_t ms);
void render_p12(uint32_t ms);
void render_p13(uint32_t ms);
void render_p14(uint32_t ms);
void render_p15(uint32_t ms);
void render_p16(uint32_t ms);
void render_p17(uint32_t ms);
void render_p18(uint32_t ms);
void render_p19(uint32_t ms);
void render_p20(uint32_t ms);
void render_p21(uint32_t ms);
void render_p22(uint32_t ms);
void render_p23(uint32_t ms);
void render_p24(uint32_t ms);
void render_p25(uint32_t ms);
void render_p26(uint32_t ms);
void render_p27(uint32_t ms);
void render_p28(uint32_t ms);
void render_p29(uint32_t ms);
void render_p30(uint32_t ms);
void render_p31(uint32_t ms);
void render_p32(uint32_t ms);
void render_p33(uint32_t ms);
void render_p34(uint32_t ms);
void render_p35(uint32_t ms);
void render_p36(uint32_t ms);
void render_p37(uint32_t ms);
void render_p38(uint32_t ms);
void render_p39(uint32_t ms);
void render_p40(uint32_t ms);
void render_p41(uint32_t ms);
void render_p42(uint32_t ms);
void render_p43(uint32_t ms);
void render_p44(uint32_t ms);
void render_p45(uint32_t ms);
void render_p46(uint32_t ms);
void render_p47(uint32_t ms);
void render_p48(uint32_t ms);
void render_p49(uint32_t ms);
void render_p50(uint32_t ms);
void render_p51(uint32_t ms);
void renderPattern(uint8_t i, uint32_t ms);

#line 1 "src/main.ino"
// FastLED Studio — generative pattern show (Phase 4, first slice)
#include <FastLED.h>
// INMP441 I2S microphone (ESP32) — new driver on IDF 5+ (the legacy one
// conflicts with FastLED 3.10's audio framework there), legacy before.
#include <esp_idf_version.h>
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
#include <driver/i2s_std.h>
#else
#include <driver/i2s.h>
#endif

// Explicit FastLED-typed declarations keep the Arduino preprocessor
// from injecting its own before <FastLED.h>, which breaks CRGB names.
void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt);
CRGB kelvinToRGB(float kelvin);

#define WIDTH    16
#define HEIGHT   16
#define NUM_LEDS (WIDTH * HEIGHT)
#define DATA_PIN 4
#define PATTERN_COUNT 52

CRGB leds[NUM_LEDS];
CRGB* showA = nullptr;
CRGB* showB = nullptr;
CRGB* p0_buf_j_frame = nullptr;
CRGB* p0_buf_j_flash = nullptr;
CRGB* p0_buf_j_gamma = nullptr;
float* p0_field_j_base = nullptr;
float* p0_field_j_ring = nullptr;
float* p0_field_j_combine = nullptr;
float* p0_field_j_tile = nullptr;
float* p0_field_j_rotate = nullptr;
CRGB* p1_buf_i_particles = nullptr;
CRGB* p1_buf_i_flow = nullptr;
CRGB* p1_buf_i_blend = nullptr;
CRGB* p1_buf_i_gamma = nullptr;
CRGB* p2_buf_h_gabor = nullptr;
CRGB* p2_buf_h_frame = nullptr;
CRGB* p2_buf_h_blend = nullptr;
CRGB* p2_buf_h_blur = nullptr;
CRGB* p2_buf_h_gamma = nullptr;
float* p2_field_h_field = nullptr;
CRGB* p3_buf_g_bloom = nullptr;
CRGB* p3_buf_g_rings = nullptr;
CRGB* p3_buf_g_blend = nullptr;
CRGB* p3_buf_g_shift = nullptr;
CRGB* p3_buf_g_gamma = nullptr;
CRGB* p4_buf_f_audioFlow = nullptr;
CRGB* p4_buf_f_sparks = nullptr;
CRGB* p4_buf_f_blend = nullptr;
CRGB* p4_buf_f_flash = nullptr;
CRGB* p4_buf_f_gamma = nullptr;
CRGB* p5_buf_e_fractal = nullptr;
CRGB* p5_buf_e_formula = nullptr;
CRGB* p5_buf_e_blend = nullptr;
CRGB* p5_buf_e_shift = nullptr;
CRGB* p5_buf_e_gamma = nullptr;
CRGB* p6_buf_d_rd = nullptr;
CRGB* p6_buf_d_waves = nullptr;
CRGB* p6_buf_d_blend = nullptr;
CRGB* p6_buf_d_gamma = nullptr;
CRGB* p7_buf_c_flow = nullptr;
CRGB* p7_buf_c_stars = nullptr;
CRGB* p7_buf_c_blend = nullptr;
CRGB* p7_buf_c_blur = nullptr;
CRGB* p7_buf_c_gamma = nullptr;
CRGB* p8_buf_b_frame = nullptr;
CRGB* p8_buf_b_shift = nullptr;
CRGB* p8_buf_b_gamma = nullptr;
float* p8_field_b_base = nullptr;
float* p8_field_b_ring = nullptr;
float* p8_field_b_combine = nullptr;
float* p8_field_b_rotate = nullptr;
CRGB* p9_buf_a_bloom = nullptr;
CRGB* p9_buf_a_formula = nullptr;
CRGB* p9_buf_a_blend = nullptr;
CRGB* p9_buf_a_blur = nullptr;
CRGB* p9_buf_a_gamma = nullptr;
CRGB* p10_buf_p10_cascade = nullptr;
CRGB* p10_buf_p10_particles = nullptr;
CRGB* p10_buf_p10_stars = nullptr;
CRGB* p10_buf_p10_blendA = nullptr;
CRGB* p10_buf_p10_blendB = nullptr;
CRGB* p10_buf_p10_flash = nullptr;
CRGB* p10_buf_p10_gamma = nullptr;
CRGB* p11_buf_p9_gradient = nullptr;
CRGB* p11_buf_p9_prism = nullptr;
CRGB* p11_buf_p9_tr = nullptr;
CRGB* p11_buf_p9_transform = nullptr;
CRGB* p11_buf_p9_flash = nullptr;
CRGB* p11_buf_p9_gamma = nullptr;
CRGB* p12_buf_p8_fractal = nullptr;
CRGB* p12_buf_p8_stars = nullptr;
CRGB* p12_buf_p8_blend = nullptr;
CRGB* p12_buf_p8_shift = nullptr;
CRGB* p12_buf_p8_gamma = nullptr;
CRGB* p13_buf_p7_bloom = nullptr;
CRGB* p13_buf_p7_flow = nullptr;
CRGB* p13_buf_p7_blend = nullptr;
CRGB* p13_buf_p7_blur = nullptr;
CRGB* p13_buf_p7_gamma = nullptr;
CRGB* p14_buf_p6_custom = nullptr;
CRGB* p14_buf_p6_gradient = nullptr;
CRGB* p14_buf_p6_blend = nullptr;
CRGB* p14_buf_p6_transform = nullptr;
CRGB* p14_buf_p6_gamma = nullptr;
CRGB* p15_buf_p5_frame = nullptr;
CRGB* p15_buf_p5_blur = nullptr;
CRGB* p15_buf_p5_gamma = nullptr;
float* p15_field_p5_src = nullptr;
float* p15_field_p5_ring = nullptr;
float* p15_field_p5_combine = nullptr;
float* p15_field_p5_rotate = nullptr;
CRGB* p16_buf_p4_gabor = nullptr;
CRGB* p16_buf_p4_flow = nullptr;
CRGB* p16_buf_p4_blend = nullptr;
CRGB* p16_buf_p4_flash = nullptr;
CRGB* p16_buf_p4_gamma = nullptr;
CRGB* p17_buf_p3_rd = nullptr;
CRGB* p17_buf_p3_blobs = nullptr;
CRGB* p17_buf_p3_blend = nullptr;
CRGB* p17_buf_p3_gamma = nullptr;
CRGB* p18_buf_p2_frame = nullptr;
CRGB* p18_buf_p2_gamma = nullptr;
float* p18_field_p2_base = nullptr;
float* p18_field_p2_dx = nullptr;
float* p18_field_p2_dy = nullptr;
float* p18_field_p2_warp = nullptr;
float* p18_field_p2_tile = nullptr;
float* p18_field_p2_rotate = nullptr;
CRGB* p19_buf_p1_bars = nullptr;
CRGB* p19_buf_p1_flow = nullptr;
CRGB* p19_buf_p1_tr = nullptr;
CRGB* p19_buf_p1_shift = nullptr;
CRGB* p19_buf_p1_flash = nullptr;
CRGB* p19_buf_p1_gamma = nullptr;
CRGB* p20_buf_i_cascade = nullptr;
CRGB* p20_buf_i_formula = nullptr;
CRGB* p20_buf_i_blend = nullptr;
CRGB* p20_buf_i_flash = nullptr;
CRGB* p20_buf_i_gamma = nullptr;
CRGB* p21_buf_h_bars = nullptr;
CRGB* p21_buf_h_rings = nullptr;
CRGB* p21_buf_h_blend = nullptr;
CRGB* p21_buf_h_transform = nullptr;
CRGB* p21_buf_h_blur = nullptr;
CRGB* p21_buf_h_gamma = nullptr;
CRGB* p22_buf_g_gradient = nullptr;
CRGB* p22_buf_g_stars = nullptr;
CRGB* p22_buf_g_swarm = nullptr;
CRGB* p22_buf_g_starSwarm = nullptr;
CRGB* p22_buf_g_tr = nullptr;
CRGB* p22_buf_g_transform = nullptr;
CRGB* p22_buf_g_gamma = nullptr;
CRGB* p23_buf_f_fractal = nullptr;
CRGB* p23_buf_f_life = nullptr;
CRGB* p23_buf_f_tr = nullptr;
CRGB* p23_buf_f_gamma = nullptr;
CRGB* p24_buf_e_frame = nullptr;
CRGB* p24_buf_e_gamma = nullptr;
float* p24_field_e_base = nullptr;
float* p24_field_e_orbit = nullptr;
float* p24_field_e_combine = nullptr;
float* p24_field_e_dx = nullptr;
float* p24_field_e_dy = nullptr;
float* p24_field_e_warp = nullptr;
float* p24_field_e_rotate = nullptr;
CRGB* p25_buf_d_noise = nullptr;
CRGB* p25_buf_d_waves = nullptr;
CRGB* p25_buf_d_blend = nullptr;
CRGB* p25_buf_d_shift = nullptr;
CRGB* p25_buf_d_blur = nullptr;
CRGB* p25_buf_d_gamma = nullptr;
CRGB* p26_buf_c_audioFlow = nullptr;
CRGB* p26_buf_c_bassRings = nullptr;
CRGB* p26_buf_c_blend = nullptr;
CRGB* p26_buf_c_transform = nullptr;
CRGB* p26_buf_c_gamma = nullptr;
CRGB* p27_buf_b_bloom = nullptr;
CRGB* p27_buf_b_fire = nullptr;
CRGB* p27_buf_b_blend = nullptr;
CRGB* p27_buf_b_shift = nullptr;
CRGB* p27_buf_b_flash = nullptr;
CRGB* p27_buf_b_gamma = nullptr;
CRGB* p28_buf_a_bars = nullptr;
CRGB* p28_buf_a_prism = nullptr;
CRGB* p28_buf_a_tr = nullptr;
CRGB* p28_buf_a_blur = nullptr;
CRGB* p28_buf_a_flash = nullptr;
CRGB* p28_buf_a_gamma = nullptr;
CRGB* p29_buf_p10_flow = nullptr;
CRGB* p29_buf_p10_particles = nullptr;
CRGB* p29_buf_p10_blend = nullptr;
CRGB* p29_buf_p10_transform = nullptr;
CRGB* p29_buf_p10_blur = nullptr;
CRGB* p29_buf_p10_gamma = nullptr;
CRGB* p30_buf_p9_formula = nullptr;
CRGB* p30_buf_p9_gradient = nullptr;
CRGB* p30_buf_p9_blend = nullptr;
CRGB* p30_buf_p9_hueshift = nullptr;
CRGB* p30_buf_p9_gamma = nullptr;
CRGB* p31_buf_p8_fractal = nullptr;
CRGB* p31_buf_p8_life = nullptr;
CRGB* p31_buf_p8_transition = nullptr;
CRGB* p31_buf_p8_blur = nullptr;
CRGB* p31_buf_p8_gamma = nullptr;
CRGB* p32_buf_p7_blobs = nullptr;
CRGB* p32_buf_p7_rd = nullptr;
CRGB* p32_buf_p7_blend = nullptr;
CRGB* p32_buf_p7_transform = nullptr;
CRGB* p32_buf_p7_gamma = nullptr;
CRGB* p33_buf_p6_toFrame = nullptr;
CRGB* p33_buf_p6_blur = nullptr;
CRGB* p33_buf_p6_gamma = nullptr;
float* p33_field_p6_d1 = nullptr;
float* p33_field_p6_d2 = nullptr;
float* p33_field_p6_diff = nullptr;
float* p33_field_p6_tile = nullptr;
float* p33_field_p6_rotate = nullptr;
CRGB* p34_buf_p5_particles = nullptr;
CRGB* p34_buf_p5_stars = nullptr;
CRGB* p34_buf_p5_blend = nullptr;
CRGB* p34_buf_p5_blur = nullptr;
CRGB* p34_buf_p5_flash = nullptr;
CRGB* p34_buf_p5_gamma = nullptr;
CRGB* p35_buf_p4_toFrame = nullptr;
CRGB* p35_buf_p4_flash = nullptr;
CRGB* p35_buf_p4_gamma = nullptr;
float* p35_field_p4_src = nullptr;
float* p35_field_p4_dx = nullptr;
float* p35_field_p4_dy = nullptr;
float* p35_field_p4_warp = nullptr;
float* p35_field_p4_rotate = nullptr;
CRGB* p36_buf_p3_flow = nullptr;
CRGB* p36_buf_p3_gabor = nullptr;
CRGB* p36_buf_p3_blend = nullptr;
CRGB* p36_buf_p3_hueshift = nullptr;
CRGB* p36_buf_p3_gamma = nullptr;
CRGB* p37_buf_p2_stars = nullptr;
CRGB* p37_buf_p2_burst = nullptr;
CRGB* p37_buf_p2_blend = nullptr;
CRGB* p37_buf_p2_transform = nullptr;
CRGB* p37_buf_p2_blur = nullptr;
CRGB* p37_buf_p2_gamma = nullptr;
CRGB* p38_buf_p1_rd = nullptr;
CRGB* p38_buf_p1_gabor = nullptr;
CRGB* p38_buf_p1_blend = nullptr;
CRGB* p38_buf_p1_flash = nullptr;
CRGB* p38_buf_p1_gamma = nullptr;
CRGB* p39_buf_AudioFlow_1 = nullptr;
CRGB* p39_buf_BassRings_1 = nullptr;
CRGB* p39_buf_TrebleSparks_1 = nullptr;
CRGB* p39_buf_Blend_1 = nullptr;
CRGB* p39_buf_Blend_2 = nullptr;
CRGB* p39_buf_Kaleidoscope_1 = nullptr;
CRGB* p39_buf_Transform_1 = nullptr;
CRGB* p39_buf_BeatFlash_1 = nullptr;
CRGB* p39_buf_Blur2D_1 = nullptr;
CRGB* p39_buf_Gamma_1 = nullptr;
CRGB* p40_buf_AudioCascade_1 = nullptr;
CRGB* p40_buf_TrebleSparks_1 = nullptr;
CRGB* p40_buf_Blend_1 = nullptr;
CRGB* p40_buf_Kaleidoscope_1 = nullptr;
CRGB* p40_buf_Transform_1 = nullptr;
CRGB* p41_buf_audio_pattern_10_spiral = nullptr;
CRGB* p41_buf_audio_pattern_10_kaleido = nullptr;
CRGB* p41_buf_audio_pattern_10_flash = nullptr;
CRGB* p42_buf_audio_pattern_9_cascade = nullptr;
CRGB* p42_buf_audio_pattern_9_hue = nullptr;
CRGB* p42_buf_audio_pattern_9_blur = nullptr;
CRGB* p43_buf_audio_pattern_8_prism = nullptr;
CRGB* p43_buf_audio_pattern_8_spin = nullptr;
CRGB* p43_buf_audio_pattern_8_blur = nullptr;
CRGB* p44_buf_audio_pattern_7_bloom = nullptr;
CRGB* p44_buf_audio_pattern_7_kaleido = nullptr;
CRGB* p44_buf_audio_pattern_7_flash = nullptr;
CRGB* p45_buf_audio_pattern_6_rings = nullptr;
CRGB* p45_buf_audio_pattern_6_kaleido = nullptr;
CRGB* p45_buf_audio_pattern_6_flash = nullptr;
CRGB* p46_buf_audio_pattern_5_flow = nullptr;
CRGB* p46_buf_audio_pattern_5_hue = nullptr;
CRGB* p46_buf_audio_pattern_5_kaleido = nullptr;
CRGB* p47_buf_audio_pattern_4_sparks = nullptr;
CRGB* p47_buf_audio_pattern_4_blur = nullptr;
CRGB* p47_buf_audio_pattern_4_flash = nullptr;
CRGB* p48_buf_audio_pattern_3_waves = nullptr;
CRGB* p48_buf_audio_pattern_3_spin = nullptr;
CRGB* p48_buf_audio_pattern_3_blur = nullptr;
CRGB* p49_buf_audio_pattern_2_bars = nullptr;
CRGB* p49_buf_audio_pattern_2_kaleido = nullptr;
CRGB* p49_buf_audio_pattern_2_blur = nullptr;
CRGB* p50_buf_audio_pattern_1_pulse = nullptr;
CRGB* p50_buf_audio_pattern_1_blur = nullptr;
CRGB* p50_buf_audio_pattern_1_hue = nullptr;
CRGB* p51_buf_j_bloom = nullptr;
CRGB* p51_buf_j_sparks = nullptr;
CRGB* p51_buf_j_blend = nullptr;
CRGB* p51_buf_j_transform = nullptr;

// Allocate a render buffer in external PSRAM when present; falls back to the
// internal heap, and halts (rather than crashing on a null write) if neither
// has room.
void* _psAlloc(size_t n) {
  void* p = psramFound() ? ps_malloc(n) : nullptr;
  if (!p) p = malloc(n);
  if (!p) { for (;;) delay(1000); }  // out of memory
  memset(p, 0, n);
  return p;
}

const uint8_t TRANS_POOL[] = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 };
#define TRANS_POOL_N 16

CRGBPalette16 paldef_fire(CRGB(18,0,0), CRGB(47,0,0), CRGB(76,0,0), CRGB(105,0,0), CRGB(136,4,0), CRGB(170,20,0), CRGB(204,37,0), CRGB(238,53,0), CRGB(255,74,0), CRGB(255,100,0), CRGB(255,126,0), CRGB(255,152,0), CRGB(255,174,34), CRGB(255,196,78), CRGB(255,218,123), CRGB(18,0,0));
CRGBPalette16 paldef_ice(CRGB(3,25,38), CRGB(21,56,75), CRGB(39,88,111), CRGB(57,119,148), CRGB(74,146,178), CRGB(92,160,189), CRGB(110,174,200), CRGB(128,187,211), CRGB(147,200,222), CRGB(168,212,232), CRGB(188,225,242), CRGB(209,237,252), CRGB(222,243,255), CRGB(233,247,255), CRGB(244,251,255), CRGB(3,25,38));
CRGBPalette16 paldef_purple(CRGB(27,16,55), CRGB(40,19,80), CRGB(53,23,105), CRGB(66,26,130), CRGB(79,31,155), CRGB(92,39,178), CRGB(105,46,202), CRGB(118,54,225), CRGB(133,68,239), CRGB(151,88,243), CRGB(169,107,247), CRGB(187,127,251), CRGB(203,147,252), CRGB(217,167,253), CRGB(231,188,253), CRGB(27,16,55));
CRGBPalette16 paldef_sunset(CRGB(43,11,63), CRGB(69,16,79), CRGB(95,20,96), CRGB(121,25,112), CRGB(148,32,122), CRGB(178,50,113), CRGB(209,68,104), CRGB(240,85,95), CRGB(255,105,88), CRGB(255,128,83), CRGB(255,151,78), CRGB(255,173,72), CRGB(255,189,89), CRGB(255,201,112), CRGB(255,214,136), CRGB(43,11,63));
CRGBPalette16 paldef_aurora(CRGB(6,24,38), CRGB(8,38,55), CRGB(10,52,71), CRGB(12,66,88), CRGB(15,83,103), CRGB(17,106,117), CRGB(19,129,131), CRGB(22,152,145), CRGB(36,169,150), CRGB(63,182,146), CRGB(90,195,142), CRGB(116,208,138), CRGB(141,218,154), CRGB(165,227,176), CRGB(190,237,199), CRGB(6,24,38));
CRGBPalette16 paldef_synthwave(CRGB(18,1,54), CRGB(41,1,105), CRGB(65,0,155), CRGB(88,0,206), CRGB(116,3,238), CRGB(156,15,212), CRGB(195,27,187), CRGB(235,39,162), CRGB(255,57,129), CRGB(255,82,89), CRGB(255,107,50), CRGB(255,132,10), CRGB(255,156,22), CRGB(255,181,51), CRGB(255,205,80), CRGB(18,1,54));
CRGBPalette16 paldef_cottoncandy(CRGB(91,206,250), CRGB(109,213,244), CRGB(128,219,239), CRGB(146,226,233), CRGB(166,228,229), CRGB(192,214,227), CRGB(217,200,225), CRGB(242,186,223), CRGB(255,181,225), CRGB(255,185,230), CRGB(255,188,236), CRGB(255,192,242), CRGB(255,203,245), CRGB(255,217,247), CRGB(255,231,249), CRGB(91,206,250));
CRGBPalette16 paldef_emberglow(CRGB(27,12,12), CRGB(49,17,17), CRGB(71,22,22), CRGB(93,27,27), CRGB(116,34,29), CRGB(139,45,21), CRGB(162,56,12), CRGB(185,67,4), CRGB(204,80,0), CRGB(220,93,0), CRGB(235,106,0), CRGB(251,120,0), CRGB(255,140,20), CRGB(255,163,48), CRGB(255,186,75), CRGB(27,12,12));
CRGBPalette16 paldef_deepsea(CRGB(3,25,38), CRGB(3,35,59), CRGB(2,45,79), CRGB(2,55,100), CRGB(2,64,118), CRGB(2,71,132), CRGB(3,79,146), CRGB(3,86,159), CRGB(3,96,173), CRGB(3,108,186), CRGB(4,120,200), CRGB(4,132,214), CRGB(26,150,222), CRGB(56,170,229), CRGB(86,191,235), CRGB(3,25,38));
CRGBPalette16 paldef_mojito(CRGB(11,61,32), CRGB(15,79,39), CRGB(20,96,46), CRGB(24,114,53), CRGB(33,131,59), CRGB(59,149,61), CRGB(85,166,63), CRGB(110,183,66), CRGB(136,198,78), CRGB(161,210,99), CRGB(186,222,120), CRGB(211,234,141), CRGB(225,239,156), CRGB(235,243,169), CRGB(245,246,183), CRGB(11,61,32));
CRGBPalette16 paldef_rosegold(CRGB(46,31,39), CRGB(71,48,52), CRGB(96,65,65), CRGB(121,81,78), CRGB(143,97,91), CRGB(157,109,101), CRGB(171,120,112), CRGB(185,132,123), CRGB(197,144,133), CRGB(207,156,142), CRGB(217,169,151), CRGB(227,181,160), CRGB(233,193,171), CRGB(238,206,183), CRGB(242,218,194), CRGB(46,31,39));
CRGBPalette16 paldef_arctic(CRGB(8,27,51), CRGB(13,45,78), CRGB(19,62,105), CRGB(24,80,133), CRGB(33,97,154), CRGB(52,115,159), CRGB(71,133,164), CRGB(90,150,169), CRGB(111,165,179), CRGB(134,177,194), CRGB(158,190,210), CRGB(181,202,225), CRGB(196,213,234), CRGB(209,224,241), CRGB(221,235,248), CRGB(8,27,51));
CRGBPalette16 paldef_citrus(CRGB(39,64,1), CRGB(58,107,1), CRGB(78,149,0), CRGB(97,192,0), CRGB(117,226,5), CRGB(139,234,26), CRGB(160,243,46), CRGB(181,251,67), CRGB(200,249,75), CRGB(217,237,71), CRGB(234,225,68), CRGB(251,213,64), CRGB(255,196,64), CRGB(255,177,64), CRGB(255,159,65), CRGB(39,64,1));
CRGBPalette16 paldef_amethyst(CRGB(20,0,31), CRGB(35,8,51), CRGB(49,15,72), CRGB(64,23,92), CRGB(78,30,113), CRGB(91,34,135), CRGB(104,38,157), CRGB(117,42,180), CRGB(133,55,200), CRGB(153,76,217), CRGB(174,98,234), CRGB(194,120,251), CRGB(207,146,255), CRGB(219,173,255), CRGB(230,201,255), CRGB(20,0,31));
CRGBPalette16 paldef_peacock(CRGB(0,18,25), CRGB(0,39,49), CRGB(0,59,73), CRGB(0,80,97), CRGB(1,98,117), CRGB(3,112,127), CRGB(6,126,136), CRGB(9,140,145), CRGB(28,155,155), CRGB(65,172,166), CRGB(102,189,176), CRGB(139,206,186), CRGB(166,199,151), CRGB(190,184,101), CRGB(214,170,50), CRGB(0,18,25));
CRGBPalette16 paldef_volcano(CRGB(26,15,10), CRGB(44,18,15), CRGB(61,21,19), CRGB(79,24,24), CRGB(96,27,28), CRGB(114,31,32), CRGB(132,36,37), CRGB(149,40,41), CRGB(168,51,48), CRGB(187,70,58), CRGB(207,88,68), CRGB(226,106,78), CRGB(234,121,84), CRGB(237,135,88), CRGB(241,148,93), CRGB(26,15,10));
CRGBPalette16 paldef_meadow(CRGB(16,42,19), CRGB(24,53,28), CRGB(33,63,36), CRGB(41,74,45), CRGB(50,86,52), CRGB(62,101,54), CRGB(74,116,57), CRGB(86,131,60), CRGB(102,146,66), CRGB(121,163,76), CRGB(140,180,86), CRGB(159,197,96), CRGB(178,210,111), CRGB(196,222,128), CRGB(214,235,144), CRGB(16,42,19));
CRGBPalette16 paldef_noir(CRGB(5,7,10), CRGB(10,14,24), CRGB(14,21,38), CRGB(19,28,52), CRGB(24,36,64), CRGB(31,46,73), CRGB(38,56,81), CRGB(45,66,90), CRGB(58,80,102), CRGB(79,98,117), CRGB(100,116,132), CRGB(121,134,147), CRGB(144,155,168), CRGB(168,179,190), CRGB(191,202,212), CRGB(5,7,10));
CRGBPalette16 paldef_coralreef(CRGB(0,59,70), CRGB(2,66,76), CRGB(4,74,81), CRGB(6,81,87), CRGB(13,92,96), CRGB(39,113,118), CRGB(64,134,140), CRGB(89,155,162), CRGB(122,158,163), CRGB(163,143,143), CRGB(204,129,122), CRGB(245,115,102), CRGB(255,132,116), CRGB(255,160,141), CRGB(255,189,167), CRGB(0,59,70));
CRGBPalette16 paldef_ultraviolet(CRGB(11,3,45), CRGB(18,2,52), CRGB(24,1,58), CRGB(31,1,65), CRGB(40,2,76), CRGB(54,8,98), CRGB(68,14,120), CRGB(83,21,143), CRGB(99,31,163), CRGB(117,46,181), CRGB(135,60,199), CRGB(153,74,217), CRGB(170,96,228), CRGB(188,121,237), CRGB(206,145,246), CRGB(11,3,45));
CRGBPalette16 paldef_honeycomb(CRGB(43,22,0), CRGB(69,38,3), CRGB(95,53,5), CRGB(121,69,8), CRGB(145,85,9), CRGB(166,102,7), CRGB(186,118,4), CRGB(207,135,1), CRGB(221,150,9), CRGB(229,164,28), CRGB(236,178,46), CRGB(244,192,64), CRGB(248,205,89), CRGB(250,217,115), CRGB(253,228,142), CRGB(43,22,0));
CRGBPalette16 paldef_laguna(CRGB(4,28,50), CRGB(4,31,52), CRGB(4,35,54), CRGB(4,38,56), CRGB(4,43,61), CRGB(5,51,72), CRGB(5,58,83), CRGB(6,66,94), CRGB(13,80,113), CRGB(28,100,141), CRGB(43,121,169), CRGB(58,141,197), CRGB(83,157,209), CRGB(111,171,217), CRGB(139,185,224), CRGB(4,28,50));
CRGBPalette16 paldef_opal(CRGB(30,42,56), CRGB(43,60,74), CRGB(56,78,91), CRGB(69,96,109), CRGB(84,116,128), CRGB(105,145,151), CRGB(126,174,175), CRGB(147,203,198), CRGB(169,221,216), CRGB(193,229,228), CRGB(217,237,240), CRGB(241,245,252), CRGB(246,236,243), CRGB(246,222,227), CRGB(245,208,210), CRGB(30,42,56));

// ── INMP441 I2S microphone + FFT (on-device audio reactivity) ───────────────
#define MIC_WS   10
#define MIC_SCK  13
#define MIC_SD   14
#define MIC_GAIN  1.000f
#define MIC_AGC   0
#define MIC_NOISE_THRESHOLD 0.100f
#define MIC_NOISE_ATTACK     0.300f
#define MIC_NOISE_DECAY      0.080f
#define MIC_DEBUG 0   // print band levels to serial (~10×/sec)
#define AUDIO_N   512        // FFT size (power of two)
#define AUDIO_SR  16000      // I2S sample rate (Hz)
float _audioBass = 0, _audioMids = 0, _audioTreble = 0, _audioBpm = 120;
bool  _audioBeat = false;
static float _audioBeatFast = 0, _audioBeatSlow = 0, _audioBeatPrevFlux = 0, _audioBeatPrevPrevFlux = 0;
static float _audioPrevSpectrum[32];
static float _audioSpectrum[32];
static bool _audioHavePrevSpectrum = false;
static uint32_t _audioBeatLast = 0;
static float _bassFloor = 0.02f, _midsFloor = 0.02f, _trebleFloor = 0.02f;
static float _bassSmooth = 0, _midsSmooth = 0, _trebleSmooth = 0;
static float _aRe[AUDIO_N], _aIm[AUDIO_N];

// In-place iterative radix-2 FFT (Cooley–Tukey).
void _audioFFT(float* re, float* im, int n) {
  for (int i = 1, j = 0; i < n; i++) {
    int bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { float tr = re[i]; re[i] = re[j]; re[j] = tr; float ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (int len = 2; len <= n; len <<= 1) {
    float ang = -2.0f * PI / len, wr = cos(ang), wi = sin(ang);
    for (int i = 0; i < n; i += len) {
      float cr = 1, ci = 0;
      for (int k = 0; k < len / 2; k++) {
        int a = i + k, b = i + k + len / 2;
        float vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr;        im[a] += vi;
        float ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

float _audioNoiseGate(float raw, float& floor, float& smooth) {
  floor = floor + (raw - floor) * (raw > floor ? 0.0025f : 0.03f);
  floor = constrain(floor, 0.0f, 1.0f);
  float gate = constrain(floor + MIC_NOISE_THRESHOLD, 0.0f, 1.0f);
  float span = 1.0f - gate; if (span < 0.0001f) span = 0.0001f;
  float target = raw > gate ? constrain((raw - gate) / span, 0.0f, 1.0f) : 0.0f;
  float follow = target > smooth ? MIC_NOISE_ATTACK : MIC_NOISE_DECAY;
  smooth = constrain(smooth + (target - smooth) * follow, 0.0f, 1.0f);
  return smooth;
}

#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
// New channel-based I2S driver (IDF 5 / Arduino core 3.x). The legacy
// driver cannot coexist with FastLED 3.10's audio framework on IDF 5.
static i2s_chan_handle_t _micChan = NULL;
void setupAudio() {
#if MIC_DEBUG
  Serial.begin(115200);
#endif
  i2s_chan_config_t chanCfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_AUTO, I2S_ROLE_MASTER);
  i2s_new_channel(&chanCfg, NULL, &_micChan);
  i2s_std_config_t cfg = {
    .clk_cfg  = I2S_STD_CLK_DEFAULT_CONFIG(AUDIO_SR),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
    .gpio_cfg = {
      .mclk = I2S_GPIO_UNUSED,
      .bclk = (gpio_num_t)MIC_SCK,
      .ws   = (gpio_num_t)MIC_WS,
      .dout = I2S_GPIO_UNUSED,
      .din  = (gpio_num_t)MIC_SD,
      .invert_flags = { .mclk_inv = false, .bclk_inv = false, .ws_inv = false },
    },
  };
  cfg.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT;   // INMP441 outputs on the slot its L/R pin selects
  i2s_channel_init_std_mode(_micChan, &cfg);
  i2s_channel_enable(_micChan);
}
#else
// Legacy I2S driver (IDF 4 / Arduino core 2.x).
void setupAudio() {
#if MIC_DEBUG
  Serial.begin(115200);
#endif
  i2s_config_t cfg = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = AUDIO_SR,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = 0,
    .dma_buf_count = 4,
    .dma_buf_len = 256,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };
  i2s_pin_config_t pins = { .bck_io_num = MIC_SCK, .ws_io_num = MIC_WS, .data_out_num = I2S_PIN_NO_CHANGE, .data_in_num = MIC_SD };
  i2s_driver_install(I2S_NUM_0, &cfg, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pins);
}
#endif

// Read one block from the mic, FFT it, split into bass/mid/treble bands.
void updateAudio() {
  static int32_t raw[AUDIO_N];
  size_t bytesRead = 0;
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
  i2s_channel_read(_micChan, raw, sizeof(raw), &bytesRead, 20);   // timeout in ms
#else
  i2s_read(I2S_NUM_0, raw, sizeof(raw), &bytesRead, 20 / portTICK_PERIOD_MS);
#endif
  int got = bytesRead / sizeof(int32_t);
  for (int i = 0; i < AUDIO_N; i++) {
    float s = (i < got) ? (float)(raw[i] >> 8) / 8388608.0f : 0.0f;   // 24-bit sample
    float w = 0.5f - 0.5f * cos(2.0f * PI * i / (AUDIO_N - 1));        // Hann window
    _aRe[i] = s * w; _aIm[i] = 0;
  }
  _audioFFT(_aRe, _aIm, AUDIO_N);
  float binHz = (float)AUDIO_SR / AUDIO_N;
  float bass = 0, mids = 0, treble = 0; int nb = 0, nm = 0, nt = 0;
  for (int i = 1; i < AUDIO_N / 2; i++) {
    float mag = sqrtf(_aRe[i] * _aRe[i] + _aIm[i] * _aIm[i]);
    float hz = i * binHz;
    if (hz < 250)       { bass   += mag; nb++; }
    else if (hz < 2000) { mids   += mag; nm++; }
    else                { treble += mag; nt++; }
  }
  if (nb) bass /= nb; if (nm) mids /= nm; if (nt) treble /= nt;
  static float mx = 0.0001f;                  // slow auto-gain (running peak)
  float peak = max(bass, max(mids, treble));
  if (MIC_AGC) {
    mx = (peak > mx) ? peak : (mx * 0.999f + peak * 0.001f);
    if (mx < 0.0001f) mx = 0.0001f;
  } else {
    mx = 1.0f;
  }
  float agcGain = MIC_GAIN * (MIC_AGC ? (1.0f / mx) : 1.0f);
  _audioBass   = _audioNoiseGate(constrain(bass   * agcGain, 0.0f, 1.0f), _bassFloor, _bassSmooth);
  _audioMids   = _audioNoiseGate(constrain(mids   * agcGain, 0.0f, 1.0f), _midsFloor, _midsSmooth);
  _audioTreble = _audioNoiseGate(constrain(treble * agcGain, 0.0f, 1.0f), _trebleFloor, _trebleSmooth);
  for (int band = 0; band < 32; band++) {
    float t0 = (float)band / 32.0f;
    float t1 = (float)(band + 1) / 32.0f;
    float hz0 = 30.0f * powf(12000.0f / 30.0f, t0);
    float hz1 = 30.0f * powf(12000.0f / 30.0f, t1);
    int startBin = max(1, (int)floorf(hz0 / binHz));
    int endBin = min(AUDIO_N / 2 - 1, max(startBin, (int)ceilf(hz1 / binHz)));
    float acc = 0.0f;
    int count = 0;
    for (int i = startBin; i <= endBin; i++) {
      float mag = sqrtf(_aRe[i] * _aRe[i] + _aIm[i] * _aIm[i]);
      acc += constrain(mag * agcGain, 0.0f, 1.0f);
      count++;
    }
    _audioSpectrum[band] = count > 0 ? constrain(acc / count, 0.0f, 1.0f) : 0.0f;
  }
  _audioBeat = false;
  if (_audioHavePrevSpectrum) {
    float flux = 0.0f;
    float weightSum = 0.0f;
    for (int i = 0; i < 32; i++) {
      float diff = _audioSpectrum[i] - _audioPrevSpectrum[i];
      if (diff < 0.0f) diff = 0.0f;
      float weight = i < 6 ? 2.0f : (i < 12 ? 1.35f : (i < 20 ? 0.85f : 0.45f));
      flux += diff * weight;
      weightSum += weight;
    }
    flux = weightSum > 0.0f ? flux / weightSum : 0.0f;
    _audioBeatFast += (flux - _audioBeatFast) * 0.45f;
    _audioBeatSlow += (flux - _audioBeatSlow) * 0.13f;
    float onset = _audioBeatFast - _audioBeatSlow;
    float baseline = _audioBeatSlow > 0.02f ? _audioBeatSlow : 0.02f;
    float contrast = onset / baseline;
    uint32_t now = millis();
    float gap = _audioBpm > 0.0f ? 60000.0f / _audioBpm * 0.42f : 160.0f;
    if (gap < 160.0f) gap = 160.0f; else if (gap > 600.0f) gap = 600.0f;
    bool isPeak = flux > _audioBeatPrevFlux && _audioBeatPrevFlux >= _audioBeatPrevPrevFlux;
    _audioBeat = (flux > 0.07f && isPeak && onset > 0.07f * 0.45f && contrast > 1.1f && (_audioBeatLast == 0 || now - _audioBeatLast >= (uint32_t)gap));
    if (_audioBeat) {
      if (_audioBeatLast != 0) {
        float interval = now - _audioBeatLast;
        if (interval >= 220.0f && interval <= 1800.0f) {
          float instant = 60000.0f / interval;
          _audioBpm = _audioBpm * 0.65f + instant * 0.35f;
        }
      }
      _audioBeatLast = now;
    }
    _audioBeatPrevPrevFlux = _audioBeatPrevFlux;
    _audioBeatPrevFlux = flux;
  }
  for (int i = 0; i < 32; i++) _audioPrevSpectrum[i] = _audioSpectrum[i];
  _audioHavePrevSpectrum = true;
#if MIC_DEBUG
  { static uint32_t _dbgLast = 0;
    if (millis() - _dbgLast >= 100) { _dbgLast = millis();
      // pk = largest raw 24-bit sample this block (pre-gate, pre-gain):
      // ~0 means the I2S slot is silent (wiring/L-R); big-but-bands-0.00
      // means the mic works and the noise gate/gain needs tuning.
      int32_t _pk = 0;
      for (int i = 0; i < got; i++) { int32_t v = raw[i] >> 8; if (v < 0) v = -v; if (v > _pk) _pk = v; }
      Serial.printf("audio bass=%.2f mids=%.2f treble=%.2f beat=%d bpm=%.0f raw=%d pk=%ld\n",
                    _audioBass, _audioMids, _audioTreble, (int)_audioBeat, _audioBpm, got, (long)_pk); } }
#endif
}

// ── Transitions ─────────────────────────────────────────────────────────────
void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt) {
  switch (type) {
    case 1: {  // wipe (rightward)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      int thr = (int)(tt * WIDTH);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++)
        if (x < thr) out[y*WIDTH+x] = b[y*WIDTH+x];
      break;
    }
    case 2: {  // dissolve
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int i = 0; i < NUM_LEDS; i++) {
        uint32_t h = ((uint32_t)i * 1664525u + 1013904223u);
        if ((h & 0xFFFF) < (uint32_t)(tt * 65535)) out[i] = b[i];
      }
      break;
    }
    case 3: {  // iris
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, r = tt * sqrtf(cx*cx + cy*cy);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float dx = x - cx, dy = y - cy;
        if (sqrtf(dx*dx + dy*dy) < r) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 4: {  // clockwipe
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f;
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float n = (atan2f(x - cx, -(y - cy)) + 3.14159265f) / 6.2831853f;
        if (n < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 5: {  // push (rightward)
      fill_solid(out, NUM_LEDS, CRGB::Black);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        int ax = (int)roundf(x + tt*WIDTH), bx = (int)roundf(x - (1.0f-tt)*WIDTH);
        if (bx >= 0 && bx < WIDTH) out[y*WIDTH+x] = b[y*WIDTH+bx];
        else if (ax >= 0 && ax < WIDTH) out[y*WIDTH+x] = a[y*WIDTH+ax];
      }
      break;
    }
    case 6: {  // checkerboard (tile 4)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float thr = ((x/4 + y/4) % 2 == 0) ? tt*2.0f : tt*2.0f - 1.0f;
        if (thr >= 1.0f) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 7: {  // diagonal
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float n = ((float)x/WIDTH + (float)y/HEIGHT) * 0.5f;
        if (n < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 8: {  // fadeblack
      float al = tt < 0.5f ? 1.0f - tt*2.0f : (tt - 0.5f)*2.0f;
      for (int i = 0; i < NUM_LEDS; i++) { CRGB s = tt < 0.5f ? a[i] : b[i];
        out[i] = CRGB((uint8_t)(s.r*al), (uint8_t)(s.g*al), (uint8_t)(s.b*al)); }
      break;
    }
    case 9: {  // fadewhite
      float al = tt < 0.5f ? 1.0f - tt*2.0f : (tt - 0.5f)*2.0f, w = (1.0f - al)*255.0f;
      for (int i = 0; i < NUM_LEDS; i++) { CRGB s = tt < 0.5f ? a[i] : b[i];
        out[i] = CRGB((uint8_t)(s.r*al+w), (uint8_t)(s.g*al+w), (uint8_t)(s.b*al+w)); }
      break;
    }
    case 10: {  // blinds (4, horizontal)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      int slat = max(1, HEIGHT / 4);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++)
        if ((float)(y % slat) / slat < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      break;
    }
    case 11: {  // ripple
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, maxR = sqrtf(cx*cx+cy*cy), e = 0.08f;
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float dx = x-cx, dy = y-cy, n = sqrtf(dx*dx+dy*dy) / maxR;
        int idx = y*WIDTH+x;
        if (n < tt - e) out[idx] = b[idx];
        else if (n < tt) { float bl = (tt - n) / e; out[idx] = blend(a[idx], b[idx], (uint8_t)(bl*255)); }
      }
      break;
    }
    case 12: {  // spiral (2 turns)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, maxR = sqrtf(cx*cx+cy*cy), k = 1.0f + 1.0f/2.0f;
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float dx = x-cx, dy = y-cy, r = sqrtf(dx*dx+dy*dy) / maxR;
        float na = (atan2f(dy, dx) + 3.14159265f) / 6.2831853f;
        if ((r + na/2.0f) / k < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 13: {  // curtain (horizontal)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++)
        if (fabsf(2.0f*y/HEIGHT - 1.0f) < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      break;
    }
    case 14: {  // scanlines
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float thr = (y % 2 == 0) ? ((float)y/HEIGHT)*0.5f : 0.5f + ((float)(y-1)/HEIGHT)*0.5f;
        if (tt > thr) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 15: {  // zoom
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, sc = max(0.01f, tt);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        int bx = (int)((x-cx)/sc + cx), by = (int)((y-cy)/sc + cy), idx = y*WIDTH+x;
        if (bx >= 0 && bx < WIDTH && by >= 0 && by < HEIGHT)
          out[idx] = blend(out[idx], b[by*WIDTH+bx], (uint8_t)(tt*255));
        else out[idx].nscale8((uint8_t)((1.0f-tt)*255));
      }
      break;
    }
    default: {  // crossfade (0)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      nblend(out, b, NUM_LEDS, (uint8_t)(tt * 255));
      break;
    }
  }
}

// Hash → [0,1) (GLSL fract(sin(...)) — mirrors prnd() in showPreview.ts so the
// device spawns the same particle sparks as the browser preview).
float prnd(float n) { float s = sinf(n * 12.9898f) * 43758.5453f; return s - floorf(s); }


float _fsin8(float x){ return sin8((uint8_t)x); }

float _fcos8(float x){ return cos8((uint8_t)x); }

float _fsin16(float x){ return sin16((uint16_t)x); }

float _fbeatsin8(float bpm, float lo = 0, float hi = 255){ return beatsin8((uint8_t)bpm, (uint8_t)lo, (uint8_t)hi); }

float _fbeatsin16(float bpm, float lo = 0, float hi = 65535){ return beatsin16((uint16_t)bpm, (uint16_t)lo, (uint16_t)hi); }

float _fscale8(float v, float s){ return scale8((uint8_t)v, (uint8_t)s); }

float _fqadd8(float a, float b){ return qadd8((uint8_t)a, (uint8_t)b); }

float _fqsub8(float a, float b){ return qsub8((uint8_t)a, (uint8_t)b); }

float _ftriwave8(float x){ return triwave8((uint8_t)x); }

float _fquadwave8(float x){ return quadwave8((uint8_t)x); }

float _fcubicwave8(float x){ return cubicwave8((uint8_t)x); }

float _fease8InOutQuad(float x){ return ease8InOutQuad((uint8_t)x); }

float _fease8InOutCubic(float x){ return ease8InOutCubic((uint8_t)x); }

float _fblend8(float a, float b, float amt){ return blend8((uint8_t)a, (uint8_t)b, (uint8_t)amt); }

float _flerp8by8(float a, float b, float frac){ return lerp8by8((uint8_t)a, (uint8_t)b, (uint8_t)frac); }

float _flerp16by16(float a, float b, float frac){ return lerp16by16((uint16_t)a, (uint16_t)b, (uint16_t)frac); }

float _fsqrt16(float x){ return sqrt16((uint16_t)x); }

float _fnscale8(float v, float s){ return scale8((uint8_t)v, (uint8_t)s); }

float mapFloat(float x, float inMin, float inMax, float outMin, float outMax) {
  if (inMax == inMin) return outMin;
  return outMin + (x - inMin) * (outMax - outMin) / (inMax - inMin);
}

CRGB kelvinToRGB(float kelvin) {
  float t = constrain(kelvin, 1000.0f, 40000.0f) / 100.0f, r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861f * log(t) - 161.1195681661f; }
  else { r = 329.698727446f * pow(t - 60, -0.1332047592f); g = 288.1221695283f * pow(t - 60, -0.0755148492f); }
  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231f * log(t - 10) - 305.0447927307f;
  return CRGB(constrain((int)r, 0, 255), constrain((int)g, 0, 255), constrain((int)b, 0, 255));
}

fl::XYMap _xyMap = fl::XYMap::constructRectangularGrid(WIDTH, HEIGHT);

float _worleyHash(int x, int y) {
  uint32_t h = (uint32_t)(x * 374761393) + (uint32_t)(y * 668265263);
  h = (h ^ (h >> 13)) * 1274126177u;
  return ((h ^ (h >> 16)) & 0xFFFFFF) / 16777216.0f;
}

void render_p0(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_j_fft_bass_target = constrain(_audioBass * 1.180f, 0.0f, 1.0f), n_j_fft_mids_target = constrain(_audioMids * 1.180f, 0.0f, 1.0f), n_j_fft_treble_target = constrain(_audioTreble * 1.180f, 0.0f, 1.0f);
  static float n_j_fft_bass_smooth = -1, n_j_fft_mids_smooth = -1, n_j_fft_treble_smooth = -1;
  n_j_fft_bass_smooth = n_j_fft_bass_smooth < 0 ? n_j_fft_bass_target : n_j_fft_bass_smooth * 0.760f + n_j_fft_bass_target * 0.240f;
  n_j_fft_mids_smooth = n_j_fft_mids_smooth < 0 ? n_j_fft_mids_target : n_j_fft_mids_smooth * 0.760f + n_j_fft_mids_target * 0.240f;
  n_j_fft_treble_smooth = n_j_fft_treble_smooth < 0 ? n_j_fft_treble_target : n_j_fft_treble_smooth * 0.760f + n_j_fft_treble_target * 0.240f;
  float n_j_fft_bass = n_j_fft_bass_smooth, n_j_fft_mids = n_j_fft_mids_smooth, n_j_fft_treble = n_j_fft_treble_smooth;
  bool n_j_beat_beat = false;
  static float n_j_beat_bpm = 120.0f, n_j_beat_detector_fast = 0.0f, n_j_beat_detector_slow = 0.0f, n_j_beat_detector_prevFlux = 0.0f, n_j_beat_detector_prevPrevFlux = 0.0f;
  static float n_j_beat_detector_prevSpectrum[32]; static bool n_j_beat_detector_ready = false; static uint32_t n_j_beat_detector_lastBeat = 0;
  if (n_j_beat_detector_ready) {
    float _flux = 0.0f, _weightSum = 0.0f;
    for (int _i = 0; _i < 32; _i++) {
      float _diff = _audioSpectrum[_i] - n_j_beat_detector_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;
      float _weight = _i < 6 ? 2.0f : (_i < 12 ? 1.35f : (_i < 20 ? 0.85f : 0.45f)); _flux += _diff * _weight; _weightSum += _weight;
    }
    _flux = _weightSum > 0.0f ? _flux / _weightSum : 0.0f;
    n_j_beat_detector_fast += (_flux - n_j_beat_detector_fast) * 0.4490f;
    n_j_beat_detector_slow += (_flux - n_j_beat_detector_slow) * 0.1374f;
    float _onset = n_j_beat_detector_fast - n_j_beat_detector_slow, _baseline = n_j_beat_detector_slow > 0.02f ? n_j_beat_detector_slow : 0.02f;
    float _gap = constrain(60000.0f / n_j_beat_bpm * 0.42f, 150.0f, 600.0f); uint32_t _now = millis();
    bool _peak = _flux > n_j_beat_detector_prevFlux && n_j_beat_detector_prevFlux >= n_j_beat_detector_prevPrevFlux;
    n_j_beat_beat = _flux > 0.0500f && _peak && _onset > 0.0225f && _onset / _baseline > 1.1f && (n_j_beat_detector_lastBeat == 0 || _now - n_j_beat_detector_lastBeat >= (uint32_t)_gap);
    if (n_j_beat_beat) { if (n_j_beat_detector_lastBeat != 0) { float _interval = _now - n_j_beat_detector_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) n_j_beat_bpm = n_j_beat_bpm * 0.65f + (60000.0f / _interval) * 0.35f; } n_j_beat_detector_lastBeat = _now; }
    n_j_beat_detector_prevPrevFlux = n_j_beat_detector_prevFlux; n_j_beat_detector_prevFlux = _flux;
  }
  for (int _i = 0; _i < 32; _i++) n_j_beat_detector_prevSpectrum[_i] = _audioSpectrum[_i]; n_j_beat_detector_ready = true;
  uint8_t n_j_hue_hue = (uint8_t)(((n_j_fft_bass)*0.5f+(n_j_fft_mids)*0.3f+(n_j_fft_treble)*0.2f)*255);
  CRGBPalette16 pal_j_poline(CRGB(6,20,43), CRGB(14,55,81), CRGB(23,87,116), CRGB(34,116,147), CRGB(44,139,171), CRGB(52,155,189), CRGB(58,165,198), CRGB(63,167,199), CRGB(63,167,199), CRGB(58,170,197), CRGB(55,176,183), CRGB(52,169,146), CRGB(56,172,107), CRGB(77,195,88), CRGB(149,213,137), CRGB(219,238,210));
  { /* FieldFormula: sin8(r*180 + t*(20 + a*90))/255 */
    float a=n_j_fft_bass, b=0; (void)a;(void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=_x, y=_y; (void)x;(void)y;
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float fieldIn=0.0f; (void)fieldIn;
      float _v=_fsin8(r*180 + t*(20 + a*90))/255;
      p0_field_j_base[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}
  { /* DistanceField */
    float _px=n_j_fft_mids, _py=n_j_fft_treble, _sc=1.8; if(_sc<0.0001f)_sc=0.0001f;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _nx=(float)_x/(WIDTH-1>0?WIDTH-1:1),_ny=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);
      float _dx=_nx-_px,_dy=_ny-_py;
      float _d=sqrtf(_dx*_dx+_dy*_dy)/1.41421356f*_sc;
      p0_field_j_ring[_y*WIDTH+_x]=constrain(_d,0.0f,1.0f);}}
  { /* FieldMath: difference */
    for(int _i=0;_i<NUM_LEDS;_i++){
      float _a=p0_field_j_base[_i], _b=p0_field_j_ring[_i];
      p0_field_j_combine[_i]=constrain(fabsf(_a - _b),0.0f,1.0f);}}
  { /* FieldTile */
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      int _sx=(_x*3)%WIDTH,_sy=(_y*3)%HEIGHT;
      p0_field_j_tile[_y*WIDTH+_x]=p0_field_j_combine[_sy*WIDTH+_sx];}}
  { /* FieldRotate */ float _ang=((n_j_hue_hue)+t*0)*0.01745329f;
    float _ca=cosf(-_ang),_sa=sinf(-_ang),_cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _dx=_x-_cx,_dy=_y-_cy;
      int _sx=(((int)roundf(_dx*_ca-_dy*_sa+_cx))%WIDTH+WIDTH)%WIDTH;
      int _sy=(((int)roundf(_dx*_sa+_dy*_ca+_cy))%HEIGHT+HEIGHT)%HEIGHT;
      p0_field_j_rotate[_y*WIDTH+_x]=p0_field_j_tile[_sy*WIDTH+_sx];}}
  { float _br=constrain(1,0.0f,1.0f);
    for(int _i=0;_i<NUM_LEDS;_i++)
      p0_buf_j_frame[_i]=ColorFromPalette(pal_j_poline,(uint8_t)(p0_field_j_rotate[_i]*255),(uint8_t)(_br*255)); }
  {
    ::memmove(p0_buf_j_flash, p0_buf_j_frame, sizeof(CRGB) * NUM_LEDS);
    static float _flash_j_flash = 0;
    if (n_j_beat_beat) _flash_j_flash = 1.0f; else _flash_j_flash *= 0.82;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p0_buf_j_flash[_i].r = qadd8(p0_buf_j_flash[_i].r, (uint8_t)((255 - p0_buf_j_flash[_i].r) * _flash_j_flash));
      p0_buf_j_flash[_i].g = qadd8(p0_buf_j_flash[_i].g, (uint8_t)((255 - p0_buf_j_flash[_i].g) * _flash_j_flash));
      p0_buf_j_flash[_i].b = qadd8(p0_buf_j_flash[_i].b, (uint8_t)((255 - p0_buf_j_flash[_i].b) * _flash_j_flash));
    }
  }
  { ::memmove(p0_buf_j_gamma, p0_buf_j_flash, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p0_buf_j_gamma, NUM_LEDS, 2.180f); }
  ::memmove(leds, p0_buf_j_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p1(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_i_fft_bass_target = constrain(_audioBass * 1.180f, 0.0f, 1.0f), n_i_fft_mids_target = constrain(_audioMids * 1.180f, 0.0f, 1.0f), n_i_fft_treble_target = constrain(_audioTreble * 1.180f, 0.0f, 1.0f);
  static float n_i_fft_bass_smooth = -1, n_i_fft_mids_smooth = -1, n_i_fft_treble_smooth = -1;
  n_i_fft_bass_smooth = n_i_fft_bass_smooth < 0 ? n_i_fft_bass_target : n_i_fft_bass_smooth * 0.760f + n_i_fft_bass_target * 0.240f;
  n_i_fft_mids_smooth = n_i_fft_mids_smooth < 0 ? n_i_fft_mids_target : n_i_fft_mids_smooth * 0.760f + n_i_fft_mids_target * 0.240f;
  n_i_fft_treble_smooth = n_i_fft_treble_smooth < 0 ? n_i_fft_treble_target : n_i_fft_treble_smooth * 0.760f + n_i_fft_treble_target * 0.240f;
  float n_i_fft_bass = n_i_fft_bass_smooth, n_i_fft_mids = n_i_fft_mids_smooth, n_i_fft_treble = n_i_fft_treble_smooth;
  // PaletteSelector — drives OceanColors_p in connected palette-consuming nodes
  // PaletteSelector — drives ForestColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_i_palMix;
  { uint8_t _amt = (uint8_t)((n_i_fft_treble) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_i_palMix[_i] = blend(ColorFromPalette(OceanColors_p, _p), ColorFromPalette(ForestColors_p, _p), _amt); } }
  float n_i_tempRange_result = mapFloat(n_i_fft_treble, 0, 1, 2600, 13000);
  CRGB n_i_temp_color = kelvinToRGB(n_i_tempRange_result);
  { // Particles: snow
    const int _PN=120;
    static float _pa_i_particlesx[_PN], _pa_i_particlesy[_PN], _pa_i_particlesvx[_PN], _pa_i_particlesvy[_PN], _pa_i_particlesl[_PN], _pa_i_particless[_PN]; static uint8_t _pa_i_particlesr[_PN], _pa_i_particlesg[_PN], _pa_i_particlesb[_PN]; static bool _pa_i_particlesinit=false;
    float _rate=n_i_fft_mids; CRGB _pc=n_i_temp_color;
    if(!_pa_i_particlesinit){ for(int i=0;i<_PN;i++) _pa_i_particlesl[i]=0; _pa_i_particlesinit=true; }
    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(_pa_i_particlesl[i]<=0.04f){ _pa_i_particlesx[i]=random8()/255.0f*WIDTH; _pa_i_particlesy[i]=0; _pa_i_particlesvy[i]=random8()/255.0f*0.12f+0.05f; _pa_i_particlesl[i]=0.7f+random8()/255.0f*0.3f; _pa_i_particless[i]=random8()/255.0f*6.28f; _pa_i_particlesr[i]=_pc.r; _pa_i_particlesg[i]=_pc.g; _pa_i_particlesb[i]=_pc.b; break; } }
    for(int i=0;i<_PN;i++){ if(_pa_i_particlesl[i]<=0.04f) continue;
      _pa_i_particlesy[i]+=_pa_i_particlesvy[i]; _pa_i_particlesx[i]+=sin(t*1.5f+_pa_i_particless[i])*0.12f; if(_pa_i_particlesy[i]>=HEIGHT) _pa_i_particlesl[i]=0; }
    fill_solid(p1_buf_i_particles, NUM_LEDS, CRGB::Black);
    for(int i=0;i<_PN;i++){ if(_pa_i_particlesl[i]<=0.04f) continue; int X=(int)(_pa_i_particlesx[i]+0.5f), Y=(int)(_pa_i_particlesy[i]+0.5f);
      if(X>=0&&X<WIDTH&&Y>=0&&Y<HEIGHT){ float _k=min(1.0f,_pa_i_particlesl[i]); p1_buf_i_particles[Y*WIDTH+X]+=CRGB((uint8_t)(_pc.r*_k),(uint8_t)(_pc.g*_k),(uint8_t)(_pc.b*_k)); } } }
  { // Flow field
    static float _fpx_i_flow[74], _fpy_i_flow[74], _ftr_i_flow[NUM_LEDS]; static bool _fi_i_flow=false;
    if(!_fi_i_flow){ for(int _i=0;_i<74;_i++){ _fpx_i_flow[_i]=(random8()/255.0f)*WIDTH; _fpy_i_flow[_i]=(random8()/255.0f)*HEIGHT; } for(int _i=0;_i<NUM_LEDS;_i++)_ftr_i_flow[_i]=0; _fi_i_flow=true; }
    float _spd=(constrain((n_i_fft_bass), 0.0f, 1.0f) * 1.500f),_sc=(constrain((n_i_fft_mids), 0.0f, 1.0f) * 1.000f); uint16_t _z=(uint16_t)(t*100);
    for(int _i=0;_i<NUM_LEDS;_i++) _ftr_i_flow[_i]*=0.94f;
    for(int _i=0;_i<74;_i++){
      float _a=(inoise8((uint16_t)(_fpx_i_flow[_i]*_sc*256),(uint16_t)(_fpy_i_flow[_i]*_sc*256),_z)/255.0f)*6.2831f*2;
      _fpx_i_flow[_i]=fmodf(_fpx_i_flow[_i]+cos(_a)*_spd*0.6f+WIDTH,WIDTH); _fpy_i_flow[_i]=fmodf(_fpy_i_flow[_i]+sin(_a)*_spd*0.6f+HEIGHT,HEIGHT);
      int _xi=(int)_fpx_i_flow[_i],_yi=(int)_fpy_i_flow[_i]; if(_xi>=0&&_xi<WIDTH&&_yi>=0&&_yi<HEIGHT){ int _id=_yi*WIDTH+_xi; _ftr_i_flow[_id]=min(1.0f,_ftr_i_flow[_id]+0.5f); } }
    for(int _i=0;_i<NUM_LEDS;_i++) p1_buf_i_flow[_i]=ColorFromPalette(pal_i_palMix,(uint8_t)(_ftr_i_flow[_i]*255)); }
  { ::memmove(p1_buf_i_blend, p1_buf_i_flow, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.14); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p1_buf_i_blend[_i], _b=p1_buf_i_particles[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p1_buf_i_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { ::memmove(p1_buf_i_gamma, p1_buf_i_blend, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p1_buf_i_gamma, NUM_LEDS, 2.140f); }
  ::memmove(leds, p1_buf_i_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p2(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_h_fft_bass_target = constrain(_audioBass * 1.180f, 0.0f, 1.0f), n_h_fft_mids_target = constrain(_audioMids * 1.180f, 0.0f, 1.0f), n_h_fft_treble_target = constrain(_audioTreble * 1.180f, 0.0f, 1.0f);
  static float n_h_fft_bass_smooth = -1, n_h_fft_mids_smooth = -1, n_h_fft_treble_smooth = -1;
  n_h_fft_bass_smooth = n_h_fft_bass_smooth < 0 ? n_h_fft_bass_target : n_h_fft_bass_smooth * 0.760f + n_h_fft_bass_target * 0.240f;
  n_h_fft_mids_smooth = n_h_fft_mids_smooth < 0 ? n_h_fft_mids_target : n_h_fft_mids_smooth * 0.760f + n_h_fft_mids_target * 0.240f;
  n_h_fft_treble_smooth = n_h_fft_treble_smooth < 0 ? n_h_fft_treble_target : n_h_fft_treble_smooth * 0.760f + n_h_fft_treble_target * 0.240f;
  float n_h_fft_bass = n_h_fft_bass_smooth, n_h_fft_mids = n_h_fft_mids_smooth, n_h_fft_treble = n_h_fft_treble_smooth;
  CRGBPalette16 pal_h_poline(CRGB(10,16,34), CRGB(22,47,109), CRGB(24,72,188), CRGB(24,72,188), CRGB(42,101,240), CRGB(85,134,250), CRGB(115,156,254), CRGB(125,164,255), CRGB(125,164,255), CRGB(129,167,255), CRGB(141,175,255), CRGB(159,188,255), CRGB(183,205,255), CRGB(183,205,255), CRGB(212,225,255), CRGB(242,246,255));
  float n_h_gaborFreq_result = mapFloat(n_h_fft_treble, 0, 1, 0.5, 1.8);
  { // Gabor noise
    float _spd=(constrain((n_h_fft_bass), 0.0f, 1.0f) * 1.500f),_sc=(constrain((n_h_fft_mids), 0.0f, 1.0f) * 0.500f),_fr=n_h_gaborFreq_result,_om=90*0.01745329f,_co=cos(_om),_si=sin(_om);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _v=0;
      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){
        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy),_h2=_worleyHash(_cx+31,_cy-17);
        float _fx=_cx+0.5f+(_h-0.5f),_fy=_cy+0.5f+(_h2-0.5f);
        float _dx=_px-_fx,_dy=_py-_fy,_g=expf(-2.5f*(_dx*_dx+_dy*_dy));
        float _proj=_dx*_co+_dy*_si,_w=_h2<0.5f?1.0f:-1.0f;
        _v+=_w*_g*cosf(6.2831853f*_fr*_proj+t*_spd+_h*6.2831853f); }
      p2_buf_h_gabor[_y*WIDTH+_x]=ColorFromPalette(pal_h_poline,(uint8_t)((_v*0.5f+0.5f)*255));}}
  { /* FieldFormula: sin8((x*10 + y*6) + t*(18 + a*70))/255 */
    float a=n_h_fft_bass, b=0; (void)a;(void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=_x, y=_y; (void)x;(void)y;
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float fieldIn=0.0f; (void)fieldIn;
      float _v=_fsin8((x*10 + y*6) + t*(18 + a*70))/255;
      p2_field_h_field[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}
  { float _br=constrain(1,0.0f,1.0f);
    for(int _i=0;_i<NUM_LEDS;_i++)
      p2_buf_h_frame[_i]=ColorFromPalette(pal_h_poline,(uint8_t)(p2_field_h_field[_i]*255),(uint8_t)(_br*255)); }
  { ::memmove(p2_buf_h_blend, p2_buf_h_gabor, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.16); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p2_buf_h_blend[_i], _b=p2_buf_h_frame[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p2_buf_h_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  ::memmove(p2_buf_h_blur, p2_buf_h_blend, sizeof(CRGB) * NUM_LEDS); blur2d(p2_buf_h_blur, WIDTH, HEIGHT, 46, _xyMap);
  { ::memmove(p2_buf_h_gamma, p2_buf_h_blur, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p2_buf_h_gamma, NUM_LEDS, 2.300f); }
  ::memmove(leds, p2_buf_h_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p3(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_g_fft_bass_target = constrain(_audioBass * 1.180f, 0.0f, 1.0f), n_g_fft_mids_target = constrain(_audioMids * 1.180f, 0.0f, 1.0f), n_g_fft_treble_target = constrain(_audioTreble * 1.180f, 0.0f, 1.0f);
  static float n_g_fft_bass_smooth = -1, n_g_fft_mids_smooth = -1, n_g_fft_treble_smooth = -1;
  n_g_fft_bass_smooth = n_g_fft_bass_smooth < 0 ? n_g_fft_bass_target : n_g_fft_bass_smooth * 0.760f + n_g_fft_bass_target * 0.240f;
  n_g_fft_mids_smooth = n_g_fft_mids_smooth < 0 ? n_g_fft_mids_target : n_g_fft_mids_smooth * 0.760f + n_g_fft_mids_target * 0.240f;
  n_g_fft_treble_smooth = n_g_fft_treble_smooth < 0 ? n_g_fft_treble_target : n_g_fft_treble_smooth * 0.760f + n_g_fft_treble_target * 0.240f;
  float n_g_fft_bass = n_g_fft_bass_smooth, n_g_fft_mids = n_g_fft_mids_smooth, n_g_fft_treble = n_g_fft_treble_smooth;
  uint8_t n_g_hue_hue = (uint8_t)(((n_g_fft_bass)*0.5f+(n_g_fft_mids)*0.3f+(n_g_fft_treble)*0.2f)*255);
  CRGB n_g_hsv_color = CHSV((uint8_t)((n_g_hue_hue) / 360.0f * 255), (uint8_t)((0.85) * 255), (uint8_t)((1) * 255));
  // PaletteSelector — drives ForestColors_p in connected palette-consuming nodes
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_g_palMix;
  { uint8_t _amt = (uint8_t)((n_g_fft_treble) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_g_palMix[_i] = blend(ColorFromPalette(ForestColors_p, _p), ColorFromPalette(PartyColors_p, _p), _amt); } }
  {
    float _m = n_g_fft_mids, _intensity = n_g_fft_bass, _spd = n_g_fft_treble;
    float _mAmt = min(1.0f, max(0.0f, _m));
    float _strength = min(1.0f, max(0.0f, _intensity));
    float _motion = min(1.0f, max(0.0f, _spd)) * (0.8f + _mAmt * 2.2f * _strength);
    float _cx0 = (WIDTH - 1) / 2.0f, _cy0 = (HEIGHT - 1) / 2.0f;
    float _sx = max(1.0f, WIDTH / 2.0f), _sy = max(1.0f, HEIGHT / 2.0f);
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _cx = (_x - _cx0) / _sx, _cy = (_y - _cy0) / _sy;
      float _radial = sqrtf(_cx * _cx + _cy * _cy);
      float _swirl = sinf((_cx * _cx - _cy * _cy) * 6 + t * _motion * 3.2f) + cosf((_cx + _cy) * 4 - t * _motion * 2.4f);
      float _bloom = sinf(_radial * (5.0f + _mAmt * 8.0f * _strength) * 3.14159265f - t * _motion * 4.0f + _swirl * 0.6f);
      float _crisp = powf(max(0.0f, _bloom * 0.5f + 0.5f), 1.8f);
      float _v = min(1.0f, _crisp * (0.22f + _mAmt * 0.78f * _strength));
      float _pt = _radial * 0.6f + _swirl * 0.12f + t * _motion * 0.05f;
      p3_buf_g_bloom[_y * WIDTH + _x] = ColorFromPalette(pal_g_palMix, (uint8_t)(_pt * 255));
      p3_buf_g_bloom[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));
    }
  }
  {
    float _b = min(1.0f, max(0.0f, n_g_fft_bass));
    float _strength = min(1.0f, max(0.0f, n_g_fft_mids));
    float _spd = min(1.0f, max(0.0f, n_g_fft_treble));
    float _cx = WIDTH * 0.5f, _cy = HEIGHT * 0.5f, _maxD = sqrtf(_cx * _cx + _cy * _cy);
    float _motion = _spd * (0.75f + _b * 1.75f * _strength);
    float _phase = t * (1.2f + _motion * 4.8f);
    float _rings = 4.0f + _b * 8.0f * _strength;
    float _floor = 0.04f + _b * 0.1f * _strength;
    float _gain = 0.16f + _b * 0.84f * _strength;
    CRGB _base = n_g_hsv_color;
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _dx = _x - _cx, _dy = _y - _cy;
      float _dist = sqrtf(_dx * _dx + _dy * _dy) / max(0.0001f, _maxD);
      float _wave = sinf(_dist * _rings * 6.2831853f - _phase);
      float _crisp = powf(max(0.0f, _wave * 0.5f + 0.5f), 2.4f);
      float _v = min(1.0f, _floor + _crisp * _gain);
      int _i = _y * WIDTH + _x;
      p3_buf_g_rings[_i] = _base;
      p3_buf_g_rings[_i].nscale8((uint8_t)(_v * 255));
    }
  }
  { ::memmove(p3_buf_g_blend, p3_buf_g_bloom, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.22); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p3_buf_g_blend[_i], _b=p3_buf_g_rings[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=_av<0.5f?2.0f*_av*_bv:1.0f-2.0f*(1.0f-_av)*(1.0f-_bv);
        p3_buf_g_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { ::memmove(p3_buf_g_shift, p3_buf_g_blend, sizeof(CRGB) * NUM_LEDS); uint8_t _sh = (uint8_t)((n_g_hue_hue) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) p3_buf_g_shift[_i] = CHSV(rgb2hsv_approximate(p3_buf_g_shift[_i]).hue + _sh, rgb2hsv_approximate(p3_buf_g_shift[_i]).sat, rgb2hsv_approximate(p3_buf_g_shift[_i]).val); }
  { ::memmove(p3_buf_g_gamma, p3_buf_g_shift, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p3_buf_g_gamma, NUM_LEDS, 2.240f); }
  ::memmove(leds, p3_buf_g_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p4(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_f_fft_bass_target = constrain(_audioBass * 1.180f, 0.0f, 1.0f), n_f_fft_mids_target = constrain(_audioMids * 1.180f, 0.0f, 1.0f), n_f_fft_treble_target = constrain(_audioTreble * 1.180f, 0.0f, 1.0f);
  static float n_f_fft_bass_smooth = -1, n_f_fft_mids_smooth = -1, n_f_fft_treble_smooth = -1;
  n_f_fft_bass_smooth = n_f_fft_bass_smooth < 0 ? n_f_fft_bass_target : n_f_fft_bass_smooth * 0.760f + n_f_fft_bass_target * 0.240f;
  n_f_fft_mids_smooth = n_f_fft_mids_smooth < 0 ? n_f_fft_mids_target : n_f_fft_mids_smooth * 0.760f + n_f_fft_mids_target * 0.240f;
  n_f_fft_treble_smooth = n_f_fft_treble_smooth < 0 ? n_f_fft_treble_target : n_f_fft_treble_smooth * 0.760f + n_f_fft_treble_target * 0.240f;
  float n_f_fft_bass = n_f_fft_bass_smooth, n_f_fft_mids = n_f_fft_mids_smooth, n_f_fft_treble = n_f_fft_treble_smooth;
  bool n_f_beat_beat = false;
  static float n_f_beat_bpm = 120.0f, n_f_beat_detector_fast = 0.0f, n_f_beat_detector_slow = 0.0f, n_f_beat_detector_prevFlux = 0.0f, n_f_beat_detector_prevPrevFlux = 0.0f;
  static float n_f_beat_detector_prevSpectrum[32]; static bool n_f_beat_detector_ready = false; static uint32_t n_f_beat_detector_lastBeat = 0;
  if (n_f_beat_detector_ready) {
    float _flux = 0.0f, _weightSum = 0.0f;
    for (int _i = 0; _i < 32; _i++) {
      float _diff = _audioSpectrum[_i] - n_f_beat_detector_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;
      float _weight = _i < 6 ? 2.0f : (_i < 12 ? 1.35f : (_i < 20 ? 0.85f : 0.45f)); _flux += _diff * _weight; _weightSum += _weight;
    }
    _flux = _weightSum > 0.0f ? _flux / _weightSum : 0.0f;
    n_f_beat_detector_fast += (_flux - n_f_beat_detector_fast) * 0.4490f;
    n_f_beat_detector_slow += (_flux - n_f_beat_detector_slow) * 0.1374f;
    float _onset = n_f_beat_detector_fast - n_f_beat_detector_slow, _baseline = n_f_beat_detector_slow > 0.02f ? n_f_beat_detector_slow : 0.02f;
    float _gap = constrain(60000.0f / n_f_beat_bpm * 0.42f, 150.0f, 600.0f); uint32_t _now = millis();
    bool _peak = _flux > n_f_beat_detector_prevFlux && n_f_beat_detector_prevFlux >= n_f_beat_detector_prevPrevFlux;
    n_f_beat_beat = _flux > 0.0500f && _peak && _onset > 0.0225f && _onset / _baseline > 1.1f && (n_f_beat_detector_lastBeat == 0 || _now - n_f_beat_detector_lastBeat >= (uint32_t)_gap);
    if (n_f_beat_beat) { if (n_f_beat_detector_lastBeat != 0) { float _interval = _now - n_f_beat_detector_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) n_f_beat_bpm = n_f_beat_bpm * 0.65f + (60000.0f / _interval) * 0.35f; } n_f_beat_detector_lastBeat = _now; }
    n_f_beat_detector_prevPrevFlux = n_f_beat_detector_prevFlux; n_f_beat_detector_prevFlux = _flux;
  }
  for (int _i = 0; _i < 32; _i++) n_f_beat_detector_prevSpectrum[_i] = _audioSpectrum[_i]; n_f_beat_detector_ready = true;
  CRGBPalette16 pal_f_poline(CRGB(8,32,58), CRGB(12,78,114), CRGB(13,125,172), CRGB(11,169,227), CRGB(33,194,249), CRGB(63,206,253), CRGB(82,213,254), CRGB(88,215,255), CRGB(88,215,255), CRGB(90,212,255), CRGB(97,206,255), CRGB(110,198,255), CRGB(131,195,255), CRGB(160,199,255), CRGB(198,216,255), CRGB(242,245,255));
  { float _b=n_f_fft_bass,_m=n_f_fft_mids,_tr=n_f_fft_treble,_spd=(0.000f + constrain((n_f_fft_mids), 0.0f, 1.0f) * 0.200f),_sc=(0.000f + constrain((n_f_fft_bass), 0.0f, 1.0f) * 0.200f);
    float _flow=t*_spd*(0.2f+_m*1.5f); uint8_t _bright=(uint8_t)(min(1.0f,0.3f+_b)*255);
    float _vamp=0.2f+_tr*0.7f+_b*0.3f;
    float _vflow=((float)inoise8((uint16_t)((t*_spd*4.0f+50)*256),4429)/128.0f-1.0f)*_vamp;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      uint8_t _v=inoise8((uint16_t)((_x*_sc+_flow)*256),(uint16_t)((_y*_sc*0.6f+_vflow+8.0f)*256));
      p4_buf_f_audioFlow[_y*WIDTH+_x]=ColorFromPalette(pal_f_poline,(uint8_t)(_v+_tr*80)); p4_buf_f_audioFlow[_y*WIDTH+_x].nscale8(_bright);}}
  CRGB n_f_sample_color = ColorFromPalette(pal_f_poline, (uint8_t)((n_f_fft_bass)*255));
  {
    float _t = n_f_fft_treble, _d = n_f_fft_mids;
    fadeToBlackBy(p4_buf_f_sparks, NUM_LEDS, (uint8_t)(110 + (1.0f - constrain(_t, 0.0f, 1.0f)) * 40));
    int _spawns = (int)(NUM_LEDS * constrain(_d, 0.0f, 1.0f) * (0.03f + constrain(_t, 0.0f, 1.0f) * 0.12f));
    if (_spawns < 1 && _d * _t > 0.05f) _spawns = 1;
    uint8_t _spawnChance = (uint8_t)(51 + constrain(_t, 0.0f, 1.0f) * 204);
    for (int _s = 0; _s < _spawns; _s++) if (random8() <= _spawnChance) {
      int _x = random16(WIDTH), _y = random16(HEIGHT), _i = _y * WIDTH + _x;
      CRGB _spark = blend(n_f_sample_color, CRGB::White, (uint8_t)(89 + constrain(_t, 0.0f, 1.0f) * 89));
      _spark.nscale8((uint8_t)(min(255.0f, (0.7f + constrain(_t, 0.0f, 1.0f) * 0.6f) * (140 + random8(116)))));
      p4_buf_f_sparks[_i] += _spark;
      CRGB _edge = _spark; _edge.nscale8((uint8_t)(107));
      if (_x > 0) p4_buf_f_sparks[_i - 1] += _edge; if (_x + 1 < WIDTH) p4_buf_f_sparks[_i + 1] += _edge;
      if (_y > 0) p4_buf_f_sparks[_i - WIDTH] += _edge; if (_y + 1 < HEIGHT) p4_buf_f_sparks[_i + WIDTH] += _edge;
      CRGB _corner = _spark; _corner.nscale8((uint8_t)(41));
      if (_x > 0 && _y > 0) p4_buf_f_sparks[_i - WIDTH - 1] += _corner;
      if (_x + 1 < WIDTH && _y > 0) p4_buf_f_sparks[_i - WIDTH + 1] += _corner;
      if (_x > 0 && _y + 1 < HEIGHT) p4_buf_f_sparks[_i + WIDTH - 1] += _corner;
      if (_x + 1 < WIDTH && _y + 1 < HEIGHT) p4_buf_f_sparks[_i + WIDTH + 1] += _corner;
    }
  }
  { ::memmove(p4_buf_f_blend, p4_buf_f_audioFlow, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.18); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p4_buf_f_blend[_i], _b=p4_buf_f_sparks[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p4_buf_f_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  {
    ::memmove(p4_buf_f_flash, p4_buf_f_blend, sizeof(CRGB) * NUM_LEDS);
    static float _flash_f_flash = 0;
    if (n_f_beat_beat) _flash_f_flash = 1.0f; else _flash_f_flash *= 0.86;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p4_buf_f_flash[_i].r = qadd8(p4_buf_f_flash[_i].r, (uint8_t)((255 - p4_buf_f_flash[_i].r) * _flash_f_flash));
      p4_buf_f_flash[_i].g = qadd8(p4_buf_f_flash[_i].g, (uint8_t)((255 - p4_buf_f_flash[_i].g) * _flash_f_flash));
      p4_buf_f_flash[_i].b = qadd8(p4_buf_f_flash[_i].b, (uint8_t)((255 - p4_buf_f_flash[_i].b) * _flash_f_flash));
    }
  }
  { ::memmove(p4_buf_f_gamma, p4_buf_f_flash, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p4_buf_f_gamma, NUM_LEDS, 2.160f); }
  ::memmove(leds, p4_buf_f_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p5(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_e_fft_bass_target = constrain(_audioBass * 1.180f, 0.0f, 1.0f), n_e_fft_mids_target = constrain(_audioMids * 1.180f, 0.0f, 1.0f), n_e_fft_treble_target = constrain(_audioTreble * 1.180f, 0.0f, 1.0f);
  static float n_e_fft_bass_smooth = -1, n_e_fft_mids_smooth = -1, n_e_fft_treble_smooth = -1;
  n_e_fft_bass_smooth = n_e_fft_bass_smooth < 0 ? n_e_fft_bass_target : n_e_fft_bass_smooth * 0.760f + n_e_fft_bass_target * 0.240f;
  n_e_fft_mids_smooth = n_e_fft_mids_smooth < 0 ? n_e_fft_mids_target : n_e_fft_mids_smooth * 0.760f + n_e_fft_mids_target * 0.240f;
  n_e_fft_treble_smooth = n_e_fft_treble_smooth < 0 ? n_e_fft_treble_target : n_e_fft_treble_smooth * 0.760f + n_e_fft_treble_target * 0.240f;
  float n_e_fft_bass = n_e_fft_bass_smooth, n_e_fft_mids = n_e_fft_mids_smooth, n_e_fft_treble = n_e_fft_treble_smooth;
  uint8_t n_e_hue_hue = (uint8_t)(((n_e_fft_bass)*0.5f+(n_e_fft_mids)*0.3f+(n_e_fft_treble)*0.2f)*255);
  CRGBPalette16 pal_e_poline(CRGB(19,12,43), CRGB(43,23,90), CRGB(65,33,136), CRGB(65,33,136), CRGB(84,40,176), CRGB(98,45,207), CRGB(111,60,214), CRGB(116,66,216), CRGB(116,66,216), CRGB(120,62,217), CRGB(138,54,220), CRGB(176,49,227), CRGB(230,60,237), CRGB(230,60,237), CRGB(248,96,218), CRGB(255,155,217));
  { // Fractal noise (fBm via inoise8)
    float _spd=(constrain((n_e_fft_bass), 0.0f, 1.0f) * 1.200f),_sc=(constrain((n_e_fft_mids), 0.0f, 1.0f) * 0.500f); uint16_t _z=(uint16_t)(t*_spd*40);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _v=0,_amp=0.5f,_norm=0,_freq=_sc*96;
      for(int _o=0;_o<5;_o++){
        _v+=_amp*(inoise8((uint16_t)(_x*_freq),(uint16_t)(_y*_freq),_z)/255.0f);
        _norm+=_amp; _amp*=0.5f; _freq*=2; }
      p5_buf_e_fractal[_y*WIDTH+_x]=ColorFromPalette(pal_e_poline,(uint8_t)((_v/_norm)*255));}}
  { /* CustomFormula: sin((r*10 - t*(0.5 + a*3)) + cos(angle*5 + t*(0.4 + b*3))*2.5)*0.5+0.5 */
    float a=n_e_fft_bass, b=n_e_fft_treble; (void)a; (void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=(float)_x/(WIDTH-1>0?WIDTH-1:1),y=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float _v=sin((r*10 - t*(0.5 + a*3)) + cos(angle*5 + t*(0.4 + b*3))*2.5)*0.5+0.5;
      p5_buf_e_formula[_y*WIDTH+_x]=ColorFromPalette(pal_e_poline,(uint8_t)(fmod(fmod(_v,1)+1,1)*255));}}
  { ::memmove(p5_buf_e_blend, p5_buf_e_fractal, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.24); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p5_buf_e_blend[_i], _b=p5_buf_e_formula[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p5_buf_e_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { ::memmove(p5_buf_e_shift, p5_buf_e_blend, sizeof(CRGB) * NUM_LEDS); uint8_t _sh = (uint8_t)((n_e_hue_hue) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) p5_buf_e_shift[_i] = CHSV(rgb2hsv_approximate(p5_buf_e_shift[_i]).hue + _sh, rgb2hsv_approximate(p5_buf_e_shift[_i]).sat, rgb2hsv_approximate(p5_buf_e_shift[_i]).val); }
  { ::memmove(p5_buf_e_gamma, p5_buf_e_shift, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p5_buf_e_gamma, NUM_LEDS, 2.260f); }
  ::memmove(leds, p5_buf_e_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p6(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_d_fft_bass_target = constrain(_audioBass * 1.180f, 0.0f, 1.0f), n_d_fft_mids_target = constrain(_audioMids * 1.180f, 0.0f, 1.0f), n_d_fft_treble_target = constrain(_audioTreble * 1.180f, 0.0f, 1.0f);
  static float n_d_fft_bass_smooth = -1, n_d_fft_mids_smooth = -1, n_d_fft_treble_smooth = -1;
  n_d_fft_bass_smooth = n_d_fft_bass_smooth < 0 ? n_d_fft_bass_target : n_d_fft_bass_smooth * 0.760f + n_d_fft_bass_target * 0.240f;
  n_d_fft_mids_smooth = n_d_fft_mids_smooth < 0 ? n_d_fft_mids_target : n_d_fft_mids_smooth * 0.760f + n_d_fft_mids_target * 0.240f;
  n_d_fft_treble_smooth = n_d_fft_treble_smooth < 0 ? n_d_fft_treble_target : n_d_fft_treble_smooth * 0.760f + n_d_fft_treble_target * 0.240f;
  float n_d_fft_bass = n_d_fft_bass_smooth, n_d_fft_mids = n_d_fft_mids_smooth, n_d_fft_treble = n_d_fft_treble_smooth;
  // PaletteSelector — drives ForestColors_p in connected palette-consuming nodes
  // PaletteSelector — drives OceanColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_d_palMix;
  { uint8_t _amt = (uint8_t)((n_d_fft_treble) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_d_palMix[_i] = blend(ColorFromPalette(ForestColors_p, _p), ColorFromPalette(OceanColors_p, _p), _amt); } }
  float n_d_rdFeed_result = mapFloat(n_d_fft_bass, 0, 1, 0.044, 0.066);
  float n_d_rdKill_result = mapFloat(n_d_fft_mids, 0, 1, 0.05, 0.064);
  { // ReactionDiffusion (Gray-Scott)
    static float _u_d_rd[NUM_LEDS], _v_d_rd[NUM_LEDS], _un_d_rd[NUM_LEDS], _vn_d_rd[NUM_LEDS]; static bool _rd_d_rd = false;
    if (!_rd_d_rd) { for (int _i = 0; _i < NUM_LEDS; _i++) { _u_d_rd[_i] = 1; _v_d_rd[_i] = 0; }
      for (int _y = HEIGHT/2-2; _y <= HEIGHT/2+1; _y++) for (int _x = WIDTH/2-2; _x <= WIDTH/2+1; _x++)
        if (_x>=0&&_x<WIDTH&&_y>=0&&_y<HEIGHT) { _u_d_rd[_y*WIDTH+_x]=0.5f; _v_d_rd[_y*WIDTH+_x]=0.5f; } _rd_d_rd=true; }
    float _f=n_d_rdFeed_result, _k=n_d_rdKill_result;
    for (int _it=0; _it<10; _it++) {
      for (int _y=0; _y<HEIGHT; _y++) { int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;
        for (int _x=0; _x<WIDTH; _x++) { int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;
          float _lu=(_u_d_rd[_ym+_x]+_u_d_rd[_yp+_x]+_u_d_rd[_yr+_xm]+_u_d_rd[_yr+_xp])*0.2f+(_u_d_rd[_ym+_xm]+_u_d_rd[_ym+_xp]+_u_d_rd[_yp+_xm]+_u_d_rd[_yp+_xp])*0.05f-_u_d_rd[_i];
          float _lv=(_v_d_rd[_ym+_x]+_v_d_rd[_yp+_x]+_v_d_rd[_yr+_xm]+_v_d_rd[_yr+_xp])*0.2f+(_v_d_rd[_ym+_xm]+_v_d_rd[_ym+_xp]+_v_d_rd[_yp+_xm]+_v_d_rd[_yp+_xp])*0.05f-_v_d_rd[_i];
          float _uvv=_u_d_rd[_i]*_v_d_rd[_i]*_v_d_rd[_i];
          _un_d_rd[_i]=constrain(_u_d_rd[_i]+0.16f*_lu-_uvv+_f*(1-_u_d_rd[_i]),0.0f,1.0f);
          _vn_d_rd[_i]=constrain(_v_d_rd[_i]+0.08f*_lv+_uvv-(_k+_f)*_v_d_rd[_i],0.0f,1.0f); } }
      ::memcpy(_u_d_rd,_un_d_rd,sizeof(_u_d_rd)); ::memcpy(_v_d_rd,_vn_d_rd,sizeof(_v_d_rd)); }
    for (int _i=0; _i<NUM_LEDS; _i++) p6_buf_d_rd[_i]=ColorFromPalette(pal_d_palMix,(uint8_t)(_v_d_rd[_i]*255)); }
  {
    float _m = n_d_fft_mids, _intensity = n_d_fft_bass, _spd = n_d_fft_treble;
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _mAmt = min(1.0f, max(0.0f, _m));
      float _strength = min(1.0f, max(0.0f, _intensity));
      float _motion = _spd * (1.0f + _mAmt * 1.5f * _strength);
      float _contrast = 0.7f + _mAmt * 1.8f * _strength;
      float _wBase = sin(_x * 0.8f + t * _motion * 4) * sin(_y * 0.5f + t * _motion * 2.5f);
      float _w = min(1.0f, max(-1.0f, _wBase * _contrast));
      float _int = min(1.0f, 0.1f + powf(_mAmt, 0.65f) * 1.25f * _strength);
      float _v = (_w + 1) / 2.0f * _int;
      p6_buf_d_waves[_y * WIDTH + _x] = ColorFromPalette(pal_d_palMix, (uint8_t)((_w + 1) * 127.5f));
      p6_buf_d_waves[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));
    }
  }
  { ::memmove(p6_buf_d_blend, p6_buf_d_rd, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.28); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p6_buf_d_blend[_i], _b=p6_buf_d_waves[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p6_buf_d_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { ::memmove(p6_buf_d_gamma, p6_buf_d_blend, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p6_buf_d_gamma, NUM_LEDS, 2.220f); }
  ::memmove(leds, p6_buf_d_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p7(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_c_fft_bass_target = constrain(_audioBass * 1.180f, 0.0f, 1.0f), n_c_fft_mids_target = constrain(_audioMids * 1.180f, 0.0f, 1.0f), n_c_fft_treble_target = constrain(_audioTreble * 1.180f, 0.0f, 1.0f);
  static float n_c_fft_bass_smooth = -1, n_c_fft_mids_smooth = -1, n_c_fft_treble_smooth = -1;
  n_c_fft_bass_smooth = n_c_fft_bass_smooth < 0 ? n_c_fft_bass_target : n_c_fft_bass_smooth * 0.760f + n_c_fft_bass_target * 0.240f;
  n_c_fft_mids_smooth = n_c_fft_mids_smooth < 0 ? n_c_fft_mids_target : n_c_fft_mids_smooth * 0.760f + n_c_fft_mids_target * 0.240f;
  n_c_fft_treble_smooth = n_c_fft_treble_smooth < 0 ? n_c_fft_treble_target : n_c_fft_treble_smooth * 0.760f + n_c_fft_treble_target * 0.240f;
  float n_c_fft_bass = n_c_fft_bass_smooth, n_c_fft_mids = n_c_fft_mids_smooth, n_c_fft_treble = n_c_fft_treble_smooth;
  // PaletteSelector — drives OceanColors_p in connected palette-consuming nodes
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_c_palMix;
  { uint8_t _amt = (uint8_t)((n_c_fft_treble) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_c_palMix[_i] = blend(ColorFromPalette(OceanColors_p, _p), ColorFromPalette(PartyColors_p, _p), _amt); } }
  { // Flow field
    static float _fpx_c_flow[84], _fpy_c_flow[84], _ftr_c_flow[NUM_LEDS]; static bool _fi_c_flow=false;
    if(!_fi_c_flow){ for(int _i=0;_i<84;_i++){ _fpx_c_flow[_i]=(random8()/255.0f)*WIDTH; _fpy_c_flow[_i]=(random8()/255.0f)*HEIGHT; } for(int _i=0;_i<NUM_LEDS;_i++)_ftr_c_flow[_i]=0; _fi_c_flow=true; }
    float _spd=(constrain((n_c_fft_bass), 0.0f, 1.0f) * 1.500f),_sc=(constrain((n_c_fft_mids), 0.0f, 1.0f) * 1.000f); uint16_t _z=(uint16_t)(t*100);
    for(int _i=0;_i<NUM_LEDS;_i++) _ftr_c_flow[_i]*=0.92f;
    for(int _i=0;_i<84;_i++){
      float _a=(inoise8((uint16_t)(_fpx_c_flow[_i]*_sc*256),(uint16_t)(_fpy_c_flow[_i]*_sc*256),_z)/255.0f)*6.2831f*2;
      _fpx_c_flow[_i]=fmodf(_fpx_c_flow[_i]+cos(_a)*_spd*0.6f+WIDTH,WIDTH); _fpy_c_flow[_i]=fmodf(_fpy_c_flow[_i]+sin(_a)*_spd*0.6f+HEIGHT,HEIGHT);
      int _xi=(int)_fpx_c_flow[_i],_yi=(int)_fpy_c_flow[_i]; if(_xi>=0&&_xi<WIDTH&&_yi>=0&&_yi<HEIGHT){ int _id=_yi*WIDTH+_xi; _ftr_c_flow[_id]=min(1.0f,_ftr_c_flow[_id]+0.5f); } }
    for(int _i=0;_i<NUM_LEDS;_i++) p7_buf_c_flow[_i]=ColorFromPalette(pal_c_palMix,(uint8_t)(_ftr_c_flow[_i]*255)); }
  CRGB n_c_sample_color = ColorFromPalette(pal_c_palMix, (uint8_t)((n_c_fft_bass)*255));
  { // Starfield
    static float _sfx_c_stars[46], _sfy_c_stars[46], _sfz_c_stars[46]; static bool _sfi_c_stars=false;
    if(!_sfi_c_stars){ for(int _i=0;_i<46;_i++){ _sfx_c_stars[_i]=random8()/127.5f-1; _sfy_c_stars[_i]=random8()/127.5f-1; _sfz_c_stars[_i]=random8()/255.0f*0.9f+0.1f; } _sfi_c_stars=true; }
    float _spd=(constrain((n_c_fft_mids), 0.0f, 1.0f) * 3.000f); fill_solid(p7_buf_c_stars, NUM_LEDS, CRGB::Black);
    for(int _i=0;_i<46;_i++){ _sfz_c_stars[_i]-=_spd*0.015f;
      if(_sfz_c_stars[_i]<=0.02f){ _sfx_c_stars[_i]=random8()/127.5f-1; _sfy_c_stars[_i]=random8()/127.5f-1; _sfz_c_stars[_i]=1; }
      int _px=(int)(WIDTH/2.0f+(_sfx_c_stars[_i]/_sfz_c_stars[_i])*WIDTH*0.35f), _py=(int)(HEIGHT/2.0f+(_sfy_c_stars[_i]/_sfz_c_stars[_i])*HEIGHT*0.35f);
      if(_px>=0&&_px<WIDTH&&_py>=0&&_py<HEIGHT){ p7_buf_c_stars[_py*WIDTH+_px]=n_c_sample_color; p7_buf_c_stars[_py*WIDTH+_px].nscale8((uint8_t)(min(1.0f,1-_sfz_c_stars[_i])*255)); } } }
  { ::memmove(p7_buf_c_blend, p7_buf_c_flow, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.2); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p7_buf_c_blend[_i], _b=p7_buf_c_stars[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p7_buf_c_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  ::memmove(p7_buf_c_blur, p7_buf_c_blend, sizeof(CRGB) * NUM_LEDS); blur2d(p7_buf_c_blur, WIDTH, HEIGHT, 41, _xyMap);
  { ::memmove(p7_buf_c_gamma, p7_buf_c_blur, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p7_buf_c_gamma, NUM_LEDS, 2.180f); }
  ::memmove(leds, p7_buf_c_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p8(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_b_fft_bass_target = constrain(_audioBass * 1.180f, 0.0f, 1.0f), n_b_fft_mids_target = constrain(_audioMids * 1.180f, 0.0f, 1.0f), n_b_fft_treble_target = constrain(_audioTreble * 1.180f, 0.0f, 1.0f);
  static float n_b_fft_bass_smooth = -1, n_b_fft_mids_smooth = -1, n_b_fft_treble_smooth = -1;
  n_b_fft_bass_smooth = n_b_fft_bass_smooth < 0 ? n_b_fft_bass_target : n_b_fft_bass_smooth * 0.760f + n_b_fft_bass_target * 0.240f;
  n_b_fft_mids_smooth = n_b_fft_mids_smooth < 0 ? n_b_fft_mids_target : n_b_fft_mids_smooth * 0.760f + n_b_fft_mids_target * 0.240f;
  n_b_fft_treble_smooth = n_b_fft_treble_smooth < 0 ? n_b_fft_treble_target : n_b_fft_treble_smooth * 0.760f + n_b_fft_treble_target * 0.240f;
  float n_b_fft_bass = n_b_fft_bass_smooth, n_b_fft_mids = n_b_fft_mids_smooth, n_b_fft_treble = n_b_fft_treble_smooth;
  uint8_t n_b_hue_hue = (uint8_t)(((n_b_fft_bass)*0.5f+(n_b_fft_mids)*0.3f+(n_b_fft_treble)*0.2f)*255);
  CRGBPalette16 pal_b_poline(CRGB(25,55,103), CRGB(22,16,59), CRGB(60,18,56), CRGB(95,31,59), CRGB(132,46,70), CRGB(163,60,81), CRGB(185,73,91), CRGB(189,89,104), CRGB(192,94,106), CRGB(195,92,99), CRGB(200,93,90), CRGB(207,107,91), CRGB(216,129,97), CRGB(227,156,109), CRGB(237,186,130), CRGB(246,213,159));
  { /* FieldFormula: sin8(r*210 + angle*40 + t*(24 + a*90))/255 */
    float a=n_b_fft_bass, b=0; (void)a;(void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=_x, y=_y; (void)x;(void)y;
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float fieldIn=0.0f; (void)fieldIn;
      float _v=_fsin8(r*210 + angle*40 + t*(24 + a*90))/255;
      p8_field_b_base[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}
  { /* DistanceField */
    float _px=n_b_fft_mids, _py=n_b_fft_treble, _sc=2; if(_sc<0.0001f)_sc=0.0001f;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _nx=(float)_x/(WIDTH-1>0?WIDTH-1:1),_ny=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);
      float _dx=_nx-_px,_dy=_ny-_py;
      float _d=sqrtf(_dx*_dx+_dy*_dy)/1.41421356f*_sc;
      p8_field_b_ring[_y*WIDTH+_x]=constrain(_d,0.0f,1.0f);}}
  { /* FieldMath: max */
    for(int _i=0;_i<NUM_LEDS;_i++){
      float _a=p8_field_b_base[_i], _b=p8_field_b_ring[_i];
      p8_field_b_combine[_i]=constrain(max(_a, _b),0.0f,1.0f);}}
  { /* FieldRotate */ float _ang=((n_b_hue_hue)+t*0)*0.01745329f;
    float _ca=cosf(-_ang),_sa=sinf(-_ang),_cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _dx=_x-_cx,_dy=_y-_cy;
      int _sx=(((int)roundf(_dx*_ca-_dy*_sa+_cx))%WIDTH+WIDTH)%WIDTH;
      int _sy=(((int)roundf(_dx*_sa+_dy*_ca+_cy))%HEIGHT+HEIGHT)%HEIGHT;
      p8_field_b_rotate[_y*WIDTH+_x]=p8_field_b_combine[_sy*WIDTH+_sx];}}
  { float _br=constrain(1,0.0f,1.0f);
    for(int _i=0;_i<NUM_LEDS;_i++)
      p8_buf_b_frame[_i]=ColorFromPalette(pal_b_poline,(uint8_t)(p8_field_b_rotate[_i]*255),(uint8_t)(_br*255)); }
  { ::memmove(p8_buf_b_shift, p8_buf_b_frame, sizeof(CRGB) * NUM_LEDS); uint8_t _sh = (uint8_t)((n_b_hue_hue) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) p8_buf_b_shift[_i] = CHSV(rgb2hsv_approximate(p8_buf_b_shift[_i]).hue + _sh, rgb2hsv_approximate(p8_buf_b_shift[_i]).sat, rgb2hsv_approximate(p8_buf_b_shift[_i]).val); }
  { ::memmove(p8_buf_b_gamma, p8_buf_b_shift, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p8_buf_b_gamma, NUM_LEDS, 2.300f); }
  ::memmove(leds, p8_buf_b_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p9(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_a_fft_bass_target = constrain(_audioBass * 1.180f, 0.0f, 1.0f), n_a_fft_mids_target = constrain(_audioMids * 1.180f, 0.0f, 1.0f), n_a_fft_treble_target = constrain(_audioTreble * 1.180f, 0.0f, 1.0f);
  static float n_a_fft_bass_smooth = -1, n_a_fft_mids_smooth = -1, n_a_fft_treble_smooth = -1;
  n_a_fft_bass_smooth = n_a_fft_bass_smooth < 0 ? n_a_fft_bass_target : n_a_fft_bass_smooth * 0.760f + n_a_fft_bass_target * 0.240f;
  n_a_fft_mids_smooth = n_a_fft_mids_smooth < 0 ? n_a_fft_mids_target : n_a_fft_mids_smooth * 0.760f + n_a_fft_mids_target * 0.240f;
  n_a_fft_treble_smooth = n_a_fft_treble_smooth < 0 ? n_a_fft_treble_target : n_a_fft_treble_smooth * 0.760f + n_a_fft_treble_target * 0.240f;
  float n_a_fft_bass = n_a_fft_bass_smooth, n_a_fft_mids = n_a_fft_mids_smooth, n_a_fft_treble = n_a_fft_treble_smooth;
  CRGBPalette16 pal_a_poline(CRGB(36,16,10), CRGB(71,32,18), CRGB(104,47,25), CRGB(104,47,25), CRGB(134,59,30), CRGB(157,68,33), CRGB(172,74,35), CRGB(177,76,36), CRGB(177,76,36), CRGB(182,81,36), CRGB(195,95,37), CRGB(218,119,39), CRGB(226,151,65), CRGB(226,151,65), CRGB(235,181,99), CRGB(243,208,138));
  {
    float _m = n_a_fft_mids, _intensity = n_a_fft_bass, _spd = n_a_fft_treble;
    float _mAmt = min(1.0f, max(0.0f, _m));
    float _strength = min(1.0f, max(0.0f, _intensity));
    float _motion = min(1.0f, max(0.0f, _spd)) * (0.8f + _mAmt * 2.2f * _strength);
    float _cx0 = (WIDTH - 1) / 2.0f, _cy0 = (HEIGHT - 1) / 2.0f;
    float _sx = max(1.0f, WIDTH / 2.0f), _sy = max(1.0f, HEIGHT / 2.0f);
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _cx = (_x - _cx0) / _sx, _cy = (_y - _cy0) / _sy;
      float _radial = sqrtf(_cx * _cx + _cy * _cy);
      float _swirl = sinf((_cx * _cx - _cy * _cy) * 6 + t * _motion * 3.2f) + cosf((_cx + _cy) * 4 - t * _motion * 2.4f);
      float _bloom = sinf(_radial * (5.0f + _mAmt * 8.0f * _strength) * 3.14159265f - t * _motion * 4.0f + _swirl * 0.6f);
      float _crisp = powf(max(0.0f, _bloom * 0.5f + 0.5f), 1.8f);
      float _v = min(1.0f, _crisp * (0.22f + _mAmt * 0.78f * _strength));
      float _pt = _radial * 0.6f + _swirl * 0.12f + t * _motion * 0.05f;
      p9_buf_a_bloom[_y * WIDTH + _x] = ColorFromPalette(pal_a_poline, (uint8_t)(_pt * 255));
      p9_buf_a_bloom[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));
    }
  }
  { /* CustomFormula: sin((r*12 - t*(0.7 + a*4)) + cos(angle*3 + t*(0.3 + b*2))*2)*0.5+0.5 */
    float a=n_a_fft_bass, b=n_a_fft_mids; (void)a; (void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=(float)_x/(WIDTH-1>0?WIDTH-1:1),y=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float _v=sin((r*12 - t*(0.7 + a*4)) + cos(angle*3 + t*(0.3 + b*2))*2)*0.5+0.5;
      p9_buf_a_formula[_y*WIDTH+_x]=ColorFromPalette(pal_a_poline,(uint8_t)(fmod(fmod(_v,1)+1,1)*255));}}
  { ::memmove(p9_buf_a_blend, p9_buf_a_bloom, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.32); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p9_buf_a_blend[_i], _b=p9_buf_a_formula[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=_av<0.5f?2.0f*_av*_bv:1.0f-2.0f*(1.0f-_av)*(1.0f-_bv);
        p9_buf_a_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  ::memmove(p9_buf_a_blur, p9_buf_a_blend, sizeof(CRGB) * NUM_LEDS); blur2d(p9_buf_a_blur, WIDTH, HEIGHT, 31, _xyMap);
  { ::memmove(p9_buf_a_gamma, p9_buf_a_blur, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p9_buf_a_gamma, NUM_LEDS, 2.340f); }
  ::memmove(leds, p9_buf_a_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p10(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p10_fft_bass_target = constrain(_audioBass * 1.240f, 0.0f, 1.0f), n_p10_fft_mids_target = constrain(_audioMids * 1.240f, 0.0f, 1.0f), n_p10_fft_treble_target = constrain(_audioTreble * 1.240f, 0.0f, 1.0f);
  static float n_p10_fft_bass_smooth = -1, n_p10_fft_mids_smooth = -1, n_p10_fft_treble_smooth = -1;
  n_p10_fft_bass_smooth = n_p10_fft_bass_smooth < 0 ? n_p10_fft_bass_target : n_p10_fft_bass_smooth * 0.720f + n_p10_fft_bass_target * 0.280f;
  n_p10_fft_mids_smooth = n_p10_fft_mids_smooth < 0 ? n_p10_fft_mids_target : n_p10_fft_mids_smooth * 0.720f + n_p10_fft_mids_target * 0.280f;
  n_p10_fft_treble_smooth = n_p10_fft_treble_smooth < 0 ? n_p10_fft_treble_target : n_p10_fft_treble_smooth * 0.720f + n_p10_fft_treble_target * 0.280f;
  float n_p10_fft_bass = n_p10_fft_bass_smooth, n_p10_fft_mids = n_p10_fft_mids_smooth, n_p10_fft_treble = n_p10_fft_treble_smooth;
  bool n_p10_beat_beat = false;
  static float n_p10_beat_bpm = 120.0f, n_p10_beat_detector_fast = 0.0f, n_p10_beat_detector_slow = 0.0f, n_p10_beat_detector_prevFlux = 0.0f, n_p10_beat_detector_prevPrevFlux = 0.0f;
  static float n_p10_beat_detector_prevSpectrum[32]; static bool n_p10_beat_detector_ready = false; static uint32_t n_p10_beat_detector_lastBeat = 0;
  if (n_p10_beat_detector_ready) {
    float _flux = 0.0f, _weightSum = 0.0f;
    for (int _i = 0; _i < 32; _i++) {
      float _diff = _audioSpectrum[_i] - n_p10_beat_detector_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;
      float _weight = _i < 6 ? 2.0f : (_i < 12 ? 1.35f : (_i < 20 ? 0.85f : 0.45f)); _flux += _diff * _weight; _weightSum += _weight;
    }
    _flux = _weightSum > 0.0f ? _flux / _weightSum : 0.0f;
    n_p10_beat_detector_fast += (_flux - n_p10_beat_detector_fast) * 0.4724f;
    n_p10_beat_detector_slow += (_flux - n_p10_beat_detector_slow) * 0.1276f;
    float _onset = n_p10_beat_detector_fast - n_p10_beat_detector_slow, _baseline = n_p10_beat_detector_slow > 0.02f ? n_p10_beat_detector_slow : 0.02f;
    float _gap = constrain(60000.0f / n_p10_beat_bpm * 0.42f, 150.0f, 600.0f); uint32_t _now = millis();
    bool _peak = _flux > n_p10_beat_detector_prevFlux && n_p10_beat_detector_prevFlux >= n_p10_beat_detector_prevPrevFlux;
    n_p10_beat_beat = _flux > 0.0550f && _peak && _onset > 0.0248f && _onset / _baseline > 1.1f && (n_p10_beat_detector_lastBeat == 0 || _now - n_p10_beat_detector_lastBeat >= (uint32_t)_gap);
    if (n_p10_beat_beat) { if (n_p10_beat_detector_lastBeat != 0) { float _interval = _now - n_p10_beat_detector_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) n_p10_beat_bpm = n_p10_beat_bpm * 0.65f + (60000.0f / _interval) * 0.35f; } n_p10_beat_detector_lastBeat = _now; }
    n_p10_beat_detector_prevPrevFlux = n_p10_beat_detector_prevFlux; n_p10_beat_detector_prevFlux = _flux;
  }
  for (int _i = 0; _i < 32; _i++) n_p10_beat_detector_prevSpectrum[_i] = _audioSpectrum[_i]; n_p10_beat_detector_ready = true;
  uint8_t n_p10_hue_hue = (uint8_t)(((n_p10_fft_bass)*0.5f+(n_p10_fft_mids)*0.3f+(n_p10_fft_treble)*0.2f)*255);
  CRGB n_p10_hsv_color = CHSV((uint8_t)((n_p10_hue_hue) / 360.0f * 255), (uint8_t)((0.82) * 255), (uint8_t)((1) * 255));
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  // PaletteSelector — drives RainbowColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_p10_palMix;
  { uint8_t _amt = (uint8_t)((n_p10_fft_treble) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_p10_palMix[_i] = blend(ColorFromPalette(PartyColors_p, _p), ColorFromPalette(RainbowColors_p, _p), _amt); } }
  {
    float _b = min(1.0f, max(0.0f, n_p10_fft_bass)), _m = min(1.0f, max(0.0f, n_p10_fft_mids)), _t = min(1.0f, max(0.0f, n_p10_fft_treble));
    float _strength = min(1.0f, max(0.0f, n_p10_fft_bass));
    float _spd = min(1.0f, max(0.0f, n_p10_fft_treble));
    float _motion = _spd * (0.8f + (_b + _m + _t) * 1.4f * _strength);
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _nx = WIDTH > 1 ? (float)_x / (float)(WIDTH - 1) : 0.0f;
      float _ny = HEIGHT > 1 ? (float)_y / (float)(HEIGHT - 1) : 0.0f;
      float _ribbon = sinf((_nx * 7.0f + _ny * 2.5f) + t * _motion * (2.0f + _m * 3.0f * _strength));
      float _sweep = cosf((_ny * 9.0f - _nx * 3.0f) - t * _motion * (1.4f + _b * 2.2f * _strength));
      float _shimmer = powf(max(0.0f, sinf((_nx + _ny) * 18.0f + t * _motion * (4.0f + _t * 8.0f * _strength)) * 0.5f + 0.5f), 6.0f);
      float _body = max(0.0f, _ribbon * 0.55f + _sweep * 0.45f);
      float _v = min(1.0f, _body * (0.18f + _m * 0.52f * _strength) + _b * 0.24f * _strength + _shimmer * _t * 0.85f * _strength);
      float _pt = _nx * (0.2f + _b * 0.5f) + _ny * (0.35f + _m * 0.45f) + _shimmer * 0.15f + t * _motion * 0.03f;
      p10_buf_p10_cascade[_y * WIDTH + _x] = ColorFromPalette(pal_p10_palMix, (uint8_t)(_pt * 255));
      p10_buf_p10_cascade[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));
    }
  }
  { // Particles: fireworks
    const int _PN=120;
    static float _pa_p10_particlesx[_PN], _pa_p10_particlesy[_PN], _pa_p10_particlesvx[_PN], _pa_p10_particlesvy[_PN], _pa_p10_particlesl[_PN], _pa_p10_particless[_PN]; static uint8_t _pa_p10_particlesr[_PN], _pa_p10_particlesg[_PN], _pa_p10_particlesb[_PN]; static bool _pa_p10_particlesinit=false;
    float _rate=n_p10_fft_mids; CRGB _pc=n_p10_hsv_color;
    if(!_pa_p10_particlesinit){ for(int i=0;i<_PN;i++) _pa_p10_particlesl[i]=0; _pa_p10_particlesinit=true; }
    if(random8()<(uint8_t)(_rate*0.12f*255)){ uint8_t _hue=random8(); int _n=14+random8()/32; float _cx=random8()/255.0f*WIDTH, _cy=random8()/255.0f*HEIGHT*0.5f+HEIGHT*0.1f;
      for(int k=0;k<_n;k++) for(int i=0;i<_PN;i++) if(_pa_p10_particlesl[i]<=0.04f){ float _a=(k/(float)_n)*6.2831f+random8()/255.0f*0.3f, _sp=random8()/255.0f*0.5f+0.35f; _pa_p10_particlesx[i]=_cx; _pa_p10_particlesy[i]=_cy; _pa_p10_particlesvx[i]=cos(_a)*_sp; _pa_p10_particlesvy[i]=sin(_a)*_sp; _pa_p10_particlesl[i]=1; CRGB _fc=CHSV(_hue+(random8()%30)-15,255,255); _pa_p10_particlesr[i]=_fc.r; _pa_p10_particlesg[i]=_fc.g; _pa_p10_particlesb[i]=_fc.b; break; } }
    for(int i=0;i<_PN;i++){ if(_pa_p10_particlesl[i]<=0.04f) continue;
      _pa_p10_particlesvy[i]=(_pa_p10_particlesvy[i]+0.022f)*0.965f; _pa_p10_particlesvx[i]*=0.965f; _pa_p10_particlesx[i]+=_pa_p10_particlesvx[i]; _pa_p10_particlesy[i]+=_pa_p10_particlesvy[i]; _pa_p10_particlesl[i]*=0.88f*0.985f; }
    fill_solid(p10_buf_p10_particles, NUM_LEDS, CRGB::Black);
    for(int i=0;i<_PN;i++){ if(_pa_p10_particlesl[i]<=0.04f) continue; int X=(int)(_pa_p10_particlesx[i]+0.5f), Y=(int)(_pa_p10_particlesy[i]+0.5f);
      if(X>=0&&X<WIDTH&&Y>=0&&Y<HEIGHT){ float _k=min(1.0f,_pa_p10_particlesl[i]); p10_buf_p10_particles[Y*WIDTH+X]+=CRGB((uint8_t)(_pa_p10_particlesr[i]*_k),(uint8_t)(_pa_p10_particlesg[i]*_k),(uint8_t)(_pa_p10_particlesb[i]*_k)); } } }
  { // Starfield
    static float _sfx_p10_stars[58], _sfy_p10_stars[58], _sfz_p10_stars[58]; static bool _sfi_p10_stars=false;
    if(!_sfi_p10_stars){ for(int _i=0;_i<58;_i++){ _sfx_p10_stars[_i]=random8()/127.5f-1; _sfy_p10_stars[_i]=random8()/127.5f-1; _sfz_p10_stars[_i]=random8()/255.0f*0.9f+0.1f; } _sfi_p10_stars=true; }
    float _spd=(constrain((n_p10_fft_bass), 0.0f, 1.0f) * 3.000f); fill_solid(p10_buf_p10_stars, NUM_LEDS, CRGB::Black);
    for(int _i=0;_i<58;_i++){ _sfz_p10_stars[_i]-=_spd*0.015f;
      if(_sfz_p10_stars[_i]<=0.02f){ _sfx_p10_stars[_i]=random8()/127.5f-1; _sfy_p10_stars[_i]=random8()/127.5f-1; _sfz_p10_stars[_i]=1; }
      int _px=(int)(WIDTH/2.0f+(_sfx_p10_stars[_i]/_sfz_p10_stars[_i])*WIDTH*0.35f), _py=(int)(HEIGHT/2.0f+(_sfy_p10_stars[_i]/_sfz_p10_stars[_i])*HEIGHT*0.35f);
      if(_px>=0&&_px<WIDTH&&_py>=0&&_py<HEIGHT){ p10_buf_p10_stars[_py*WIDTH+_px]=n_p10_hsv_color; p10_buf_p10_stars[_py*WIDTH+_px].nscale8((uint8_t)(min(1.0f,1-_sfz_p10_stars[_i])*255)); } } }
  { ::memmove(p10_buf_p10_blendA, p10_buf_p10_cascade, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.54); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p10_buf_p10_blendA[_i], _b=p10_buf_p10_particles[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=min(1.0f,_av+_bv);
        p10_buf_p10_blendA[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { ::memmove(p10_buf_p10_blendB, p10_buf_p10_blendA, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.28); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p10_buf_p10_blendB[_i], _b=p10_buf_p10_stars[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p10_buf_p10_blendB[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  {
    ::memmove(p10_buf_p10_flash, p10_buf_p10_blendB, sizeof(CRGB) * NUM_LEDS);
    static float _flash_p10_flash = 0;
    if (n_p10_beat_beat) _flash_p10_flash = 1.0f; else _flash_p10_flash *= 0.62;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p10_buf_p10_flash[_i].r = qadd8(p10_buf_p10_flash[_i].r, (uint8_t)((255 - p10_buf_p10_flash[_i].r) * _flash_p10_flash));
      p10_buf_p10_flash[_i].g = qadd8(p10_buf_p10_flash[_i].g, (uint8_t)((255 - p10_buf_p10_flash[_i].g) * _flash_p10_flash));
      p10_buf_p10_flash[_i].b = qadd8(p10_buf_p10_flash[_i].b, (uint8_t)((255 - p10_buf_p10_flash[_i].b) * _flash_p10_flash));
    }
  }
  { ::memmove(p10_buf_p10_gamma, p10_buf_p10_flash, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p10_buf_p10_gamma, NUM_LEDS, 2.180f); }
  ::memmove(leds, p10_buf_p10_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p11(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p9_fft_bass_target = constrain(_audioBass * 1.240f, 0.0f, 1.0f), n_p9_fft_mids_target = constrain(_audioMids * 1.240f, 0.0f, 1.0f), n_p9_fft_treble_target = constrain(_audioTreble * 1.240f, 0.0f, 1.0f);
  static float n_p9_fft_bass_smooth = -1, n_p9_fft_mids_smooth = -1, n_p9_fft_treble_smooth = -1;
  n_p9_fft_bass_smooth = n_p9_fft_bass_smooth < 0 ? n_p9_fft_bass_target : n_p9_fft_bass_smooth * 0.720f + n_p9_fft_bass_target * 0.280f;
  n_p9_fft_mids_smooth = n_p9_fft_mids_smooth < 0 ? n_p9_fft_mids_target : n_p9_fft_mids_smooth * 0.720f + n_p9_fft_mids_target * 0.280f;
  n_p9_fft_treble_smooth = n_p9_fft_treble_smooth < 0 ? n_p9_fft_treble_target : n_p9_fft_treble_smooth * 0.720f + n_p9_fft_treble_target * 0.280f;
  float n_p9_fft_bass = n_p9_fft_bass_smooth, n_p9_fft_mids = n_p9_fft_mids_smooth, n_p9_fft_treble = n_p9_fft_treble_smooth;
  bool n_p9_beat_beat = false;
  static float n_p9_beat_bpm = 120.0f, n_p9_beat_detector_fast = 0.0f, n_p9_beat_detector_slow = 0.0f, n_p9_beat_detector_prevFlux = 0.0f, n_p9_beat_detector_prevPrevFlux = 0.0f;
  static float n_p9_beat_detector_prevSpectrum[32]; static bool n_p9_beat_detector_ready = false; static uint32_t n_p9_beat_detector_lastBeat = 0;
  if (n_p9_beat_detector_ready) {
    float _flux = 0.0f, _weightSum = 0.0f;
    for (int _i = 0; _i < 32; _i++) {
      float _diff = _audioSpectrum[_i] - n_p9_beat_detector_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;
      float _weight = _i < 6 ? 2.0f : (_i < 12 ? 1.35f : (_i < 20 ? 0.85f : 0.45f)); _flux += _diff * _weight; _weightSum += _weight;
    }
    _flux = _weightSum > 0.0f ? _flux / _weightSum : 0.0f;
    n_p9_beat_detector_fast += (_flux - n_p9_beat_detector_fast) * 0.4724f;
    n_p9_beat_detector_slow += (_flux - n_p9_beat_detector_slow) * 0.1276f;
    float _onset = n_p9_beat_detector_fast - n_p9_beat_detector_slow, _baseline = n_p9_beat_detector_slow > 0.02f ? n_p9_beat_detector_slow : 0.02f;
    float _gap = constrain(60000.0f / n_p9_beat_bpm * 0.42f, 150.0f, 600.0f); uint32_t _now = millis();
    bool _peak = _flux > n_p9_beat_detector_prevFlux && n_p9_beat_detector_prevFlux >= n_p9_beat_detector_prevPrevFlux;
    n_p9_beat_beat = _flux > 0.0550f && _peak && _onset > 0.0248f && _onset / _baseline > 1.1f && (n_p9_beat_detector_lastBeat == 0 || _now - n_p9_beat_detector_lastBeat >= (uint32_t)_gap);
    if (n_p9_beat_beat) { if (n_p9_beat_detector_lastBeat != 0) { float _interval = _now - n_p9_beat_detector_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) n_p9_beat_bpm = n_p9_beat_bpm * 0.65f + (60000.0f / _interval) * 0.35f; } n_p9_beat_detector_lastBeat = _now; }
    n_p9_beat_detector_prevPrevFlux = n_p9_beat_detector_prevFlux; n_p9_beat_detector_prevFlux = _flux;
  }
  for (int _i = 0; _i < 32; _i++) n_p9_beat_detector_prevSpectrum[_i] = _audioSpectrum[_i]; n_p9_beat_detector_ready = true;
  uint8_t n_p9_hue_hue = (uint8_t)(((n_p9_fft_bass)*0.5f+(n_p9_fft_mids)*0.3f+(n_p9_fft_treble)*0.2f)*255);
  CRGB n_p9_hsv_color = CHSV((uint8_t)((n_p9_hue_hue) / 360.0f * 255), (uint8_t)((0.9) * 255), (uint8_t)((1) * 255));
  { // Palette gradient
    float _a=12*0.01745329f,_co=cos(_a),_si=sin(_a);
    float _pmin=(_co<0?(WIDTH-1)*_co:0)+(_si<0?(HEIGHT-1)*_si:0);
    float _pmax=(_co>0?(WIDTH-1)*_co:0)+(_si>0?(HEIGHT-1)*_si:0);
    float _rng=max(1e-6f,_pmax-_pmin);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _tn=(_x*_co+_y*_si-_pmin)/_rng;
      p11_buf_p9_gradient[_y*WIDTH+_x]=ColorFromPalette(RainbowColors_p,(uint8_t)((_tn*8.0f+t*0.24f)*255));}}
  {
    float _t = min(1.0f, max(0.0f, n_p9_fft_treble));
    float _strength = min(1.0f, max(0.0f, n_p9_fft_bass));
    float _spd = min(1.0f, max(0.0f, n_p9_fft_mids));
    float _motion = _spd * (1.2f + _t * 3.2f * _strength);
    CRGB _base = n_p9_hsv_color;
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _diagA = _x * 1.7f + _y * 1.15f, _diagB = _x * -1.1f + _y * 1.9f;
      float _waveA = sinf(_diagA + t * _motion * 7.5f);
      float _waveB = sinf(_diagB - t * _motion * 6.1f);
      float _prism = max(0.0f, _waveA * 0.55f + _waveB * 0.45f);
      float _shard = powf(_prism, 3.6f);
      float _flash = powf(max(0.0f, sinf((_x + _y) * 2.4f - t * _motion * 9.0f) * 0.5f + 0.5f), 10.0f);
      float _v = min(1.0f, _shard * (0.3f + _t * 0.7f * _strength) + _flash * _t * 0.9f * _strength);
      int _i = _y * WIDTH + _x;
      p11_buf_p9_prism[_i] = _base;
      p11_buf_p9_prism[_i].nscale8((uint8_t)(_v * 255));
    }
  }
  { fill_solid(p11_buf_p9_tr, NUM_LEDS, CRGB::Black); float _tt=n_p9_fft_bass;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      int _ax=_x,_ay=(int)roundf(_y-_tt*HEIGHT),_bx=_x,_by=(int)roundf(_y+(1.0f-_tt)*HEIGHT);
      if(_bx>=0&&_bx<WIDTH&&_by>=0&&_by<HEIGHT) p11_buf_p9_tr[_y*WIDTH+_x] = p11_buf_p9_prism[_by*WIDTH+_bx];
      else if(_ax>=0&&_ax<WIDTH&&_ay>=0&&_ay<HEIGHT) p11_buf_p9_tr[_y*WIDTH+_x] = p11_buf_p9_gradient[_ay*WIDTH+_ax];
    } }
  float n_p9_rate_result = mapFloat(n_p9_fft_mids, 0, 1, 40, 180);
  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=n_p9_rate_result;
    float _a=0*0.01745329f,_dx=cos(_a)*_rate*t,_dy=sin(_a)*_rate*t;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      int _sx=(((int)floorf(_x-_dx+0.5f))%WIDTH+WIDTH)%WIDTH, _sy=(((int)floorf(_y-_dy+0.5f))%HEIGHT+HEIGHT)%HEIGHT;
      p11_buf_p9_transform[_y*WIDTH+_x]=p11_buf_p9_tr[_sy*WIDTH+_sx];}}
  {
    ::memmove(p11_buf_p9_flash, p11_buf_p9_transform, sizeof(CRGB) * NUM_LEDS);
    static float _flash_p9_flash = 0;
    if (n_p9_beat_beat) _flash_p9_flash = 1.0f; else _flash_p9_flash *= 0.64;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p11_buf_p9_flash[_i].r = qadd8(p11_buf_p9_flash[_i].r, (uint8_t)((255 - p11_buf_p9_flash[_i].r) * _flash_p9_flash));
      p11_buf_p9_flash[_i].g = qadd8(p11_buf_p9_flash[_i].g, (uint8_t)((255 - p11_buf_p9_flash[_i].g) * _flash_p9_flash));
      p11_buf_p9_flash[_i].b = qadd8(p11_buf_p9_flash[_i].b, (uint8_t)((255 - p11_buf_p9_flash[_i].b) * _flash_p9_flash));
    }
  }
  { ::memmove(p11_buf_p9_gamma, p11_buf_p9_flash, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p11_buf_p9_gamma, NUM_LEDS, 2.200f); }
  ::memmove(leds, p11_buf_p9_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p12(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p8_fft_bass_target = constrain(_audioBass * 1.240f, 0.0f, 1.0f), n_p8_fft_mids_target = constrain(_audioMids * 1.240f, 0.0f, 1.0f), n_p8_fft_treble_target = constrain(_audioTreble * 1.240f, 0.0f, 1.0f);
  static float n_p8_fft_bass_smooth = -1, n_p8_fft_mids_smooth = -1, n_p8_fft_treble_smooth = -1;
  n_p8_fft_bass_smooth = n_p8_fft_bass_smooth < 0 ? n_p8_fft_bass_target : n_p8_fft_bass_smooth * 0.720f + n_p8_fft_bass_target * 0.280f;
  n_p8_fft_mids_smooth = n_p8_fft_mids_smooth < 0 ? n_p8_fft_mids_target : n_p8_fft_mids_smooth * 0.720f + n_p8_fft_mids_target * 0.280f;
  n_p8_fft_treble_smooth = n_p8_fft_treble_smooth < 0 ? n_p8_fft_treble_target : n_p8_fft_treble_smooth * 0.720f + n_p8_fft_treble_target * 0.280f;
  float n_p8_fft_bass = n_p8_fft_bass_smooth, n_p8_fft_mids = n_p8_fft_mids_smooth, n_p8_fft_treble = n_p8_fft_treble_smooth;
  uint8_t n_p8_hue_hue = (uint8_t)(((n_p8_fft_bass)*0.5f+(n_p8_fft_mids)*0.3f+(n_p8_fft_treble)*0.2f)*255);
  // PaletteSelector — drives OceanColors_p in connected palette-consuming nodes
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_p8_palMix;
  { uint8_t _amt = (uint8_t)((n_p8_fft_treble) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_p8_palMix[_i] = blend(ColorFromPalette(OceanColors_p, _p), ColorFromPalette(PartyColors_p, _p), _amt); } }
  { // Fractal noise (fBm via inoise8)
    float _spd=(constrain((n_p8_fft_bass), 0.0f, 1.0f) * 1.200f),_sc=(constrain((n_p8_fft_mids), 0.0f, 1.0f) * 0.500f); uint16_t _z=(uint16_t)(t*_spd*40);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _v=0,_amp=0.5f,_norm=0,_freq=_sc*96;
      for(int _o=0;_o<5;_o++){
        _v+=_amp*(inoise8((uint16_t)(_x*_freq),(uint16_t)(_y*_freq),_z)/255.0f);
        _norm+=_amp; _amp*=0.5f; _freq*=2; }
      p12_buf_p8_fractal[_y*WIDTH+_x]=ColorFromPalette(pal_p8_palMix,(uint8_t)((_v/_norm)*255));}}
  float n_p8_tempRange_result = mapFloat(n_p8_fft_treble, 0, 1, 2200, 18000);
  CRGB n_p8_temp_color = kelvinToRGB(n_p8_tempRange_result);
  { // Starfield
    static float _sfx_p8_stars[70], _sfy_p8_stars[70], _sfz_p8_stars[70]; static bool _sfi_p8_stars=false;
    if(!_sfi_p8_stars){ for(int _i=0;_i<70;_i++){ _sfx_p8_stars[_i]=random8()/127.5f-1; _sfy_p8_stars[_i]=random8()/127.5f-1; _sfz_p8_stars[_i]=random8()/255.0f*0.9f+0.1f; } _sfi_p8_stars=true; }
    float _spd=(constrain((n_p8_fft_bass), 0.0f, 1.0f) * 3.000f); fill_solid(p12_buf_p8_stars, NUM_LEDS, CRGB::Black);
    for(int _i=0;_i<70;_i++){ _sfz_p8_stars[_i]-=_spd*0.015f;
      if(_sfz_p8_stars[_i]<=0.02f){ _sfx_p8_stars[_i]=random8()/127.5f-1; _sfy_p8_stars[_i]=random8()/127.5f-1; _sfz_p8_stars[_i]=1; }
      int _px=(int)(WIDTH/2.0f+(_sfx_p8_stars[_i]/_sfz_p8_stars[_i])*WIDTH*0.35f), _py=(int)(HEIGHT/2.0f+(_sfy_p8_stars[_i]/_sfz_p8_stars[_i])*HEIGHT*0.35f);
      if(_px>=0&&_px<WIDTH&&_py>=0&&_py<HEIGHT){ p12_buf_p8_stars[_py*WIDTH+_px]=n_p8_temp_color; p12_buf_p8_stars[_py*WIDTH+_px].nscale8((uint8_t)(min(1.0f,1-_sfz_p8_stars[_i])*255)); } } }
  { ::memmove(p12_buf_p8_blend, p12_buf_p8_fractal, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.3); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p12_buf_p8_blend[_i], _b=p12_buf_p8_stars[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=min(1.0f,_av+_bv);
        p12_buf_p8_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { ::memmove(p12_buf_p8_shift, p12_buf_p8_blend, sizeof(CRGB) * NUM_LEDS); uint8_t _sh = (uint8_t)((n_p8_hue_hue) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) p12_buf_p8_shift[_i] = CHSV(rgb2hsv_approximate(p12_buf_p8_shift[_i]).hue + _sh, rgb2hsv_approximate(p12_buf_p8_shift[_i]).sat, rgb2hsv_approximate(p12_buf_p8_shift[_i]).val); }
  { ::memmove(p12_buf_p8_gamma, p12_buf_p8_shift, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p12_buf_p8_gamma, NUM_LEDS, 2.160f); }
  ::memmove(leds, p12_buf_p8_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p13(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p7_fft_bass_target = constrain(_audioBass * 1.240f, 0.0f, 1.0f), n_p7_fft_mids_target = constrain(_audioMids * 1.240f, 0.0f, 1.0f), n_p7_fft_treble_target = constrain(_audioTreble * 1.240f, 0.0f, 1.0f);
  static float n_p7_fft_bass_smooth = -1, n_p7_fft_mids_smooth = -1, n_p7_fft_treble_smooth = -1;
  n_p7_fft_bass_smooth = n_p7_fft_bass_smooth < 0 ? n_p7_fft_bass_target : n_p7_fft_bass_smooth * 0.720f + n_p7_fft_bass_target * 0.280f;
  n_p7_fft_mids_smooth = n_p7_fft_mids_smooth < 0 ? n_p7_fft_mids_target : n_p7_fft_mids_smooth * 0.720f + n_p7_fft_mids_target * 0.280f;
  n_p7_fft_treble_smooth = n_p7_fft_treble_smooth < 0 ? n_p7_fft_treble_target : n_p7_fft_treble_smooth * 0.720f + n_p7_fft_treble_target * 0.280f;
  float n_p7_fft_bass = n_p7_fft_bass_smooth, n_p7_fft_mids = n_p7_fft_mids_smooth, n_p7_fft_treble = n_p7_fft_treble_smooth;
  // PaletteSelector — drives OceanColors_p in connected palette-consuming nodes
  // PaletteSelector — drives ForestColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_p7_palMix;
  { uint8_t _amt = (uint8_t)((n_p7_fft_mids) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_p7_palMix[_i] = blend(ColorFromPalette(OceanColors_p, _p), ColorFromPalette(ForestColors_p, _p), _amt); } }
  {
    float _m = n_p7_fft_mids, _intensity = n_p7_fft_bass, _spd = n_p7_fft_treble;
    float _mAmt = min(1.0f, max(0.0f, _m));
    float _strength = min(1.0f, max(0.0f, _intensity));
    float _motion = min(1.0f, max(0.0f, _spd)) * (0.8f + _mAmt * 2.2f * _strength);
    float _cx0 = (WIDTH - 1) / 2.0f, _cy0 = (HEIGHT - 1) / 2.0f;
    float _sx = max(1.0f, WIDTH / 2.0f), _sy = max(1.0f, HEIGHT / 2.0f);
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _cx = (_x - _cx0) / _sx, _cy = (_y - _cy0) / _sy;
      float _radial = sqrtf(_cx * _cx + _cy * _cy);
      float _swirl = sinf((_cx * _cx - _cy * _cy) * 6 + t * _motion * 3.2f) + cosf((_cx + _cy) * 4 - t * _motion * 2.4f);
      float _bloom = sinf(_radial * (5.0f + _mAmt * 8.0f * _strength) * 3.14159265f - t * _motion * 4.0f + _swirl * 0.6f);
      float _crisp = powf(max(0.0f, _bloom * 0.5f + 0.5f), 1.8f);
      float _v = min(1.0f, _crisp * (0.22f + _mAmt * 0.78f * _strength));
      float _pt = _radial * 0.6f + _swirl * 0.12f + t * _motion * 0.05f;
      p13_buf_p7_bloom[_y * WIDTH + _x] = ColorFromPalette(pal_p7_palMix, (uint8_t)(_pt * 255));
      p13_buf_p7_bloom[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));
    }
  }
  { // Flow field
    static float _fpx_p7_flow[88], _fpy_p7_flow[88], _ftr_p7_flow[NUM_LEDS]; static bool _fi_p7_flow=false;
    if(!_fi_p7_flow){ for(int _i=0;_i<88;_i++){ _fpx_p7_flow[_i]=(random8()/255.0f)*WIDTH; _fpy_p7_flow[_i]=(random8()/255.0f)*HEIGHT; } for(int _i=0;_i<NUM_LEDS;_i++)_ftr_p7_flow[_i]=0; _fi_p7_flow=true; }
    float _spd=(constrain((n_p7_fft_bass), 0.0f, 1.0f) * 1.500f),_sc=(constrain((n_p7_fft_treble), 0.0f, 1.0f) * 1.000f); uint16_t _z=(uint16_t)(t*100);
    for(int _i=0;_i<NUM_LEDS;_i++) _ftr_p7_flow[_i]*=0.9f;
    for(int _i=0;_i<88;_i++){
      float _a=(inoise8((uint16_t)(_fpx_p7_flow[_i]*_sc*256),(uint16_t)(_fpy_p7_flow[_i]*_sc*256),_z)/255.0f)*6.2831f*2;
      _fpx_p7_flow[_i]=fmodf(_fpx_p7_flow[_i]+cos(_a)*_spd*0.6f+WIDTH,WIDTH); _fpy_p7_flow[_i]=fmodf(_fpy_p7_flow[_i]+sin(_a)*_spd*0.6f+HEIGHT,HEIGHT);
      int _xi=(int)_fpx_p7_flow[_i],_yi=(int)_fpy_p7_flow[_i]; if(_xi>=0&&_xi<WIDTH&&_yi>=0&&_yi<HEIGHT){ int _id=_yi*WIDTH+_xi; _ftr_p7_flow[_id]=min(1.0f,_ftr_p7_flow[_id]+0.5f); } }
    for(int _i=0;_i<NUM_LEDS;_i++) p13_buf_p7_flow[_i]=ColorFromPalette(pal_p7_palMix,(uint8_t)(_ftr_p7_flow[_i]*255)); }
  { ::memmove(p13_buf_p7_blend, p13_buf_p7_bloom, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.38); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p13_buf_p7_blend[_i], _b=p13_buf_p7_flow[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p13_buf_p7_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  ::memmove(p13_buf_p7_blur, p13_buf_p7_blend, sizeof(CRGB) * NUM_LEDS); blur2d(p13_buf_p7_blur, WIDTH, HEIGHT, 36, _xyMap);
  { ::memmove(p13_buf_p7_gamma, p13_buf_p7_blur, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p13_buf_p7_gamma, NUM_LEDS, 2.180f); }
  ::memmove(leds, p13_buf_p7_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p14(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p6_fft_bass_target = constrain(_audioBass * 1.240f, 0.0f, 1.0f), n_p6_fft_mids_target = constrain(_audioMids * 1.240f, 0.0f, 1.0f), n_p6_fft_treble_target = constrain(_audioTreble * 1.240f, 0.0f, 1.0f);
  static float n_p6_fft_bass_smooth = -1, n_p6_fft_mids_smooth = -1, n_p6_fft_treble_smooth = -1;
  n_p6_fft_bass_smooth = n_p6_fft_bass_smooth < 0 ? n_p6_fft_bass_target : n_p6_fft_bass_smooth * 0.720f + n_p6_fft_bass_target * 0.280f;
  n_p6_fft_mids_smooth = n_p6_fft_mids_smooth < 0 ? n_p6_fft_mids_target : n_p6_fft_mids_smooth * 0.720f + n_p6_fft_mids_target * 0.280f;
  n_p6_fft_treble_smooth = n_p6_fft_treble_smooth < 0 ? n_p6_fft_treble_target : n_p6_fft_treble_smooth * 0.720f + n_p6_fft_treble_target * 0.280f;
  float n_p6_fft_bass = n_p6_fft_bass_smooth, n_p6_fft_mids = n_p6_fft_mids_smooth, n_p6_fft_treble = n_p6_fft_treble_smooth;
  CRGBPalette16 pal_p6_poline(CRGB(0,29,68), CRGB(0,68,119), CRGB(0,106,168), CRGB(0,141,213), CRGB(0,169,250), CRGB(24,182,255), CRGB(41,189,255), CRGB(47,191,255), CRGB(47,191,255), CRGB(30,189,255), CRGB(0,181,236), CRGB(0,150,159), CRGB(0,85,31), CRGB(110,135,0), CRGB(255,221,14), CRGB(255,233,166));
  { /* CustomFormula: sin((r*16 + angle*4 - t*(1+a*7)))*0.5+0.5 */
    float a=n_p6_fft_bass, b=n_p6_fft_mids; (void)a; (void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=(float)_x/(WIDTH-1>0?WIDTH-1:1),y=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float _v=sin((r*16 + angle*4 - t*(1+a*7)))*0.5+0.5;
      p14_buf_p6_custom[_y*WIDTH+_x]=ColorFromPalette(pal_p6_poline,(uint8_t)(fmod(fmod(_v,1)+1,1)*255));}}
  { // Palette gradient
    float _a=90*0.01745329f,_co=cos(_a),_si=sin(_a);
    float _pmin=(_co<0?(WIDTH-1)*_co:0)+(_si<0?(HEIGHT-1)*_si:0);
    float _pmax=(_co>0?(WIDTH-1)*_co:0)+(_si>0?(HEIGHT-1)*_si:0);
    float _rng=max(1e-6f,_pmax-_pmin);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _tn=(_x*_co+_y*_si-_pmin)/_rng;
      p14_buf_p6_gradient[_y*WIDTH+_x]=ColorFromPalette(pal_p6_poline,(uint8_t)((_tn*6.0f+t*0.08f)*255));}}
  { ::memmove(p14_buf_p6_blend, p14_buf_p6_custom, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.34); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p14_buf_p6_blend[_i], _b=p14_buf_p6_gradient[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p14_buf_p6_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  float n_p6_rate_result = mapFloat(n_p6_fft_mids, 0, 1, 18, 110);
  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=n_p6_rate_result;
    float _a=_rate*t*0.01745329f,_co=cos(_a),_si=sin(_a);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _rx=_x-_cx,_ry=_y-_cy; int _sx=(int)floorf(_cx+_rx*_co+_ry*_si+0.5f), _sy=(int)floorf(_cy-_rx*_si+_ry*_co+0.5f);
      p14_buf_p6_transform[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?p14_buf_p6_blend[_sy*WIDTH+_sx]:CRGB::Black;}}
  { ::memmove(p14_buf_p6_gamma, p14_buf_p6_transform, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p14_buf_p6_gamma, NUM_LEDS, 2.240f); }
  ::memmove(leds, p14_buf_p6_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p15(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p5_fft_bass_target = constrain(_audioBass * 1.240f, 0.0f, 1.0f), n_p5_fft_mids_target = constrain(_audioMids * 1.240f, 0.0f, 1.0f), n_p5_fft_treble_target = constrain(_audioTreble * 1.240f, 0.0f, 1.0f);
  static float n_p5_fft_bass_smooth = -1, n_p5_fft_mids_smooth = -1, n_p5_fft_treble_smooth = -1;
  n_p5_fft_bass_smooth = n_p5_fft_bass_smooth < 0 ? n_p5_fft_bass_target : n_p5_fft_bass_smooth * 0.720f + n_p5_fft_bass_target * 0.280f;
  n_p5_fft_mids_smooth = n_p5_fft_mids_smooth < 0 ? n_p5_fft_mids_target : n_p5_fft_mids_smooth * 0.720f + n_p5_fft_mids_target * 0.280f;
  n_p5_fft_treble_smooth = n_p5_fft_treble_smooth < 0 ? n_p5_fft_treble_target : n_p5_fft_treble_smooth * 0.720f + n_p5_fft_treble_target * 0.280f;
  float n_p5_fft_bass = n_p5_fft_bass_smooth, n_p5_fft_mids = n_p5_fft_mids_smooth, n_p5_fft_treble = n_p5_fft_treble_smooth;
  uint8_t n_p5_hue_hue = (uint8_t)(((n_p5_fft_bass)*0.5f+(n_p5_fft_mids)*0.3f+(n_p5_fft_treble)*0.2f)*255);
  CRGBPalette16 pal_p5_poline(CRGB(42,59,143), CRGB(52,28,115), CRGB(105,24,121), CRGB(159,25,129), CRGB(207,27,130), CRGB(233,47,133), CRGB(240,77,142), CRGB(243,96,151), CRGB(244,100,149), CRGB(244,91,135), CRGB(244,78,110), CRGB(246,66,76), CRGB(247,83,60), CRGB(250,125,66), CRGB(253,172,87), CRGB(255,213,122));
  { /* FieldFormula: sin8(r*220 + angle*52 + t*(42 + a*120))/255 */
    float a=n_p5_fft_bass, b=0; (void)a;(void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=_x, y=_y; (void)x;(void)y;
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float fieldIn=0.0f; (void)fieldIn;
      float _v=_fsin8(r*220 + angle*52 + t*(42 + a*120))/255;
      p15_field_p5_src[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}
  { /* DistanceField */
    float _px=n_p5_fft_mids, _py=n_p5_fft_treble, _sc=2.2; if(_sc<0.0001f)_sc=0.0001f;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _nx=(float)_x/(WIDTH-1>0?WIDTH-1:1),_ny=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);
      float _dx=_nx-_px,_dy=_ny-_py;
      float _d=sqrtf(_dx*_dx+_dy*_dy)/1.41421356f*_sc;
      p15_field_p5_ring[_y*WIDTH+_x]=constrain(_d,0.0f,1.0f);}}
  { /* FieldMath: max */
    for(int _i=0;_i<NUM_LEDS;_i++){
      float _a=p15_field_p5_src[_i], _b=p15_field_p5_ring[_i];
      p15_field_p5_combine[_i]=constrain(max(_a, _b),0.0f,1.0f);}}
  { /* FieldRotate */ float _ang=((n_p5_hue_hue)+t*0)*0.01745329f;
    float _ca=cosf(-_ang),_sa=sinf(-_ang),_cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _dx=_x-_cx,_dy=_y-_cy;
      int _sx=(((int)roundf(_dx*_ca-_dy*_sa+_cx))%WIDTH+WIDTH)%WIDTH;
      int _sy=(((int)roundf(_dx*_sa+_dy*_ca+_cy))%HEIGHT+HEIGHT)%HEIGHT;
      p15_field_p5_rotate[_y*WIDTH+_x]=p15_field_p5_combine[_sy*WIDTH+_sx];}}
  { float _br=constrain(1,0.0f,1.0f);
    for(int _i=0;_i<NUM_LEDS;_i++)
      p15_buf_p5_frame[_i]=ColorFromPalette(pal_p5_poline,(uint8_t)(p15_field_p5_rotate[_i]*255),(uint8_t)(_br*255)); }
  ::memmove(p15_buf_p5_blur, p15_buf_p5_frame, sizeof(CRGB) * NUM_LEDS); blur2d(p15_buf_p5_blur, WIDTH, HEIGHT, 15, _xyMap);
  { ::memmove(p15_buf_p5_gamma, p15_buf_p5_blur, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p15_buf_p5_gamma, NUM_LEDS, 2.300f); }
  ::memmove(leds, p15_buf_p5_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p16(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p4_fft_bass_target = constrain(_audioBass * 1.240f, 0.0f, 1.0f), n_p4_fft_mids_target = constrain(_audioMids * 1.240f, 0.0f, 1.0f), n_p4_fft_treble_target = constrain(_audioTreble * 1.240f, 0.0f, 1.0f);
  static float n_p4_fft_bass_smooth = -1, n_p4_fft_mids_smooth = -1, n_p4_fft_treble_smooth = -1;
  n_p4_fft_bass_smooth = n_p4_fft_bass_smooth < 0 ? n_p4_fft_bass_target : n_p4_fft_bass_smooth * 0.720f + n_p4_fft_bass_target * 0.280f;
  n_p4_fft_mids_smooth = n_p4_fft_mids_smooth < 0 ? n_p4_fft_mids_target : n_p4_fft_mids_smooth * 0.720f + n_p4_fft_mids_target * 0.280f;
  n_p4_fft_treble_smooth = n_p4_fft_treble_smooth < 0 ? n_p4_fft_treble_target : n_p4_fft_treble_smooth * 0.720f + n_p4_fft_treble_target * 0.280f;
  float n_p4_fft_bass = n_p4_fft_bass_smooth, n_p4_fft_mids = n_p4_fft_mids_smooth, n_p4_fft_treble = n_p4_fft_treble_smooth;
  bool n_p4_beat_beat = false;
  static float n_p4_beat_bpm = 120.0f, n_p4_beat_detector_fast = 0.0f, n_p4_beat_detector_slow = 0.0f, n_p4_beat_detector_prevFlux = 0.0f, n_p4_beat_detector_prevPrevFlux = 0.0f;
  static float n_p4_beat_detector_prevSpectrum[32]; static bool n_p4_beat_detector_ready = false; static uint32_t n_p4_beat_detector_lastBeat = 0;
  if (n_p4_beat_detector_ready) {
    float _flux = 0.0f, _weightSum = 0.0f;
    for (int _i = 0; _i < 32; _i++) {
      float _diff = _audioSpectrum[_i] - n_p4_beat_detector_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;
      float _weight = _i < 6 ? 2.0f : (_i < 12 ? 1.35f : (_i < 20 ? 0.85f : 0.45f)); _flux += _diff * _weight; _weightSum += _weight;
    }
    _flux = _weightSum > 0.0f ? _flux / _weightSum : 0.0f;
    n_p4_beat_detector_fast += (_flux - n_p4_beat_detector_fast) * 0.4724f;
    n_p4_beat_detector_slow += (_flux - n_p4_beat_detector_slow) * 0.1276f;
    float _onset = n_p4_beat_detector_fast - n_p4_beat_detector_slow, _baseline = n_p4_beat_detector_slow > 0.02f ? n_p4_beat_detector_slow : 0.02f;
    float _gap = constrain(60000.0f / n_p4_beat_bpm * 0.42f, 150.0f, 600.0f); uint32_t _now = millis();
    bool _peak = _flux > n_p4_beat_detector_prevFlux && n_p4_beat_detector_prevFlux >= n_p4_beat_detector_prevPrevFlux;
    n_p4_beat_beat = _flux > 0.0550f && _peak && _onset > 0.0248f && _onset / _baseline > 1.1f && (n_p4_beat_detector_lastBeat == 0 || _now - n_p4_beat_detector_lastBeat >= (uint32_t)_gap);
    if (n_p4_beat_beat) { if (n_p4_beat_detector_lastBeat != 0) { float _interval = _now - n_p4_beat_detector_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) n_p4_beat_bpm = n_p4_beat_bpm * 0.65f + (60000.0f / _interval) * 0.35f; } n_p4_beat_detector_lastBeat = _now; }
    n_p4_beat_detector_prevPrevFlux = n_p4_beat_detector_prevFlux; n_p4_beat_detector_prevFlux = _flux;
  }
  for (int _i = 0; _i < 32; _i++) n_p4_beat_detector_prevSpectrum[_i] = _audioSpectrum[_i]; n_p4_beat_detector_ready = true;
  CRGBPalette16 pal_p4_poline(CRGB(19,36,24), CRGB(33,96,49), CRGB(34,165,67), CRGB(34,165,67), CRGB(29,230,78), CRGB(59,245,104), CRGB(80,253,122), CRGB(88,255,128), CRGB(88,255,128), CRGB(76,255,113), CRGB(46,255,63), CRGB(47,255,9), CRGB(134,248,0), CRGB(134,248,0), CRGB(246,255,26), CRGB(255,215,106));
  float n_p4_gaborFreq_result = mapFloat(n_p4_fft_treble, 0, 1, 0.6, 2.4);
  { // Gabor noise
    float _spd=(constrain((n_p4_fft_mids), 0.0f, 1.0f) * 1.500f),_sc=(constrain((n_p4_fft_bass), 0.0f, 1.0f) * 0.500f),_fr=n_p4_gaborFreq_result,_om=25*0.01745329f,_co=cos(_om),_si=sin(_om);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _v=0;
      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){
        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy),_h2=_worleyHash(_cx+31,_cy-17);
        float _fx=_cx+0.5f+(_h-0.5f),_fy=_cy+0.5f+(_h2-0.5f);
        float _dx=_px-_fx,_dy=_py-_fy,_g=expf(-2.5f*(_dx*_dx+_dy*_dy));
        float _proj=_dx*_co+_dy*_si,_w=_h2<0.5f?1.0f:-1.0f;
        _v+=_w*_g*cosf(6.2831853f*_fr*_proj+t*_spd+_h*6.2831853f); }
      p16_buf_p4_gabor[_y*WIDTH+_x]=ColorFromPalette(pal_p4_poline,(uint8_t)((_v*0.5f+0.5f)*255));}}
  { // Flow field
    static float _fpx_p4_flow[100], _fpy_p4_flow[100], _ftr_p4_flow[NUM_LEDS]; static bool _fi_p4_flow=false;
    if(!_fi_p4_flow){ for(int _i=0;_i<100;_i++){ _fpx_p4_flow[_i]=(random8()/255.0f)*WIDTH; _fpy_p4_flow[_i]=(random8()/255.0f)*HEIGHT; } for(int _i=0;_i<NUM_LEDS;_i++)_ftr_p4_flow[_i]=0; _fi_p4_flow=true; }
    float _spd=(constrain((n_p4_fft_bass), 0.0f, 1.0f) * 1.500f),_sc=(constrain((n_p4_fft_mids), 0.0f, 1.0f) * 1.000f); uint16_t _z=(uint16_t)(t*100);
    for(int _i=0;_i<NUM_LEDS;_i++) _ftr_p4_flow[_i]*=0.9f;
    for(int _i=0;_i<100;_i++){
      float _a=(inoise8((uint16_t)(_fpx_p4_flow[_i]*_sc*256),(uint16_t)(_fpy_p4_flow[_i]*_sc*256),_z)/255.0f)*6.2831f*2;
      _fpx_p4_flow[_i]=fmodf(_fpx_p4_flow[_i]+cos(_a)*_spd*0.6f+WIDTH,WIDTH); _fpy_p4_flow[_i]=fmodf(_fpy_p4_flow[_i]+sin(_a)*_spd*0.6f+HEIGHT,HEIGHT);
      int _xi=(int)_fpx_p4_flow[_i],_yi=(int)_fpy_p4_flow[_i]; if(_xi>=0&&_xi<WIDTH&&_yi>=0&&_yi<HEIGHT){ int _id=_yi*WIDTH+_xi; _ftr_p4_flow[_id]=min(1.0f,_ftr_p4_flow[_id]+0.5f); } }
    for(int _i=0;_i<NUM_LEDS;_i++) p16_buf_p4_flow[_i]=ColorFromPalette(pal_p4_poline,(uint8_t)(_ftr_p4_flow[_i]*255)); }
  { ::memmove(p16_buf_p4_blend, p16_buf_p4_gabor, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.44); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p16_buf_p4_blend[_i], _b=p16_buf_p4_flow[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=_av<0.5f?2.0f*_av*_bv:1.0f-2.0f*(1.0f-_av)*(1.0f-_bv);
        p16_buf_p4_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  {
    ::memmove(p16_buf_p4_flash, p16_buf_p4_blend, sizeof(CRGB) * NUM_LEDS);
    static float _flash_p4_flash = 0;
    if (n_p4_beat_beat) _flash_p4_flash = 1.0f; else _flash_p4_flash *= 0.76;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p16_buf_p4_flash[_i].r = qadd8(p16_buf_p4_flash[_i].r, (uint8_t)((255 - p16_buf_p4_flash[_i].r) * _flash_p4_flash));
      p16_buf_p4_flash[_i].g = qadd8(p16_buf_p4_flash[_i].g, (uint8_t)((255 - p16_buf_p4_flash[_i].g) * _flash_p4_flash));
      p16_buf_p4_flash[_i].b = qadd8(p16_buf_p4_flash[_i].b, (uint8_t)((255 - p16_buf_p4_flash[_i].b) * _flash_p4_flash));
    }
  }
  { ::memmove(p16_buf_p4_gamma, p16_buf_p4_flash, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p16_buf_p4_gamma, NUM_LEDS, 2.220f); }
  ::memmove(leds, p16_buf_p4_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p17(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p3_fft_bass_target = constrain(_audioBass * 1.240f, 0.0f, 1.0f), n_p3_fft_mids_target = constrain(_audioMids * 1.240f, 0.0f, 1.0f), n_p3_fft_treble_target = constrain(_audioTreble * 1.240f, 0.0f, 1.0f);
  static float n_p3_fft_bass_smooth = -1, n_p3_fft_mids_smooth = -1, n_p3_fft_treble_smooth = -1;
  n_p3_fft_bass_smooth = n_p3_fft_bass_smooth < 0 ? n_p3_fft_bass_target : n_p3_fft_bass_smooth * 0.720f + n_p3_fft_bass_target * 0.280f;
  n_p3_fft_mids_smooth = n_p3_fft_mids_smooth < 0 ? n_p3_fft_mids_target : n_p3_fft_mids_smooth * 0.720f + n_p3_fft_mids_target * 0.280f;
  n_p3_fft_treble_smooth = n_p3_fft_treble_smooth < 0 ? n_p3_fft_treble_target : n_p3_fft_treble_smooth * 0.720f + n_p3_fft_treble_target * 0.280f;
  float n_p3_fft_bass = n_p3_fft_bass_smooth, n_p3_fft_mids = n_p3_fft_mids_smooth, n_p3_fft_treble = n_p3_fft_treble_smooth;
  // PaletteSelector — drives ForestColors_p in connected palette-consuming nodes
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_p3_palMix;
  { uint8_t _amt = (uint8_t)((n_p3_fft_mids) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_p3_palMix[_i] = blend(ColorFromPalette(ForestColors_p, _p), ColorFromPalette(PartyColors_p, _p), _amt); } }
  float n_p3_rdFeed_result = mapFloat(n_p3_fft_bass, 0, 1, 0.038, 0.07);
  float n_p3_rdKill_result = mapFloat(n_p3_fft_treble, 0, 1, 0.05, 0.067);
  { // ReactionDiffusion (Gray-Scott)
    static float _u_p3_rd[NUM_LEDS], _v_p3_rd[NUM_LEDS], _un_p3_rd[NUM_LEDS], _vn_p3_rd[NUM_LEDS]; static bool _rd_p3_rd = false;
    if (!_rd_p3_rd) { for (int _i = 0; _i < NUM_LEDS; _i++) { _u_p3_rd[_i] = 1; _v_p3_rd[_i] = 0; }
      for (int _y = HEIGHT/2-2; _y <= HEIGHT/2+1; _y++) for (int _x = WIDTH/2-2; _x <= WIDTH/2+1; _x++)
        if (_x>=0&&_x<WIDTH&&_y>=0&&_y<HEIGHT) { _u_p3_rd[_y*WIDTH+_x]=0.5f; _v_p3_rd[_y*WIDTH+_x]=0.5f; } _rd_p3_rd=true; }
    float _f=n_p3_rdFeed_result, _k=n_p3_rdKill_result;
    for (int _it=0; _it<11; _it++) {
      for (int _y=0; _y<HEIGHT; _y++) { int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;
        for (int _x=0; _x<WIDTH; _x++) { int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;
          float _lu=(_u_p3_rd[_ym+_x]+_u_p3_rd[_yp+_x]+_u_p3_rd[_yr+_xm]+_u_p3_rd[_yr+_xp])*0.2f+(_u_p3_rd[_ym+_xm]+_u_p3_rd[_ym+_xp]+_u_p3_rd[_yp+_xm]+_u_p3_rd[_yp+_xp])*0.05f-_u_p3_rd[_i];
          float _lv=(_v_p3_rd[_ym+_x]+_v_p3_rd[_yp+_x]+_v_p3_rd[_yr+_xm]+_v_p3_rd[_yr+_xp])*0.2f+(_v_p3_rd[_ym+_xm]+_v_p3_rd[_ym+_xp]+_v_p3_rd[_yp+_xm]+_v_p3_rd[_yp+_xp])*0.05f-_v_p3_rd[_i];
          float _uvv=_u_p3_rd[_i]*_v_p3_rd[_i]*_v_p3_rd[_i];
          _un_p3_rd[_i]=constrain(_u_p3_rd[_i]+0.16f*_lu-_uvv+_f*(1-_u_p3_rd[_i]),0.0f,1.0f);
          _vn_p3_rd[_i]=constrain(_v_p3_rd[_i]+0.08f*_lv+_uvv-(_k+_f)*_v_p3_rd[_i],0.0f,1.0f); } }
      ::memcpy(_u_p3_rd,_un_p3_rd,sizeof(_u_p3_rd)); ::memcpy(_v_p3_rd,_vn_p3_rd,sizeof(_v_p3_rd)); }
    for (int _i=0; _i<NUM_LEDS; _i++) p17_buf_p3_rd[_i]=ColorFromPalette(pal_p3_palMix,(uint8_t)(_v_p3_rd[_i]*255)); }
  { // Blobs (metaballs)
    float _spd=(constrain((n_p3_fft_bass), 0.0f, 1.0f) * 2.000f), _r=(constrain((n_p3_fft_mids), 0.0f, 1.0f) * 0.500f)*min(WIDTH,HEIGHT), _r2=_r*_r;
    float _bx[5], _by[5];
    for(int _i=0;_i<5;_i++){ _bx[_i]=WIDTH*(0.5f+0.4f*sin(t*_spd*(0.7f+_i*0.13f)+_i*1.7f)); _by[_i]=HEIGHT*(0.5f+0.4f*cos(t*_spd*(0.6f+_i*0.17f)+_i*2.3f)); }
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){ float _f=0;
      for(int _i=0;_i<5;_i++){ float _dx=_x-_bx[_i],_dy=_y-_by[_i]; _f+=_r2/(_dx*_dx+_dy*_dy+1.0f); }
      p17_buf_p3_blobs[_y*WIDTH+_x]=ColorFromPalette(pal_p3_palMix,(uint8_t)((_f/(_f+1.0f))*255)); }}
  { ::memmove(p17_buf_p3_blend, p17_buf_p3_rd, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.4); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p17_buf_p3_blend[_i], _b=p17_buf_p3_blobs[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p17_buf_p3_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { ::memmove(p17_buf_p3_gamma, p17_buf_p3_blend, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p17_buf_p3_gamma, NUM_LEDS, 2.260f); }
  ::memmove(leds, p17_buf_p3_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p18(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p2_fft_bass_target = constrain(_audioBass * 1.240f, 0.0f, 1.0f), n_p2_fft_mids_target = constrain(_audioMids * 1.240f, 0.0f, 1.0f), n_p2_fft_treble_target = constrain(_audioTreble * 1.240f, 0.0f, 1.0f);
  static float n_p2_fft_bass_smooth = -1, n_p2_fft_mids_smooth = -1, n_p2_fft_treble_smooth = -1;
  n_p2_fft_bass_smooth = n_p2_fft_bass_smooth < 0 ? n_p2_fft_bass_target : n_p2_fft_bass_smooth * 0.720f + n_p2_fft_bass_target * 0.280f;
  n_p2_fft_mids_smooth = n_p2_fft_mids_smooth < 0 ? n_p2_fft_mids_target : n_p2_fft_mids_smooth * 0.720f + n_p2_fft_mids_target * 0.280f;
  n_p2_fft_treble_smooth = n_p2_fft_treble_smooth < 0 ? n_p2_fft_treble_target : n_p2_fft_treble_smooth * 0.720f + n_p2_fft_treble_target * 0.280f;
  float n_p2_fft_bass = n_p2_fft_bass_smooth, n_p2_fft_mids = n_p2_fft_mids_smooth, n_p2_fft_treble = n_p2_fft_treble_smooth;
  uint8_t n_p2_hue_hue = (uint8_t)(((n_p2_fft_bass)*0.5f+(n_p2_fft_mids)*0.3f+(n_p2_fft_treble)*0.2f)*255);
  CRGBPalette16 pal_p2_poline(CRGB(8,20,31), CRGB(15,73,85), CRGB(16,131,144), CRGB(16,131,144), CRGB(13,186,199), CRGB(7,231,245), CRGB(23,242,253), CRGB(30,244,255), CRGB(30,244,255), CRGB(16,235,255), CRGB(0,184,232), CRGB(0,90,181), CRGB(14,0,160), CRGB(14,0,160), CRGB(142,0,211), CRGB(251,59,255));
  { /* FieldFormula: sin8((x+y)*18 + t*(30 + a*130))/255 */
    float a=n_p2_fft_bass, b=n_p2_fft_mids; (void)a;(void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=_x, y=_y; (void)x;(void)y;
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float fieldIn=0.0f; (void)fieldIn;
      float _v=_fsin8((x+y)*18 + t*(30 + a*130))/255;
      p18_field_p2_base[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}
  { /* FieldFormula: sin8(y*22 + t*(18 + a*90))/255 */
    float a=n_p2_fft_mids, b=0; (void)a;(void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=_x, y=_y; (void)x;(void)y;
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float fieldIn=0.0f; (void)fieldIn;
      float _v=_fsin8(y*22 + t*(18 + a*90))/255;
      p18_field_p2_dx[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}
  { /* FieldFormula: cos8(x*22 - t*(18 + b*90))/255 */
    float a=0, b=n_p2_fft_treble; (void)a;(void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=_x, y=_y; (void)x;(void)y;
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float fieldIn=0.0f; (void)fieldIn;
      float _v=_fcos8(x*22 - t*(18 + b*90))/255;
      p18_field_p2_dy[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}
  { /* FieldWarp */ float _st=1.05;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _ox=(2.0f*p18_field_p2_dx[_y*WIDTH+_x]-1.0f)*_st,_oy=(2.0f*p18_field_p2_dy[_y*WIDTH+_x]-1.0f)*_st;
      int _sx=(int)roundf(_x+_ox); if(_sx<0)_sx=0; if(_sx>WIDTH-1)_sx=WIDTH-1;
      int _sy=(int)roundf(_y+_oy); if(_sy<0)_sy=0; if(_sy>HEIGHT-1)_sy=HEIGHT-1;
      p18_field_p2_warp[_y*WIDTH+_x]=p18_field_p2_base[_sy*WIDTH+_sx];}}
  { /* FieldTile */
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      int _sx=(_x*4)%WIDTH,_sy=(_y*4)%HEIGHT;
      p18_field_p2_tile[_y*WIDTH+_x]=p18_field_p2_warp[_sy*WIDTH+_sx];}}
  { /* FieldRotate */ float _ang=((n_p2_hue_hue)+t*0)*0.01745329f;
    float _ca=cosf(-_ang),_sa=sinf(-_ang),_cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _dx=_x-_cx,_dy=_y-_cy;
      int _sx=(((int)roundf(_dx*_ca-_dy*_sa+_cx))%WIDTH+WIDTH)%WIDTH;
      int _sy=(((int)roundf(_dx*_sa+_dy*_ca+_cy))%HEIGHT+HEIGHT)%HEIGHT;
      p18_field_p2_rotate[_y*WIDTH+_x]=p18_field_p2_tile[_sy*WIDTH+_sx];}}
  { float _br=constrain(1,0.0f,1.0f);
    for(int _i=0;_i<NUM_LEDS;_i++)
      p18_buf_p2_frame[_i]=ColorFromPalette(pal_p2_poline,(uint8_t)(p18_field_p2_rotate[_i]*255),(uint8_t)(_br*255)); }
  { ::memmove(p18_buf_p2_gamma, p18_buf_p2_frame, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p18_buf_p2_gamma, NUM_LEDS, 2.280f); }
  ::memmove(leds, p18_buf_p2_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p19(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p1_fft_bass_target = constrain(_audioBass * 1.240f, 0.0f, 1.0f), n_p1_fft_mids_target = constrain(_audioMids * 1.240f, 0.0f, 1.0f), n_p1_fft_treble_target = constrain(_audioTreble * 1.240f, 0.0f, 1.0f);
  static float n_p1_fft_bass_smooth = -1, n_p1_fft_mids_smooth = -1, n_p1_fft_treble_smooth = -1;
  n_p1_fft_bass_smooth = n_p1_fft_bass_smooth < 0 ? n_p1_fft_bass_target : n_p1_fft_bass_smooth * 0.720f + n_p1_fft_bass_target * 0.280f;
  n_p1_fft_mids_smooth = n_p1_fft_mids_smooth < 0 ? n_p1_fft_mids_target : n_p1_fft_mids_smooth * 0.720f + n_p1_fft_mids_target * 0.280f;
  n_p1_fft_treble_smooth = n_p1_fft_treble_smooth < 0 ? n_p1_fft_treble_target : n_p1_fft_treble_smooth * 0.720f + n_p1_fft_treble_target * 0.280f;
  float n_p1_fft_bass = n_p1_fft_bass_smooth, n_p1_fft_mids = n_p1_fft_mids_smooth, n_p1_fft_treble = n_p1_fft_treble_smooth;
  bool n_p1_beat_beat = false;
  static float n_p1_beat_bpm = 120.0f, n_p1_beat_detector_fast = 0.0f, n_p1_beat_detector_slow = 0.0f, n_p1_beat_detector_prevFlux = 0.0f, n_p1_beat_detector_prevPrevFlux = 0.0f;
  static float n_p1_beat_detector_prevSpectrum[32]; static bool n_p1_beat_detector_ready = false; static uint32_t n_p1_beat_detector_lastBeat = 0;
  if (n_p1_beat_detector_ready) {
    float _flux = 0.0f, _weightSum = 0.0f;
    for (int _i = 0; _i < 32; _i++) {
      float _diff = _audioSpectrum[_i] - n_p1_beat_detector_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;
      float _weight = _i < 6 ? 2.0f : (_i < 12 ? 1.35f : (_i < 20 ? 0.85f : 0.45f)); _flux += _diff * _weight; _weightSum += _weight;
    }
    _flux = _weightSum > 0.0f ? _flux / _weightSum : 0.0f;
    n_p1_beat_detector_fast += (_flux - n_p1_beat_detector_fast) * 0.4724f;
    n_p1_beat_detector_slow += (_flux - n_p1_beat_detector_slow) * 0.1276f;
    float _onset = n_p1_beat_detector_fast - n_p1_beat_detector_slow, _baseline = n_p1_beat_detector_slow > 0.02f ? n_p1_beat_detector_slow : 0.02f;
    float _gap = constrain(60000.0f / n_p1_beat_bpm * 0.42f, 150.0f, 600.0f); uint32_t _now = millis();
    bool _peak = _flux > n_p1_beat_detector_prevFlux && n_p1_beat_detector_prevFlux >= n_p1_beat_detector_prevPrevFlux;
    n_p1_beat_beat = _flux > 0.0550f && _peak && _onset > 0.0248f && _onset / _baseline > 1.1f && (n_p1_beat_detector_lastBeat == 0 || _now - n_p1_beat_detector_lastBeat >= (uint32_t)_gap);
    if (n_p1_beat_beat) { if (n_p1_beat_detector_lastBeat != 0) { float _interval = _now - n_p1_beat_detector_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) n_p1_beat_bpm = n_p1_beat_bpm * 0.65f + (60000.0f / _interval) * 0.35f; } n_p1_beat_detector_lastBeat = _now; }
    n_p1_beat_detector_prevPrevFlux = n_p1_beat_detector_prevFlux; n_p1_beat_detector_prevFlux = _flux;
  }
  for (int _i = 0; _i < 32; _i++) n_p1_beat_detector_prevSpectrum[_i] = _audioSpectrum[_i]; n_p1_beat_detector_ready = true;
  CRGBPalette16 pal_p1_poline(CRGB(0,246,255), CRGB(0,107,162), CRGB(3,0,113), CRGB(105,0,144), CRGB(203,0,196), CRGB(255,1,214), CRGB(255,35,208), CRGB(255,47,207), CRGB(255,47,207), CRGB(255,39,199), CRGB(255,16,171), CRGB(240,0,112), CRGB(217,0,34), CRGB(224,54,0), CRGB(255,158,16), CRGB(255,228,92));
  uint8_t n_p1_hue_hue = (uint8_t)(((n_p1_fft_bass)*0.5f+(n_p1_fft_mids)*0.3f+(n_p1_fft_treble)*0.2f)*255);
  {
    fill_solid(p19_buf_p1_bars, NUM_LEDS, CRGB::Black);
    float _b = min(1.0f, max(0.0f, n_p1_fft_bass)), _m = min(1.0f, max(0.0f, n_p1_fft_mids)), _t = min(1.0f, max(0.0f, n_p1_fft_treble));
    float _strength = min(1.0f, max(0.0f, n_p1_fft_bass));
    float _spd = min(1.0f, max(0.0f, n_p1_fft_treble));
    const int _cols = max(1, ((WIDTH + 1) / 2));
    float _levels[3] = { _b, _m, _t };
    float _geometryMotion = t * (0.45f + _spd * 3.2f);
    float _paletteScroll = t * (0.08f + _spd * 0.42f);
    for (int _x = 0; _x < _cols; _x++) {
      float _nx = _cols <= 1 ? 0.0f : (float)_x / (float)(_cols - 1);
      float _spec = _nx * 2.0f;
      int _left = (int)floorf(_spec);
      int _right = min(2, _left + 1);
      float _mix = _spec - (float)_left;
      float _base = _levels[_left] * (1.0f - _mix) + _levels[_right] * _mix;
      float _ripple = sinf(_nx * 10.5f - _geometryMotion * (1.1f + _t * 1.8f)) * 0.08f * _strength;
      float _shimmer = max(0.0f, sinf(_nx * 21.0f + _geometryMotion * (2.0f + _m * 2.5f))) * 0.06f * _t * _strength;
      float _level = min(1.0f, max(0.0f, _base * (0.45f + _strength * 0.9f) + _ripple + _shimmer));
      int _barH = max(0, (int)roundf(_level * HEIGHT));
      for (int _row = 0; _row < _barH; _row++) {
        int _y = HEIGHT - 1 - _row;
        float _vertical = HEIGHT <= 1 ? 0.0f : (float)_row / (float)(HEIGHT - 1);
        float _pulse = 0.72f + 0.28f * sinf(_vertical * 6.2f - _geometryMotion * (1.4f + _b * 1.6f));
        float _v = min(1.0f, max(0.0f, (0.28f + _vertical * 0.72f) * _pulse));
        float _pt = _nx + _paletteScroll + _vertical * (0.12f + _m * 0.12f) + _spec * 0.08f;
        CRGB _px = ColorFromPalette(pal_p1_poline, (uint8_t)(_pt * 255));
        _px.nscale8((uint8_t)(_v * 255));
        p19_buf_p1_bars[_y * WIDTH + _x] = _px;
        p19_buf_p1_bars[_y * WIDTH + (WIDTH - 1 - _x)] = _px;
      }
      if (_barH > 0) {
        int _peakY = max(0, HEIGHT - _barH);
        CRGB _peak = ColorFromPalette(pal_p1_poline, (uint8_t)((_nx + _paletteScroll + _spec * 0.08f) * 255));
        _peak.nscale8((uint8_t)(min(1.0f, 0.6f + _t * 0.35f + _strength * 0.2f) * 255));
        p19_buf_p1_bars[_peakY * WIDTH + _x] = _peak;
        p19_buf_p1_bars[_peakY * WIDTH + (WIDTH - 1 - _x)] = _peak;
      }
    }
  }
  { float _b=n_p1_fft_bass,_m=n_p1_fft_mids,_tr=n_p1_fft_treble,_spd=(0.000f + constrain((n_p1_fft_mids), 0.0f, 1.0f) * 0.200f),_sc=(0.000f + constrain((n_p1_fft_bass), 0.0f, 1.0f) * 0.200f);
    float _flow=t*_spd*(0.2f+_m*1.5f); uint8_t _bright=(uint8_t)(min(1.0f,0.3f+_b)*255);
    float _vamp=0.2f+_tr*0.7f+_b*0.3f;
    float _vflow=((float)inoise8((uint16_t)((t*_spd*4.0f+50)*256),4429)/128.0f-1.0f)*_vamp;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      uint8_t _v=inoise8((uint16_t)((_x*_sc+_flow)*256),(uint16_t)((_y*_sc*0.6f+_vflow+8.0f)*256));
      p19_buf_p1_flow[_y*WIDTH+_x]=ColorFromPalette(pal_p1_poline,(uint8_t)(_v+_tr*80)); p19_buf_p1_flow[_y*WIDTH+_x].nscale8(_bright);}}
  { ::memmove(p19_buf_p1_tr, p19_buf_p1_bars, sizeof(CRGB) * NUM_LEDS); float _tt=n_p1_fft_bass; 
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _n=((float)_x/WIDTH+(float)_y/HEIGHT)*0.5f;
      if(_n<_tt) p19_buf_p1_tr[_y*WIDTH+_x] = p19_buf_p1_flow[_y*WIDTH+_x];
    } }
  { ::memmove(p19_buf_p1_shift, p19_buf_p1_tr, sizeof(CRGB) * NUM_LEDS); uint8_t _sh = (uint8_t)((n_p1_hue_hue) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) p19_buf_p1_shift[_i] = CHSV(rgb2hsv_approximate(p19_buf_p1_shift[_i]).hue + _sh, rgb2hsv_approximate(p19_buf_p1_shift[_i]).sat, rgb2hsv_approximate(p19_buf_p1_shift[_i]).val); }
  {
    ::memmove(p19_buf_p1_flash, p19_buf_p1_shift, sizeof(CRGB) * NUM_LEDS);
    static float _flash_p1_flash = 0;
    if (n_p1_beat_beat) _flash_p1_flash = 1.0f; else _flash_p1_flash *= 0.68;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p19_buf_p1_flash[_i].r = qadd8(p19_buf_p1_flash[_i].r, (uint8_t)((255 - p19_buf_p1_flash[_i].r) * _flash_p1_flash));
      p19_buf_p1_flash[_i].g = qadd8(p19_buf_p1_flash[_i].g, (uint8_t)((255 - p19_buf_p1_flash[_i].g) * _flash_p1_flash));
      p19_buf_p1_flash[_i].b = qadd8(p19_buf_p1_flash[_i].b, (uint8_t)((255 - p19_buf_p1_flash[_i].b) * _flash_p1_flash));
    }
  }
  { ::memmove(p19_buf_p1_gamma, p19_buf_p1_flash, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p19_buf_p1_gamma, NUM_LEDS, 2.220f); }
  ::memmove(leds, p19_buf_p1_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p20(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_i_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_i_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_i_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_i_fft_bass_smooth = -1, n_i_fft_mids_smooth = -1, n_i_fft_treble_smooth = -1;
  n_i_fft_bass_smooth = n_i_fft_bass_smooth < 0 ? n_i_fft_bass_target : n_i_fft_bass_smooth * 0.720f + n_i_fft_bass_target * 0.280f;
  n_i_fft_mids_smooth = n_i_fft_mids_smooth < 0 ? n_i_fft_mids_target : n_i_fft_mids_smooth * 0.720f + n_i_fft_mids_target * 0.280f;
  n_i_fft_treble_smooth = n_i_fft_treble_smooth < 0 ? n_i_fft_treble_target : n_i_fft_treble_smooth * 0.720f + n_i_fft_treble_target * 0.280f;
  float n_i_fft_bass = n_i_fft_bass_smooth, n_i_fft_mids = n_i_fft_mids_smooth, n_i_fft_treble = n_i_fft_treble_smooth;
  bool n_i_beat_beat = false;
  static float n_i_beat_bpm = 120.0f, n_i_beat_detector_fast = 0.0f, n_i_beat_detector_slow = 0.0f, n_i_beat_detector_prevFlux = 0.0f, n_i_beat_detector_prevPrevFlux = 0.0f;
  static float n_i_beat_detector_prevSpectrum[32]; static bool n_i_beat_detector_ready = false; static uint32_t n_i_beat_detector_lastBeat = 0;
  if (n_i_beat_detector_ready) {
    float _flux = 0.0f, _weightSum = 0.0f;
    for (int _i = 0; _i < 32; _i++) {
      float _diff = _audioSpectrum[_i] - n_i_beat_detector_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;
      float _weight = _i < 6 ? 2.0f : (_i < 12 ? 1.35f : (_i < 20 ? 0.85f : 0.45f)); _flux += _diff * _weight; _weightSum += _weight;
    }
    _flux = _weightSum > 0.0f ? _flux / _weightSum : 0.0f;
    n_i_beat_detector_fast += (_flux - n_i_beat_detector_fast) * 0.4724f;
    n_i_beat_detector_slow += (_flux - n_i_beat_detector_slow) * 0.1276f;
    float _onset = n_i_beat_detector_fast - n_i_beat_detector_slow, _baseline = n_i_beat_detector_slow > 0.02f ? n_i_beat_detector_slow : 0.02f;
    float _gap = constrain(60000.0f / n_i_beat_bpm * 0.42f, 150.0f, 600.0f); uint32_t _now = millis();
    bool _peak = _flux > n_i_beat_detector_prevFlux && n_i_beat_detector_prevFlux >= n_i_beat_detector_prevPrevFlux;
    n_i_beat_beat = _flux > 0.0550f && _peak && _onset > 0.0248f && _onset / _baseline > 1.1f && (n_i_beat_detector_lastBeat == 0 || _now - n_i_beat_detector_lastBeat >= (uint32_t)_gap);
    if (n_i_beat_beat) { if (n_i_beat_detector_lastBeat != 0) { float _interval = _now - n_i_beat_detector_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) n_i_beat_bpm = n_i_beat_bpm * 0.65f + (60000.0f / _interval) * 0.35f; } n_i_beat_detector_lastBeat = _now; }
    n_i_beat_detector_prevPrevFlux = n_i_beat_detector_prevFlux; n_i_beat_detector_prevFlux = _flux;
  }
  for (int _i = 0; _i < 32; _i++) n_i_beat_detector_prevSpectrum[_i] = _audioSpectrum[_i]; n_i_beat_detector_ready = true;
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  // PaletteSelector — drives OceanColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_i_palMix;
  { uint8_t _amt = (uint8_t)((n_i_fft_mids) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_i_palMix[_i] = blend(ColorFromPalette(PartyColors_p, _p), ColorFromPalette(OceanColors_p, _p), _amt); } }
  {
    float _b = min(1.0f, max(0.0f, n_i_fft_bass)), _m = min(1.0f, max(0.0f, n_i_fft_mids)), _t = min(1.0f, max(0.0f, n_i_fft_treble));
    float _strength = min(1.0f, max(0.0f, n_i_fft_bass));
    float _spd = min(1.0f, max(0.0f, n_i_fft_treble));
    float _motion = _spd * (0.8f + (_b + _m + _t) * 1.4f * _strength);
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _nx = WIDTH > 1 ? (float)_x / (float)(WIDTH - 1) : 0.0f;
      float _ny = HEIGHT > 1 ? (float)_y / (float)(HEIGHT - 1) : 0.0f;
      float _ribbon = sinf((_nx * 7.0f + _ny * 2.5f) + t * _motion * (2.0f + _m * 3.0f * _strength));
      float _sweep = cosf((_ny * 9.0f - _nx * 3.0f) - t * _motion * (1.4f + _b * 2.2f * _strength));
      float _shimmer = powf(max(0.0f, sinf((_nx + _ny) * 18.0f + t * _motion * (4.0f + _t * 8.0f * _strength)) * 0.5f + 0.5f), 6.0f);
      float _body = max(0.0f, _ribbon * 0.55f + _sweep * 0.45f);
      float _v = min(1.0f, _body * (0.18f + _m * 0.52f * _strength) + _b * 0.24f * _strength + _shimmer * _t * 0.85f * _strength);
      float _pt = _nx * (0.2f + _b * 0.5f) + _ny * (0.35f + _m * 0.45f) + _shimmer * 0.15f + t * _motion * 0.03f;
      p20_buf_i_cascade[_y * WIDTH + _x] = ColorFromPalette(pal_i_palMix, (uint8_t)(_pt * 255));
      p20_buf_i_cascade[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));
    }
  }
  { /* CustomFormula: sin((x*10 + y*6 + t*(1+a*8)))*0.25 + cos((r*14 - t*(1+b*8)))*0.25 + 0.5 */
    float a=n_i_fft_mids, b=n_i_fft_treble; (void)a; (void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=(float)_x/(WIDTH-1>0?WIDTH-1:1),y=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float _v=sin((x*10 + y*6 + t*(1+a*8)))*0.25 + cos((r*14 - t*(1+b*8)))*0.25 + 0.5;
      p20_buf_i_formula[_y*WIDTH+_x]=ColorFromPalette(pal_i_palMix,(uint8_t)(fmod(fmod(_v,1)+1,1)*255));}}
  { ::memmove(p20_buf_i_blend, p20_buf_i_cascade, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.46); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p20_buf_i_blend[_i], _b=p20_buf_i_formula[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=_av<0.5f?2.0f*_av*_bv:1.0f-2.0f*(1.0f-_av)*(1.0f-_bv);
        p20_buf_i_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  {
    ::memmove(p20_buf_i_flash, p20_buf_i_blend, sizeof(CRGB) * NUM_LEDS);
    static float _flash_i_flash = 0;
    if (n_i_beat_beat) _flash_i_flash = 1.0f; else _flash_i_flash *= 0.7;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p20_buf_i_flash[_i].r = qadd8(p20_buf_i_flash[_i].r, (uint8_t)((255 - p20_buf_i_flash[_i].r) * _flash_i_flash));
      p20_buf_i_flash[_i].g = qadd8(p20_buf_i_flash[_i].g, (uint8_t)((255 - p20_buf_i_flash[_i].g) * _flash_i_flash));
      p20_buf_i_flash[_i].b = qadd8(p20_buf_i_flash[_i].b, (uint8_t)((255 - p20_buf_i_flash[_i].b) * _flash_i_flash));
    }
  }
  { ::memmove(p20_buf_i_gamma, p20_buf_i_flash, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p20_buf_i_gamma, NUM_LEDS, 2.220f); }
  ::memmove(leds, p20_buf_i_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p21(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_h_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_h_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_h_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_h_fft_bass_smooth = -1, n_h_fft_mids_smooth = -1, n_h_fft_treble_smooth = -1;
  n_h_fft_bass_smooth = n_h_fft_bass_smooth < 0 ? n_h_fft_bass_target : n_h_fft_bass_smooth * 0.720f + n_h_fft_bass_target * 0.280f;
  n_h_fft_mids_smooth = n_h_fft_mids_smooth < 0 ? n_h_fft_mids_target : n_h_fft_mids_smooth * 0.720f + n_h_fft_mids_target * 0.280f;
  n_h_fft_treble_smooth = n_h_fft_treble_smooth < 0 ? n_h_fft_treble_target : n_h_fft_treble_smooth * 0.720f + n_h_fft_treble_target * 0.280f;
  float n_h_fft_bass = n_h_fft_bass_smooth, n_h_fft_mids = n_h_fft_mids_smooth, n_h_fft_treble = n_h_fft_treble_smooth;
  uint8_t n_h_hue_hue = (uint8_t)(((n_h_fft_bass)*0.5f+(n_h_fft_mids)*0.3f+(n_h_fft_treble)*0.2f)*255);
  CRGB n_h_hsv_color = CHSV((uint8_t)((n_h_hue_hue) / 360.0f * 255), (uint8_t)((0.92) * 255), (uint8_t)((1) * 255));
  // PaletteSelector — drives LavaColors_p in connected palette-consuming nodes
  {
    fill_solid(p21_buf_h_bars, NUM_LEDS, CRGB::Black);
    float _b = min(1.0f, max(0.0f, n_h_fft_bass)), _m = min(1.0f, max(0.0f, n_h_fft_mids)), _t = min(1.0f, max(0.0f, n_h_fft_treble));
    float _strength = min(1.0f, max(0.0f, n_h_fft_bass));
    float _spd = min(1.0f, max(0.0f, n_h_fft_mids));
    const int _cols = max(1, ((WIDTH + 1) / 2));
    float _levels[3] = { _b, _m, _t };
    float _geometryMotion = t * (0.45f + _spd * 3.2f);
    float _paletteScroll = t * (0.08f + _spd * 0.42f);
    for (int _x = 0; _x < _cols; _x++) {
      float _nx = _cols <= 1 ? 0.0f : (float)_x / (float)(_cols - 1);
      float _spec = _nx * 2.0f;
      int _left = (int)floorf(_spec);
      int _right = min(2, _left + 1);
      float _mix = _spec - (float)_left;
      float _base = _levels[_left] * (1.0f - _mix) + _levels[_right] * _mix;
      float _ripple = sinf(_nx * 10.5f - _geometryMotion * (1.1f + _t * 1.8f)) * 0.08f * _strength;
      float _shimmer = max(0.0f, sinf(_nx * 21.0f + _geometryMotion * (2.0f + _m * 2.5f))) * 0.06f * _t * _strength;
      float _level = min(1.0f, max(0.0f, _base * (0.45f + _strength * 0.9f) + _ripple + _shimmer));
      int _barH = max(0, (int)roundf(_level * HEIGHT));
      for (int _row = 0; _row < _barH; _row++) {
        int _y = HEIGHT - 1 - _row;
        float _vertical = HEIGHT <= 1 ? 0.0f : (float)_row / (float)(HEIGHT - 1);
        float _pulse = 0.72f + 0.28f * sinf(_vertical * 6.2f - _geometryMotion * (1.4f + _b * 1.6f));
        float _v = min(1.0f, max(0.0f, (0.28f + _vertical * 0.72f) * _pulse));
        float _pt = _nx + _paletteScroll + _vertical * (0.12f + _m * 0.12f) + _spec * 0.08f;
        CRGB _px = ColorFromPalette(LavaColors_p, (uint8_t)(_pt * 255));
        _px.nscale8((uint8_t)(_v * 255));
        p21_buf_h_bars[_y * WIDTH + _x] = _px;
        p21_buf_h_bars[_y * WIDTH + (WIDTH - 1 - _x)] = _px;
      }
      if (_barH > 0) {
        int _peakY = max(0, HEIGHT - _barH);
        CRGB _peak = ColorFromPalette(LavaColors_p, (uint8_t)((_nx + _paletteScroll + _spec * 0.08f) * 255));
        _peak.nscale8((uint8_t)(min(1.0f, 0.6f + _t * 0.35f + _strength * 0.2f) * 255));
        p21_buf_h_bars[_peakY * WIDTH + _x] = _peak;
        p21_buf_h_bars[_peakY * WIDTH + (WIDTH - 1 - _x)] = _peak;
      }
    }
  }
  {
    float _b = min(1.0f, max(0.0f, n_h_fft_bass));
    float _strength = min(1.0f, max(0.0f, n_h_fft_mids));
    float _spd = min(1.0f, max(0.0f, n_h_fft_treble));
    float _cx = WIDTH * 0.5f, _cy = HEIGHT * 0.5f, _maxD = sqrtf(_cx * _cx + _cy * _cy);
    float _motion = _spd * (0.75f + _b * 1.75f * _strength);
    float _phase = t * (1.2f + _motion * 4.8f);
    float _rings = 4.0f + _b * 8.0f * _strength;
    float _floor = 0.04f + _b * 0.1f * _strength;
    float _gain = 0.16f + _b * 0.84f * _strength;
    CRGB _base = n_h_hsv_color;
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _dx = _x - _cx, _dy = _y - _cy;
      float _dist = sqrtf(_dx * _dx + _dy * _dy) / max(0.0001f, _maxD);
      float _wave = sinf(_dist * _rings * 6.2831853f - _phase);
      float _crisp = powf(max(0.0f, _wave * 0.5f + 0.5f), 2.4f);
      float _v = min(1.0f, _floor + _crisp * _gain);
      int _i = _y * WIDTH + _x;
      p21_buf_h_rings[_i] = _base;
      p21_buf_h_rings[_i].nscale8((uint8_t)(_v * 255));
    }
  }
  { ::memmove(p21_buf_h_blend, p21_buf_h_bars, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.54); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p21_buf_h_blend[_i], _b=p21_buf_h_rings[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=min(1.0f,_av+_bv);
        p21_buf_h_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  float n_h_rate_result = mapFloat(n_h_fft_bass, 0, 1, 8, 150);
  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=n_h_rate_result;
    float _s=1.0f+(_rate/100.0f)*t; _s=constrain(_s,0.05f,20.0f);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      int _sx=(int)floorf(_cx+(_x-_cx)/_s+0.5f), _sy=(int)floorf(_cy+(_y-_cy)/_s+0.5f);
      p21_buf_h_transform[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?p21_buf_h_blend[_sy*WIDTH+_sx]:CRGB::Black;}}
  ::memmove(p21_buf_h_blur, p21_buf_h_transform, sizeof(CRGB) * NUM_LEDS); blur2d(p21_buf_h_blur, WIDTH, HEIGHT, 26, _xyMap);
  { ::memmove(p21_buf_h_gamma, p21_buf_h_blur, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p21_buf_h_gamma, NUM_LEDS, 2.200f); }
  ::memmove(leds, p21_buf_h_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p22(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_g_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_g_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_g_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_g_fft_bass_smooth = -1, n_g_fft_mids_smooth = -1, n_g_fft_treble_smooth = -1;
  n_g_fft_bass_smooth = n_g_fft_bass_smooth < 0 ? n_g_fft_bass_target : n_g_fft_bass_smooth * 0.720f + n_g_fft_bass_target * 0.280f;
  n_g_fft_mids_smooth = n_g_fft_mids_smooth < 0 ? n_g_fft_mids_target : n_g_fft_mids_smooth * 0.720f + n_g_fft_mids_target * 0.280f;
  n_g_fft_treble_smooth = n_g_fft_treble_smooth < 0 ? n_g_fft_treble_target : n_g_fft_treble_smooth * 0.720f + n_g_fft_treble_target * 0.280f;
  float n_g_fft_bass = n_g_fft_bass_smooth, n_g_fft_mids = n_g_fft_mids_smooth, n_g_fft_treble = n_g_fft_treble_smooth;
  // PaletteSelector — drives OceanColors_p in connected palette-consuming nodes
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_g_palMix;
  { uint8_t _amt = (uint8_t)((n_g_fft_mids) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_g_palMix[_i] = blend(ColorFromPalette(OceanColors_p, _p), ColorFromPalette(PartyColors_p, _p), _amt); } }
  { // Palette gradient
    float _a=135*0.01745329f,_co=cos(_a),_si=sin(_a);
    float _pmin=(_co<0?(WIDTH-1)*_co:0)+(_si<0?(HEIGHT-1)*_si:0);
    float _pmax=(_co>0?(WIDTH-1)*_co:0)+(_si>0?(HEIGHT-1)*_si:0);
    float _rng=max(1e-6f,_pmax-_pmin);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _tn=(_x*_co+_y*_si-_pmin)/_rng;
      p22_buf_g_gradient[_y*WIDTH+_x]=ColorFromPalette(pal_g_palMix,(uint8_t)((_tn*5.0f+t*0.12f)*255));}}
  CRGB n_g_sample_color = ColorFromPalette(pal_g_palMix, (uint8_t)((n_g_fft_bass)*255));
  { // Starfield
    static float _sfx_g_stars[72], _sfy_g_stars[72], _sfz_g_stars[72]; static bool _sfi_g_stars=false;
    if(!_sfi_g_stars){ for(int _i=0;_i<72;_i++){ _sfx_g_stars[_i]=random8()/127.5f-1; _sfy_g_stars[_i]=random8()/127.5f-1; _sfz_g_stars[_i]=random8()/255.0f*0.9f+0.1f; } _sfi_g_stars=true; }
    float _spd=(constrain((n_g_fft_mids), 0.0f, 1.0f) * 3.000f); fill_solid(p22_buf_g_stars, NUM_LEDS, CRGB::Black);
    for(int _i=0;_i<72;_i++){ _sfz_g_stars[_i]-=_spd*0.015f;
      if(_sfz_g_stars[_i]<=0.02f){ _sfx_g_stars[_i]=random8()/127.5f-1; _sfy_g_stars[_i]=random8()/127.5f-1; _sfz_g_stars[_i]=1; }
      int _px=(int)(WIDTH/2.0f+(_sfx_g_stars[_i]/_sfz_g_stars[_i])*WIDTH*0.35f), _py=(int)(HEIGHT/2.0f+(_sfy_g_stars[_i]/_sfz_g_stars[_i])*HEIGHT*0.35f);
      if(_px>=0&&_px<WIDTH&&_py>=0&&_py<HEIGHT){ p22_buf_g_stars[_py*WIDTH+_px]=n_g_sample_color; p22_buf_g_stars[_py*WIDTH+_px].nscale8((uint8_t)(min(1.0f,1-_sfz_g_stars[_i])*255)); } } }
  { // Particles: swarm
    const int _PN=40;
    static float _pa_g_swarmx[_PN], _pa_g_swarmy[_PN], _pa_g_swarmvx[_PN], _pa_g_swarmvy[_PN], _pa_g_swarml[_PN], _pa_g_swarms[_PN]; static uint8_t _pa_g_swarmr[_PN], _pa_g_swarmg[_PN], _pa_g_swarmb[_PN]; static bool _pa_g_swarminit=false;
    float _rate=n_g_fft_treble; CRGB _pc=n_g_sample_color;
    if(!_pa_g_swarminit){ for(int i=0;i<_PN;i++){ _pa_g_swarmx[i]=random8()/255.0f*WIDTH; _pa_g_swarmy[i]=random8()/255.0f*HEIGHT; _pa_g_swarmvx[i]=(random8()/255.0f-0.5f)*0.6f; _pa_g_swarmvy[i]=(random8()/255.0f-0.5f)*0.6f; _pa_g_swarml[i]=1; _pa_g_swarmr[i]=_pc.r; _pa_g_swarmg[i]=_pc.g; _pa_g_swarmb[i]=_pc.b; } _pa_g_swarminit=true; }
    float _R=max(3.0f, min(WIDTH,HEIGHT)*0.5f); static float _pa_g_swarmnvx[_PN], _pa_g_swarmnvy[_PN];
    for(int i=0;i<_PN;i++){ float cx=0,cy=0,ax=0,ay=0,sx=0,sy=0; int n=0;
      for(int j=0;j<_PN;j++){ if(j==i) continue; float dx=_pa_g_swarmx[j]-_pa_g_swarmx[i], dy=_pa_g_swarmy[j]-_pa_g_swarmy[i]; float d=sqrtf(dx*dx+dy*dy);
        if(d<_R&&d>0){ cx+=_pa_g_swarmx[j]; cy+=_pa_g_swarmy[j]; ax+=_pa_g_swarmvx[j]; ay+=_pa_g_swarmvy[j]; n++; if(d<_R*0.4f){ sx-=dx/d; sy-=dy/d; } } }
      float vx=_pa_g_swarmvx[i], vy=_pa_g_swarmvy[i];
      if(n>0){ vx+=(cx/n-_pa_g_swarmx[i])*0.0008f+(ax/n-_pa_g_swarmvx[i])*0.05f+sx*0.04f; vy+=(cy/n-_pa_g_swarmy[i])*0.0008f+(ay/n-_pa_g_swarmvy[i])*0.05f+sy*0.04f; }
      float sp=sqrtf(vx*vx+vy*vy); if(sp>0.7f){ vx=vx/sp*0.7f; vy=vy/sp*0.7f; } _pa_g_swarmnvx[i]=vx; _pa_g_swarmnvy[i]=vy; }
    for(int i=0;i<_PN;i++){ _pa_g_swarmvx[i]=_pa_g_swarmnvx[i]; _pa_g_swarmvy[i]=_pa_g_swarmnvy[i]; _pa_g_swarmx[i]=fmodf(_pa_g_swarmx[i]+_pa_g_swarmvx[i]+WIDTH,WIDTH); _pa_g_swarmy[i]=fmodf(_pa_g_swarmy[i]+_pa_g_swarmvy[i]+HEIGHT,HEIGHT); }
    fill_solid(p22_buf_g_swarm, NUM_LEDS, CRGB::Black);
    for(int i=0;i<_PN;i++){ if(_pa_g_swarml[i]<=0.04f) continue; int X=(int)(_pa_g_swarmx[i]+0.5f), Y=(int)(_pa_g_swarmy[i]+0.5f);
      if(X>=0&&X<WIDTH&&Y>=0&&Y<HEIGHT){ float _k=min(1.0f,_pa_g_swarml[i]); p22_buf_g_swarm[Y*WIDTH+X]+=CRGB((uint8_t)(_pc.r*_k),(uint8_t)(_pc.g*_k),(uint8_t)(_pc.b*_k)); } } }
  { ::memmove(p22_buf_g_starSwarm, p22_buf_g_stars, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.7); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p22_buf_g_starSwarm[_i], _b=p22_buf_g_swarm[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=min(1.0f,_av+_bv);
        p22_buf_g_starSwarm[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { fill_solid(p22_buf_g_tr, NUM_LEDS, CRGB::Black); float _tt=n_g_fft_bass;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      int _ax=(int)roundf(_x-_tt*WIDTH),_ay=_y,_bx=(int)roundf(_x+(1.0f-_tt)*WIDTH),_by=_y;
      if(_bx>=0&&_bx<WIDTH&&_by>=0&&_by<HEIGHT) p22_buf_g_tr[_y*WIDTH+_x] = p22_buf_g_starSwarm[_by*WIDTH+_bx];
      else if(_ax>=0&&_ax<WIDTH&&_ay>=0&&_ay<HEIGHT) p22_buf_g_tr[_y*WIDTH+_x] = p22_buf_g_gradient[_ay*WIDTH+_ax];
    } }
  float n_g_rate_result = mapFloat(n_g_fft_treble, 0, 1, 18, 140);
  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=n_g_rate_result;
    float _a=_rate*t*0.01745329f,_co=cos(_a),_si=sin(_a);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _rx=_x-_cx,_ry=_y-_cy; int _sx=(int)floorf(_cx+_rx*_co+_ry*_si+0.5f), _sy=(int)floorf(_cy-_rx*_si+_ry*_co+0.5f);
      p22_buf_g_transform[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?p22_buf_g_tr[_sy*WIDTH+_sx]:CRGB::Black;}}
  { ::memmove(p22_buf_g_gamma, p22_buf_g_transform, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p22_buf_g_gamma, NUM_LEDS, 2.180f); }
  ::memmove(leds, p22_buf_g_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p23(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_f_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_f_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_f_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_f_fft_bass_smooth = -1, n_f_fft_mids_smooth = -1, n_f_fft_treble_smooth = -1;
  n_f_fft_bass_smooth = n_f_fft_bass_smooth < 0 ? n_f_fft_bass_target : n_f_fft_bass_smooth * 0.720f + n_f_fft_bass_target * 0.280f;
  n_f_fft_mids_smooth = n_f_fft_mids_smooth < 0 ? n_f_fft_mids_target : n_f_fft_mids_smooth * 0.720f + n_f_fft_mids_target * 0.280f;
  n_f_fft_treble_smooth = n_f_fft_treble_smooth < 0 ? n_f_fft_treble_target : n_f_fft_treble_smooth * 0.720f + n_f_fft_treble_target * 0.280f;
  float n_f_fft_bass = n_f_fft_bass_smooth, n_f_fft_mids = n_f_fft_mids_smooth, n_f_fft_treble = n_f_fft_treble_smooth;
  uint8_t n_f_hue_hue = (uint8_t)(((n_f_fft_bass)*0.5f+(n_f_fft_mids)*0.3f+(n_f_fft_treble)*0.2f)*255);
  CRGB n_f_hsv_color = CHSV((uint8_t)((n_f_hue_hue) / 360.0f * 255), (uint8_t)((0.85) * 255), (uint8_t)((1) * 255));
  // PaletteSelector — drives ForestColors_p in connected palette-consuming nodes
  // PaletteSelector — drives OceanColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_f_palMix;
  { uint8_t _amt = (uint8_t)((n_f_fft_bass) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_f_palMix[_i] = blend(ColorFromPalette(ForestColors_p, _p), ColorFromPalette(OceanColors_p, _p), _amt); } }
  { // Fractal noise (fBm via inoise8)
    float _spd=(constrain((n_f_fft_bass), 0.0f, 1.0f) * 1.200f),_sc=(constrain((n_f_fft_treble), 0.0f, 1.0f) * 0.500f); uint16_t _z=(uint16_t)(t*_spd*40);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _v=0,_amp=0.5f,_norm=0,_freq=_sc*96;
      for(int _o=0;_o<5;_o++){
        _v+=_amp*(inoise8((uint16_t)(_x*_freq),(uint16_t)(_y*_freq),_z)/255.0f);
        _norm+=_amp; _amp*=0.5f; _freq*=2; }
      p23_buf_f_fractal[_y*WIDTH+_x]=ColorFromPalette(pal_f_palMix,(uint8_t)((_v/_norm)*255));}}
  float n_f_lifeSpeed_result = mapFloat(n_f_fft_mids, 0, 1, 4, 22);
  { // Game of Life
    static uint8_t _gc_f_life[NUM_LEDS], _gn_f_life[NUM_LEDS]; static float _gb_f_life[NUM_LEDS]; static bool _gi_f_life=false; static uint32_t _gt_f_life=0;
    if (!_gi_f_life) { for (int _i=0;_i<NUM_LEDS;_i++){_gc_f_life[_i]=random8()<77?1:0;_gb_f_life[_i]=0;} _gi_f_life=true; }
    if (millis() - _gt_f_life >= (uint32_t)(1000.0f / max(1.0f, (float)(n_f_lifeSpeed_result)))) {
      int _pop=0;
      for (int _y=0;_y<HEIGHT;_y++){ int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;
        for (int _x=0;_x<WIDTH;_x++){ int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;
          int _n=_gc_f_life[_ym+_xm]+_gc_f_life[_ym+_x]+_gc_f_life[_ym+_xp]+_gc_f_life[_yr+_xm]+_gc_f_life[_yr+_xp]+_gc_f_life[_yp+_xm]+_gc_f_life[_yp+_x]+_gc_f_life[_yp+_xp];
          _gn_f_life[_i]=_gc_f_life[_i]?((_n==2||_n==3)?1:0):(_n==3?1:0); _pop+=_gn_f_life[_i]; } }
      ::memcpy(_gc_f_life,_gn_f_life,sizeof(_gc_f_life));
      if (_pop==0) { for (int _i=0;_i<NUM_LEDS;_i++) _gc_f_life[_i]=random8()<77?1:0; }
      _gt_f_life=millis(); }
    for (int _i=0;_i<NUM_LEDS;_i++){ _gb_f_life[_i]=_gc_f_life[_i]?1.0f:_gb_f_life[_i]*0.82f; p23_buf_f_life[_i]=n_f_hsv_color; p23_buf_f_life[_i].nscale8((uint8_t)(_gb_f_life[_i]*255)); } }
  { ::memmove(p23_buf_f_tr, p23_buf_f_fractal, sizeof(CRGB) * NUM_LEDS); float _tt=n_f_fft_treble; int _slat=max(1,WIDTH/6);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _p=(float)(_x%_slat)/_slat;
      if(_p<_tt) p23_buf_f_tr[_y*WIDTH+_x] = p23_buf_f_life[_y*WIDTH+_x];
    } }
  { ::memmove(p23_buf_f_gamma, p23_buf_f_tr, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p23_buf_f_gamma, NUM_LEDS, 2.280f); }
  ::memmove(leds, p23_buf_f_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p24(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_e_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_e_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_e_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_e_fft_bass_smooth = -1, n_e_fft_mids_smooth = -1, n_e_fft_treble_smooth = -1;
  n_e_fft_bass_smooth = n_e_fft_bass_smooth < 0 ? n_e_fft_bass_target : n_e_fft_bass_smooth * 0.720f + n_e_fft_bass_target * 0.280f;
  n_e_fft_mids_smooth = n_e_fft_mids_smooth < 0 ? n_e_fft_mids_target : n_e_fft_mids_smooth * 0.720f + n_e_fft_mids_target * 0.280f;
  n_e_fft_treble_smooth = n_e_fft_treble_smooth < 0 ? n_e_fft_treble_target : n_e_fft_treble_smooth * 0.720f + n_e_fft_treble_target * 0.280f;
  float n_e_fft_bass = n_e_fft_bass_smooth, n_e_fft_mids = n_e_fft_mids_smooth, n_e_fft_treble = n_e_fft_treble_smooth;
  uint8_t n_e_hue_hue = (uint8_t)(((n_e_fft_bass)*0.5f+(n_e_fft_mids)*0.3f+(n_e_fft_treble)*0.2f)*255);
  CRGBPalette16 pal_e_poline(CRGB(6,22,58), CRGB(8,58,105), CRGB(9,94,153), CRGB(7,128,198), CRGB(5,156,237), CRGB(17,174,253), CRGB(33,181,254), CRGB(38,184,255), CRGB(38,184,255), CRGB(37,176,255), CRGB(38,154,255), CRGB(45,123,255), CRGB(67,100,255), CRGB(111,109,255), CRGB(184,169,255), CRGB(246,242,255));
  { /* FieldFormula: sin8(r*220 + angle*32 + t*(30 + a*140))/255 */
    float a=n_e_fft_bass, b=n_e_fft_mids; (void)a;(void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=_x, y=_y; (void)x;(void)y;
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float fieldIn=0.0f; (void)fieldIn;
      float _v=_fsin8(r*220 + angle*32 + t*(30 + a*140))/255;
      p24_field_e_base[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}
  { /* DistanceField */
    float _px=n_e_fft_bass, _py=n_e_fft_treble, _sc=1.8; if(_sc<0.0001f)_sc=0.0001f;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _nx=(float)_x/(WIDTH-1>0?WIDTH-1:1),_ny=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);
      float _dx=_nx-_px,_dy=_ny-_py;
      float _d=sqrtf(_dx*_dx+_dy*_dy)/1.41421356f*_sc;
      p24_field_e_orbit[_y*WIDTH+_x]=constrain(_d,0.0f,1.0f);}}
  { /* FieldMath: difference */
    for(int _i=0;_i<NUM_LEDS;_i++){
      float _a=p24_field_e_base[_i], _b=p24_field_e_orbit[_i];
      p24_field_e_combine[_i]=constrain(fabsf(_a - _b),0.0f,1.0f);}}
  { /* FieldFormula: sin8(y*18 + t*(20 + a*100))/255 */
    float a=n_e_fft_mids, b=0; (void)a;(void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=_x, y=_y; (void)x;(void)y;
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float fieldIn=0.0f; (void)fieldIn;
      float _v=_fsin8(y*18 + t*(20 + a*100))/255;
      p24_field_e_dx[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}
  { /* FieldFormula: cos8(x*18 - t*(20 + b*100))/255 */
    float a=0, b=n_e_fft_treble; (void)a;(void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=_x, y=_y; (void)x;(void)y;
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float fieldIn=0.0f; (void)fieldIn;
      float _v=_fcos8(x*18 - t*(20 + b*100))/255;
      p24_field_e_dy[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}
  { /* FieldWarp */ float _st=1.25;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _ox=(2.0f*p24_field_e_dx[_y*WIDTH+_x]-1.0f)*_st,_oy=(2.0f*p24_field_e_dy[_y*WIDTH+_x]-1.0f)*_st;
      int _sx=(int)roundf(_x+_ox); if(_sx<0)_sx=0; if(_sx>WIDTH-1)_sx=WIDTH-1;
      int _sy=(int)roundf(_y+_oy); if(_sy<0)_sy=0; if(_sy>HEIGHT-1)_sy=HEIGHT-1;
      p24_field_e_warp[_y*WIDTH+_x]=p24_field_e_combine[_sy*WIDTH+_sx];}}
  { /* FieldRotate */ float _ang=((n_e_hue_hue)+t*0)*0.01745329f;
    float _ca=cosf(-_ang),_sa=sinf(-_ang),_cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _dx=_x-_cx,_dy=_y-_cy;
      int _sx=(((int)roundf(_dx*_ca-_dy*_sa+_cx))%WIDTH+WIDTH)%WIDTH;
      int _sy=(((int)roundf(_dx*_sa+_dy*_ca+_cy))%HEIGHT+HEIGHT)%HEIGHT;
      p24_field_e_rotate[_y*WIDTH+_x]=p24_field_e_warp[_sy*WIDTH+_sx];}}
  { float _br=constrain(1,0.0f,1.0f);
    for(int _i=0;_i<NUM_LEDS;_i++)
      p24_buf_e_frame[_i]=ColorFromPalette(pal_e_poline,(uint8_t)(p24_field_e_rotate[_i]*255),(uint8_t)(_br*255)); }
  { ::memmove(p24_buf_e_gamma, p24_buf_e_frame, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p24_buf_e_gamma, NUM_LEDS, 2.320f); }
  ::memmove(leds, p24_buf_e_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p25(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_d_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_d_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_d_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_d_fft_bass_smooth = -1, n_d_fft_mids_smooth = -1, n_d_fft_treble_smooth = -1;
  n_d_fft_bass_smooth = n_d_fft_bass_smooth < 0 ? n_d_fft_bass_target : n_d_fft_bass_smooth * 0.720f + n_d_fft_bass_target * 0.280f;
  n_d_fft_mids_smooth = n_d_fft_mids_smooth < 0 ? n_d_fft_mids_target : n_d_fft_mids_smooth * 0.720f + n_d_fft_mids_target * 0.280f;
  n_d_fft_treble_smooth = n_d_fft_treble_smooth < 0 ? n_d_fft_treble_target : n_d_fft_treble_smooth * 0.720f + n_d_fft_treble_target * 0.280f;
  float n_d_fft_bass = n_d_fft_bass_smooth, n_d_fft_mids = n_d_fft_mids_smooth, n_d_fft_treble = n_d_fft_treble_smooth;
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  // PaletteSelector — drives OceanColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_d_palMix;
  { uint8_t _amt = (uint8_t)((n_d_fft_bass) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_d_palMix[_i] = blend(ColorFromPalette(PartyColors_p, _p), ColorFromPalette(OceanColors_p, _p), _amt); } }
  { float _spd=(constrain((n_d_fft_bass), 0.0f, 1.0f) * 1.000f),_sc=(constrain((n_d_fft_treble), 0.0f, 1.0f) * 1.000f); for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
    float _v=sin(_x*_sc+t*_spd+1.7f)*cos(_y*_sc*1.3f+t*_spd*0.8f+2.3f)+0.5f*sin(_x*_sc*2.1f+t*_spd*2.0f)*cos(_y*_sc*2.7f+t*_spd*1.6f);
    p25_buf_d_noise[_y*WIDTH+_x]=CHSV((uint8_t)((_v*0.5f+0.5f)*255),255,220);}}
  {
    float _m = n_d_fft_mids, _intensity = n_d_fft_bass, _spd = n_d_fft_treble;
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _mAmt = min(1.0f, max(0.0f, _m));
      float _strength = min(1.0f, max(0.0f, _intensity));
      float _motion = _spd * (1.0f + _mAmt * 1.5f * _strength);
      float _contrast = 0.7f + _mAmt * 1.8f * _strength;
      float _wBase = sin(_x * 0.8f + t * _motion * 4) * sin(_y * 0.5f + t * _motion * 2.5f);
      float _w = min(1.0f, max(-1.0f, _wBase * _contrast));
      float _int = min(1.0f, 0.1f + powf(_mAmt, 0.65f) * 1.25f * _strength);
      float _v = (_w + 1) / 2.0f * _int;
      p25_buf_d_waves[_y * WIDTH + _x] = ColorFromPalette(pal_d_palMix, (uint8_t)((_w + 1) * 127.5f));
      p25_buf_d_waves[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));
    }
  }
  { ::memmove(p25_buf_d_blend, p25_buf_d_noise, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.4); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p25_buf_d_blend[_i], _b=p25_buf_d_waves[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p25_buf_d_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  uint8_t n_d_hue_hue = (uint8_t)(((n_d_fft_bass)*0.5f+(n_d_fft_mids)*0.3f+(n_d_fft_treble)*0.2f)*255);
  { ::memmove(p25_buf_d_shift, p25_buf_d_blend, sizeof(CRGB) * NUM_LEDS); uint8_t _sh = (uint8_t)((n_d_hue_hue) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) p25_buf_d_shift[_i] = CHSV(rgb2hsv_approximate(p25_buf_d_shift[_i]).hue + _sh, rgb2hsv_approximate(p25_buf_d_shift[_i]).sat, rgb2hsv_approximate(p25_buf_d_shift[_i]).val); }
  ::memmove(p25_buf_d_blur, p25_buf_d_shift, sizeof(CRGB) * NUM_LEDS); blur2d(p25_buf_d_blur, WIDTH, HEIGHT, 31, _xyMap);
  { ::memmove(p25_buf_d_gamma, p25_buf_d_blur, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p25_buf_d_gamma, NUM_LEDS, 2.180f); }
  ::memmove(leds, p25_buf_d_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p26(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_c_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_c_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_c_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_c_fft_bass_smooth = -1, n_c_fft_mids_smooth = -1, n_c_fft_treble_smooth = -1;
  n_c_fft_bass_smooth = n_c_fft_bass_smooth < 0 ? n_c_fft_bass_target : n_c_fft_bass_smooth * 0.720f + n_c_fft_bass_target * 0.280f;
  n_c_fft_mids_smooth = n_c_fft_mids_smooth < 0 ? n_c_fft_mids_target : n_c_fft_mids_smooth * 0.720f + n_c_fft_mids_target * 0.280f;
  n_c_fft_treble_smooth = n_c_fft_treble_smooth < 0 ? n_c_fft_treble_target : n_c_fft_treble_smooth * 0.720f + n_c_fft_treble_target * 0.280f;
  float n_c_fft_bass = n_c_fft_bass_smooth, n_c_fft_mids = n_c_fft_mids_smooth, n_c_fft_treble = n_c_fft_treble_smooth;
  CRGBPalette16 pal_c_poline(CRGB(8,38,255), CRGB(0,73,252), CRGB(0,114,249), CRGB(0,154,254), CRGB(7,187,255), CRGB(15,209,255), CRGB(22,222,255), CRGB(24,226,255), CRGB(24,226,255), CRGB(10,231,255), CRGB(0,223,224), CRGB(0,166,125), CRGB(0,125,15), CRGB(110,171,0), CRGB(253,255,27), CRGB(255,242,160));
  CRGB n_c_heat_color = HeatColor((uint8_t)(constrain(n_c_fft_bass, 0.0f, 1.0f) * 255));
  { float _b=n_c_fft_bass,_m=n_c_fft_mids,_tr=n_c_fft_treble,_spd=(0.000f + constrain((n_c_fft_bass), 0.0f, 1.0f) * 0.200f),_sc=(0.000f + constrain((n_c_fft_treble), 0.0f, 1.0f) * 0.200f);
    float _flow=t*_spd*(0.2f+_m*1.5f); uint8_t _bright=(uint8_t)(min(1.0f,0.3f+_b)*255);
    float _vamp=0.2f+_tr*0.7f+_b*0.3f;
    float _vflow=((float)inoise8((uint16_t)((t*_spd*4.0f+50)*256),4429)/128.0f-1.0f)*_vamp;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      uint8_t _v=inoise8((uint16_t)((_x*_sc+_flow)*256),(uint16_t)((_y*_sc*0.6f+_vflow+8.0f)*256));
      p26_buf_c_audioFlow[_y*WIDTH+_x]=ColorFromPalette(pal_c_poline,(uint8_t)(_v+_tr*80)); p26_buf_c_audioFlow[_y*WIDTH+_x].nscale8(_bright);}}
  {
    float _b = min(1.0f, max(0.0f, n_c_fft_bass));
    float _strength = min(1.0f, max(0.0f, n_c_fft_mids));
    float _spd = min(1.0f, max(0.0f, n_c_fft_treble));
    float _cx = WIDTH * 0.5f, _cy = HEIGHT * 0.5f, _maxD = sqrtf(_cx * _cx + _cy * _cy);
    float _motion = _spd * (0.75f + _b * 1.75f * _strength);
    float _phase = t * (1.2f + _motion * 4.8f);
    float _rings = 4.0f + _b * 8.0f * _strength;
    float _floor = 0.04f + _b * 0.1f * _strength;
    float _gain = 0.16f + _b * 0.84f * _strength;
    CRGB _base = n_c_heat_color;
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _dx = _x - _cx, _dy = _y - _cy;
      float _dist = sqrtf(_dx * _dx + _dy * _dy) / max(0.0001f, _maxD);
      float _wave = sinf(_dist * _rings * 6.2831853f - _phase);
      float _crisp = powf(max(0.0f, _wave * 0.5f + 0.5f), 2.4f);
      float _v = min(1.0f, _floor + _crisp * _gain);
      int _i = _y * WIDTH + _x;
      p26_buf_c_bassRings[_i] = _base;
      p26_buf_c_bassRings[_i].nscale8((uint8_t)(_v * 255));
    }
  }
  float n_c_rate_result = mapFloat(n_c_fft_mids, 0, 1, 20, 180);
  { ::memmove(p26_buf_c_blend, p26_buf_c_audioFlow, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.48); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p26_buf_c_blend[_i], _b=p26_buf_c_bassRings[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=fabsf(_av-_bv);
        p26_buf_c_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=n_c_rate_result;
    float _a=0*0.01745329f,_dx=cos(_a)*_rate*t,_dy=sin(_a)*_rate*t;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      int _sx=(((int)floorf(_x-_dx+0.5f))%WIDTH+WIDTH)%WIDTH, _sy=(((int)floorf(_y-_dy+0.5f))%HEIGHT+HEIGHT)%HEIGHT;
      p26_buf_c_transform[_y*WIDTH+_x]=p26_buf_c_blend[_sy*WIDTH+_sx];}}
  { ::memmove(p26_buf_c_gamma, p26_buf_c_transform, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p26_buf_c_gamma, NUM_LEDS, 2.260f); }
  ::memmove(leds, p26_buf_c_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p27(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_b_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_b_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_b_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_b_fft_bass_smooth = -1, n_b_fft_mids_smooth = -1, n_b_fft_treble_smooth = -1;
  n_b_fft_bass_smooth = n_b_fft_bass_smooth < 0 ? n_b_fft_bass_target : n_b_fft_bass_smooth * 0.720f + n_b_fft_bass_target * 0.280f;
  n_b_fft_mids_smooth = n_b_fft_mids_smooth < 0 ? n_b_fft_mids_target : n_b_fft_mids_smooth * 0.720f + n_b_fft_mids_target * 0.280f;
  n_b_fft_treble_smooth = n_b_fft_treble_smooth < 0 ? n_b_fft_treble_target : n_b_fft_treble_smooth * 0.720f + n_b_fft_treble_target * 0.280f;
  float n_b_fft_bass = n_b_fft_bass_smooth, n_b_fft_mids = n_b_fft_mids_smooth, n_b_fft_treble = n_b_fft_treble_smooth;
  bool n_b_beat_beat = false;
  static float n_b_beat_bpm = 120.0f, n_b_beat_detector_fast = 0.0f, n_b_beat_detector_slow = 0.0f, n_b_beat_detector_prevFlux = 0.0f, n_b_beat_detector_prevPrevFlux = 0.0f;
  static float n_b_beat_detector_prevSpectrum[32]; static bool n_b_beat_detector_ready = false; static uint32_t n_b_beat_detector_lastBeat = 0;
  if (n_b_beat_detector_ready) {
    float _flux = 0.0f, _weightSum = 0.0f;
    for (int _i = 0; _i < 32; _i++) {
      float _diff = _audioSpectrum[_i] - n_b_beat_detector_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;
      float _weight = _i < 6 ? 2.0f : (_i < 12 ? 1.35f : (_i < 20 ? 0.85f : 0.45f)); _flux += _diff * _weight; _weightSum += _weight;
    }
    _flux = _weightSum > 0.0f ? _flux / _weightSum : 0.0f;
    n_b_beat_detector_fast += (_flux - n_b_beat_detector_fast) * 0.4724f;
    n_b_beat_detector_slow += (_flux - n_b_beat_detector_slow) * 0.1276f;
    float _onset = n_b_beat_detector_fast - n_b_beat_detector_slow, _baseline = n_b_beat_detector_slow > 0.02f ? n_b_beat_detector_slow : 0.02f;
    float _gap = constrain(60000.0f / n_b_beat_bpm * 0.42f, 150.0f, 600.0f); uint32_t _now = millis();
    bool _peak = _flux > n_b_beat_detector_prevFlux && n_b_beat_detector_prevFlux >= n_b_beat_detector_prevPrevFlux;
    n_b_beat_beat = _flux > 0.0550f && _peak && _onset > 0.0248f && _onset / _baseline > 1.1f && (n_b_beat_detector_lastBeat == 0 || _now - n_b_beat_detector_lastBeat >= (uint32_t)_gap);
    if (n_b_beat_beat) { if (n_b_beat_detector_lastBeat != 0) { float _interval = _now - n_b_beat_detector_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) n_b_beat_bpm = n_b_beat_bpm * 0.65f + (60000.0f / _interval) * 0.35f; } n_b_beat_detector_lastBeat = _now; }
    n_b_beat_detector_prevPrevFlux = n_b_beat_detector_prevFlux; n_b_beat_detector_prevFlux = _flux;
  }
  for (int _i = 0; _i < 32; _i++) n_b_beat_detector_prevSpectrum[_i] = _audioSpectrum[_i]; n_b_beat_detector_ready = true;
  // PaletteSelector — drives LavaColors_p in connected palette-consuming nodes
  // PaletteSelector — drives ForestColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_b_palMix;
  { uint8_t _amt = (uint8_t)((n_b_fft_treble) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_b_palMix[_i] = blend(ColorFromPalette(LavaColors_p, _p), ColorFromPalette(ForestColors_p, _p), _amt); } }
  {
    float _m = n_b_fft_mids, _intensity = n_b_fft_bass, _spd = n_b_fft_treble;
    float _mAmt = min(1.0f, max(0.0f, _m));
    float _strength = min(1.0f, max(0.0f, _intensity));
    float _motion = min(1.0f, max(0.0f, _spd)) * (0.8f + _mAmt * 2.2f * _strength);
    float _cx0 = (WIDTH - 1) / 2.0f, _cy0 = (HEIGHT - 1) / 2.0f;
    float _sx = max(1.0f, WIDTH / 2.0f), _sy = max(1.0f, HEIGHT / 2.0f);
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _cx = (_x - _cx0) / _sx, _cy = (_y - _cy0) / _sy;
      float _radial = sqrtf(_cx * _cx + _cy * _cy);
      float _swirl = sinf((_cx * _cx - _cy * _cy) * 6 + t * _motion * 3.2f) + cosf((_cx + _cy) * 4 - t * _motion * 2.4f);
      float _bloom = sinf(_radial * (5.0f + _mAmt * 8.0f * _strength) * 3.14159265f - t * _motion * 4.0f + _swirl * 0.6f);
      float _crisp = powf(max(0.0f, _bloom * 0.5f + 0.5f), 1.8f);
      float _v = min(1.0f, _crisp * (0.22f + _mAmt * 0.78f * _strength));
      float _pt = _radial * 0.6f + _swirl * 0.12f + t * _motion * 0.05f;
      p27_buf_b_bloom[_y * WIDTH + _x] = ColorFromPalette(pal_b_palMix, (uint8_t)(_pt * 255));
      p27_buf_b_bloom[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));
    }
  }
  { // Fire2012 (cooling=48, sparking=170)
    static uint8_t _heat_b_fire[HEIGHT][WIDTH] = {};
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++)
      _heat_b_fire[_y][_x]=qsub8(_heat_b_fire[_y][_x],random8(0,((48*10/HEIGHT)+2)));
    for(int _y=0;_y<HEIGHT-2;_y++) for(int _x=0;_x<WIDTH;_x++)
      _heat_b_fire[_y][_x]=(_heat_b_fire[_y+1][_x]+_heat_b_fire[_y+2][max(0,_x-1)]+_heat_b_fire[_y+2][_x]+_heat_b_fire[_y+2][min(WIDTH-1,_x+1)])/4;
    for(int _x=0;_x<WIDTH;_x++) if(random8()<170) _heat_b_fire[HEIGHT-1][_x]=qadd8(_heat_b_fire[HEIGHT-1][_x],random8(160,255));
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++) p27_buf_b_fire[_y*WIDTH+_x]=HeatColor(_heat_b_fire[_y][_x]);
  }
  { ::memmove(p27_buf_b_blend, p27_buf_b_bloom, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.56); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p27_buf_b_blend[_i], _b=p27_buf_b_fire[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=_av<0.5f?2.0f*_av*_bv:1.0f-2.0f*(1.0f-_av)*(1.0f-_bv);
        p27_buf_b_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  uint8_t n_b_hue_hue = (uint8_t)(((n_b_fft_bass)*0.5f+(n_b_fft_mids)*0.3f+(n_b_fft_treble)*0.2f)*255);
  { ::memmove(p27_buf_b_shift, p27_buf_b_blend, sizeof(CRGB) * NUM_LEDS); uint8_t _sh = (uint8_t)((n_b_hue_hue) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) p27_buf_b_shift[_i] = CHSV(rgb2hsv_approximate(p27_buf_b_shift[_i]).hue + _sh, rgb2hsv_approximate(p27_buf_b_shift[_i]).sat, rgb2hsv_approximate(p27_buf_b_shift[_i]).val); }
  {
    ::memmove(p27_buf_b_flash, p27_buf_b_shift, sizeof(CRGB) * NUM_LEDS);
    static float _flash_b_flash = 0;
    if (n_b_beat_beat) _flash_b_flash = 1.0f; else _flash_b_flash *= 0.74;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p27_buf_b_flash[_i].r = qadd8(p27_buf_b_flash[_i].r, (uint8_t)((255 - p27_buf_b_flash[_i].r) * _flash_b_flash));
      p27_buf_b_flash[_i].g = qadd8(p27_buf_b_flash[_i].g, (uint8_t)((255 - p27_buf_b_flash[_i].g) * _flash_b_flash));
      p27_buf_b_flash[_i].b = qadd8(p27_buf_b_flash[_i].b, (uint8_t)((255 - p27_buf_b_flash[_i].b) * _flash_b_flash));
    }
  }
  { ::memmove(p27_buf_b_gamma, p27_buf_b_flash, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p27_buf_b_gamma, NUM_LEDS, 2.300f); }
  ::memmove(leds, p27_buf_b_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p28(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_a_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_a_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_a_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_a_fft_bass_smooth = -1, n_a_fft_mids_smooth = -1, n_a_fft_treble_smooth = -1;
  n_a_fft_bass_smooth = n_a_fft_bass_smooth < 0 ? n_a_fft_bass_target : n_a_fft_bass_smooth * 0.720f + n_a_fft_bass_target * 0.280f;
  n_a_fft_mids_smooth = n_a_fft_mids_smooth < 0 ? n_a_fft_mids_target : n_a_fft_mids_smooth * 0.720f + n_a_fft_mids_target * 0.280f;
  n_a_fft_treble_smooth = n_a_fft_treble_smooth < 0 ? n_a_fft_treble_target : n_a_fft_treble_smooth * 0.720f + n_a_fft_treble_target * 0.280f;
  float n_a_fft_bass = n_a_fft_bass_smooth, n_a_fft_mids = n_a_fft_mids_smooth, n_a_fft_treble = n_a_fft_treble_smooth;
  bool n_a_beat_beat = false;
  static float n_a_beat_bpm = 120.0f, n_a_beat_detector_fast = 0.0f, n_a_beat_detector_slow = 0.0f, n_a_beat_detector_prevFlux = 0.0f, n_a_beat_detector_prevPrevFlux = 0.0f;
  static float n_a_beat_detector_prevSpectrum[32]; static bool n_a_beat_detector_ready = false; static uint32_t n_a_beat_detector_lastBeat = 0;
  if (n_a_beat_detector_ready) {
    float _flux = 0.0f, _weightSum = 0.0f;
    for (int _i = 0; _i < 32; _i++) {
      float _diff = _audioSpectrum[_i] - n_a_beat_detector_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;
      float _weight = _i < 6 ? 2.0f : (_i < 12 ? 1.35f : (_i < 20 ? 0.85f : 0.45f)); _flux += _diff * _weight; _weightSum += _weight;
    }
    _flux = _weightSum > 0.0f ? _flux / _weightSum : 0.0f;
    n_a_beat_detector_fast += (_flux - n_a_beat_detector_fast) * 0.4724f;
    n_a_beat_detector_slow += (_flux - n_a_beat_detector_slow) * 0.1276f;
    float _onset = n_a_beat_detector_fast - n_a_beat_detector_slow, _baseline = n_a_beat_detector_slow > 0.02f ? n_a_beat_detector_slow : 0.02f;
    float _gap = constrain(60000.0f / n_a_beat_bpm * 0.42f, 150.0f, 600.0f); uint32_t _now = millis();
    bool _peak = _flux > n_a_beat_detector_prevFlux && n_a_beat_detector_prevFlux >= n_a_beat_detector_prevPrevFlux;
    n_a_beat_beat = _flux > 0.0550f && _peak && _onset > 0.0248f && _onset / _baseline > 1.1f && (n_a_beat_detector_lastBeat == 0 || _now - n_a_beat_detector_lastBeat >= (uint32_t)_gap);
    if (n_a_beat_beat) { if (n_a_beat_detector_lastBeat != 0) { float _interval = _now - n_a_beat_detector_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) n_a_beat_bpm = n_a_beat_bpm * 0.65f + (60000.0f / _interval) * 0.35f; } n_a_beat_detector_lastBeat = _now; }
    n_a_beat_detector_prevPrevFlux = n_a_beat_detector_prevFlux; n_a_beat_detector_prevFlux = _flux;
  }
  for (int _i = 0; _i < 32; _i++) n_a_beat_detector_prevSpectrum[_i] = _audioSpectrum[_i]; n_a_beat_detector_ready = true;
  uint8_t n_a_hue_hue = (uint8_t)(((n_a_fft_bass)*0.5f+(n_a_fft_mids)*0.3f+(n_a_fft_treble)*0.2f)*255);
  CRGB n_a_hsv_color = CHSV((uint8_t)((n_a_hue_hue) / 360.0f * 255), (uint8_t)((0.7) * 255), (uint8_t)((1) * 255));
  // PaletteSelector — drives OceanColors_p in connected palette-consuming nodes
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_a_palMix;
  { uint8_t _amt = (uint8_t)((n_a_fft_mids) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_a_palMix[_i] = blend(ColorFromPalette(OceanColors_p, _p), ColorFromPalette(PartyColors_p, _p), _amt); } }
  {
    fill_solid(p28_buf_a_bars, NUM_LEDS, CRGB::Black);
    float _b = min(1.0f, max(0.0f, n_a_fft_bass)), _m = min(1.0f, max(0.0f, n_a_fft_mids)), _t = min(1.0f, max(0.0f, n_a_fft_treble));
    float _strength = min(1.0f, max(0.0f, n_a_fft_bass));
    float _spd = min(1.0f, max(0.0f, n_a_fft_treble));
    const int _cols = max(1, ((WIDTH + 1) / 2));
    float _levels[3] = { _b, _m, _t };
    float _geometryMotion = t * (0.45f + _spd * 3.2f);
    float _paletteScroll = t * (0.08f + _spd * 0.42f);
    for (int _x = 0; _x < _cols; _x++) {
      float _nx = _cols <= 1 ? 0.0f : (float)_x / (float)(_cols - 1);
      float _spec = _nx * 2.0f;
      int _left = (int)floorf(_spec);
      int _right = min(2, _left + 1);
      float _mix = _spec - (float)_left;
      float _base = _levels[_left] * (1.0f - _mix) + _levels[_right] * _mix;
      float _ripple = sinf(_nx * 10.5f - _geometryMotion * (1.1f + _t * 1.8f)) * 0.08f * _strength;
      float _shimmer = max(0.0f, sinf(_nx * 21.0f + _geometryMotion * (2.0f + _m * 2.5f))) * 0.06f * _t * _strength;
      float _level = min(1.0f, max(0.0f, _base * (0.45f + _strength * 0.9f) + _ripple + _shimmer));
      int _barH = max(0, (int)roundf(_level * HEIGHT));
      for (int _row = 0; _row < _barH; _row++) {
        int _y = HEIGHT - 1 - _row;
        float _vertical = HEIGHT <= 1 ? 0.0f : (float)_row / (float)(HEIGHT - 1);
        float _pulse = 0.72f + 0.28f * sinf(_vertical * 6.2f - _geometryMotion * (1.4f + _b * 1.6f));
        float _v = min(1.0f, max(0.0f, (0.28f + _vertical * 0.72f) * _pulse));
        float _pt = _nx + _paletteScroll + _vertical * (0.12f + _m * 0.12f) + _spec * 0.08f;
        CRGB _px = ColorFromPalette(pal_a_palMix, (uint8_t)(_pt * 255));
        _px.nscale8((uint8_t)(_v * 255));
        p28_buf_a_bars[_y * WIDTH + _x] = _px;
        p28_buf_a_bars[_y * WIDTH + (WIDTH - 1 - _x)] = _px;
      }
      if (_barH > 0) {
        int _peakY = max(0, HEIGHT - _barH);
        CRGB _peak = ColorFromPalette(pal_a_palMix, (uint8_t)((_nx + _paletteScroll + _spec * 0.08f) * 255));
        _peak.nscale8((uint8_t)(min(1.0f, 0.6f + _t * 0.35f + _strength * 0.2f) * 255));
        p28_buf_a_bars[_peakY * WIDTH + _x] = _peak;
        p28_buf_a_bars[_peakY * WIDTH + (WIDTH - 1 - _x)] = _peak;
      }
    }
  }
  {
    float _t = min(1.0f, max(0.0f, n_a_fft_treble));
    float _strength = min(1.0f, max(0.0f, n_a_fft_bass));
    float _spd = min(1.0f, max(0.0f, n_a_fft_mids));
    float _motion = _spd * (1.2f + _t * 3.2f * _strength);
    CRGB _base = n_a_hsv_color;
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _diagA = _x * 1.7f + _y * 1.15f, _diagB = _x * -1.1f + _y * 1.9f;
      float _waveA = sinf(_diagA + t * _motion * 7.5f);
      float _waveB = sinf(_diagB - t * _motion * 6.1f);
      float _prism = max(0.0f, _waveA * 0.55f + _waveB * 0.45f);
      float _shard = powf(_prism, 3.6f);
      float _flash = powf(max(0.0f, sinf((_x + _y) * 2.4f - t * _motion * 9.0f) * 0.5f + 0.5f), 10.0f);
      float _v = min(1.0f, _shard * (0.3f + _t * 0.7f * _strength) + _flash * _t * 0.9f * _strength);
      int _i = _y * WIDTH + _x;
      p28_buf_a_prism[_i] = _base;
      p28_buf_a_prism[_i].nscale8((uint8_t)(_v * 255));
    }
  }
  { ::memmove(p28_buf_a_tr, p28_buf_a_bars, sizeof(CRGB) * NUM_LEDS); float _tt=n_a_fft_bass; 
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      int _tx=_x/3,_ty=_y/3;
      float _thr=((_tx+_ty)%2==0)?_tt*2.0f:_tt*2.0f-1.0f;
      if(_thr>=1.0f) p28_buf_a_tr[_y*WIDTH+_x] = p28_buf_a_prism[_y*WIDTH+_x];
    } }
  ::memmove(p28_buf_a_blur, p28_buf_a_tr, sizeof(CRGB) * NUM_LEDS); blur2d(p28_buf_a_blur, WIDTH, HEIGHT, 23, _xyMap);
  {
    ::memmove(p28_buf_a_flash, p28_buf_a_blur, sizeof(CRGB) * NUM_LEDS);
    static float _flash_a_flash = 0;
    if (n_a_beat_beat) _flash_a_flash = 1.0f; else _flash_a_flash *= 0.66;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p28_buf_a_flash[_i].r = qadd8(p28_buf_a_flash[_i].r, (uint8_t)((255 - p28_buf_a_flash[_i].r) * _flash_a_flash));
      p28_buf_a_flash[_i].g = qadd8(p28_buf_a_flash[_i].g, (uint8_t)((255 - p28_buf_a_flash[_i].g) * _flash_a_flash));
      p28_buf_a_flash[_i].b = qadd8(p28_buf_a_flash[_i].b, (uint8_t)((255 - p28_buf_a_flash[_i].b) * _flash_a_flash));
    }
  }
  { ::memmove(p28_buf_a_gamma, p28_buf_a_flash, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p28_buf_a_gamma, NUM_LEDS, 2.240f); }
  ::memmove(leds, p28_buf_a_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p29(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p10_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_p10_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_p10_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_p10_fft_bass_smooth = -1, n_p10_fft_mids_smooth = -1, n_p10_fft_treble_smooth = -1;
  n_p10_fft_bass_smooth = n_p10_fft_bass_smooth < 0 ? n_p10_fft_bass_target : n_p10_fft_bass_smooth * 0.720f + n_p10_fft_bass_target * 0.280f;
  n_p10_fft_mids_smooth = n_p10_fft_mids_smooth < 0 ? n_p10_fft_mids_target : n_p10_fft_mids_smooth * 0.720f + n_p10_fft_mids_target * 0.280f;
  n_p10_fft_treble_smooth = n_p10_fft_treble_smooth < 0 ? n_p10_fft_treble_target : n_p10_fft_treble_smooth * 0.720f + n_p10_fft_treble_target * 0.280f;
  float n_p10_fft_bass = n_p10_fft_bass_smooth, n_p10_fft_mids = n_p10_fft_mids_smooth, n_p10_fft_treble = n_p10_fft_treble_smooth;
  // PaletteSelector — drives ForestColors_p in connected palette-consuming nodes
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_p10_palMix;
  { uint8_t _amt = (uint8_t)((n_p10_fft_treble) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_p10_palMix[_i] = blend(ColorFromPalette(ForestColors_p, _p), ColorFromPalette(PartyColors_p, _p), _amt); } }
  CRGB n_p10_sample_color = ColorFromPalette(pal_p10_palMix, (uint8_t)((n_p10_fft_bass)*255));
  float n_p10_rate_result = mapFloat(n_p10_fft_mids, 0, 1, 5, 40);
  { // Flow field
    static float _fpx_p10_flow[90], _fpy_p10_flow[90], _ftr_p10_flow[NUM_LEDS]; static bool _fi_p10_flow=false;
    if(!_fi_p10_flow){ for(int _i=0;_i<90;_i++){ _fpx_p10_flow[_i]=(random8()/255.0f)*WIDTH; _fpy_p10_flow[_i]=(random8()/255.0f)*HEIGHT; } for(int _i=0;_i<NUM_LEDS;_i++)_ftr_p10_flow[_i]=0; _fi_p10_flow=true; }
    float _spd=(constrain((n_p10_fft_bass), 0.0f, 1.0f) * 1.500f),_sc=(constrain((n_p10_fft_mids), 0.0f, 1.0f) * 1.000f); uint16_t _z=(uint16_t)(t*100);
    for(int _i=0;_i<NUM_LEDS;_i++) _ftr_p10_flow[_i]*=0.9f;
    for(int _i=0;_i<90;_i++){
      float _a=(inoise8((uint16_t)(_fpx_p10_flow[_i]*_sc*256),(uint16_t)(_fpy_p10_flow[_i]*_sc*256),_z)/255.0f)*6.2831f*2;
      _fpx_p10_flow[_i]=fmodf(_fpx_p10_flow[_i]+cos(_a)*_spd*0.6f+WIDTH,WIDTH); _fpy_p10_flow[_i]=fmodf(_fpy_p10_flow[_i]+sin(_a)*_spd*0.6f+HEIGHT,HEIGHT);
      int _xi=(int)_fpx_p10_flow[_i],_yi=(int)_fpy_p10_flow[_i]; if(_xi>=0&&_xi<WIDTH&&_yi>=0&&_yi<HEIGHT){ int _id=_yi*WIDTH+_xi; _ftr_p10_flow[_id]=min(1.0f,_ftr_p10_flow[_id]+0.5f); } }
    for(int _i=0;_i<NUM_LEDS;_i++) p29_buf_p10_flow[_i]=ColorFromPalette(pal_p10_palMix,(uint8_t)(_ftr_p10_flow[_i]*255)); }
  { // Particles: sparkle
    const int _PN=120;
    static float _pa_p10_particlesx[_PN], _pa_p10_particlesy[_PN], _pa_p10_particlesvx[_PN], _pa_p10_particlesvy[_PN], _pa_p10_particlesl[_PN], _pa_p10_particless[_PN]; static uint8_t _pa_p10_particlesr[_PN], _pa_p10_particlesg[_PN], _pa_p10_particlesb[_PN]; static bool _pa_p10_particlesinit=false;
    float _rate=n_p10_fft_treble; CRGB _pc=n_p10_sample_color;
    if(!_pa_p10_particlesinit){ for(int i=0;i<_PN;i++) _pa_p10_particlesl[i]=0; _pa_p10_particlesinit=true; }
    { int _sp=max(1,(int)(_rate*WIDTH*0.8f)); for(int k=0;k<_sp;k++) if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(_pa_p10_particlesl[i]<=0.04f){ _pa_p10_particlesx[i]=random8()/255.0f*WIDTH; _pa_p10_particlesy[i]=random8()/255.0f*HEIGHT*0.3f; _pa_p10_particlesvx[i]=0; _pa_p10_particlesvy[i]=random8()/255.0f*0.25f+0.05f; _pa_p10_particlesl[i]=1; _pa_p10_particlesr[i]=_pc.r; _pa_p10_particlesg[i]=_pc.g; _pa_p10_particlesb[i]=_pc.b; break; } } }
    for(int i=0;i<_PN;i++){ if(_pa_p10_particlesl[i]<=0.04f) continue;
      _pa_p10_particlesy[i]+=_pa_p10_particlesvy[i]; _pa_p10_particlesl[i]*=0.86f*0.9f; if(_pa_p10_particlesy[i]>=HEIGHT) _pa_p10_particlesl[i]=0; }
    fill_solid(p29_buf_p10_particles, NUM_LEDS, CRGB::Black);
    for(int i=0;i<_PN;i++){ if(_pa_p10_particlesl[i]<=0.04f) continue; int X=(int)(_pa_p10_particlesx[i]+0.5f), Y=(int)(_pa_p10_particlesy[i]+0.5f);
      if(X>=0&&X<WIDTH&&Y>=0&&Y<HEIGHT){ float _k=min(1.0f,_pa_p10_particlesl[i]); p29_buf_p10_particles[Y*WIDTH+X]+=CRGB((uint8_t)(_pc.r*_k),(uint8_t)(_pc.g*_k),(uint8_t)(_pc.b*_k)); } } }
  { ::memmove(p29_buf_p10_blend, p29_buf_p10_flow, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.5); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p29_buf_p10_blend[_i], _b=p29_buf_p10_particles[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=min(1.0f,_av+_bv);
        p29_buf_p10_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=n_p10_rate_result;
    float _a=_rate*t*0.01745329f,_co=cos(_a),_si=sin(_a);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _rx=_x-_cx,_ry=_y-_cy; int _sx=(int)floorf(_cx+_rx*_co+_ry*_si+0.5f), _sy=(int)floorf(_cy-_rx*_si+_ry*_co+0.5f);
      p29_buf_p10_transform[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?p29_buf_p10_blend[_sy*WIDTH+_sx]:CRGB::Black;}}
  ::memmove(p29_buf_p10_blur, p29_buf_p10_transform, sizeof(CRGB) * NUM_LEDS); blur2d(p29_buf_p10_blur, WIDTH, HEIGHT, 26, _xyMap);
  { ::memmove(p29_buf_p10_gamma, p29_buf_p10_blur, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p29_buf_p10_gamma, NUM_LEDS, 2.240f); }
  ::memmove(leds, p29_buf_p10_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p30(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p9_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_p9_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_p9_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_p9_fft_bass_smooth = -1, n_p9_fft_mids_smooth = -1, n_p9_fft_treble_smooth = -1;
  n_p9_fft_bass_smooth = n_p9_fft_bass_smooth < 0 ? n_p9_fft_bass_target : n_p9_fft_bass_smooth * 0.720f + n_p9_fft_bass_target * 0.280f;
  n_p9_fft_mids_smooth = n_p9_fft_mids_smooth < 0 ? n_p9_fft_mids_target : n_p9_fft_mids_smooth * 0.720f + n_p9_fft_mids_target * 0.280f;
  n_p9_fft_treble_smooth = n_p9_fft_treble_smooth < 0 ? n_p9_fft_treble_target : n_p9_fft_treble_smooth * 0.720f + n_p9_fft_treble_target * 0.280f;
  float n_p9_fft_bass = n_p9_fft_bass_smooth, n_p9_fft_mids = n_p9_fft_mids_smooth, n_p9_fft_treble = n_p9_fft_treble_smooth;
  uint8_t n_p9_hue_hue = (uint8_t)(((n_p9_fft_bass)*0.5f+(n_p9_fft_mids)*0.3f+(n_p9_fft_treble)*0.2f)*255);
  CRGBPalette16 pal_p9_poline(CRGB(23,59,255), CRGB(53,0,231), CRGB(153,0,231), CRGB(153,0,231), CRGB(251,11,255), CRGB(255,53,222), CRGB(255,84,211), CRGB(255,95,210), CRGB(255,95,210), CRGB(255,72,206), CRGB(255,3,205), CRGB(153,0,155), CRGB(0,13,81), CRGB(0,13,81), CRGB(0,202,180), CRGB(122,255,216));
  { /* CustomFormula: sin((r*14 - t*(1.5 + a*6)) + cos(angle*6 + t*(0.5 + b*4))*2)*0.5+0.5 */
    float a=n_p9_fft_bass, b=n_p9_fft_mids; (void)a; (void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=(float)_x/(WIDTH-1>0?WIDTH-1:1),y=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float _v=sin((r*14 - t*(1.5 + a*6)) + cos(angle*6 + t*(0.5 + b*4))*2)*0.5+0.5;
      p30_buf_p9_formula[_y*WIDTH+_x]=ColorFromPalette(pal_p9_poline,(uint8_t)(fmod(fmod(_v,1)+1,1)*255));}}
  { // Palette gradient
    float _a=120*0.01745329f,_co=cos(_a),_si=sin(_a);
    float _pmin=(_co<0?(WIDTH-1)*_co:0)+(_si<0?(HEIGHT-1)*_si:0);
    float _pmax=(_co>0?(WIDTH-1)*_co:0)+(_si>0?(HEIGHT-1)*_si:0);
    float _rng=max(1e-6f,_pmax-_pmin);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _tn=(_x*_co+_y*_si-_pmin)/_rng;
      p30_buf_p9_gradient[_y*WIDTH+_x]=ColorFromPalette(pal_p9_poline,(uint8_t)((_tn*4.0f+t*0.16f)*255));}}
  { ::memmove(p30_buf_p9_blend, p30_buf_p9_formula, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.28); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p30_buf_p9_blend[_i], _b=p30_buf_p9_gradient[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p30_buf_p9_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { ::memmove(p30_buf_p9_hueshift, p30_buf_p9_blend, sizeof(CRGB) * NUM_LEDS); uint8_t _sh = (uint8_t)((n_p9_hue_hue) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) p30_buf_p9_hueshift[_i] = CHSV(rgb2hsv_approximate(p30_buf_p9_hueshift[_i]).hue + _sh, rgb2hsv_approximate(p30_buf_p9_hueshift[_i]).sat, rgb2hsv_approximate(p30_buf_p9_hueshift[_i]).val); }
  { ::memmove(p30_buf_p9_gamma, p30_buf_p9_hueshift, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p30_buf_p9_gamma, NUM_LEDS, 2.260f); }
  ::memmove(leds, p30_buf_p9_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p31(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p8_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_p8_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_p8_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_p8_fft_bass_smooth = -1, n_p8_fft_mids_smooth = -1, n_p8_fft_treble_smooth = -1;
  n_p8_fft_bass_smooth = n_p8_fft_bass_smooth < 0 ? n_p8_fft_bass_target : n_p8_fft_bass_smooth * 0.720f + n_p8_fft_bass_target * 0.280f;
  n_p8_fft_mids_smooth = n_p8_fft_mids_smooth < 0 ? n_p8_fft_mids_target : n_p8_fft_mids_smooth * 0.720f + n_p8_fft_mids_target * 0.280f;
  n_p8_fft_treble_smooth = n_p8_fft_treble_smooth < 0 ? n_p8_fft_treble_target : n_p8_fft_treble_smooth * 0.720f + n_p8_fft_treble_target * 0.280f;
  float n_p8_fft_bass = n_p8_fft_bass_smooth, n_p8_fft_mids = n_p8_fft_mids_smooth, n_p8_fft_treble = n_p8_fft_treble_smooth;
  uint8_t n_p8_hue_hue = (uint8_t)(((n_p8_fft_bass)*0.5f+(n_p8_fft_mids)*0.3f+(n_p8_fft_treble)*0.2f)*255);
  CRGB n_p8_hsv_color = CHSV((uint8_t)((n_p8_hue_hue) / 360.0f * 255), (uint8_t)((0.8) * 255), (uint8_t)((1) * 255));
  // PaletteSelector — drives OceanColors_p in connected palette-consuming nodes
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_p8_palMix;
  { uint8_t _amt = (uint8_t)((n_p8_fft_treble) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_p8_palMix[_i] = blend(ColorFromPalette(OceanColors_p, _p), ColorFromPalette(PartyColors_p, _p), _amt); } }
  float n_p8_golSpeed_result = mapFloat(n_p8_fft_mids, 0, 1, 4, 20);
  { // Fractal noise (fBm via inoise8)
    float _spd=(constrain((n_p8_fft_bass), 0.0f, 1.0f) * 1.200f),_sc=(constrain((n_p8_fft_mids), 0.0f, 1.0f) * 0.500f); uint16_t _z=(uint16_t)(t*_spd*40);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _v=0,_amp=0.5f,_norm=0,_freq=_sc*96;
      for(int _o=0;_o<5;_o++){
        _v+=_amp*(inoise8((uint16_t)(_x*_freq),(uint16_t)(_y*_freq),_z)/255.0f);
        _norm+=_amp; _amp*=0.5f; _freq*=2; }
      p31_buf_p8_fractal[_y*WIDTH+_x]=ColorFromPalette(pal_p8_palMix,(uint8_t)((_v/_norm)*255));}}
  { // Game of Life
    static uint8_t _gc_p8_life[NUM_LEDS], _gn_p8_life[NUM_LEDS]; static float _gb_p8_life[NUM_LEDS]; static bool _gi_p8_life=false; static uint32_t _gt_p8_life=0;
    if (!_gi_p8_life) { for (int _i=0;_i<NUM_LEDS;_i++){_gc_p8_life[_i]=random8()<77?1:0;_gb_p8_life[_i]=0;} _gi_p8_life=true; }
    if (millis() - _gt_p8_life >= (uint32_t)(1000.0f / max(1.0f, (float)(n_p8_golSpeed_result)))) {
      int _pop=0;
      for (int _y=0;_y<HEIGHT;_y++){ int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;
        for (int _x=0;_x<WIDTH;_x++){ int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;
          int _n=_gc_p8_life[_ym+_xm]+_gc_p8_life[_ym+_x]+_gc_p8_life[_ym+_xp]+_gc_p8_life[_yr+_xm]+_gc_p8_life[_yr+_xp]+_gc_p8_life[_yp+_xm]+_gc_p8_life[_yp+_x]+_gc_p8_life[_yp+_xp];
          _gn_p8_life[_i]=_gc_p8_life[_i]?((_n==2||_n==3)?1:0):(_n==3?1:0); _pop+=_gn_p8_life[_i]; } }
      ::memcpy(_gc_p8_life,_gn_p8_life,sizeof(_gc_p8_life));
      if (_pop==0) { for (int _i=0;_i<NUM_LEDS;_i++) _gc_p8_life[_i]=random8()<77?1:0; }
      _gt_p8_life=millis(); }
    for (int _i=0;_i<NUM_LEDS;_i++){ _gb_p8_life[_i]=_gc_p8_life[_i]?1.0f:_gb_p8_life[_i]*0.88f; p31_buf_p8_life[_i]=n_p8_hsv_color; p31_buf_p8_life[_i].nscale8((uint8_t)(_gb_p8_life[_i]*255)); } }
  { ::memmove(p31_buf_p8_transition, p31_buf_p8_fractal, sizeof(CRGB) * NUM_LEDS); float _tt=n_p8_fft_bass; float _cx=WIDTH*0.5f,_cy=HEIGHT*0.5f,_maxR=sqrtf(_cx*_cx+_cy*_cy),_k=1.0f+1.0f/(float)3;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _dx=_x-_cx,_dy=_y-_cy,_r=sqrtf(_dx*_dx+_dy*_dy)/_maxR;
      float _na=(atan2f(_dy,_dx)+3.14159265f)/6.2831853f;
      if((_r+_na/(float)3)/_k<_tt) p31_buf_p8_transition[_y*WIDTH+_x] = p31_buf_p8_life[_y*WIDTH+_x];
    } }
  ::memmove(p31_buf_p8_blur, p31_buf_p8_transition, sizeof(CRGB) * NUM_LEDS); blur2d(p31_buf_p8_blur, WIDTH, HEIGHT, 15, _xyMap);
  { ::memmove(p31_buf_p8_gamma, p31_buf_p8_blur, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p31_buf_p8_gamma, NUM_LEDS, 2.220f); }
  ::memmove(leds, p31_buf_p8_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p32(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p7_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_p7_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_p7_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_p7_fft_bass_smooth = -1, n_p7_fft_mids_smooth = -1, n_p7_fft_treble_smooth = -1;
  n_p7_fft_bass_smooth = n_p7_fft_bass_smooth < 0 ? n_p7_fft_bass_target : n_p7_fft_bass_smooth * 0.720f + n_p7_fft_bass_target * 0.280f;
  n_p7_fft_mids_smooth = n_p7_fft_mids_smooth < 0 ? n_p7_fft_mids_target : n_p7_fft_mids_smooth * 0.720f + n_p7_fft_mids_target * 0.280f;
  n_p7_fft_treble_smooth = n_p7_fft_treble_smooth < 0 ? n_p7_fft_treble_target : n_p7_fft_treble_smooth * 0.720f + n_p7_fft_treble_target * 0.280f;
  float n_p7_fft_bass = n_p7_fft_bass_smooth, n_p7_fft_mids = n_p7_fft_mids_smooth, n_p7_fft_treble = n_p7_fft_treble_smooth;
  // PaletteSelector — drives LavaColors_p in connected palette-consuming nodes
  // PaletteSelector — drives ForestColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_p7_palMix;
  { uint8_t _amt = (uint8_t)((n_p7_fft_mids) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_p7_palMix[_i] = blend(ColorFromPalette(LavaColors_p, _p), ColorFromPalette(ForestColors_p, _p), _amt); } }
  float n_p7_feed_result = mapFloat(n_p7_fft_treble, 0, 1, 0.04, 0.07);
  float n_p7_kill_result = mapFloat(n_p7_fft_bass, 0, 1, 0.05, 0.065);
  float n_p7_rate_result = mapFloat(n_p7_fft_mids, 0, 1, 5, 70);
  { // Blobs (metaballs)
    float _spd=(constrain((n_p7_fft_bass), 0.0f, 1.0f) * 2.000f), _r=(constrain((n_p7_fft_mids), 0.0f, 1.0f) * 0.500f)*min(WIDTH,HEIGHT), _r2=_r*_r;
    float _bx[4], _by[4];
    for(int _i=0;_i<4;_i++){ _bx[_i]=WIDTH*(0.5f+0.4f*sin(t*_spd*(0.7f+_i*0.13f)+_i*1.7f)); _by[_i]=HEIGHT*(0.5f+0.4f*cos(t*_spd*(0.6f+_i*0.17f)+_i*2.3f)); }
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){ float _f=0;
      for(int _i=0;_i<4;_i++){ float _dx=_x-_bx[_i],_dy=_y-_by[_i]; _f+=_r2/(_dx*_dx+_dy*_dy+1.0f); }
      p32_buf_p7_blobs[_y*WIDTH+_x]=ColorFromPalette(pal_p7_palMix,(uint8_t)((_f/(_f+1.0f))*255)); }}
  { // ReactionDiffusion (Gray-Scott)
    static float _u_p7_rd[NUM_LEDS], _v_p7_rd[NUM_LEDS], _un_p7_rd[NUM_LEDS], _vn_p7_rd[NUM_LEDS]; static bool _rd_p7_rd = false;
    if (!_rd_p7_rd) { for (int _i = 0; _i < NUM_LEDS; _i++) { _u_p7_rd[_i] = 1; _v_p7_rd[_i] = 0; }
      for (int _y = HEIGHT/2-2; _y <= HEIGHT/2+1; _y++) for (int _x = WIDTH/2-2; _x <= WIDTH/2+1; _x++)
        if (_x>=0&&_x<WIDTH&&_y>=0&&_y<HEIGHT) { _u_p7_rd[_y*WIDTH+_x]=0.5f; _v_p7_rd[_y*WIDTH+_x]=0.5f; } _rd_p7_rd=true; }
    float _f=n_p7_feed_result, _k=n_p7_kill_result;
    for (int _it=0; _it<9; _it++) {
      for (int _y=0; _y<HEIGHT; _y++) { int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;
        for (int _x=0; _x<WIDTH; _x++) { int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;
          float _lu=(_u_p7_rd[_ym+_x]+_u_p7_rd[_yp+_x]+_u_p7_rd[_yr+_xm]+_u_p7_rd[_yr+_xp])*0.2f+(_u_p7_rd[_ym+_xm]+_u_p7_rd[_ym+_xp]+_u_p7_rd[_yp+_xm]+_u_p7_rd[_yp+_xp])*0.05f-_u_p7_rd[_i];
          float _lv=(_v_p7_rd[_ym+_x]+_v_p7_rd[_yp+_x]+_v_p7_rd[_yr+_xm]+_v_p7_rd[_yr+_xp])*0.2f+(_v_p7_rd[_ym+_xm]+_v_p7_rd[_ym+_xp]+_v_p7_rd[_yp+_xm]+_v_p7_rd[_yp+_xp])*0.05f-_v_p7_rd[_i];
          float _uvv=_u_p7_rd[_i]*_v_p7_rd[_i]*_v_p7_rd[_i];
          _un_p7_rd[_i]=constrain(_u_p7_rd[_i]+0.16f*_lu-_uvv+_f*(1-_u_p7_rd[_i]),0.0f,1.0f);
          _vn_p7_rd[_i]=constrain(_v_p7_rd[_i]+0.08f*_lv+_uvv-(_k+_f)*_v_p7_rd[_i],0.0f,1.0f); } }
      ::memcpy(_u_p7_rd,_un_p7_rd,sizeof(_u_p7_rd)); ::memcpy(_v_p7_rd,_vn_p7_rd,sizeof(_v_p7_rd)); }
    for (int _i=0; _i<NUM_LEDS; _i++) p32_buf_p7_rd[_i]=ColorFromPalette(pal_p7_palMix,(uint8_t)(_v_p7_rd[_i]*255)); }
  { ::memmove(p32_buf_p7_blend, p32_buf_p7_blobs, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.42); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p32_buf_p7_blend[_i], _b=p32_buf_p7_rd[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=_av<0.5f?2.0f*_av*_bv:1.0f-2.0f*(1.0f-_av)*(1.0f-_bv);
        p32_buf_p7_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=n_p7_rate_result;
    float _a=_rate*t*0.01745329f,_co=cos(_a),_si=sin(_a);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _rx=_x-_cx,_ry=_y-_cy; int _sx=(int)floorf(_cx+_rx*_co+_ry*_si+0.5f), _sy=(int)floorf(_cy-_rx*_si+_ry*_co+0.5f);
      p32_buf_p7_transform[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?p32_buf_p7_blend[_sy*WIDTH+_sx]:CRGB::Black;}}
  { ::memmove(p32_buf_p7_gamma, p32_buf_p7_transform, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p32_buf_p7_gamma, NUM_LEDS, 2.280f); }
  ::memmove(leds, p32_buf_p7_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p33(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p6_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_p6_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_p6_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_p6_fft_bass_smooth = -1, n_p6_fft_mids_smooth = -1, n_p6_fft_treble_smooth = -1;
  n_p6_fft_bass_smooth = n_p6_fft_bass_smooth < 0 ? n_p6_fft_bass_target : n_p6_fft_bass_smooth * 0.720f + n_p6_fft_bass_target * 0.280f;
  n_p6_fft_mids_smooth = n_p6_fft_mids_smooth < 0 ? n_p6_fft_mids_target : n_p6_fft_mids_smooth * 0.720f + n_p6_fft_mids_target * 0.280f;
  n_p6_fft_treble_smooth = n_p6_fft_treble_smooth < 0 ? n_p6_fft_treble_target : n_p6_fft_treble_smooth * 0.720f + n_p6_fft_treble_target * 0.280f;
  float n_p6_fft_bass = n_p6_fft_bass_smooth, n_p6_fft_mids = n_p6_fft_mids_smooth, n_p6_fft_treble = n_p6_fft_treble_smooth;
  uint8_t n_p6_hue_hue = (uint8_t)(((n_p6_fft_bass)*0.5f+(n_p6_fft_mids)*0.3f+(n_p6_fft_treble)*0.2f)*255);
  float n_p6_invBass_result = (1) - (n_p6_fft_bass);
  { /* DistanceField */
    float _px=n_p6_fft_bass, _py=n_p6_fft_mids, _sc=1.6; if(_sc<0.0001f)_sc=0.0001f;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _nx=(float)_x/(WIDTH-1>0?WIDTH-1:1),_ny=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);
      float _dx=_nx-_px,_dy=_ny-_py;
      float _d=sqrtf(_dx*_dx+_dy*_dy)/1.41421356f*_sc;
      p33_field_p6_d1[_y*WIDTH+_x]=constrain(_d,0.0f,1.0f);}}
  { /* DistanceField */
    float _px=n_p6_invBass_result, _py=n_p6_fft_treble, _sc=1.6; if(_sc<0.0001f)_sc=0.0001f;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _nx=(float)_x/(WIDTH-1>0?WIDTH-1:1),_ny=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);
      float _dx=_nx-_px,_dy=_ny-_py;
      float _d=sqrtf(_dx*_dx+_dy*_dy)/1.41421356f*_sc;
      p33_field_p6_d2[_y*WIDTH+_x]=constrain(_d,0.0f,1.0f);}}
  { /* FieldMath: difference */
    for(int _i=0;_i<NUM_LEDS;_i++){
      float _a=p33_field_p6_d1[_i], _b=p33_field_p6_d2[_i];
      p33_field_p6_diff[_i]=constrain(fabsf(_a - _b),0.0f,1.0f);}}
  { /* FieldTile */
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      int _sx=(_x*3)%WIDTH,_sy=(_y*3)%HEIGHT;
      p33_field_p6_tile[_y*WIDTH+_x]=p33_field_p6_diff[_sy*WIDTH+_sx];}}
  { /* FieldRotate */ float _ang=((n_p6_hue_hue)+t*0)*0.01745329f;
    float _ca=cosf(-_ang),_sa=sinf(-_ang),_cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _dx=_x-_cx,_dy=_y-_cy;
      int _sx=(((int)roundf(_dx*_ca-_dy*_sa+_cx))%WIDTH+WIDTH)%WIDTH;
      int _sy=(((int)roundf(_dx*_sa+_dy*_ca+_cy))%HEIGHT+HEIGHT)%HEIGHT;
      p33_field_p6_rotate[_y*WIDTH+_x]=p33_field_p6_tile[_sy*WIDTH+_sx];}}
  // PaletteSelector — drives ForestColors_p in connected palette-consuming nodes
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_p6_palMix;
  { uint8_t _amt = (uint8_t)((n_p6_fft_treble) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_p6_palMix[_i] = blend(ColorFromPalette(ForestColors_p, _p), ColorFromPalette(PartyColors_p, _p), _amt); } }
  { float _br=constrain(1,0.0f,1.0f);
    for(int _i=0;_i<NUM_LEDS;_i++)
      p33_buf_p6_toFrame[_i]=ColorFromPalette(pal_p6_palMix,(uint8_t)(p33_field_p6_rotate[_i]*255),(uint8_t)(_br*255)); }
  ::memmove(p33_buf_p6_blur, p33_buf_p6_toFrame, sizeof(CRGB) * NUM_LEDS); blur2d(p33_buf_p6_blur, WIDTH, HEIGHT, 31, _xyMap);
  { ::memmove(p33_buf_p6_gamma, p33_buf_p6_blur, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p33_buf_p6_gamma, NUM_LEDS, 2.300f); }
  ::memmove(leds, p33_buf_p6_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p34(uint32_t ms) {
  float n_p5_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_p5_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_p5_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_p5_fft_bass_smooth = -1, n_p5_fft_mids_smooth = -1, n_p5_fft_treble_smooth = -1;
  n_p5_fft_bass_smooth = n_p5_fft_bass_smooth < 0 ? n_p5_fft_bass_target : n_p5_fft_bass_smooth * 0.720f + n_p5_fft_bass_target * 0.280f;
  n_p5_fft_mids_smooth = n_p5_fft_mids_smooth < 0 ? n_p5_fft_mids_target : n_p5_fft_mids_smooth * 0.720f + n_p5_fft_mids_target * 0.280f;
  n_p5_fft_treble_smooth = n_p5_fft_treble_smooth < 0 ? n_p5_fft_treble_target : n_p5_fft_treble_smooth * 0.720f + n_p5_fft_treble_target * 0.280f;
  float n_p5_fft_bass = n_p5_fft_bass_smooth, n_p5_fft_mids = n_p5_fft_mids_smooth, n_p5_fft_treble = n_p5_fft_treble_smooth;
  bool n_p5_beat_beat = false;
  static float n_p5_beat_bpm = 120.0f, n_p5_beat_detector_fast = 0.0f, n_p5_beat_detector_slow = 0.0f, n_p5_beat_detector_prevFlux = 0.0f, n_p5_beat_detector_prevPrevFlux = 0.0f;
  static float n_p5_beat_detector_prevSpectrum[32]; static bool n_p5_beat_detector_ready = false; static uint32_t n_p5_beat_detector_lastBeat = 0;
  if (n_p5_beat_detector_ready) {
    float _flux = 0.0f, _weightSum = 0.0f;
    for (int _i = 0; _i < 32; _i++) {
      float _diff = _audioSpectrum[_i] - n_p5_beat_detector_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;
      float _weight = _i < 6 ? 2.0f : (_i < 12 ? 1.35f : (_i < 20 ? 0.85f : 0.45f)); _flux += _diff * _weight; _weightSum += _weight;
    }
    _flux = _weightSum > 0.0f ? _flux / _weightSum : 0.0f;
    n_p5_beat_detector_fast += (_flux - n_p5_beat_detector_fast) * 0.4724f;
    n_p5_beat_detector_slow += (_flux - n_p5_beat_detector_slow) * 0.1276f;
    float _onset = n_p5_beat_detector_fast - n_p5_beat_detector_slow, _baseline = n_p5_beat_detector_slow > 0.02f ? n_p5_beat_detector_slow : 0.02f;
    float _gap = constrain(60000.0f / n_p5_beat_bpm * 0.42f, 150.0f, 600.0f); uint32_t _now = millis();
    bool _peak = _flux > n_p5_beat_detector_prevFlux && n_p5_beat_detector_prevFlux >= n_p5_beat_detector_prevPrevFlux;
    n_p5_beat_beat = _flux > 0.0550f && _peak && _onset > 0.0248f && _onset / _baseline > 1.1f && (n_p5_beat_detector_lastBeat == 0 || _now - n_p5_beat_detector_lastBeat >= (uint32_t)_gap);
    if (n_p5_beat_beat) { if (n_p5_beat_detector_lastBeat != 0) { float _interval = _now - n_p5_beat_detector_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) n_p5_beat_bpm = n_p5_beat_bpm * 0.65f + (60000.0f / _interval) * 0.35f; } n_p5_beat_detector_lastBeat = _now; }
    n_p5_beat_detector_prevPrevFlux = n_p5_beat_detector_prevFlux; n_p5_beat_detector_prevFlux = _flux;
  }
  for (int _i = 0; _i < 32; _i++) n_p5_beat_detector_prevSpectrum[_i] = _audioSpectrum[_i]; n_p5_beat_detector_ready = true;
  uint8_t n_p5_hue_hue = (uint8_t)(((n_p5_fft_bass)*0.5f+(n_p5_fft_mids)*0.3f+(n_p5_fft_treble)*0.2f)*255);
  CRGB n_p5_hsv_color = CHSV((uint8_t)((n_p5_hue_hue) / 360.0f * 255), (uint8_t)((0.8) * 255), (uint8_t)((1) * 255));
  float n_p5_rate_result = mapFloat(n_p5_fft_bass, 0, 1, 0.15, 1);
  float n_p5_starSpeed_result = mapFloat(n_p5_fft_mids, 0, 1, 0.08, 0.75);
  { // Particles: fireworks
    const int _PN=120;
    static float _pa_p5_particlesx[_PN], _pa_p5_particlesy[_PN], _pa_p5_particlesvx[_PN], _pa_p5_particlesvy[_PN], _pa_p5_particlesl[_PN], _pa_p5_particless[_PN]; static uint8_t _pa_p5_particlesr[_PN], _pa_p5_particlesg[_PN], _pa_p5_particlesb[_PN]; static bool _pa_p5_particlesinit=false;
    float _rate=n_p5_rate_result; CRGB _pc=n_p5_hsv_color;
    if(!_pa_p5_particlesinit){ for(int i=0;i<_PN;i++) _pa_p5_particlesl[i]=0; _pa_p5_particlesinit=true; }
    if(random8()<(uint8_t)(_rate*0.12f*255)){ uint8_t _hue=random8(); int _n=14+random8()/32; float _cx=random8()/255.0f*WIDTH, _cy=random8()/255.0f*HEIGHT*0.5f+HEIGHT*0.1f;
      for(int k=0;k<_n;k++) for(int i=0;i<_PN;i++) if(_pa_p5_particlesl[i]<=0.04f){ float _a=(k/(float)_n)*6.2831f+random8()/255.0f*0.3f, _sp=random8()/255.0f*0.5f+0.35f; _pa_p5_particlesx[i]=_cx; _pa_p5_particlesy[i]=_cy; _pa_p5_particlesvx[i]=cos(_a)*_sp; _pa_p5_particlesvy[i]=sin(_a)*_sp; _pa_p5_particlesl[i]=1; CRGB _fc=CHSV(_hue+(random8()%30)-15,255,255); _pa_p5_particlesr[i]=_fc.r; _pa_p5_particlesg[i]=_fc.g; _pa_p5_particlesb[i]=_fc.b; break; } }
    for(int i=0;i<_PN;i++){ if(_pa_p5_particlesl[i]<=0.04f) continue;
      _pa_p5_particlesvy[i]=(_pa_p5_particlesvy[i]+0.022f)*0.965f; _pa_p5_particlesvx[i]*=0.965f; _pa_p5_particlesx[i]+=_pa_p5_particlesvx[i]; _pa_p5_particlesy[i]+=_pa_p5_particlesvy[i]; _pa_p5_particlesl[i]*=0.9f*0.985f; }
    fill_solid(p34_buf_p5_particles, NUM_LEDS, CRGB::Black);
    for(int i=0;i<_PN;i++){ if(_pa_p5_particlesl[i]<=0.04f) continue; int X=(int)(_pa_p5_particlesx[i]+0.5f), Y=(int)(_pa_p5_particlesy[i]+0.5f);
      if(X>=0&&X<WIDTH&&Y>=0&&Y<HEIGHT){ float _k=min(1.0f,_pa_p5_particlesl[i]); p34_buf_p5_particles[Y*WIDTH+X]+=CRGB((uint8_t)(_pa_p5_particlesr[i]*_k),(uint8_t)(_pa_p5_particlesg[i]*_k),(uint8_t)(_pa_p5_particlesb[i]*_k)); } } }
  { // Starfield
    static float _sfx_p5_stars[56], _sfy_p5_stars[56], _sfz_p5_stars[56]; static bool _sfi_p5_stars=false;
    if(!_sfi_p5_stars){ for(int _i=0;_i<56;_i++){ _sfx_p5_stars[_i]=random8()/127.5f-1; _sfy_p5_stars[_i]=random8()/127.5f-1; _sfz_p5_stars[_i]=random8()/255.0f*0.9f+0.1f; } _sfi_p5_stars=true; }
    float _spd=(constrain((n_p5_starSpeed_result), 0.0f, 1.0f) * 3.000f); fill_solid(p34_buf_p5_stars, NUM_LEDS, CRGB::Black);
    for(int _i=0;_i<56;_i++){ _sfz_p5_stars[_i]-=_spd*0.015f;
      if(_sfz_p5_stars[_i]<=0.02f){ _sfx_p5_stars[_i]=random8()/127.5f-1; _sfy_p5_stars[_i]=random8()/127.5f-1; _sfz_p5_stars[_i]=1; }
      int _px=(int)(WIDTH/2.0f+(_sfx_p5_stars[_i]/_sfz_p5_stars[_i])*WIDTH*0.35f), _py=(int)(HEIGHT/2.0f+(_sfy_p5_stars[_i]/_sfz_p5_stars[_i])*HEIGHT*0.35f);
      if(_px>=0&&_px<WIDTH&&_py>=0&&_py<HEIGHT){ p34_buf_p5_stars[_py*WIDTH+_px]=n_p5_hsv_color; p34_buf_p5_stars[_py*WIDTH+_px].nscale8((uint8_t)(min(1.0f,1-_sfz_p5_stars[_i])*255)); } } }
  { ::memmove(p34_buf_p5_blend, p34_buf_p5_particles, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.7); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p34_buf_p5_blend[_i], _b=p34_buf_p5_stars[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=min(1.0f,_av+_bv);
        p34_buf_p5_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  ::memmove(p34_buf_p5_blur, p34_buf_p5_blend, sizeof(CRGB) * NUM_LEDS); blur2d(p34_buf_p5_blur, WIDTH, HEIGHT, 38, _xyMap);
  {
    ::memmove(p34_buf_p5_flash, p34_buf_p5_blur, sizeof(CRGB) * NUM_LEDS);
    static float _flash_p5_flash = 0;
    if (n_p5_beat_beat) _flash_p5_flash = 1.0f; else _flash_p5_flash *= 0.65;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p34_buf_p5_flash[_i].r = qadd8(p34_buf_p5_flash[_i].r, (uint8_t)((255 - p34_buf_p5_flash[_i].r) * _flash_p5_flash));
      p34_buf_p5_flash[_i].g = qadd8(p34_buf_p5_flash[_i].g, (uint8_t)((255 - p34_buf_p5_flash[_i].g) * _flash_p5_flash));
      p34_buf_p5_flash[_i].b = qadd8(p34_buf_p5_flash[_i].b, (uint8_t)((255 - p34_buf_p5_flash[_i].b) * _flash_p5_flash));
    }
  }
  { ::memmove(p34_buf_p5_gamma, p34_buf_p5_flash, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p34_buf_p5_gamma, NUM_LEDS, 2.200f); }
  ::memmove(leds, p34_buf_p5_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p35(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p4_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_p4_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_p4_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_p4_fft_bass_smooth = -1, n_p4_fft_mids_smooth = -1, n_p4_fft_treble_smooth = -1;
  n_p4_fft_bass_smooth = n_p4_fft_bass_smooth < 0 ? n_p4_fft_bass_target : n_p4_fft_bass_smooth * 0.720f + n_p4_fft_bass_target * 0.280f;
  n_p4_fft_mids_smooth = n_p4_fft_mids_smooth < 0 ? n_p4_fft_mids_target : n_p4_fft_mids_smooth * 0.720f + n_p4_fft_mids_target * 0.280f;
  n_p4_fft_treble_smooth = n_p4_fft_treble_smooth < 0 ? n_p4_fft_treble_target : n_p4_fft_treble_smooth * 0.720f + n_p4_fft_treble_target * 0.280f;
  float n_p4_fft_bass = n_p4_fft_bass_smooth, n_p4_fft_mids = n_p4_fft_mids_smooth, n_p4_fft_treble = n_p4_fft_treble_smooth;
  bool n_p4_beat_beat = false;
  static float n_p4_beat_bpm = 120.0f, n_p4_beat_detector_fast = 0.0f, n_p4_beat_detector_slow = 0.0f, n_p4_beat_detector_prevFlux = 0.0f, n_p4_beat_detector_prevPrevFlux = 0.0f;
  static float n_p4_beat_detector_prevSpectrum[32]; static bool n_p4_beat_detector_ready = false; static uint32_t n_p4_beat_detector_lastBeat = 0;
  if (n_p4_beat_detector_ready) {
    float _flux = 0.0f, _weightSum = 0.0f;
    for (int _i = 0; _i < 32; _i++) {
      float _diff = _audioSpectrum[_i] - n_p4_beat_detector_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;
      float _weight = _i < 6 ? 2.0f : (_i < 12 ? 1.35f : (_i < 20 ? 0.85f : 0.45f)); _flux += _diff * _weight; _weightSum += _weight;
    }
    _flux = _weightSum > 0.0f ? _flux / _weightSum : 0.0f;
    n_p4_beat_detector_fast += (_flux - n_p4_beat_detector_fast) * 0.4724f;
    n_p4_beat_detector_slow += (_flux - n_p4_beat_detector_slow) * 0.1276f;
    float _onset = n_p4_beat_detector_fast - n_p4_beat_detector_slow, _baseline = n_p4_beat_detector_slow > 0.02f ? n_p4_beat_detector_slow : 0.02f;
    float _gap = constrain(60000.0f / n_p4_beat_bpm * 0.42f, 150.0f, 600.0f); uint32_t _now = millis();
    bool _peak = _flux > n_p4_beat_detector_prevFlux && n_p4_beat_detector_prevFlux >= n_p4_beat_detector_prevPrevFlux;
    n_p4_beat_beat = _flux > 0.0550f && _peak && _onset > 0.0248f && _onset / _baseline > 1.1f && (n_p4_beat_detector_lastBeat == 0 || _now - n_p4_beat_detector_lastBeat >= (uint32_t)_gap);
    if (n_p4_beat_beat) { if (n_p4_beat_detector_lastBeat != 0) { float _interval = _now - n_p4_beat_detector_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) n_p4_beat_bpm = n_p4_beat_bpm * 0.65f + (60000.0f / _interval) * 0.35f; } n_p4_beat_detector_lastBeat = _now; }
    n_p4_beat_detector_prevPrevFlux = n_p4_beat_detector_prevFlux; n_p4_beat_detector_prevFlux = _flux;
  }
  for (int _i = 0; _i < 32; _i++) n_p4_beat_detector_prevSpectrum[_i] = _audioSpectrum[_i]; n_p4_beat_detector_ready = true;
  uint8_t n_p4_hue_hue = (uint8_t)(((n_p4_fft_bass)*0.5f+(n_p4_fft_mids)*0.3f+(n_p4_fft_treble)*0.2f)*255);
  CRGBPalette16 pal_p4_poline(CRGB(10,240,255), CRGB(0,95,194), CRGB(23,0,191), CRGB(133,0,247), CRGB(205,60,255), CRGB(234,118,255), CRGB(244,155,255), CRGB(247,168,255), CRGB(247,168,255), CRGB(248,153,255), CRGB(255,109,254), CRGB(255,45,218), CRGB(238,0,112), CRGB(229,23,0), CRGB(255,171,49), CRGB(255,244,176));
  { /* FieldFormula: sin8(r*220 + angle*40 + t*(40 + a*120))/255 */
    float a=n_p4_fft_bass, b=0; (void)a;(void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=_x, y=_y; (void)x;(void)y;
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float fieldIn=0.0f; (void)fieldIn;
      float _v=_fsin8(r*220 + angle*40 + t*(40 + a*120))/255;
      p35_field_p4_src[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}
  { /* FieldFormula: sin8(y*18 + t*(24 + a*90))/255 */
    float a=n_p4_fft_mids, b=0; (void)a;(void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=_x, y=_y; (void)x;(void)y;
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float fieldIn=0.0f; (void)fieldIn;
      float _v=_fsin8(y*18 + t*(24 + a*90))/255;
      p35_field_p4_dx[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}
  { /* FieldFormula: cos8(x*18 - t*(24 + a*110))/255 */
    float a=n_p4_fft_treble, b=0; (void)a;(void)b;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float x=_x, y=_y; (void)x;(void)y;
      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);
      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;
      float fieldIn=0.0f; (void)fieldIn;
      float _v=_fcos8(x*18 - t*(24 + a*110))/255;
      p35_field_p4_dy[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}
  { /* FieldWarp */ float _st=1.35;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _ox=(2.0f*p35_field_p4_dx[_y*WIDTH+_x]-1.0f)*_st,_oy=(2.0f*p35_field_p4_dy[_y*WIDTH+_x]-1.0f)*_st;
      int _sx=(int)roundf(_x+_ox); if(_sx<0)_sx=0; if(_sx>WIDTH-1)_sx=WIDTH-1;
      int _sy=(int)roundf(_y+_oy); if(_sy<0)_sy=0; if(_sy>HEIGHT-1)_sy=HEIGHT-1;
      p35_field_p4_warp[_y*WIDTH+_x]=p35_field_p4_src[_sy*WIDTH+_sx];}}
  { /* FieldRotate */ float _ang=((n_p4_hue_hue)+t*0)*0.01745329f;
    float _ca=cosf(-_ang),_sa=sinf(-_ang),_cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _dx=_x-_cx,_dy=_y-_cy;
      int _sx=(((int)roundf(_dx*_ca-_dy*_sa+_cx))%WIDTH+WIDTH)%WIDTH;
      int _sy=(((int)roundf(_dx*_sa+_dy*_ca+_cy))%HEIGHT+HEIGHT)%HEIGHT;
      p35_field_p4_rotate[_y*WIDTH+_x]=p35_field_p4_warp[_sy*WIDTH+_sx];}}
  { float _br=constrain(1,0.0f,1.0f);
    for(int _i=0;_i<NUM_LEDS;_i++)
      p35_buf_p4_toFrame[_i]=ColorFromPalette(pal_p4_poline,(uint8_t)(p35_field_p4_rotate[_i]*255),(uint8_t)(_br*255)); }
  {
    ::memmove(p35_buf_p4_flash, p35_buf_p4_toFrame, sizeof(CRGB) * NUM_LEDS);
    static float _flash_p4_flash = 0;
    if (n_p4_beat_beat) _flash_p4_flash = 1.0f; else _flash_p4_flash *= 0.68;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p35_buf_p4_flash[_i].r = qadd8(p35_buf_p4_flash[_i].r, (uint8_t)((255 - p35_buf_p4_flash[_i].r) * _flash_p4_flash));
      p35_buf_p4_flash[_i].g = qadd8(p35_buf_p4_flash[_i].g, (uint8_t)((255 - p35_buf_p4_flash[_i].g) * _flash_p4_flash));
      p35_buf_p4_flash[_i].b = qadd8(p35_buf_p4_flash[_i].b, (uint8_t)((255 - p35_buf_p4_flash[_i].b) * _flash_p4_flash));
    }
  }
  { ::memmove(p35_buf_p4_gamma, p35_buf_p4_flash, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p35_buf_p4_gamma, NUM_LEDS, 2.300f); }
  ::memmove(leds, p35_buf_p4_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p36(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p3_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_p3_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_p3_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_p3_fft_bass_smooth = -1, n_p3_fft_mids_smooth = -1, n_p3_fft_treble_smooth = -1;
  n_p3_fft_bass_smooth = n_p3_fft_bass_smooth < 0 ? n_p3_fft_bass_target : n_p3_fft_bass_smooth * 0.720f + n_p3_fft_bass_target * 0.280f;
  n_p3_fft_mids_smooth = n_p3_fft_mids_smooth < 0 ? n_p3_fft_mids_target : n_p3_fft_mids_smooth * 0.720f + n_p3_fft_mids_target * 0.280f;
  n_p3_fft_treble_smooth = n_p3_fft_treble_smooth < 0 ? n_p3_fft_treble_target : n_p3_fft_treble_smooth * 0.720f + n_p3_fft_treble_target * 0.280f;
  float n_p3_fft_bass = n_p3_fft_bass_smooth, n_p3_fft_mids = n_p3_fft_mids_smooth, n_p3_fft_treble = n_p3_fft_treble_smooth;
  uint8_t n_p3_hue_hue = (uint8_t)(((n_p3_fft_bass)*0.5f+(n_p3_fft_mids)*0.3f+(n_p3_fft_treble)*0.2f)*255);
  // PaletteSelector — drives OceanColors_p in connected palette-consuming nodes
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_p3_palMix;
  { uint8_t _amt = (uint8_t)((n_p3_fft_mids) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_p3_palMix[_i] = blend(ColorFromPalette(OceanColors_p, _p), ColorFromPalette(PartyColors_p, _p), _amt); } }
  float n_p3_flowSpeed_result = mapFloat(n_p3_fft_bass, 0, 1, 0.2, 1);
  float n_p3_gaborFreq_result = mapFloat(n_p3_fft_treble, 0, 1, 0.5, 2.5);
  { // Flow field
    static float _fpx_p3_flow[96], _fpy_p3_flow[96], _ftr_p3_flow[NUM_LEDS]; static bool _fi_p3_flow=false;
    if(!_fi_p3_flow){ for(int _i=0;_i<96;_i++){ _fpx_p3_flow[_i]=(random8()/255.0f)*WIDTH; _fpy_p3_flow[_i]=(random8()/255.0f)*HEIGHT; } for(int _i=0;_i<NUM_LEDS;_i++)_ftr_p3_flow[_i]=0; _fi_p3_flow=true; }
    float _spd=(constrain((n_p3_flowSpeed_result), 0.0f, 1.0f) * 1.500f),_sc=(constrain((n_p3_fft_treble), 0.0f, 1.0f) * 1.000f); uint16_t _z=(uint16_t)(t*100);
    for(int _i=0;_i<NUM_LEDS;_i++) _ftr_p3_flow[_i]*=0.9f;
    for(int _i=0;_i<96;_i++){
      float _a=(inoise8((uint16_t)(_fpx_p3_flow[_i]*_sc*256),(uint16_t)(_fpy_p3_flow[_i]*_sc*256),_z)/255.0f)*6.2831f*2;
      _fpx_p3_flow[_i]=fmodf(_fpx_p3_flow[_i]+cos(_a)*_spd*0.6f+WIDTH,WIDTH); _fpy_p3_flow[_i]=fmodf(_fpy_p3_flow[_i]+sin(_a)*_spd*0.6f+HEIGHT,HEIGHT);
      int _xi=(int)_fpx_p3_flow[_i],_yi=(int)_fpy_p3_flow[_i]; if(_xi>=0&&_xi<WIDTH&&_yi>=0&&_yi<HEIGHT){ int _id=_yi*WIDTH+_xi; _ftr_p3_flow[_id]=min(1.0f,_ftr_p3_flow[_id]+0.5f); } }
    for(int _i=0;_i<NUM_LEDS;_i++) p36_buf_p3_flow[_i]=ColorFromPalette(pal_p3_palMix,(uint8_t)(_ftr_p3_flow[_i]*255)); }
  { // Gabor noise
    float _spd=(constrain((n_p3_fft_mids), 0.0f, 1.0f) * 1.500f),_sc=(constrain((0.68), 0.0f, 1.0f) * 0.500f),_fr=n_p3_gaborFreq_result,_om=25*0.01745329f,_co=cos(_om),_si=sin(_om);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _v=0;
      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){
        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy),_h2=_worleyHash(_cx+31,_cy-17);
        float _fx=_cx+0.5f+(_h-0.5f),_fy=_cy+0.5f+(_h2-0.5f);
        float _dx=_px-_fx,_dy=_py-_fy,_g=expf(-2.5f*(_dx*_dx+_dy*_dy));
        float _proj=_dx*_co+_dy*_si,_w=_h2<0.5f?1.0f:-1.0f;
        _v+=_w*_g*cosf(6.2831853f*_fr*_proj+t*_spd+_h*6.2831853f); }
      p36_buf_p3_gabor[_y*WIDTH+_x]=ColorFromPalette(pal_p3_palMix,(uint8_t)((_v*0.5f+0.5f)*255));}}
  { ::memmove(p36_buf_p3_blend, p36_buf_p3_flow, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.45); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p36_buf_p3_blend[_i], _b=p36_buf_p3_gabor[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p36_buf_p3_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { ::memmove(p36_buf_p3_hueshift, p36_buf_p3_blend, sizeof(CRGB) * NUM_LEDS); uint8_t _sh = (uint8_t)((n_p3_hue_hue) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) p36_buf_p3_hueshift[_i] = CHSV(rgb2hsv_approximate(p36_buf_p3_hueshift[_i]).hue + _sh, rgb2hsv_approximate(p36_buf_p3_hueshift[_i]).sat, rgb2hsv_approximate(p36_buf_p3_hueshift[_i]).val); }
  { ::memmove(p36_buf_p3_gamma, p36_buf_p3_hueshift, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p36_buf_p3_gamma, NUM_LEDS, 2.250f); }
  ::memmove(leds, p36_buf_p3_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p37(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p2_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_p2_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_p2_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_p2_fft_bass_smooth = -1, n_p2_fft_mids_smooth = -1, n_p2_fft_treble_smooth = -1;
  n_p2_fft_bass_smooth = n_p2_fft_bass_smooth < 0 ? n_p2_fft_bass_target : n_p2_fft_bass_smooth * 0.720f + n_p2_fft_bass_target * 0.280f;
  n_p2_fft_mids_smooth = n_p2_fft_mids_smooth < 0 ? n_p2_fft_mids_target : n_p2_fft_mids_smooth * 0.720f + n_p2_fft_mids_target * 0.280f;
  n_p2_fft_treble_smooth = n_p2_fft_treble_smooth < 0 ? n_p2_fft_treble_target : n_p2_fft_treble_smooth * 0.720f + n_p2_fft_treble_target * 0.280f;
  float n_p2_fft_bass = n_p2_fft_bass_smooth, n_p2_fft_mids = n_p2_fft_mids_smooth, n_p2_fft_treble = n_p2_fft_treble_smooth;
  uint8_t n_p2_hue_hue = (uint8_t)(((n_p2_fft_bass)*0.5f+(n_p2_fft_mids)*0.3f+(n_p2_fft_treble)*0.2f)*255);
  CRGB n_p2_hsv_color = CHSV((uint8_t)((n_p2_hue_hue) / 360.0f * 255), (uint8_t)((0.85) * 255), (uint8_t)((1) * 255));
  float n_p2_starSpeed_result = mapFloat(n_p2_fft_bass, 0, 1, 0.1, 1);
  float n_p2_burstSpeed_result = mapFloat(n_p2_fft_treble, 0, 1, 0.05, 1);
  float n_p2_scaleRate_result = mapFloat(n_p2_fft_mids, 0, 1, 10, 160);
  { // Starfield
    static float _sfx_p2_stars[88], _sfy_p2_stars[88], _sfz_p2_stars[88]; static bool _sfi_p2_stars=false;
    if(!_sfi_p2_stars){ for(int _i=0;_i<88;_i++){ _sfx_p2_stars[_i]=random8()/127.5f-1; _sfy_p2_stars[_i]=random8()/127.5f-1; _sfz_p2_stars[_i]=random8()/255.0f*0.9f+0.1f; } _sfi_p2_stars=true; }
    float _spd=(constrain((n_p2_starSpeed_result), 0.0f, 1.0f) * 3.000f); fill_solid(p37_buf_p2_stars, NUM_LEDS, CRGB::Black);
    for(int _i=0;_i<88;_i++){ _sfz_p2_stars[_i]-=_spd*0.015f;
      if(_sfz_p2_stars[_i]<=0.02f){ _sfx_p2_stars[_i]=random8()/127.5f-1; _sfy_p2_stars[_i]=random8()/127.5f-1; _sfz_p2_stars[_i]=1; }
      int _px=(int)(WIDTH/2.0f+(_sfx_p2_stars[_i]/_sfz_p2_stars[_i])*WIDTH*0.35f), _py=(int)(HEIGHT/2.0f+(_sfy_p2_stars[_i]/_sfz_p2_stars[_i])*HEIGHT*0.35f);
      if(_px>=0&&_px<WIDTH&&_py>=0&&_py<HEIGHT){ p37_buf_p2_stars[_py*WIDTH+_px]=n_p2_hsv_color; p37_buf_p2_stars[_py*WIDTH+_px].nscale8((uint8_t)(min(1.0f,1-_sfz_p2_stars[_i])*255)); } } }
  { float _spd=(constrain((n_p2_burstSpeed_result), 0.0f, 1.0f) * 2.000f); for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
    float _d=sqrt((_x-WIDTH/2.0f)*(_x-WIDTH/2.0f)+(_y-HEIGHT/2.0f)*(_y-HEIGHT/2.0f))/sqrt(WIDTH*WIDTH/4.0f+HEIGHT*HEIGHT/4.0f);
    float _w=(sin((_d*8-t*_spd*3)*3.14159f)+1)/2.0f;
    p37_buf_p2_burst[_y*WIDTH+_x]=CRGB((uint8_t)(0*_w),(uint8_t)(200*_w),(uint8_t)(255*_w));}}
  { ::memmove(p37_buf_p2_blend, p37_buf_p2_stars, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.62); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p37_buf_p2_blend[_i], _b=p37_buf_p2_burst[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=min(1.0f,_av+_bv);
        p37_buf_p2_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=n_p2_scaleRate_result;
    float _s=1.0f+(_rate/100.0f)*t; _s=constrain(_s,0.05f,20.0f);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      int _sx=(int)floorf(_cx+(_x-_cx)/_s+0.5f), _sy=(int)floorf(_cy+(_y-_cy)/_s+0.5f);
      p37_buf_p2_transform[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?p37_buf_p2_blend[_sy*WIDTH+_sx]:CRGB::Black;}}
  ::memmove(p37_buf_p2_blur, p37_buf_p2_transform, sizeof(CRGB) * NUM_LEDS); blur2d(p37_buf_p2_blur, WIDTH, HEIGHT, 20, _xyMap);
  { ::memmove(p37_buf_p2_gamma, p37_buf_p2_blur, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p37_buf_p2_gamma, NUM_LEDS, 2.200f); }
  ::memmove(leds, p37_buf_p2_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p38(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_p1_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_p1_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_p1_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_p1_fft_bass_smooth = -1, n_p1_fft_mids_smooth = -1, n_p1_fft_treble_smooth = -1;
  n_p1_fft_bass_smooth = n_p1_fft_bass_smooth < 0 ? n_p1_fft_bass_target : n_p1_fft_bass_smooth * 0.720f + n_p1_fft_bass_target * 0.280f;
  n_p1_fft_mids_smooth = n_p1_fft_mids_smooth < 0 ? n_p1_fft_mids_target : n_p1_fft_mids_smooth * 0.720f + n_p1_fft_mids_target * 0.280f;
  n_p1_fft_treble_smooth = n_p1_fft_treble_smooth < 0 ? n_p1_fft_treble_target : n_p1_fft_treble_smooth * 0.720f + n_p1_fft_treble_target * 0.280f;
  float n_p1_fft_bass = n_p1_fft_bass_smooth, n_p1_fft_mids = n_p1_fft_mids_smooth, n_p1_fft_treble = n_p1_fft_treble_smooth;
  bool n_p1_beat_beat = false;
  static float n_p1_beat_bpm = 120.0f, n_p1_beat_detector_fast = 0.0f, n_p1_beat_detector_slow = 0.0f, n_p1_beat_detector_prevFlux = 0.0f, n_p1_beat_detector_prevPrevFlux = 0.0f;
  static float n_p1_beat_detector_prevSpectrum[32]; static bool n_p1_beat_detector_ready = false; static uint32_t n_p1_beat_detector_lastBeat = 0;
  if (n_p1_beat_detector_ready) {
    float _flux = 0.0f, _weightSum = 0.0f;
    for (int _i = 0; _i < 32; _i++) {
      float _diff = _audioSpectrum[_i] - n_p1_beat_detector_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;
      float _weight = _i < 6 ? 2.0f : (_i < 12 ? 1.35f : (_i < 20 ? 0.85f : 0.45f)); _flux += _diff * _weight; _weightSum += _weight;
    }
    _flux = _weightSum > 0.0f ? _flux / _weightSum : 0.0f;
    n_p1_beat_detector_fast += (_flux - n_p1_beat_detector_fast) * 0.4724f;
    n_p1_beat_detector_slow += (_flux - n_p1_beat_detector_slow) * 0.1276f;
    float _onset = n_p1_beat_detector_fast - n_p1_beat_detector_slow, _baseline = n_p1_beat_detector_slow > 0.02f ? n_p1_beat_detector_slow : 0.02f;
    float _gap = constrain(60000.0f / n_p1_beat_bpm * 0.42f, 150.0f, 600.0f); uint32_t _now = millis();
    bool _peak = _flux > n_p1_beat_detector_prevFlux && n_p1_beat_detector_prevFlux >= n_p1_beat_detector_prevPrevFlux;
    n_p1_beat_beat = _flux > 0.0550f && _peak && _onset > 0.0248f && _onset / _baseline > 1.1f && (n_p1_beat_detector_lastBeat == 0 || _now - n_p1_beat_detector_lastBeat >= (uint32_t)_gap);
    if (n_p1_beat_beat) { if (n_p1_beat_detector_lastBeat != 0) { float _interval = _now - n_p1_beat_detector_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) n_p1_beat_bpm = n_p1_beat_bpm * 0.65f + (60000.0f / _interval) * 0.35f; } n_p1_beat_detector_lastBeat = _now; }
    n_p1_beat_detector_prevPrevFlux = n_p1_beat_detector_prevFlux; n_p1_beat_detector_prevFlux = _flux;
  }
  for (int _i = 0; _i < 32; _i++) n_p1_beat_detector_prevSpectrum[_i] = _audioSpectrum[_i]; n_p1_beat_detector_ready = true;
  // PaletteSelector — drives LavaColors_p in connected palette-consuming nodes
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  CRGBPalette16 pal_p1_palMix;
  { uint8_t _amt = (uint8_t)((n_p1_fft_treble) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_p1_palMix[_i] = blend(ColorFromPalette(LavaColors_p, _p), ColorFromPalette(PartyColors_p, _p), _amt); } }
  float n_p1_feed_result = mapFloat(n_p1_fft_bass, 0, 1, 0.032, 0.072);
  float n_p1_kill_result = mapFloat(n_p1_fft_mids, 0, 1, 0.05, 0.07);
  float n_p1_freq_result = mapFloat(n_p1_fft_treble, 0, 1, 0.6, 2.2);
  { // ReactionDiffusion (Gray-Scott)
    static float _u_p1_rd[NUM_LEDS], _v_p1_rd[NUM_LEDS], _un_p1_rd[NUM_LEDS], _vn_p1_rd[NUM_LEDS]; static bool _rd_p1_rd = false;
    if (!_rd_p1_rd) { for (int _i = 0; _i < NUM_LEDS; _i++) { _u_p1_rd[_i] = 1; _v_p1_rd[_i] = 0; }
      for (int _y = HEIGHT/2-2; _y <= HEIGHT/2+1; _y++) for (int _x = WIDTH/2-2; _x <= WIDTH/2+1; _x++)
        if (_x>=0&&_x<WIDTH&&_y>=0&&_y<HEIGHT) { _u_p1_rd[_y*WIDTH+_x]=0.5f; _v_p1_rd[_y*WIDTH+_x]=0.5f; } _rd_p1_rd=true; }
    float _f=n_p1_feed_result, _k=n_p1_kill_result;
    for (int _it=0; _it<10; _it++) {
      for (int _y=0; _y<HEIGHT; _y++) { int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;
        for (int _x=0; _x<WIDTH; _x++) { int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;
          float _lu=(_u_p1_rd[_ym+_x]+_u_p1_rd[_yp+_x]+_u_p1_rd[_yr+_xm]+_u_p1_rd[_yr+_xp])*0.2f+(_u_p1_rd[_ym+_xm]+_u_p1_rd[_ym+_xp]+_u_p1_rd[_yp+_xm]+_u_p1_rd[_yp+_xp])*0.05f-_u_p1_rd[_i];
          float _lv=(_v_p1_rd[_ym+_x]+_v_p1_rd[_yp+_x]+_v_p1_rd[_yr+_xm]+_v_p1_rd[_yr+_xp])*0.2f+(_v_p1_rd[_ym+_xm]+_v_p1_rd[_ym+_xp]+_v_p1_rd[_yp+_xm]+_v_p1_rd[_yp+_xp])*0.05f-_v_p1_rd[_i];
          float _uvv=_u_p1_rd[_i]*_v_p1_rd[_i]*_v_p1_rd[_i];
          _un_p1_rd[_i]=constrain(_u_p1_rd[_i]+0.16f*_lu-_uvv+_f*(1-_u_p1_rd[_i]),0.0f,1.0f);
          _vn_p1_rd[_i]=constrain(_v_p1_rd[_i]+0.08f*_lv+_uvv-(_k+_f)*_v_p1_rd[_i],0.0f,1.0f); } }
      ::memcpy(_u_p1_rd,_un_p1_rd,sizeof(_u_p1_rd)); ::memcpy(_v_p1_rd,_vn_p1_rd,sizeof(_v_p1_rd)); }
    for (int _i=0; _i<NUM_LEDS; _i++) p38_buf_p1_rd[_i]=ColorFromPalette(pal_p1_palMix,(uint8_t)(_v_p1_rd[_i]*255)); }
  { // Gabor noise
    float _spd=(constrain((0.18), 0.0f, 1.0f) * 1.500f),_sc=(constrain((0.62), 0.0f, 1.0f) * 0.500f),_fr=n_p1_freq_result,_om=65*0.01745329f,_co=cos(_om),_si=sin(_om);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _v=0;
      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){
        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy),_h2=_worleyHash(_cx+31,_cy-17);
        float _fx=_cx+0.5f+(_h-0.5f),_fy=_cy+0.5f+(_h2-0.5f);
        float _dx=_px-_fx,_dy=_py-_fy,_g=expf(-2.5f*(_dx*_dx+_dy*_dy));
        float _proj=_dx*_co+_dy*_si,_w=_h2<0.5f?1.0f:-1.0f;
        _v+=_w*_g*cosf(6.2831853f*_fr*_proj+t*_spd+_h*6.2831853f); }
      p38_buf_p1_gabor[_y*WIDTH+_x]=ColorFromPalette(pal_p1_palMix,(uint8_t)((_v*0.5f+0.5f)*255));}}
  { ::memmove(p38_buf_p1_blend, p38_buf_p1_rd, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.36); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p38_buf_p1_blend[_i], _b=p38_buf_p1_gabor[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p38_buf_p1_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  {
    ::memmove(p38_buf_p1_flash, p38_buf_p1_blend, sizeof(CRGB) * NUM_LEDS);
    static float _flash_p1_flash = 0;
    if (n_p1_beat_beat) _flash_p1_flash = 1.0f; else _flash_p1_flash *= 0.72;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p38_buf_p1_flash[_i].r = qadd8(p38_buf_p1_flash[_i].r, (uint8_t)((255 - p38_buf_p1_flash[_i].r) * _flash_p1_flash));
      p38_buf_p1_flash[_i].g = qadd8(p38_buf_p1_flash[_i].g, (uint8_t)((255 - p38_buf_p1_flash[_i].g) * _flash_p1_flash));
      p38_buf_p1_flash[_i].b = qadd8(p38_buf_p1_flash[_i].b, (uint8_t)((255 - p38_buf_p1_flash[_i].b) * _flash_p1_flash));
    }
  }
  { ::memmove(p38_buf_p1_gamma, p38_buf_p1_flash, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p38_buf_p1_gamma, NUM_LEDS, 2.350f); }
  ::memmove(leds, p38_buf_p1_gamma, sizeof(CRGB) * NUM_LEDS);
}

void render_p39(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_groupmul_group_1783293400000_speed_0_result = (0.55) * (1);
  float n_groupin_group_1783293400000_energy_out = ((_audioBass + _audioMids + _audioTreble) / 3.0f);
  float n_groupmul_group_1783293400000_energy_0_result = (0.85) * (n_groupin_group_1783293400000_energy_out);
  float n_FFTAnalyzer_1_bass_target = constrain(_audioBass * 1.300f, 0.0f, 1.0f), n_FFTAnalyzer_1_mids_target = constrain(_audioMids * 1.300f, 0.0f, 1.0f), n_FFTAnalyzer_1_treble_target = constrain(_audioTreble * 1.300f, 0.0f, 1.0f);
  static float n_FFTAnalyzer_1_bass_smooth = -1, n_FFTAnalyzer_1_mids_smooth = -1, n_FFTAnalyzer_1_treble_smooth = -1;
  n_FFTAnalyzer_1_bass_smooth = n_FFTAnalyzer_1_bass_smooth < 0 ? n_FFTAnalyzer_1_bass_target : n_FFTAnalyzer_1_bass_smooth * 0.700f + n_FFTAnalyzer_1_bass_target * 0.300f;
  n_FFTAnalyzer_1_mids_smooth = n_FFTAnalyzer_1_mids_smooth < 0 ? n_FFTAnalyzer_1_mids_target : n_FFTAnalyzer_1_mids_smooth * 0.700f + n_FFTAnalyzer_1_mids_target * 0.300f;
  n_FFTAnalyzer_1_treble_smooth = n_FFTAnalyzer_1_treble_smooth < 0 ? n_FFTAnalyzer_1_treble_target : n_FFTAnalyzer_1_treble_smooth * 0.700f + n_FFTAnalyzer_1_treble_target * 0.300f;
  float n_FFTAnalyzer_1_bass = n_FFTAnalyzer_1_bass_smooth, n_FFTAnalyzer_1_mids = n_FFTAnalyzer_1_mids_smooth, n_FFTAnalyzer_1_treble = n_FFTAnalyzer_1_treble_smooth;
  bool n_BeatDetect_1_beat = false;
  static float n_BeatDetect_1_bpm = 120.0f, n_BeatDetect_1_detector_fast = 0.0f, n_BeatDetect_1_detector_slow = 0.0f, n_BeatDetect_1_detector_prevFlux = 0.0f, n_BeatDetect_1_detector_prevPrevFlux = 0.0f;
  static float n_BeatDetect_1_detector_prevSpectrum[32]; static bool n_BeatDetect_1_detector_ready = false; static uint32_t n_BeatDetect_1_detector_lastBeat = 0;
  if (n_BeatDetect_1_detector_ready) {
    float _flux = 0.0f, _weightSum = 0.0f;
    for (int _i = 0; _i < 32; _i++) {
      float _diff = _audioSpectrum[_i] - n_BeatDetect_1_detector_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;
      float _weight = _i < 6 ? 2.0f : (_i < 12 ? 1.35f : (_i < 20 ? 0.85f : 0.45f)); _flux += _diff * _weight; _weightSum += _weight;
    }
    _flux = _weightSum > 0.0f ? _flux / _weightSum : 0.0f;
    n_BeatDetect_1_detector_fast += (_flux - n_BeatDetect_1_detector_fast) * 0.4490f;
    n_BeatDetect_1_detector_slow += (_flux - n_BeatDetect_1_detector_slow) * 0.1325f;
    float _onset = n_BeatDetect_1_detector_fast - n_BeatDetect_1_detector_slow, _baseline = n_BeatDetect_1_detector_slow > 0.02f ? n_BeatDetect_1_detector_slow : 0.02f;
    float _gap = constrain(60000.0f / n_BeatDetect_1_bpm * 0.42f, 150.0f, 600.0f); uint32_t _now = millis();
    bool _peak = _flux > n_BeatDetect_1_detector_prevFlux && n_BeatDetect_1_detector_prevFlux >= n_BeatDetect_1_detector_prevPrevFlux;
    n_BeatDetect_1_beat = _flux > 0.0500f && _peak && _onset > 0.0225f && _onset / _baseline > 1.1f && (n_BeatDetect_1_detector_lastBeat == 0 || _now - n_BeatDetect_1_detector_lastBeat >= (uint32_t)_gap);
    if (n_BeatDetect_1_beat) { if (n_BeatDetect_1_detector_lastBeat != 0) { float _interval = _now - n_BeatDetect_1_detector_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) n_BeatDetect_1_bpm = n_BeatDetect_1_bpm * 0.65f + (60000.0f / _interval) * 0.35f; } n_BeatDetect_1_detector_lastBeat = _now; }
    n_BeatDetect_1_detector_prevPrevFlux = n_BeatDetect_1_detector_prevFlux; n_BeatDetect_1_detector_prevFlux = _flux;
  }
  for (int _i = 0; _i < 32; _i++) n_BeatDetect_1_detector_prevSpectrum[_i] = _audioSpectrum[_i]; n_BeatDetect_1_detector_ready = true;
  CRGBPalette16 pal_Poline_1(CRGB(18,10,143), CRGB(81,8,152), CRGB(157,6,187), CRGB(157,6,187), CRGB(229,4,224), CRGB(253,17,222), CRGB(255,39,215), CRGB(255,47,214), CRGB(255,47,214), CRGB(255,30,215), CRGB(236,0,209), CRGB(149,0,162), CRGB(23,0,94), CRGB(23,0,94), CRGB(0,112,137), CRGB(0,255,213));
  { float _b=n_FFTAnalyzer_1_bass,_m=n_FFTAnalyzer_1_mids,_tr=n_FFTAnalyzer_1_treble,_spd=(0.000f + constrain((n_groupmul_group_1783293400000_speed_0_result), 0.0f, 1.0f) * 0.200f),_sc=(0.000f + constrain((0.5), 0.0f, 1.0f) * 0.200f);
    float _flow=t*_spd*(0.2f+_m*1.5f); uint8_t _bright=(uint8_t)(min(1.0f,0.3f+_b)*255);
    float _vamp=0.2f+_tr*0.7f+_b*0.3f;
    float _vflow=((float)inoise8((uint16_t)((t*_spd*4.0f+50)*256),4429)/128.0f-1.0f)*_vamp;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      uint8_t _v=inoise8((uint16_t)((_x*_sc+_flow)*256),(uint16_t)((_y*_sc*0.6f+_vflow+8.0f)*256));
      p39_buf_AudioFlow_1[_y*WIDTH+_x]=ColorFromPalette(pal_Poline_1,(uint8_t)(_v+_tr*80)); p39_buf_AudioFlow_1[_y*WIDTH+_x].nscale8(_bright);}}
  uint8_t n_AudioHue_1_hue = (uint8_t)(((n_FFTAnalyzer_1_bass)*0.5f+(n_FFTAnalyzer_1_mids)*0.3f+(n_FFTAnalyzer_1_treble)*0.2f)*255);
  CRGB n_HSVToRGB_1_color = CHSV((uint8_t)((n_AudioHue_1_hue) / 360.0f * 255), (uint8_t)((1) * 255), (uint8_t)((1) * 255));
  {
    float _b = min(1.0f, max(0.0f, n_FFTAnalyzer_1_bass));
    float _strength = min(1.0f, max(0.0f, n_groupmul_group_1783293400000_energy_0_result));
    float _spd = min(1.0f, max(0.0f, 1));
    float _cx = WIDTH * 0.5f, _cy = HEIGHT * 0.5f, _maxD = sqrtf(_cx * _cx + _cy * _cy);
    float _motion = _spd * (0.75f + _b * 1.75f * _strength);
    float _phase = t * (1.2f + _motion * 4.8f);
    float _rings = 4.0f + _b * 8.0f * _strength;
    float _floor = 0.04f + _b * 0.1f * _strength;
    float _gain = 0.16f + _b * 0.84f * _strength;
    CRGB _base = n_HSVToRGB_1_color;
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _dx = _x - _cx, _dy = _y - _cy;
      float _dist = sqrtf(_dx * _dx + _dy * _dy) / max(0.0001f, _maxD);
      float _wave = sinf(_dist * _rings * 6.2831853f - _phase);
      float _crisp = powf(max(0.0f, _wave * 0.5f + 0.5f), 2.4f);
      float _v = min(1.0f, _floor + _crisp * _gain);
      int _i = _y * WIDTH + _x;
      p39_buf_BassRings_1[_i] = _base;
      p39_buf_BassRings_1[_i].nscale8((uint8_t)(_v * 255));
    }
  }
  {
    float _t = n_FFTAnalyzer_1_treble, _d = 0.65;
    fadeToBlackBy(p39_buf_TrebleSparks_1, NUM_LEDS, (uint8_t)(110 + (1.0f - constrain(_t, 0.0f, 1.0f)) * 40));
    int _spawns = (int)(NUM_LEDS * constrain(_d, 0.0f, 1.0f) * (0.03f + constrain(_t, 0.0f, 1.0f) * 0.12f));
    if (_spawns < 1 && _d * _t > 0.05f) _spawns = 1;
    uint8_t _spawnChance = (uint8_t)(51 + constrain(_t, 0.0f, 1.0f) * 204);
    for (int _s = 0; _s < _spawns; _s++) if (random8() <= _spawnChance) {
      int _x = random16(WIDTH), _y = random16(HEIGHT), _i = _y * WIDTH + _x;
      CRGB _spark = blend(CRGB(200, 235, 255), CRGB::White, (uint8_t)(89 + constrain(_t, 0.0f, 1.0f) * 89));
      _spark.nscale8((uint8_t)(min(255.0f, (0.7f + constrain(_t, 0.0f, 1.0f) * 0.6f) * (140 + random8(116)))));
      p39_buf_TrebleSparks_1[_i] += _spark;
      CRGB _edge = _spark; _edge.nscale8((uint8_t)(107));
      if (_x > 0) p39_buf_TrebleSparks_1[_i - 1] += _edge; if (_x + 1 < WIDTH) p39_buf_TrebleSparks_1[_i + 1] += _edge;
      if (_y > 0) p39_buf_TrebleSparks_1[_i - WIDTH] += _edge; if (_y + 1 < HEIGHT) p39_buf_TrebleSparks_1[_i + WIDTH] += _edge;
      CRGB _corner = _spark; _corner.nscale8((uint8_t)(41));
      if (_x > 0 && _y > 0) p39_buf_TrebleSparks_1[_i - WIDTH - 1] += _corner;
      if (_x + 1 < WIDTH && _y > 0) p39_buf_TrebleSparks_1[_i - WIDTH + 1] += _corner;
      if (_x > 0 && _y + 1 < HEIGHT) p39_buf_TrebleSparks_1[_i + WIDTH - 1] += _corner;
      if (_x + 1 < WIDTH && _y + 1 < HEIGHT) p39_buf_TrebleSparks_1[_i + WIDTH + 1] += _corner;
    }
  }
  { ::memmove(p39_buf_Blend_1, p39_buf_AudioFlow_1, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.8); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p39_buf_Blend_1[_i], _b=p39_buf_BassRings_1[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p39_buf_Blend_1[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  { ::memmove(p39_buf_Blend_2, p39_buf_Blend_1, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.65); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p39_buf_Blend_2[_i], _b=p39_buf_TrebleSparks_1[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=min(1.0f,_av+_bv);
        p39_buf_Blend_2[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  float n_MapRange_1_result = mapFloat(n_FFTAnalyzer_1_mids, 0, 1, 25, 170);
  ::memmove(p39_buf_Kaleidoscope_1, p39_buf_Blend_2, sizeof(CRGB) * NUM_LEDS);  // Kaleidoscope: mirror logic to apply on p39_buf_Kaleidoscope_1
  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=n_MapRange_1_result;
    float _a=_rate*t*0.01745329f,_co=cos(_a),_si=sin(_a);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _rx=_x-_cx,_ry=_y-_cy; int _sx=(int)floorf(_cx+_rx*_co+_ry*_si+0.5f), _sy=(int)floorf(_cy-_rx*_si+_ry*_co+0.5f);
      p39_buf_Transform_1[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?p39_buf_Kaleidoscope_1[_sy*WIDTH+_sx]:CRGB::Black;}}
  {
    ::memmove(p39_buf_BeatFlash_1, p39_buf_Transform_1, sizeof(CRGB) * NUM_LEDS);
    static float _flash_BeatFlash_1 = 0;
    if (n_BeatDetect_1_beat) _flash_BeatFlash_1 = 1.0f; else _flash_BeatFlash_1 *= 0.8;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p39_buf_BeatFlash_1[_i].r = qadd8(p39_buf_BeatFlash_1[_i].r, (uint8_t)((255 - p39_buf_BeatFlash_1[_i].r) * _flash_BeatFlash_1));
      p39_buf_BeatFlash_1[_i].g = qadd8(p39_buf_BeatFlash_1[_i].g, (uint8_t)((255 - p39_buf_BeatFlash_1[_i].g) * _flash_BeatFlash_1));
      p39_buf_BeatFlash_1[_i].b = qadd8(p39_buf_BeatFlash_1[_i].b, (uint8_t)((255 - p39_buf_BeatFlash_1[_i].b) * _flash_BeatFlash_1));
    }
  }
  ::memmove(p39_buf_Blur2D_1, p39_buf_BeatFlash_1, sizeof(CRGB) * NUM_LEDS); blur2d(p39_buf_Blur2D_1, WIDTH, HEIGHT, 31, _xyMap);
  { ::memmove(p39_buf_Gamma_1, p39_buf_Blur2D_1, sizeof(CRGB) * NUM_LEDS); napplyGamma_video(p39_buf_Gamma_1, NUM_LEDS, 2.200f); }
  ::memmove(leds, p39_buf_Gamma_1, sizeof(CRGB) * NUM_LEDS);
}

void render_p40(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_FFTAnalyzer_1_bass_target = constrain(_audioBass * 1.000f, 0.0f, 1.0f), n_FFTAnalyzer_1_mids_target = constrain(_audioMids * 1.000f, 0.0f, 1.0f), n_FFTAnalyzer_1_treble_target = constrain(_audioTreble * 1.000f, 0.0f, 1.0f);
  static float n_FFTAnalyzer_1_bass_smooth = -1, n_FFTAnalyzer_1_mids_smooth = -1, n_FFTAnalyzer_1_treble_smooth = -1;
  n_FFTAnalyzer_1_bass_smooth = n_FFTAnalyzer_1_bass_smooth < 0 ? n_FFTAnalyzer_1_bass_target : n_FFTAnalyzer_1_bass_smooth * 0.720f + n_FFTAnalyzer_1_bass_target * 0.280f;
  n_FFTAnalyzer_1_mids_smooth = n_FFTAnalyzer_1_mids_smooth < 0 ? n_FFTAnalyzer_1_mids_target : n_FFTAnalyzer_1_mids_smooth * 0.720f + n_FFTAnalyzer_1_mids_target * 0.280f;
  n_FFTAnalyzer_1_treble_smooth = n_FFTAnalyzer_1_treble_smooth < 0 ? n_FFTAnalyzer_1_treble_target : n_FFTAnalyzer_1_treble_smooth * 0.720f + n_FFTAnalyzer_1_treble_target * 0.280f;
  float n_FFTAnalyzer_1_bass = n_FFTAnalyzer_1_bass_smooth, n_FFTAnalyzer_1_mids = n_FFTAnalyzer_1_mids_smooth, n_FFTAnalyzer_1_treble = n_FFTAnalyzer_1_treble_smooth;
  float n_groupmul_group_1782947806235_speed_0_result = (1) * (1);
  float n_groupin_group_1782947806235_energy_out = ((_audioBass + _audioMids + _audioTreble) / 3.0f);
  float n_groupmul_group_1782947806235_energy_0_result = (0.9) * (n_groupin_group_1782947806235_energy_out);
  {
    float _b = min(1.0f, max(0.0f, n_FFTAnalyzer_1_bass)), _m = min(1.0f, max(0.0f, n_FFTAnalyzer_1_mids)), _t = min(1.0f, max(0.0f, n_FFTAnalyzer_1_treble));
    float _strength = min(1.0f, max(0.0f, n_groupmul_group_1782947806235_energy_0_result));
    float _spd = min(1.0f, max(0.0f, n_groupmul_group_1782947806235_speed_0_result));
    float _motion = _spd * (0.8f + (_b + _m + _t) * 1.4f * _strength);
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _nx = WIDTH > 1 ? (float)_x / (float)(WIDTH - 1) : 0.0f;
      float _ny = HEIGHT > 1 ? (float)_y / (float)(HEIGHT - 1) : 0.0f;
      float _ribbon = sinf((_nx * 7.0f + _ny * 2.5f) + t * _motion * (2.0f + _m * 3.0f * _strength));
      float _sweep = cosf((_ny * 9.0f - _nx * 3.0f) - t * _motion * (1.4f + _b * 2.2f * _strength));
      float _shimmer = powf(max(0.0f, sinf((_nx + _ny) * 18.0f + t * _motion * (4.0f + _t * 8.0f * _strength)) * 0.5f + 0.5f), 6.0f);
      float _body = max(0.0f, _ribbon * 0.55f + _sweep * 0.45f);
      float _v = min(1.0f, _body * (0.18f + _m * 0.52f * _strength) + _b * 0.24f * _strength + _shimmer * _t * 0.85f * _strength);
      float _pt = _nx * (0.2f + _b * 0.5f) + _ny * (0.35f + _m * 0.45f) + _shimmer * 0.15f + t * _motion * 0.03f;
      p40_buf_AudioCascade_1[_y * WIDTH + _x] = ColorFromPalette(RainbowColors_p, (uint8_t)(_pt * 255));
      p40_buf_AudioCascade_1[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));
    }
  }
  {
    float _t = n_FFTAnalyzer_1_treble, _d = 0.6;
    fadeToBlackBy(p40_buf_TrebleSparks_1, NUM_LEDS, (uint8_t)(110 + (1.0f - constrain(_t, 0.0f, 1.0f)) * 40));
    int _spawns = (int)(NUM_LEDS * constrain(_d, 0.0f, 1.0f) * (0.03f + constrain(_t, 0.0f, 1.0f) * 0.12f));
    if (_spawns < 1 && _d * _t > 0.05f) _spawns = 1;
    uint8_t _spawnChance = (uint8_t)(51 + constrain(_t, 0.0f, 1.0f) * 204);
    for (int _s = 0; _s < _spawns; _s++) if (random8() <= _spawnChance) {
      int _x = random16(WIDTH), _y = random16(HEIGHT), _i = _y * WIDTH + _x;
      CRGB _spark = blend(CRGB(180, 220, 255), CRGB::White, (uint8_t)(89 + constrain(_t, 0.0f, 1.0f) * 89));
      _spark.nscale8((uint8_t)(min(255.0f, (0.7f + constrain(_t, 0.0f, 1.0f) * 0.6f) * (140 + random8(116)))));
      p40_buf_TrebleSparks_1[_i] += _spark;
      CRGB _edge = _spark; _edge.nscale8((uint8_t)(107));
      if (_x > 0) p40_buf_TrebleSparks_1[_i - 1] += _edge; if (_x + 1 < WIDTH) p40_buf_TrebleSparks_1[_i + 1] += _edge;
      if (_y > 0) p40_buf_TrebleSparks_1[_i - WIDTH] += _edge; if (_y + 1 < HEIGHT) p40_buf_TrebleSparks_1[_i + WIDTH] += _edge;
      CRGB _corner = _spark; _corner.nscale8((uint8_t)(41));
      if (_x > 0 && _y > 0) p40_buf_TrebleSparks_1[_i - WIDTH - 1] += _corner;
      if (_x + 1 < WIDTH && _y > 0) p40_buf_TrebleSparks_1[_i - WIDTH + 1] += _corner;
      if (_x > 0 && _y + 1 < HEIGHT) p40_buf_TrebleSparks_1[_i + WIDTH - 1] += _corner;
      if (_x + 1 < WIDTH && _y + 1 < HEIGHT) p40_buf_TrebleSparks_1[_i + WIDTH + 1] += _corner;
    }
  }
  { ::memmove(p40_buf_Blend_1, p40_buf_AudioCascade_1, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.7); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p40_buf_Blend_1[_i], _b=p40_buf_TrebleSparks_1[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=1.0f-(1.0f-_av)*(1.0f-_bv);
        p40_buf_Blend_1[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  ::memmove(p40_buf_Kaleidoscope_1, p40_buf_Blend_1, sizeof(CRGB) * NUM_LEDS);  // Kaleidoscope: mirror logic to apply on p40_buf_Kaleidoscope_1
  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=8;
    float _a=_rate*t*0.01745329f,_co=cos(_a),_si=sin(_a);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _rx=_x-_cx,_ry=_y-_cy; int _sx=(int)floorf(_cx+_rx*_co+_ry*_si+0.5f), _sy=(int)floorf(_cy-_rx*_si+_ry*_co+0.5f);
      p40_buf_Transform_1[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?p40_buf_Kaleidoscope_1[_sy*WIDTH+_sx]:CRGB::Black;}}
  ::memmove(leds, p40_buf_Transform_1, sizeof(CRGB) * NUM_LEDS);
}

void render_p41(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_audio_pattern_10_in_bass_out = _audioBass;
  float n_audio_pattern_10_in_beat_out = _audioBeat;
  float n_audio_pattern_10_map_result = mapFloat(n_audio_pattern_10_in_bass_out, 0, 1, 0.15, 1);
  { float _spd=(constrain((n_audio_pattern_10_map_result), 0.0f, 1.0f) * 2.000f); for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
    float _d=sqrt((_x-WIDTH/2.0f)*(_x-WIDTH/2.0f)+(_y-HEIGHT/2.0f)*(_y-HEIGHT/2.0f))/sqrt(WIDTH*WIDTH/4.0f+HEIGHT*HEIGHT/4.0f);
    float _a=atan2(_y-HEIGHT/2.0f,_x-WIDTH/2.0f);float _s=(_a+_d*12.57f-t*_spd*3.14159f)*5;
    p41_buf_audio_pattern_10_spiral[_y*WIDTH+_x]=CHSV((uint8_t)(_d*255+t*30),255,(uint8_t)((sin(_s)+1)/2.0f*230));}}
  ::memmove(p41_buf_audio_pattern_10_kaleido, p41_buf_audio_pattern_10_spiral, sizeof(CRGB) * NUM_LEDS);  // Kaleidoscope: mirror logic to apply on p41_buf_audio_pattern_10_kaleido
  {
    ::memmove(p41_buf_audio_pattern_10_flash, p41_buf_audio_pattern_10_kaleido, sizeof(CRGB) * NUM_LEDS);
    static float _flash_audio_pattern_10_flash = 0;
    if (n_audio_pattern_10_in_beat_out) _flash_audio_pattern_10_flash = 1.0f; else _flash_audio_pattern_10_flash *= 0.72;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p41_buf_audio_pattern_10_flash[_i].r = qadd8(p41_buf_audio_pattern_10_flash[_i].r, (uint8_t)((255 - p41_buf_audio_pattern_10_flash[_i].r) * _flash_audio_pattern_10_flash));
      p41_buf_audio_pattern_10_flash[_i].g = qadd8(p41_buf_audio_pattern_10_flash[_i].g, (uint8_t)((255 - p41_buf_audio_pattern_10_flash[_i].g) * _flash_audio_pattern_10_flash));
      p41_buf_audio_pattern_10_flash[_i].b = qadd8(p41_buf_audio_pattern_10_flash[_i].b, (uint8_t)((255 - p41_buf_audio_pattern_10_flash[_i].b) * _flash_audio_pattern_10_flash));
    }
  }
  ::memmove(leds, p41_buf_audio_pattern_10_flash, sizeof(CRGB) * NUM_LEDS);
}

void render_p42(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_audio_pattern_9_in_bass_out = _audioBass;
  float n_audio_pattern_9_in_mids_out = _audioMids;
  float n_audio_pattern_9_in_treble_out = _audioTreble;
  float n_audio_pattern_9_in_energy_out = ((_audioBass + _audioMids + _audioTreble) / 3.0f);
  {
    float _b = min(1.0f, max(0.0f, n_audio_pattern_9_in_bass_out)), _m = min(1.0f, max(0.0f, n_audio_pattern_9_in_mids_out)), _t = min(1.0f, max(0.0f, n_audio_pattern_9_in_treble_out));
    float _strength = min(1.0f, max(0.0f, n_audio_pattern_9_in_energy_out));
    float _spd = min(1.0f, max(0.0f, 1));
    float _motion = _spd * (0.8f + (_b + _m + _t) * 1.4f * _strength);
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _nx = WIDTH > 1 ? (float)_x / (float)(WIDTH - 1) : 0.0f;
      float _ny = HEIGHT > 1 ? (float)_y / (float)(HEIGHT - 1) : 0.0f;
      float _ribbon = sinf((_nx * 7.0f + _ny * 2.5f) + t * _motion * (2.0f + _m * 3.0f * _strength));
      float _sweep = cosf((_ny * 9.0f - _nx * 3.0f) - t * _motion * (1.4f + _b * 2.2f * _strength));
      float _shimmer = powf(max(0.0f, sinf((_nx + _ny) * 18.0f + t * _motion * (4.0f + _t * 8.0f * _strength)) * 0.5f + 0.5f), 6.0f);
      float _body = max(0.0f, _ribbon * 0.55f + _sweep * 0.45f);
      float _v = min(1.0f, _body * (0.18f + _m * 0.52f * _strength) + _b * 0.24f * _strength + _shimmer * _t * 0.85f * _strength);
      float _pt = _nx * (0.2f + _b * 0.5f) + _ny * (0.35f + _m * 0.45f) + _shimmer * 0.15f + t * _motion * 0.03f;
      p42_buf_audio_pattern_9_cascade[_y * WIDTH + _x] = ColorFromPalette(RainbowColors_p, (uint8_t)(_pt * 255));
      p42_buf_audio_pattern_9_cascade[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));
    }
  }
  { ::memmove(p42_buf_audio_pattern_9_hue, p42_buf_audio_pattern_9_cascade, sizeof(CRGB) * NUM_LEDS); uint8_t _sh = (uint8_t)((35) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) p42_buf_audio_pattern_9_hue[_i] = CHSV(rgb2hsv_approximate(p42_buf_audio_pattern_9_hue[_i]).hue + _sh, rgb2hsv_approximate(p42_buf_audio_pattern_9_hue[_i]).sat, rgb2hsv_approximate(p42_buf_audio_pattern_9_hue[_i]).val); }
  ::memmove(p42_buf_audio_pattern_9_blur, p42_buf_audio_pattern_9_hue, sizeof(CRGB) * NUM_LEDS); blur2d(p42_buf_audio_pattern_9_blur, WIDTH, HEIGHT, 41, _xyMap);
  ::memmove(leds, p42_buf_audio_pattern_9_blur, sizeof(CRGB) * NUM_LEDS);
}

void render_p43(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_audio_pattern_8_in_hihat_out = _audioTreble;
  {
    float _t = min(1.0f, max(0.0f, n_audio_pattern_8_in_hihat_out));
    float _strength = min(1.0f, max(0.0f, 0.9));
    float _spd = min(1.0f, max(0.0f, 1));
    float _motion = _spd * (1.2f + _t * 3.2f * _strength);
    CRGB _base = CRGB(205, 85, 255);
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _diagA = _x * 1.7f + _y * 1.15f, _diagB = _x * -1.1f + _y * 1.9f;
      float _waveA = sinf(_diagA + t * _motion * 7.5f);
      float _waveB = sinf(_diagB - t * _motion * 6.1f);
      float _prism = max(0.0f, _waveA * 0.55f + _waveB * 0.45f);
      float _shard = powf(_prism, 3.6f);
      float _flash = powf(max(0.0f, sinf((_x + _y) * 2.4f - t * _motion * 9.0f) * 0.5f + 0.5f), 10.0f);
      float _v = min(1.0f, _shard * (0.3f + _t * 0.7f * _strength) + _flash * _t * 0.9f * _strength);
      int _i = _y * WIDTH + _x;
      p43_buf_audio_pattern_8_prism[_i] = _base;
      p43_buf_audio_pattern_8_prism[_i].nscale8((uint8_t)(_v * 255));
    }
  }
  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=135;
    float _a=_rate*t*0.01745329f,_co=cos(_a),_si=sin(_a);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _rx=_x-_cx,_ry=_y-_cy; int _sx=(int)floorf(_cx+_rx*_co+_ry*_si+0.5f), _sy=(int)floorf(_cy-_rx*_si+_ry*_co+0.5f);
      p43_buf_audio_pattern_8_spin[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?p43_buf_audio_pattern_8_prism[_sy*WIDTH+_sx]:CRGB::Black;}}
  ::memmove(p43_buf_audio_pattern_8_blur, p43_buf_audio_pattern_8_spin, sizeof(CRGB) * NUM_LEDS); blur2d(p43_buf_audio_pattern_8_blur, WIDTH, HEIGHT, 71, _xyMap);
  ::memmove(leds, p43_buf_audio_pattern_8_blur, sizeof(CRGB) * NUM_LEDS);
}

void render_p44(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_audio_pattern_7_in_vocals_out = _audioMids;
  float n_audio_pattern_7_in_beat_out = _audioBeat;
  {
    float _m = n_audio_pattern_7_in_vocals_out, _intensity = 1, _spd = 0.95;
    float _mAmt = min(1.0f, max(0.0f, _m));
    float _strength = min(1.0f, max(0.0f, _intensity));
    float _motion = min(1.0f, max(0.0f, _spd)) * (0.8f + _mAmt * 2.2f * _strength);
    float _cx0 = (WIDTH - 1) / 2.0f, _cy0 = (HEIGHT - 1) / 2.0f;
    float _sx = max(1.0f, WIDTH / 2.0f), _sy = max(1.0f, HEIGHT / 2.0f);
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _cx = (_x - _cx0) / _sx, _cy = (_y - _cy0) / _sy;
      float _radial = sqrtf(_cx * _cx + _cy * _cy);
      float _swirl = sinf((_cx * _cx - _cy * _cy) * 6 + t * _motion * 3.2f) + cosf((_cx + _cy) * 4 - t * _motion * 2.4f);
      float _bloom = sinf(_radial * (5.0f + _mAmt * 8.0f * _strength) * 3.14159265f - t * _motion * 4.0f + _swirl * 0.6f);
      float _crisp = powf(max(0.0f, _bloom * 0.5f + 0.5f), 1.8f);
      float _v = min(1.0f, _crisp * (0.22f + _mAmt * 0.78f * _strength));
      float _pt = _radial * 0.6f + _swirl * 0.12f + t * _motion * 0.05f;
      p44_buf_audio_pattern_7_bloom[_y * WIDTH + _x] = ColorFromPalette(PartyColors_p, (uint8_t)(_pt * 255));
      p44_buf_audio_pattern_7_bloom[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));
    }
  }
  ::memmove(p44_buf_audio_pattern_7_kaleido, p44_buf_audio_pattern_7_bloom, sizeof(CRGB) * NUM_LEDS);  // Kaleidoscope: mirror logic to apply on p44_buf_audio_pattern_7_kaleido
  {
    ::memmove(p44_buf_audio_pattern_7_flash, p44_buf_audio_pattern_7_kaleido, sizeof(CRGB) * NUM_LEDS);
    static float _flash_audio_pattern_7_flash = 0;
    if (n_audio_pattern_7_in_beat_out) _flash_audio_pattern_7_flash = 1.0f; else _flash_audio_pattern_7_flash *= 0.86;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p44_buf_audio_pattern_7_flash[_i].r = qadd8(p44_buf_audio_pattern_7_flash[_i].r, (uint8_t)((255 - p44_buf_audio_pattern_7_flash[_i].r) * _flash_audio_pattern_7_flash));
      p44_buf_audio_pattern_7_flash[_i].g = qadd8(p44_buf_audio_pattern_7_flash[_i].g, (uint8_t)((255 - p44_buf_audio_pattern_7_flash[_i].g) * _flash_audio_pattern_7_flash));
      p44_buf_audio_pattern_7_flash[_i].b = qadd8(p44_buf_audio_pattern_7_flash[_i].b, (uint8_t)((255 - p44_buf_audio_pattern_7_flash[_i].b) * _flash_audio_pattern_7_flash));
    }
  }
  ::memmove(leds, p44_buf_audio_pattern_7_flash, sizeof(CRGB) * NUM_LEDS);
}

void render_p45(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_audio_pattern_6_in_kick_out = _audioBass;
  float n_audio_pattern_6_in_beat_out = _audioBeat;
  {
    float _b = min(1.0f, max(0.0f, n_audio_pattern_6_in_kick_out));
    float _strength = min(1.0f, max(0.0f, 1));
    float _spd = min(1.0f, max(0.0f, 1));
    float _cx = WIDTH * 0.5f, _cy = HEIGHT * 0.5f, _maxD = sqrtf(_cx * _cx + _cy * _cy);
    float _motion = _spd * (0.75f + _b * 1.75f * _strength);
    float _phase = t * (1.2f + _motion * 4.8f);
    float _rings = 4.0f + _b * 8.0f * _strength;
    float _floor = 0.04f + _b * 0.1f * _strength;
    float _gain = 0.16f + _b * 0.84f * _strength;
    CRGB _base = CRGB(255, 95, 10);
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _dx = _x - _cx, _dy = _y - _cy;
      float _dist = sqrtf(_dx * _dx + _dy * _dy) / max(0.0001f, _maxD);
      float _wave = sinf(_dist * _rings * 6.2831853f - _phase);
      float _crisp = powf(max(0.0f, _wave * 0.5f + 0.5f), 2.4f);
      float _v = min(1.0f, _floor + _crisp * _gain);
      int _i = _y * WIDTH + _x;
      p45_buf_audio_pattern_6_rings[_i] = _base;
      p45_buf_audio_pattern_6_rings[_i].nscale8((uint8_t)(_v * 255));
    }
  }
  ::memmove(p45_buf_audio_pattern_6_kaleido, p45_buf_audio_pattern_6_rings, sizeof(CRGB) * NUM_LEDS);  // Kaleidoscope: mirror logic to apply on p45_buf_audio_pattern_6_kaleido
  {
    ::memmove(p45_buf_audio_pattern_6_flash, p45_buf_audio_pattern_6_kaleido, sizeof(CRGB) * NUM_LEDS);
    static float _flash_audio_pattern_6_flash = 0;
    if (n_audio_pattern_6_in_beat_out) _flash_audio_pattern_6_flash = 1.0f; else _flash_audio_pattern_6_flash *= 0.8;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p45_buf_audio_pattern_6_flash[_i].r = qadd8(p45_buf_audio_pattern_6_flash[_i].r, (uint8_t)((255 - p45_buf_audio_pattern_6_flash[_i].r) * _flash_audio_pattern_6_flash));
      p45_buf_audio_pattern_6_flash[_i].g = qadd8(p45_buf_audio_pattern_6_flash[_i].g, (uint8_t)((255 - p45_buf_audio_pattern_6_flash[_i].g) * _flash_audio_pattern_6_flash));
      p45_buf_audio_pattern_6_flash[_i].b = qadd8(p45_buf_audio_pattern_6_flash[_i].b, (uint8_t)((255 - p45_buf_audio_pattern_6_flash[_i].b) * _flash_audio_pattern_6_flash));
    }
  }
  ::memmove(leds, p45_buf_audio_pattern_6_flash, sizeof(CRGB) * NUM_LEDS);
}

void render_p46(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_audio_pattern_5_in_bass_out = _audioBass;
  float n_audio_pattern_5_in_mids_out = _audioMids;
  float n_audio_pattern_5_in_treble_out = _audioTreble;
  { float _b=n_audio_pattern_5_in_bass_out,_m=n_audio_pattern_5_in_mids_out,_tr=n_audio_pattern_5_in_treble_out,_spd=(0.000f + constrain((0.72), 0.0f, 1.0f) * 0.200f),_sc=(0.000f + constrain((0.34), 0.0f, 1.0f) * 0.200f);
    float _flow=t*_spd*(0.2f+_m*1.5f); uint8_t _bright=(uint8_t)(min(1.0f,0.3f+_b)*255);
    float _vamp=0.2f+_tr*0.7f+_b*0.3f;
    float _vflow=((float)inoise8((uint16_t)((t*_spd*4.0f+50)*256),4429)/128.0f-1.0f)*_vamp;
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      uint8_t _v=inoise8((uint16_t)((_x*_sc+_flow)*256),(uint16_t)((_y*_sc*0.6f+_vflow+8.0f)*256));
      p46_buf_audio_pattern_5_flow[_y*WIDTH+_x]=ColorFromPalette(ForestColors_p,(uint8_t)(_v+_tr*80)); p46_buf_audio_pattern_5_flow[_y*WIDTH+_x].nscale8(_bright);}}
  { ::memmove(p46_buf_audio_pattern_5_hue, p46_buf_audio_pattern_5_flow, sizeof(CRGB) * NUM_LEDS); uint8_t _sh = (uint8_t)((48) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) p46_buf_audio_pattern_5_hue[_i] = CHSV(rgb2hsv_approximate(p46_buf_audio_pattern_5_hue[_i]).hue + _sh, rgb2hsv_approximate(p46_buf_audio_pattern_5_hue[_i]).sat, rgb2hsv_approximate(p46_buf_audio_pattern_5_hue[_i]).val); }
  ::memmove(p46_buf_audio_pattern_5_kaleido, p46_buf_audio_pattern_5_hue, sizeof(CRGB) * NUM_LEDS);  // Kaleidoscope: mirror logic to apply on p46_buf_audio_pattern_5_kaleido
  ::memmove(leds, p46_buf_audio_pattern_5_kaleido, sizeof(CRGB) * NUM_LEDS);
}

void render_p47(uint32_t ms) {
  float n_audio_pattern_4_in_hihat_out = _audioTreble;
  float n_audio_pattern_4_in_beat_out = _audioBeat;
  {
    float _t = n_audio_pattern_4_in_hihat_out, _d = 0.82;
    fadeToBlackBy(p47_buf_audio_pattern_4_sparks, NUM_LEDS, (uint8_t)(110 + (1.0f - constrain(_t, 0.0f, 1.0f)) * 40));
    int _spawns = (int)(NUM_LEDS * constrain(_d, 0.0f, 1.0f) * (0.03f + constrain(_t, 0.0f, 1.0f) * 0.12f));
    if (_spawns < 1 && _d * _t > 0.05f) _spawns = 1;
    uint8_t _spawnChance = (uint8_t)(51 + constrain(_t, 0.0f, 1.0f) * 204);
    for (int _s = 0; _s < _spawns; _s++) if (random8() <= _spawnChance) {
      int _x = random16(WIDTH), _y = random16(HEIGHT), _i = _y * WIDTH + _x;
      CRGB _spark = blend(CRGB(140, 225, 255), CRGB::White, (uint8_t)(89 + constrain(_t, 0.0f, 1.0f) * 89));
      _spark.nscale8((uint8_t)(min(255.0f, (0.7f + constrain(_t, 0.0f, 1.0f) * 0.6f) * (140 + random8(116)))));
      p47_buf_audio_pattern_4_sparks[_i] += _spark;
      CRGB _edge = _spark; _edge.nscale8((uint8_t)(107));
      if (_x > 0) p47_buf_audio_pattern_4_sparks[_i - 1] += _edge; if (_x + 1 < WIDTH) p47_buf_audio_pattern_4_sparks[_i + 1] += _edge;
      if (_y > 0) p47_buf_audio_pattern_4_sparks[_i - WIDTH] += _edge; if (_y + 1 < HEIGHT) p47_buf_audio_pattern_4_sparks[_i + WIDTH] += _edge;
      CRGB _corner = _spark; _corner.nscale8((uint8_t)(41));
      if (_x > 0 && _y > 0) p47_buf_audio_pattern_4_sparks[_i - WIDTH - 1] += _corner;
      if (_x + 1 < WIDTH && _y > 0) p47_buf_audio_pattern_4_sparks[_i - WIDTH + 1] += _corner;
      if (_x > 0 && _y + 1 < HEIGHT) p47_buf_audio_pattern_4_sparks[_i + WIDTH - 1] += _corner;
      if (_x + 1 < WIDTH && _y + 1 < HEIGHT) p47_buf_audio_pattern_4_sparks[_i + WIDTH + 1] += _corner;
    }
  }
  ::memmove(p47_buf_audio_pattern_4_blur, p47_buf_audio_pattern_4_sparks, sizeof(CRGB) * NUM_LEDS); blur2d(p47_buf_audio_pattern_4_blur, WIDTH, HEIGHT, 107, _xyMap);
  {
    ::memmove(p47_buf_audio_pattern_4_flash, p47_buf_audio_pattern_4_blur, sizeof(CRGB) * NUM_LEDS);
    static float _flash_audio_pattern_4_flash = 0;
    if (n_audio_pattern_4_in_beat_out) _flash_audio_pattern_4_flash = 1.0f; else _flash_audio_pattern_4_flash *= 0.76;
    for (int _i = 0; _i < NUM_LEDS; _i++) {
      p47_buf_audio_pattern_4_flash[_i].r = qadd8(p47_buf_audio_pattern_4_flash[_i].r, (uint8_t)((255 - p47_buf_audio_pattern_4_flash[_i].r) * _flash_audio_pattern_4_flash));
      p47_buf_audio_pattern_4_flash[_i].g = qadd8(p47_buf_audio_pattern_4_flash[_i].g, (uint8_t)((255 - p47_buf_audio_pattern_4_flash[_i].g) * _flash_audio_pattern_4_flash));
      p47_buf_audio_pattern_4_flash[_i].b = qadd8(p47_buf_audio_pattern_4_flash[_i].b, (uint8_t)((255 - p47_buf_audio_pattern_4_flash[_i].b) * _flash_audio_pattern_4_flash));
    }
  }
  ::memmove(leds, p47_buf_audio_pattern_4_flash, sizeof(CRGB) * NUM_LEDS);
}

void render_p48(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_audio_pattern_3_in_mids_out = _audioMids;
  float n_audio_pattern_3_in_bass_out = _audioBass;
  {
    float _m = n_audio_pattern_3_in_mids_out, _intensity = 0.92, _spd = 1;
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _mAmt = min(1.0f, max(0.0f, _m));
      float _strength = min(1.0f, max(0.0f, _intensity));
      float _motion = _spd * (1.0f + _mAmt * 1.5f * _strength);
      float _contrast = 0.7f + _mAmt * 1.8f * _strength;
      float _wBase = sin(_x * 0.8f + t * _motion * 4) * sin(_y * 0.5f + t * _motion * 2.5f);
      float _w = min(1.0f, max(-1.0f, _wBase * _contrast));
      float _int = min(1.0f, 0.1f + powf(_mAmt, 0.65f) * 1.25f * _strength);
      float _v = (_w + 1) / 2.0f * _int;
      p48_buf_audio_pattern_3_waves[_y * WIDTH + _x] = ColorFromPalette(OceanColors_p, (uint8_t)((_w + 1) * 127.5f));
      p48_buf_audio_pattern_3_waves[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));
    }
  }
  float n_audio_pattern_3_map_result = mapFloat(n_audio_pattern_3_in_bass_out, 0, 1, -120, 120);
  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=n_audio_pattern_3_map_result;
    float _a=_rate*t*0.01745329f,_co=cos(_a),_si=sin(_a);
    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){
      float _rx=_x-_cx,_ry=_y-_cy; int _sx=(int)floorf(_cx+_rx*_co+_ry*_si+0.5f), _sy=(int)floorf(_cy-_rx*_si+_ry*_co+0.5f);
      p48_buf_audio_pattern_3_spin[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?p48_buf_audio_pattern_3_waves[_sy*WIDTH+_sx]:CRGB::Black;}}
  ::memmove(p48_buf_audio_pattern_3_blur, p48_buf_audio_pattern_3_spin, sizeof(CRGB) * NUM_LEDS); blur2d(p48_buf_audio_pattern_3_blur, WIDTH, HEIGHT, 51, _xyMap);
  ::memmove(leds, p48_buf_audio_pattern_3_blur, sizeof(CRGB) * NUM_LEDS);
}

void render_p49(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_audio_pattern_2_in_bass_out = _audioBass;
  float n_audio_pattern_2_in_mids_out = _audioMids;
  float n_audio_pattern_2_in_treble_out = _audioTreble;
  {
    fill_solid(p49_buf_audio_pattern_2_bars, NUM_LEDS, CRGB::Black);
    float _b = min(1.0f, max(0.0f, n_audio_pattern_2_in_bass_out)), _m = min(1.0f, max(0.0f, n_audio_pattern_2_in_mids_out)), _t = min(1.0f, max(0.0f, n_audio_pattern_2_in_treble_out));
    float _strength = min(1.0f, max(0.0f, 0.96));
    float _spd = min(1.0f, max(0.0f, 0.82));
    const int _cols = max(1, ((WIDTH + 1) / 2));
    float _levels[3] = { _b, _m, _t };
    float _geometryMotion = t * (0.45f + _spd * 3.2f);
    float _paletteScroll = t * (0.08f + _spd * 0.42f);
    for (int _x = 0; _x < _cols; _x++) {
      float _nx = _cols <= 1 ? 0.0f : (float)_x / (float)(_cols - 1);
      float _spec = _nx * 2.0f;
      int _left = (int)floorf(_spec);
      int _right = min(2, _left + 1);
      float _mix = _spec - (float)_left;
      float _base = _levels[_left] * (1.0f - _mix) + _levels[_right] * _mix;
      float _ripple = sinf(_nx * 10.5f - _geometryMotion * (1.1f + _t * 1.8f)) * 0.08f * _strength;
      float _shimmer = max(0.0f, sinf(_nx * 21.0f + _geometryMotion * (2.0f + _m * 2.5f))) * 0.06f * _t * _strength;
      float _level = min(1.0f, max(0.0f, _base * (0.45f + _strength * 0.9f) + _ripple + _shimmer));
      int _barH = max(0, (int)roundf(_level * HEIGHT));
      for (int _row = 0; _row < _barH; _row++) {
        int _y = HEIGHT - 1 - _row;
        float _vertical = HEIGHT <= 1 ? 0.0f : (float)_row / (float)(HEIGHT - 1);
        float _pulse = 0.72f + 0.28f * sinf(_vertical * 6.2f - _geometryMotion * (1.4f + _b * 1.6f));
        float _v = min(1.0f, max(0.0f, (0.28f + _vertical * 0.72f) * _pulse));
        float _pt = _nx + _paletteScroll + _vertical * (0.12f + _m * 0.12f) + _spec * 0.08f;
        CRGB _px = ColorFromPalette(LavaColors_p, (uint8_t)(_pt * 255));
        _px.nscale8((uint8_t)(_v * 255));
        p49_buf_audio_pattern_2_bars[_y * WIDTH + _x] = _px;
        p49_buf_audio_pattern_2_bars[_y * WIDTH + (WIDTH - 1 - _x)] = _px;
      }
      if (_barH > 0) {
        int _peakY = max(0, HEIGHT - _barH);
        CRGB _peak = ColorFromPalette(LavaColors_p, (uint8_t)((_nx + _paletteScroll + _spec * 0.08f) * 255));
        _peak.nscale8((uint8_t)(min(1.0f, 0.6f + _t * 0.35f + _strength * 0.2f) * 255));
        p49_buf_audio_pattern_2_bars[_peakY * WIDTH + _x] = _peak;
        p49_buf_audio_pattern_2_bars[_peakY * WIDTH + (WIDTH - 1 - _x)] = _peak;
      }
    }
  }
  ::memmove(p49_buf_audio_pattern_2_kaleido, p49_buf_audio_pattern_2_bars, sizeof(CRGB) * NUM_LEDS);  // Kaleidoscope: mirror logic to apply on p49_buf_audio_pattern_2_kaleido
  ::memmove(p49_buf_audio_pattern_2_blur, p49_buf_audio_pattern_2_kaleido, sizeof(CRGB) * NUM_LEDS); blur2d(p49_buf_audio_pattern_2_blur, WIDTH, HEIGHT, 46, _xyMap);
  ::memmove(leds, p49_buf_audio_pattern_2_blur, sizeof(CRGB) * NUM_LEDS);
}

void render_p50(uint32_t ms) {
  float n_audio_pattern_1_in_bass_out = _audioBass;
  float n_audio_pattern_1_in_mids_out = _audioMids;
  { float _b = n_audio_pattern_1_in_bass_out; fill_solid(p50_buf_audio_pattern_1_pulse, NUM_LEDS, CRGB((uint8_t)(255 * _b), (uint8_t)(12 * _b), (uint8_t)(105 * _b))); }
  ::memmove(p50_buf_audio_pattern_1_blur, p50_buf_audio_pattern_1_pulse, sizeof(CRGB) * NUM_LEDS); blur2d(p50_buf_audio_pattern_1_blur, WIDTH, HEIGHT, 87, _xyMap);
  float n_audio_pattern_1_map_result = mapFloat(n_audio_pattern_1_in_mids_out, 0, 1, -80, 220);
  { ::memmove(p50_buf_audio_pattern_1_hue, p50_buf_audio_pattern_1_blur, sizeof(CRGB) * NUM_LEDS); uint8_t _sh = (uint8_t)((n_audio_pattern_1_map_result) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) p50_buf_audio_pattern_1_hue[_i] = CHSV(rgb2hsv_approximate(p50_buf_audio_pattern_1_hue[_i]).hue + _sh, rgb2hsv_approximate(p50_buf_audio_pattern_1_hue[_i]).sat, rgb2hsv_approximate(p50_buf_audio_pattern_1_hue[_i]).val); }
  ::memmove(leds, p50_buf_audio_pattern_1_hue, sizeof(CRGB) * NUM_LEDS);
}

void render_p51(uint32_t ms) {
  float t = ms / 1000.0f;
  float n_j_fft_bass_target = constrain(_audioBass * 1.200f, 0.0f, 1.0f), n_j_fft_mids_target = constrain(_audioMids * 1.200f, 0.0f, 1.0f), n_j_fft_treble_target = constrain(_audioTreble * 1.200f, 0.0f, 1.0f);
  static float n_j_fft_bass_smooth = -1, n_j_fft_mids_smooth = -1, n_j_fft_treble_smooth = -1;
  n_j_fft_bass_smooth = n_j_fft_bass_smooth < 0 ? n_j_fft_bass_target : n_j_fft_bass_smooth * 0.720f + n_j_fft_bass_target * 0.280f;
  n_j_fft_mids_smooth = n_j_fft_mids_smooth < 0 ? n_j_fft_mids_target : n_j_fft_mids_smooth * 0.720f + n_j_fft_mids_target * 0.280f;
  n_j_fft_treble_smooth = n_j_fft_treble_smooth < 0 ? n_j_fft_treble_target : n_j_fft_treble_smooth * 0.720f + n_j_fft_treble_target * 0.280f;
  float n_j_fft_bass = n_j_fft_bass_smooth, n_j_fft_mids = n_j_fft_mids_smooth, n_j_fft_treble = n_j_fft_treble_smooth;
  // PaletteSelector — drives OceanColors_p in connected palette-consuming nodes
  // PaletteSelector — drives PartyColors_p in connected palette-consuming nodes
  static float n_Smooth_1783414683949_result = 0; static uint32_t _smT_Smooth_1783414683949 = 0; static bool _smI_Smooth_1783414683949 = false;
  { float _in = n_j_fft_bass; uint32_t _now = millis();
    if (!_smI_Smooth_1783414683949) { n_Smooth_1783414683949_result = _in; _smI_Smooth_1783414683949 = true; }
    else n_Smooth_1783414683949_result += (_in - n_Smooth_1783414683949_result) * (1.0f - expf(-(float)(_now - _smT_Smooth_1783414683949) / 1000.0f / 1.000f));
    _smT_Smooth_1783414683949 = _now; }
  CRGBPalette16 pal_j_palMix;
  { uint8_t _amt = (uint8_t)((n_Smooth_1783414683949_result) * 255); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);
    pal_j_palMix[_i] = blend(ColorFromPalette(OceanColors_p, _p), ColorFromPalette(PartyColors_p, _p), _amt); } }
  static float n_Smooth_1783414831871_result = 0; static uint32_t _smT_Smooth_1783414831871 = 0; static bool _smI_Smooth_1783414831871 = false;
  { float _in = n_j_fft_treble; uint32_t _now = millis();
    if (!_smI_Smooth_1783414831871) { n_Smooth_1783414831871_result = _in; _smI_Smooth_1783414831871 = true; }
    else n_Smooth_1783414831871_result += (_in - n_Smooth_1783414831871_result) * (1.0f - expf(-(float)(_now - _smT_Smooth_1783414831871) / 1000.0f / 1.000f));
    _smT_Smooth_1783414831871 = _now; }
  static float n_Smooth_1783415014000_result = 0; static uint32_t _smT_Smooth_1783415014000 = 0; static bool _smI_Smooth_1783415014000 = false;
  { float _in = n_j_fft_mids; uint32_t _now = millis();
    if (!_smI_Smooth_1783415014000) { n_Smooth_1783415014000_result = _in; _smI_Smooth_1783415014000 = true; }
    else n_Smooth_1783415014000_result += (_in - n_Smooth_1783415014000_result) * (1.0f - expf(-(float)(_now - _smT_Smooth_1783415014000) / 1000.0f / 1.000f));
    _smT_Smooth_1783415014000 = _now; }
  {
    float _m = n_Smooth_1783415014000_result, _intensity = n_Smooth_1783414683949_result, _spd = n_Smooth_1783414831871_result;
    float _mAmt = min(1.0f, max(0.0f, _m));
    float _strength = min(1.0f, max(0.0f, _intensity));
    float _motion = min(1.0f, max(0.0f, _spd)) * (0.8f + _mAmt * 2.2f * _strength);
    float _cx0 = (WIDTH - 1) / 2.0f, _cy0 = (HEIGHT - 1) / 2.0f;
    float _sx = max(1.0f, WIDTH / 2.0f), _sy = max(1.0f, HEIGHT / 2.0f);
    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {
      float _cx = (_x - _cx0) / _sx, _cy = (_y - _cy0) / _sy;
      float _radial = sqrtf(_cx * _cx + _cy * _cy);
      float _swirl = sinf((_cx * _cx - _cy * _cy) * 6 + t * _motion * 3.2f) + cosf((_cx + _cy) * 4 - t * _motion * 2.4f);
      float _bloom = sinf(_radial * (5.0f + _mAmt * 8.0f * _strength) * 3.14159265f - t * _motion * 4.0f + _swirl * 0.6f);
      float _crisp = powf(max(0.0f, _bloom * 0.5f + 0.5f), 1.8f);
      float _v = min(1.0f, _crisp * (0.22f + _mAmt * 0.78f * _strength));
      float _pt = _radial * 0.6f + _swirl * 0.12f + t * _motion * 0.05f;
      p51_buf_j_bloom[_y * WIDTH + _x] = ColorFromPalette(pal_j_palMix, (uint8_t)(_pt * 255));
      p51_buf_j_bloom[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));
    }
  }
  float n_j_kelvin_result = mapFloat(n_Smooth_1783414831871_result, 0, 1, 1800, 12000);
  CRGB n_j_temp_color = kelvinToRGB(n_j_kelvin_result);
  {
    float _t = n_Smooth_1783414831871_result, _d = n_Smooth_1783415014000_result;
    fadeToBlackBy(p51_buf_j_sparks, NUM_LEDS, (uint8_t)(110 + (1.0f - constrain(_t, 0.0f, 1.0f)) * 40));
    int _spawns = (int)(NUM_LEDS * constrain(_d, 0.0f, 1.0f) * (0.03f + constrain(_t, 0.0f, 1.0f) * 0.12f));
    if (_spawns < 1 && _d * _t > 0.05f) _spawns = 1;
    uint8_t _spawnChance = (uint8_t)(51 + constrain(_t, 0.0f, 1.0f) * 204);
    for (int _s = 0; _s < _spawns; _s++) if (random8() <= _spawnChance) {
      int _x = random16(WIDTH), _y = random16(HEIGHT), _i = _y * WIDTH + _x;
      CRGB _spark = blend(n_j_temp_color, CRGB::White, (uint8_t)(89 + constrain(_t, 0.0f, 1.0f) * 89));
      _spark.nscale8((uint8_t)(min(255.0f, (0.7f + constrain(_t, 0.0f, 1.0f) * 0.6f) * (140 + random8(116)))));
      p51_buf_j_sparks[_i] += _spark;
      CRGB _edge = _spark; _edge.nscale8((uint8_t)(107));
      if (_x > 0) p51_buf_j_sparks[_i - 1] += _edge; if (_x + 1 < WIDTH) p51_buf_j_sparks[_i + 1] += _edge;
      if (_y > 0) p51_buf_j_sparks[_i - WIDTH] += _edge; if (_y + 1 < HEIGHT) p51_buf_j_sparks[_i + WIDTH] += _edge;
      CRGB _corner = _spark; _corner.nscale8((uint8_t)(41));
      if (_x > 0 && _y > 0) p51_buf_j_sparks[_i - WIDTH - 1] += _corner;
      if (_x + 1 < WIDTH && _y > 0) p51_buf_j_sparks[_i - WIDTH + 1] += _corner;
      if (_x > 0 && _y + 1 < HEIGHT) p51_buf_j_sparks[_i + WIDTH - 1] += _corner;
      if (_x + 1 < WIDTH && _y + 1 < HEIGHT) p51_buf_j_sparks[_i + WIDTH + 1] += _corner;
    }
  }
  { ::memmove(p51_buf_j_blend, p51_buf_j_bloom, sizeof(CRGB) * NUM_LEDS);
    float _op=(0.52); for(int _i=0;_i<NUM_LEDS;_i++){
      CRGB _a=p51_buf_j_blend[_i], _b=p51_buf_j_sparks[_i];
      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;
        float _r=min(1.0f,_av+_bv);
        p51_buf_j_blend[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }
  float n_j_rate_result = mapFloat(n_Smooth_1783414683949_result, 0, 1, 1, 12);
  fill_solid(p51_buf_j_transform, NUM_LEDS, CRGB::Black); // Transform: no input
  ::memmove(leds, p51_buf_j_blend, sizeof(CRGB) * NUM_LEDS);
}

void renderPattern(uint8_t i, uint32_t ms) {
  switch (i) {
    case 0: render_p0(ms); break;
    case 1: render_p1(ms); break;
    case 2: render_p2(ms); break;
    case 3: render_p3(ms); break;
    case 4: render_p4(ms); break;
    case 5: render_p5(ms); break;
    case 6: render_p6(ms); break;
    case 7: render_p7(ms); break;
    case 8: render_p8(ms); break;
    case 9: render_p9(ms); break;
    case 10: render_p10(ms); break;
    case 11: render_p11(ms); break;
    case 12: render_p12(ms); break;
    case 13: render_p13(ms); break;
    case 14: render_p14(ms); break;
    case 15: render_p15(ms); break;
    case 16: render_p16(ms); break;
    case 17: render_p17(ms); break;
    case 18: render_p18(ms); break;
    case 19: render_p19(ms); break;
    case 20: render_p20(ms); break;
    case 21: render_p21(ms); break;
    case 22: render_p22(ms); break;
    case 23: render_p23(ms); break;
    case 24: render_p24(ms); break;
    case 25: render_p25(ms); break;
    case 26: render_p26(ms); break;
    case 27: render_p27(ms); break;
    case 28: render_p28(ms); break;
    case 29: render_p29(ms); break;
    case 30: render_p30(ms); break;
    case 31: render_p31(ms); break;
    case 32: render_p32(ms); break;
    case 33: render_p33(ms); break;
    case 34: render_p34(ms); break;
    case 35: render_p35(ms); break;
    case 36: render_p36(ms); break;
    case 37: render_p37(ms); break;
    case 38: render_p38(ms); break;
    case 39: render_p39(ms); break;
    case 40: render_p40(ms); break;
    case 41: render_p41(ms); break;
    case 42: render_p42(ms); break;
    case 43: render_p43(ms); break;
    case 44: render_p44(ms); break;
    case 45: render_p45(ms); break;
    case 46: render_p46(ms); break;
    case 47: render_p47(ms); break;
    case 48: render_p48(ms); break;
    case 49: render_p49(ms); break;
    case 50: render_p50(ms); break;
    case 51: render_p51(ms); break;
  }
}

void setup() {
  showA = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  showB = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p0_buf_j_frame = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p0_buf_j_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p0_buf_j_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p0_field_j_base = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p0_field_j_ring = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p0_field_j_combine = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p0_field_j_tile = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p0_field_j_rotate = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p1_buf_i_particles = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p1_buf_i_flow = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p1_buf_i_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p1_buf_i_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p2_buf_h_gabor = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p2_buf_h_frame = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p2_buf_h_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p2_buf_h_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p2_buf_h_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p2_field_h_field = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p3_buf_g_bloom = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p3_buf_g_rings = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p3_buf_g_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p3_buf_g_shift = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p3_buf_g_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p4_buf_f_audioFlow = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p4_buf_f_sparks = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p4_buf_f_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p4_buf_f_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p4_buf_f_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p5_buf_e_fractal = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p5_buf_e_formula = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p5_buf_e_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p5_buf_e_shift = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p5_buf_e_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p6_buf_d_rd = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p6_buf_d_waves = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p6_buf_d_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p6_buf_d_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p7_buf_c_flow = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p7_buf_c_stars = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p7_buf_c_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p7_buf_c_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p7_buf_c_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p8_buf_b_frame = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p8_buf_b_shift = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p8_buf_b_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p8_field_b_base = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p8_field_b_ring = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p8_field_b_combine = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p8_field_b_rotate = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p9_buf_a_bloom = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p9_buf_a_formula = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p9_buf_a_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p9_buf_a_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p9_buf_a_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p10_buf_p10_cascade = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p10_buf_p10_particles = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p10_buf_p10_stars = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p10_buf_p10_blendA = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p10_buf_p10_blendB = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p10_buf_p10_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p10_buf_p10_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p11_buf_p9_gradient = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p11_buf_p9_prism = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p11_buf_p9_tr = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p11_buf_p9_transform = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p11_buf_p9_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p11_buf_p9_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p12_buf_p8_fractal = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p12_buf_p8_stars = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p12_buf_p8_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p12_buf_p8_shift = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p12_buf_p8_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p13_buf_p7_bloom = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p13_buf_p7_flow = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p13_buf_p7_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p13_buf_p7_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p13_buf_p7_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p14_buf_p6_custom = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p14_buf_p6_gradient = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p14_buf_p6_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p14_buf_p6_transform = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p14_buf_p6_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p15_buf_p5_frame = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p15_buf_p5_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p15_buf_p5_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p15_field_p5_src = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p15_field_p5_ring = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p15_field_p5_combine = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p15_field_p5_rotate = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p16_buf_p4_gabor = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p16_buf_p4_flow = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p16_buf_p4_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p16_buf_p4_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p16_buf_p4_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p17_buf_p3_rd = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p17_buf_p3_blobs = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p17_buf_p3_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p17_buf_p3_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p18_buf_p2_frame = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p18_buf_p2_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p18_field_p2_base = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p18_field_p2_dx = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p18_field_p2_dy = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p18_field_p2_warp = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p18_field_p2_tile = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p18_field_p2_rotate = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p19_buf_p1_bars = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p19_buf_p1_flow = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p19_buf_p1_tr = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p19_buf_p1_shift = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p19_buf_p1_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p19_buf_p1_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p20_buf_i_cascade = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p20_buf_i_formula = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p20_buf_i_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p20_buf_i_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p20_buf_i_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p21_buf_h_bars = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p21_buf_h_rings = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p21_buf_h_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p21_buf_h_transform = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p21_buf_h_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p21_buf_h_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p22_buf_g_gradient = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p22_buf_g_stars = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p22_buf_g_swarm = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p22_buf_g_starSwarm = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p22_buf_g_tr = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p22_buf_g_transform = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p22_buf_g_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p23_buf_f_fractal = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p23_buf_f_life = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p23_buf_f_tr = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p23_buf_f_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p24_buf_e_frame = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p24_buf_e_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p24_field_e_base = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p24_field_e_orbit = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p24_field_e_combine = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p24_field_e_dx = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p24_field_e_dy = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p24_field_e_warp = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p24_field_e_rotate = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p25_buf_d_noise = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p25_buf_d_waves = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p25_buf_d_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p25_buf_d_shift = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p25_buf_d_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p25_buf_d_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p26_buf_c_audioFlow = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p26_buf_c_bassRings = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p26_buf_c_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p26_buf_c_transform = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p26_buf_c_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p27_buf_b_bloom = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p27_buf_b_fire = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p27_buf_b_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p27_buf_b_shift = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p27_buf_b_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p27_buf_b_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p28_buf_a_bars = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p28_buf_a_prism = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p28_buf_a_tr = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p28_buf_a_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p28_buf_a_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p28_buf_a_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p29_buf_p10_flow = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p29_buf_p10_particles = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p29_buf_p10_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p29_buf_p10_transform = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p29_buf_p10_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p29_buf_p10_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p30_buf_p9_formula = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p30_buf_p9_gradient = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p30_buf_p9_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p30_buf_p9_hueshift = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p30_buf_p9_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p31_buf_p8_fractal = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p31_buf_p8_life = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p31_buf_p8_transition = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p31_buf_p8_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p31_buf_p8_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p32_buf_p7_blobs = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p32_buf_p7_rd = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p32_buf_p7_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p32_buf_p7_transform = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p32_buf_p7_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p33_buf_p6_toFrame = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p33_buf_p6_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p33_buf_p6_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p33_field_p6_d1 = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p33_field_p6_d2 = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p33_field_p6_diff = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p33_field_p6_tile = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p33_field_p6_rotate = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p34_buf_p5_particles = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p34_buf_p5_stars = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p34_buf_p5_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p34_buf_p5_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p34_buf_p5_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p34_buf_p5_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p35_buf_p4_toFrame = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p35_buf_p4_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p35_buf_p4_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p35_field_p4_src = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p35_field_p4_dx = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p35_field_p4_dy = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p35_field_p4_warp = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p35_field_p4_rotate = (float*)_psAlloc(sizeof(float) * NUM_LEDS);
  p36_buf_p3_flow = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p36_buf_p3_gabor = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p36_buf_p3_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p36_buf_p3_hueshift = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p36_buf_p3_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p37_buf_p2_stars = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p37_buf_p2_burst = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p37_buf_p2_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p37_buf_p2_transform = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p37_buf_p2_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p37_buf_p2_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p38_buf_p1_rd = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p38_buf_p1_gabor = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p38_buf_p1_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p38_buf_p1_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p38_buf_p1_gamma = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p39_buf_AudioFlow_1 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p39_buf_BassRings_1 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p39_buf_TrebleSparks_1 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p39_buf_Blend_1 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p39_buf_Blend_2 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p39_buf_Kaleidoscope_1 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p39_buf_Transform_1 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p39_buf_BeatFlash_1 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p39_buf_Blur2D_1 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p39_buf_Gamma_1 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p40_buf_AudioCascade_1 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p40_buf_TrebleSparks_1 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p40_buf_Blend_1 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p40_buf_Kaleidoscope_1 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p40_buf_Transform_1 = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p41_buf_audio_pattern_10_spiral = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p41_buf_audio_pattern_10_kaleido = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p41_buf_audio_pattern_10_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p42_buf_audio_pattern_9_cascade = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p42_buf_audio_pattern_9_hue = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p42_buf_audio_pattern_9_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p43_buf_audio_pattern_8_prism = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p43_buf_audio_pattern_8_spin = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p43_buf_audio_pattern_8_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p44_buf_audio_pattern_7_bloom = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p44_buf_audio_pattern_7_kaleido = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p44_buf_audio_pattern_7_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p45_buf_audio_pattern_6_rings = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p45_buf_audio_pattern_6_kaleido = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p45_buf_audio_pattern_6_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p46_buf_audio_pattern_5_flow = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p46_buf_audio_pattern_5_hue = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p46_buf_audio_pattern_5_kaleido = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p47_buf_audio_pattern_4_sparks = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p47_buf_audio_pattern_4_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p47_buf_audio_pattern_4_flash = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p48_buf_audio_pattern_3_waves = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p48_buf_audio_pattern_3_spin = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p48_buf_audio_pattern_3_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p49_buf_audio_pattern_2_bars = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p49_buf_audio_pattern_2_kaleido = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p49_buf_audio_pattern_2_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p50_buf_audio_pattern_1_pulse = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p50_buf_audio_pattern_1_blur = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p50_buf_audio_pattern_1_hue = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p51_buf_j_bloom = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p51_buf_j_sparks = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p51_buf_j_blend = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  p51_buf_j_transform = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);
  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(200);
  randomSeed(analogRead(A0));
  setupAudio();
}

void loop() {
  updateAudio();   // refresh mic band levels once per frame
  static uint8_t  cur = random8(PATTERN_COUNT), nxt = 0, transType = 0;
  static bool     transitioning = false;
  static uint32_t phaseStart = 0, dwell = 0;
  uint32_t now = millis();
  if (dwell == 0) dwell = random16(4000, 12000);

  if (!transitioning) {
    renderPattern(cur, now);
    bool timeUp = now - phaseStart >= dwell;
    if (timeUp && PATTERN_COUNT > 1) {
      nxt = (cur + 1 + random8(PATTERN_COUNT - 1)) % PATTERN_COUNT;
      transType = TRANS_POOL[random8(TRANS_POOL_N)];
      transitioning = true; phaseStart = now;
    }
  } else {
    float p = 1000 > 0 ? (float)(now - phaseStart) / 1000 : 1.0f;
    if (p >= 1.0f) p = 1.0f;
    renderPattern(cur, now); ::memmove(showA, leds, sizeof(CRGB) * NUM_LEDS);  // outgoing
    renderPattern(nxt, now); ::memmove(showB, leds, sizeof(CRGB) * NUM_LEDS);  // incoming
    compositeTransition(transType, leds, showA, showB, p);
    if (p >= 1.0f) { cur = nxt; transitioning = false; phaseStart = now; dwell = random16(4000, 12000); }
  }

  FastLED.show();
  FastLED.delay(16);
}