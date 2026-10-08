import { DFPLAYER_BOOT_MS, DFPLAYER_COMMAND_GAP_MS, DFPLAYER_DEVICE_SD } from '../../state/peripherals/dfPlayer'

export interface DfPlayerEmit {
  id: string
  rxPin: number
  txPin: number
  busyPin: number
  playExpr: string
  nextExpr: string
  previousExpr: string
  trackExpr: string
  volumeExpr: string
  playingVar: string
}

export const DFPLAYER_HELPER_CPP = [
  '#if defined(ARDUINO_ARCH_ESP32)',
  '// DFPlayer Mini: native 10-byte UART protocol, no external library.',
  '// One command at a time. The module drops a frame that follows another immediately.',
  'static void _dfSend(HardwareSerial& serial, uint8_t command, uint16_t parameter) {',
  '  uint8_t frame[10] = { 0x7E, 0xFF, 0x06, command, 0x00, (uint8_t)(parameter >> 8), (uint8_t)parameter, 0, 0, 0xEF };',
  '  uint16_t checksum = 0u - (uint16_t)(0xFFu + 0x06u + command + frame[4] + frame[5] + frame[6]);',
  '  frame[7] = (uint8_t)(checksum >> 8); frame[8] = (uint8_t)checksum;',
  '  serial.write(frame, sizeof(frame));',
  '}',
  '#endif',
]

export function dfPlayerGlobalCpp(emit: DfPlayerEmit): string[] {
  return [
    '#if defined(ARDUINO_ARCH_ESP32)',
    '// UART2 on classic ESP32 and S3, so UART1 stays free for a presence sensor.',
    '// S2, C3, C6 and H2 have no UART2; they use UART1.',
    '#if defined(CONFIG_IDF_TARGET_ESP32) || defined(CONFIG_IDF_TARGET_ESP32S3)',
    `static HardwareSerial _dfSerial_${emit.id}(2);`,
    '#else',
    `static HardwareSerial _dfSerial_${emit.id}(1);`,
    '#endif',
    '#endif',
  ]
}

export function dfPlayerSetupCpp(emit: DfPlayerEmit): string[] {
  return [
    `  pinMode(${emit.busyPin}, INPUT_PULLUP);`,
    '#if defined(ARDUINO_ARCH_ESP32)',
    `  _dfSerial_${emit.id}.begin(9600, SERIAL_8N1, ${emit.rxPin}, ${emit.txPin});`,
    '#endif',
  ]
}

export function dfPlayerLoopCpp(emit: DfPlayerEmit): string[] {
  const id = emit.id
  return [
    '#if defined(ARDUINO_ARCH_ESP32)',
    `  bool _dfWantPlay_${id} = ${emit.playExpr};`,
    `  uint16_t _dfTrack_${id} = (uint16_t)constrain((int)lroundf(${emit.trackExpr}), 1, 3000);`,
    `  uint8_t _dfVolume_${id} = (uint8_t)constrain((int)lroundf(${emit.volumeExpr} * 30.0f), 0, 30);`,
    `  bool _dfNext_${id} = ${emit.nextExpr};`,
    `  bool _dfPrevious_${id} = ${emit.previousExpr};`,
    `  static bool _dfReady_${id} = false, _dfLastPlay_${id} = false, _dfLastNext_${id} = false, _dfLastPrevious_${id} = false;`,
    `  static bool _dfPendNext_${id} = false, _dfPendPrevious_${id} = false;`,
    `  static uint8_t _dfInit_${id} = 0, _dfLastVolume_${id} = 255;`,
    `  static uint16_t _dfLastTrack_${id} = 0;`,
    `  static uint32_t _dfNextMs_${id} = 0;`,
    `  if (_dfNext_${id} && !_dfLastNext_${id}) _dfPendNext_${id} = true;`,
    `  if (_dfPrevious_${id} && !_dfLastPrevious_${id}) _dfPendPrevious_${id} = true;`,
    `  _dfLastNext_${id} = _dfNext_${id}; _dfLastPrevious_${id} = _dfPrevious_${id};`,
    `  while (_dfSerial_${id}.available() > 0) (void)_dfSerial_${id}.read();`,
    `  if (millis() >= _dfNextMs_${id}) {`,
    `    if (!_dfReady_${id}) {`,
    `      if (millis() >= ${DFPLAYER_BOOT_MS}u && _dfInit_${id} == 0) { _dfSend(_dfSerial_${id}, 0x09, ${DFPLAYER_DEVICE_SD}); _dfInit_${id} = 1; _dfNextMs_${id} = millis() + ${DFPLAYER_COMMAND_GAP_MS}u; }`,
    `      else if (_dfInit_${id} == 1) { _dfSend(_dfSerial_${id}, 0x06, _dfVolume_${id}); _dfLastVolume_${id} = _dfVolume_${id}; _dfInit_${id} = 2; _dfNextMs_${id} = millis() + ${DFPLAYER_COMMAND_GAP_MS}u; }`,
    `      else if (_dfInit_${id} == 2) {`,
    `        if (_dfWantPlay_${id}) _dfSend(_dfSerial_${id}, 0x12, _dfTrack_${id});`,
    `        _dfReady_${id} = true; _dfLastPlay_${id} = _dfWantPlay_${id}; _dfLastTrack_${id} = _dfTrack_${id}; _dfNextMs_${id} = millis() + ${DFPLAYER_COMMAND_GAP_MS}u;`,
    `      }`,
    `    } else if (_dfVolume_${id} != _dfLastVolume_${id}) { _dfSend(_dfSerial_${id}, 0x06, _dfVolume_${id}); _dfLastVolume_${id} = _dfVolume_${id}; _dfNextMs_${id} = millis() + ${DFPLAYER_COMMAND_GAP_MS}u; }`,
    `    else if (_dfTrack_${id} != _dfLastTrack_${id}) { _dfLastTrack_${id} = _dfTrack_${id}; if (_dfWantPlay_${id}) _dfSend(_dfSerial_${id}, 0x12, _dfTrack_${id}); _dfNextMs_${id} = millis() + ${DFPLAYER_COMMAND_GAP_MS}u; }`,
    `    else if (_dfPendNext_${id}) { _dfSend(_dfSerial_${id}, 0x01, 0); _dfPendNext_${id} = false; _dfNextMs_${id} = millis() + ${DFPLAYER_COMMAND_GAP_MS}u; }`,
    `    else if (_dfPendPrevious_${id}) { _dfSend(_dfSerial_${id}, 0x02, 0); _dfPendPrevious_${id} = false; _dfNextMs_${id} = millis() + ${DFPLAYER_COMMAND_GAP_MS}u; }`,
    `    else if (_dfWantPlay_${id} != _dfLastPlay_${id}) { _dfSend(_dfSerial_${id}, _dfWantPlay_${id} ? 0x12 : 0x0E, _dfWantPlay_${id} ? _dfTrack_${id} : 0); _dfLastPlay_${id} = _dfWantPlay_${id}; _dfNextMs_${id} = millis() + ${DFPLAYER_COMMAND_GAP_MS}u; }`,
    '  }',
    `  bool ${emit.playingVar} = _dfReady_${id} && digitalRead(${emit.busyPin}) == LOW;`,
    '#else',
    `  bool ${emit.playingVar} = false;`,
    '#endif',
  ]
}
