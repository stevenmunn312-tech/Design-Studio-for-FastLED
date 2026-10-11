import { controlInputCpp } from '../../codegen/controlInputCpp'
import { powerMonitorLoopCpp } from '../../codegen/peripherals/powerMonitorCpp'
import { presenceSensorLoopCpp } from '../../codegen/peripherals/presenceSensorCpp'
import { lightSensorLoopCpp } from '../../codegen/peripherals/lightSensorCpp'
import { environmentSensorLoopCpp } from '../../codegen/peripherals/environmentSensorCpp'
import { temperatureSensorLoopCpp } from '../../codegen/peripherals/temperatureSensorCpp'
import { distanceSensorLoopCpp, distanceSensorXshutSetupCpp } from '../../codegen/peripherals/distanceSensorCpp'
import { distanceSensorTransport } from '../../state/peripherals/distanceSensor'
import { joystickLoopCpp, joystickSetupCpp } from '../../codegen/peripherals/joystickCpp'
import { keypadLoopCpp, keypadSetupCpp } from '../../codegen/peripherals/keypadCpp'
import { motionVectorLoopCpp } from '../../codegen/peripherals/motionVectorCpp'
import { touchPadLoopCpp } from '../../codegen/peripherals/touchPadCpp'
import { sanitizePin } from '../../codegen/hardwarePins'
import type { NodeEmitters, NodeEmitter } from '../../codegen/emitContext'
import { rtcInputLoopCpp } from '../../codegen/peripherals/rtcInputCpp'

const controlInput: NodeEmitter = ({ node, id, p, ln, pinSetupLines }) => {
  const emit = controlInputCpp(node.data.nodeType, id, p)!
  for (const line of emit.setup) pinSetupLines.add(line)
  for (const line of emit.loop) ln(line)
}

export const INPUT_EMITTERS: NodeEmitters = {
  Audio({ ln }) {
    ln(`  // Audio capability — the selected hardware source is hosted once by the sketch.`)
  },
  ButtonInput: controlInput,
  TouchButtonInput: controlInput,
  ButtonBank: controlInput,
  PotInput: controlInput,
  EncoderInput: controlInput,
  IRRemoteInput({ id, p, opts, irNodes }) {
    if (opts.aliasTerminalBuffer !== false) irNodes.push({ id, pin: sanitizePin(p.pin, 13), buttons: p.buttons, debug: p.debug === true })
  },
  MotionInput({ p, ln, v, pinSetupLines }) {
    // HC-SR501's OUT idles low and goes high on movement — the opposite
    // sense to ButtonInput above, which reads a pulled-up contact. Plain
    // INPUT: the module drives the line both ways, so a pull-up would only
    // fight it.
    const pin = sanitizePin(p.pin, 5)
    pinSetupLines.add(`  pinMode(${pin}, INPUT);`)
    ln(`  bool ${v('motion')} = digitalRead(${pin}) == HIGH;`)
  },
  LightInput({ id, p, ln, v }) {
    for (const line of lightSensorLoopCpp(p, id, v)) ln(line)
  },
  EnvironmentInput({ id, p, ln, v }) {
    for (const line of environmentSensorLoopCpp(p, id, v)) ln(line)
  },
  TemperatureInput({ id, p, ln, v }) {
    for (const line of temperatureSensorLoopCpp(p, id, v)) ln(line)
  },
  MotionVectorInput({ id, p, ln, v }) {
    for (const line of motionVectorLoopCpp(p, id, v)) ln(line)
  },
  TouchPadInput({ id, p, ln, v }) {
    for (const line of touchPadLoopCpp(p, id, v)) ln(line)
  },
  KeypadInput({ id, p, ln, v, pinSetupLines }) {
    for (const line of keypadSetupCpp(p)) pinSetupLines.add(line)
    for (const line of keypadLoopCpp(p, id, v)) ln(line)
  },
  JoystickInput({ p, ln, v, pinSetupLines }) {
    for (const line of joystickSetupCpp(p)) pinSetupLines.add(line)
    for (const line of joystickLoopCpp(p, v)) ln(line)
  },
  DistanceInput({ id, p, ln, v, pinSetupLines }) {
    // Trig is driven and Echo read; setup holds Trig low so a reset never fires a stray pulse.
    // An I2C sensor does not start Wire here: the sketch does that once. A wired
    // shutdown pin is held low until this sensor's own boot releases it.
    if (distanceSensorTransport(p.partId) === 'pulse') {
      pinSetupLines.add(`  pinMode(${sanitizePin(p.trigPin, 27)}, OUTPUT); digitalWrite(${sanitizePin(p.trigPin, 27)}, LOW);`)
      pinSetupLines.add(`  pinMode(${sanitizePin(p.echoPin, 26)}, INPUT);`)
    } else {
      for (const line of distanceSensorXshutSetupCpp(p)) pinSetupLines.add(line)
    }
    for (const line of distanceSensorLoopCpp(p, id, v)) ln(line)
  },
  PowerMonitorInput({ p, ln, v }) {
    for (const line of powerMonitorLoopCpp(p, v)) ln(line)
  },
  PresenceInput({ ln, v }) {
    for (const line of presenceSensorLoopCpp(v)) ln(line)
  },
  DMXInput({ id, p, ln, intProp, setupLines, globalLines }) {
    const inputMode = String(p.inputMode ?? 'Art-Net')
    const universe = intProp(p.universe, 0, 0, 32767)
    globalLines.push(`uint8_t _dmxData_${id}[512] = {0};`)
    globalLines.push(`bool _dmxValid_${id} = false, _dmxLive_${id} = false;`)
    globalLines.push(`float _dmxPacketRate_${id} = 0.0f;`)
    globalLines.push(`uint32_t _dmxLastPacketMs_${id} = 0;`)

    if (inputMode === 'DMX512') {
      const dmxPort = intProp(p.dmxPort, 1, 1, 2)
      const txPin = sanitizePin(p.dmxTxPin, 17)
      const rxPin = sanitizePin(p.dmxRxPin, 16)
      const enPin = sanitizePin(p.dmxEnablePin, 21)
      globalLines.push(`#if defined(ESP32)`)
      globalLines.push(`static dmx_port_t _dmxPort_${id} = (dmx_port_t)${dmxPort};`)
      globalLines.push(`#endif`)
      setupLines.push(`#if defined(ESP32)`)
      setupLines.push(`  dmx_config_t _dmxConfig_${id} = DMX_CONFIG_DEFAULT;`)
      setupLines.push(`  dmx_personality_t _dmxPersonality_${id}[] = { {1, "Studio"} };`)
      setupLines.push(`  dmx_driver_install(_dmxPort_${id}, &_dmxConfig_${id}, _dmxPersonality_${id}, 1);`)
      setupLines.push(`  dmx_set_pin(_dmxPort_${id}, ${txPin}, ${rxPin}, ${enPin});`)
      setupLines.push(`#endif`)
      ln(`#if defined(ESP32)`)
      ln(`  dmx_packet_t _dmxPacket_${id};`)
      ln(`  if (dmx_receive(_dmxPort_${id}, &_dmxPacket_${id}, DMX_TIMEOUT_TICK)) {`)
      ln(`    if (!_dmxPacket_${id}.err) {`)
      ln(`      uint8_t _dmxRaw_${id}[DMX_PACKET_SIZE] = {0};`)
      ln(`      dmx_read(_dmxPort_${id}, _dmxRaw_${id}, _dmxPacket_${id}.size);`)
      ln(`      uint16_t _dmxSlots_${id} = (uint16_t)min<int>(max(0, (int)_dmxPacket_${id}.size - 1), 512);`)
      ln(`      memset(_dmxData_${id}, 0, 512);`)
      ln(`      if (_dmxSlots_${id} > 0) memcpy(_dmxData_${id}, _dmxRaw_${id} + 1, _dmxSlots_${id});`)
      ln(`      uint32_t _dmxNow_${id} = millis();`)
      ln(`      if (_dmxLastPacketMs_${id}) _dmxPacketRate_${id} = 1000.0f / max(1u, _dmxNow_${id} - _dmxLastPacketMs_${id});`)
      ln(`      _dmxLastPacketMs_${id} = _dmxNow_${id};`)
      ln(`      _dmxValid_${id} = true;`)
      ln(`      _dmxLive_${id} = true;`)
      ln(`    }`)
      ln(`  } else if (_dmxLastPacketMs_${id} && millis() - _dmxLastPacketMs_${id} > 1000u) {`)
      ln(`    _dmxLive_${id} = false;`)
      ln(`  }`)
      ln(`#else`)
      ln(`  _dmxValid_${id} = false;`)
      ln(`  _dmxLive_${id} = false;`)
      ln(`  _dmxPacketRate_${id} = 0.0f;`)
      ln(`#endif`)
    } else {
      const port = intProp(p.previewPort, 6454, 1, 65535)
      globalLines.push(`#if FLS_NET_SUPPORTED`)
      globalLines.push(`WiFiUDP _artnetUdp_${id};`)
      globalLines.push(`#endif`)
      setupLines.push(`#if FLS_NET_SUPPORTED`)
      setupLines.push(`  _artnetUdp_${id}.begin(${port});`)
      setupLines.push(`#endif`)
      ln(`  _netEnsureConnected();`)
      ln(`#if FLS_NET_SUPPORTED`)
      ln(`  if (_netConnected()) {`)
      ln(`    int _artPkt_${id} = _artnetUdp_${id}.parsePacket();`)
      ln(`    while (_artPkt_${id} > 0) {`)
      ln(`      uint8_t _artBuf_${id}[530] = {0};`)
      ln(`      int _artLen_${id} = _artnetUdp_${id}.read(_artBuf_${id}, sizeof(_artBuf_${id}));`)
      ln(`      if (_artLen_${id} >= 18 && memcmp(_artBuf_${id}, "Art-Net\\0", 8) == 0) {`)
      ln(`        uint16_t _artOp_${id} = (uint16_t)_artBuf_${id}[8] | ((uint16_t)_artBuf_${id}[9] << 8);`)
      ln(`        uint16_t _artUni_${id} = (uint16_t)_artBuf_${id}[14] | ((uint16_t)_artBuf_${id}[15] << 8);`)
      ln(`        uint16_t _artCount_${id} = ((uint16_t)_artBuf_${id}[16] << 8) | (uint16_t)_artBuf_${id}[17];`)
      ln(`        if (_artOp_${id} == 0x5000u && _artUni_${id} == ${universe}) {`)
      ln(`          uint16_t _artSlots_${id} = min<uint16_t>(_artCount_${id}, 512u);`)
      ln(`          if (18 + (int)_artSlots_${id} <= _artLen_${id}) {`)
      ln(`            memset(_dmxData_${id}, 0, 512);`)
      ln(`            memcpy(_dmxData_${id}, _artBuf_${id} + 18, _artSlots_${id});`)
      ln(`            uint32_t _artNow_${id} = millis();`)
      ln(`            if (_dmxLastPacketMs_${id}) _dmxPacketRate_${id} = 1000.0f / max(1u, _artNow_${id} - _dmxLastPacketMs_${id});`)
      ln(`            _dmxLastPacketMs_${id} = _artNow_${id};`)
      ln(`            _dmxValid_${id} = true;`)
      ln(`            _dmxLive_${id} = true;`)
      ln(`          }`)
      ln(`        }`)
      ln(`      }`)
      ln(`      _artPkt_${id} = _artnetUdp_${id}.parsePacket();`)
      ln(`    }`)
      ln(`  }`)
      ln(`  if (_dmxLastPacketMs_${id} && millis() - _dmxLastPacketMs_${id} > 2000u) _dmxLive_${id} = false;`)
      ln(`#else`)
      ln(`  _dmxValid_${id} = false;`)
      ln(`  _dmxLive_${id} = false;`)
      ln(`  _dmxPacketRate_${id} = 0.0f;`)
      ln(`#endif`)
    }
  },
  RTCInput({ id, p, ln, v }) {
    rtcInputLoopCpp(id, p, v).forEach(ln)
  },
  // Web MIDI has no embedded-hardware equivalent — preview-only, so
  // firmware just sees the idle default.
  MidiInput({ ln, v }) {
    ln(`  float ${v('note')} = 0.0f; bool ${v('gate')} = false; float ${v('cc')} = 0.0f;`)
  },
}
