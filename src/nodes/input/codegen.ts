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
import { dmxListenPort, sacnMulticastGroup } from '../../state/peripherals/dmxTransceiver'
import { MIDI_BAUD, midiChannel, midiUsesUart } from '../../state/peripherals/midiSource'

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
    } else if (inputMode === 'sACN') {
      // E1.31 data packets: ACN root (vector 4), framing (vector 2) with the
      // universe at 113, DMP property count at 123 (start code included),
      // start code 125, channels from 126. Joins the universe's multicast
      // group on ESP32, where senders usually multicast; a unicast sender
      // reaches the plain socket either way.
      const port = dmxListenPort(p)
      const group = sacnMulticastGroup(universe)
      globalLines.push(`#if FLS_NET_SUPPORTED`)
      globalLines.push(`WiFiUDP _sacnUdp_${id};`)
      globalLines.push(`#endif`)
      setupLines.push(`#if FLS_NET_SUPPORTED && defined(ESP32)`)
      setupLines.push(`  _sacnUdp_${id}.beginMulticast(IPAddress(${group.join(', ')}), ${port});`)
      setupLines.push(`#elif FLS_NET_SUPPORTED`)
      setupLines.push(`  _sacnUdp_${id}.begin(${port});`)
      setupLines.push(`#endif`)
      ln(`  _netEnsureConnected();`)
      ln(`#if FLS_NET_SUPPORTED`)
      ln(`  if (_netConnected()) {`)
      ln(`    int _sacnPkt_${id} = _sacnUdp_${id}.parsePacket();`)
      ln(`    while (_sacnPkt_${id} > 0) {`)
      ln(`      uint8_t _sacnBuf_${id}[640] = {0};`)
      ln(`      int _sacnLen_${id} = _sacnUdp_${id}.read(_sacnBuf_${id}, sizeof(_sacnBuf_${id}));`)
      ln(`      if (_sacnLen_${id} >= 126 && memcmp(_sacnBuf_${id} + 4, "ASC-E1.17\\0\\0\\0", 12) == 0`)
      ln(`          && _sacnBuf_${id}[21] == 4 && _sacnBuf_${id}[43] == 2 && _sacnBuf_${id}[125] == 0) {`)
      ln(`        uint16_t _sacnUni_${id} = ((uint16_t)_sacnBuf_${id}[113] << 8) | (uint16_t)_sacnBuf_${id}[114];`)
      ln(`        int _sacnCount_${id} = (int)(((uint16_t)_sacnBuf_${id}[123] << 8) | (uint16_t)_sacnBuf_${id}[124]) - 1;`)
      ln(`        if (_sacnUni_${id} == ${universe} && _sacnCount_${id} >= 0) {`)
      ln(`          uint16_t _sacnSlots_${id} = min<uint16_t>((uint16_t)_sacnCount_${id}, 512u);`)
      ln(`          if (126 + (int)_sacnSlots_${id} <= _sacnLen_${id}) {`)
      ln(`            memset(_dmxData_${id}, 0, 512);`)
      ln(`            memcpy(_dmxData_${id}, _sacnBuf_${id} + 126, _sacnSlots_${id});`)
      ln(`            uint32_t _sacnNow_${id} = millis();`)
      ln(`            if (_dmxLastPacketMs_${id}) _dmxPacketRate_${id} = 1000.0f / max(1u, _sacnNow_${id} - _dmxLastPacketMs_${id});`)
      ln(`            _dmxLastPacketMs_${id} = _sacnNow_${id};`)
      ln(`            _dmxValid_${id} = true;`)
      ln(`            _dmxLive_${id} = true;`)
      ln(`          }`)
      ln(`        }`)
      ln(`      }`)
      ln(`      _sacnPkt_${id} = _sacnUdp_${id}.parsePacket();`)
      ln(`    }`)
      ln(`  }`)
      ln(`  if (_dmxLastPacketMs_${id} && millis() - _dmxLastPacketMs_${id} > 2000u) _dmxLive_${id} = false;`)
      ln(`#else`)
      ln(`  _dmxValid_${id} = false;`)
      ln(`  _dmxLive_${id} = false;`)
      ln(`  _dmxPacketRate_${id} = 0.0f;`)
      ln(`#endif`)
    } else {
      const port = dmxListenPort(p)
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
  // DDP frames into this node's own buffer, which persists between loops, so
  // a frame that arrives as several packets (offset, length) assembles in
  // place and the last complete picture holds until the next one. With
  // several output shapes the first pass drains the socket, so the passes
  // share the one global buffer rather than each keeping its own.
  DdpInput({ id, p, ln, ownBuf, intProp, setupLines, globalLines, nativeMultiRender }) {
    const ob = ownBuf({ persists: !nativeMultiRender })
    const port = intProp(p.previewPort, 4048, 1, 65535)
    globalLines.push(`#if FLS_NET_SUPPORTED`)
    globalLines.push(`WiFiUDP _ddpUdp_${id};`)
    globalLines.push(`#endif`)
    setupLines.push(`#if FLS_NET_SUPPORTED`)
    setupLines.push(`  _ddpUdp_${id}.begin(${port});`)
    setupLines.push(`#endif`)
    ln(`  _netEnsureConnected();`)
    ln(`#if FLS_NET_SUPPORTED`)
    ln(`  if (_netConnected()) {`)
    ln(`    int _ddpPkt_${id} = _ddpUdp_${id}.parsePacket();`)
    ln(`    while (_ddpPkt_${id} > 0) {`)
    ln(`      uint8_t _ddpBuf_${id}[1500];`)
    ln(`      int _ddpLen_${id} = _ddpUdp_${id}.read(_ddpBuf_${id}, sizeof(_ddpBuf_${id}));`)
    ln(`      if (_ddpLen_${id} >= 10 && (_ddpBuf_${id}[0] & 0xC0) == 0x40) {`)
    ln(`        int _ddpHdr_${id} = (_ddpBuf_${id}[0] & 0x10) ? 14 : 10;`)
    ln(`        uint32_t _ddpOff_${id} = ((uint32_t)_ddpBuf_${id}[4] << 24) | ((uint32_t)_ddpBuf_${id}[5] << 16) | ((uint32_t)_ddpBuf_${id}[6] << 8) | (uint32_t)_ddpBuf_${id}[7];`)
    ln(`        int _ddpN_${id} = ((int)_ddpBuf_${id}[8] << 8) | (int)_ddpBuf_${id}[9];`)
    ln(`        if (_ddpHdr_${id} + _ddpN_${id} <= _ddpLen_${id} && _ddpOff_${id} < (uint32_t)NUM_LEDS * 3u) {`)
    ln(`          uint32_t _ddpEnd_${id} = min<uint32_t>(_ddpOff_${id} + (uint32_t)_ddpN_${id}, (uint32_t)NUM_LEDS * 3u);`)
    ln(`          memcpy(((uint8_t*)${ob}) + _ddpOff_${id}, _ddpBuf_${id} + _ddpHdr_${id}, _ddpEnd_${id} - _ddpOff_${id});`)
    ln(`        }`)
    ln(`      }`)
    ln(`      _ddpPkt_${id} = _ddpUdp_${id}.parsePacket();`)
    ln(`    }`)
    ln(`  }`)
    ln(`#else`)
    ln(`  (void)${ob};`)
    ln(`#endif`)
  },
  // Web MIDI never deploys: the outputs rest at their idle defaults. A DIN
  // jack is a UART at 31250 baud, parsed byte by byte with running status:
  // note on/off for the watched key (a note-on at velocity 0 is off) and the
  // watched controller, on one channel or any.
  MidiInput({ id, p, ln, v, intProp, setupLines, globalLines }) {
    if (!midiUsesUart(p)) {
      ln(`  float ${v('note')} = 0.0f; bool ${v('gate')} = false; float ${v('cc')} = 0.0f;  // Web MIDI is preview-only`)
      return
    }
    const uart = intProp(p.midiUart, 1, 1, 2)
    const rxPin = sanitizePin(p.midiRxPin, 16)
    const note = intProp(p.note, 60, 0, 127)
    const cc = intProp(p.cc, 1, 0, 127)
    const channel = midiChannel(p.channel)
    globalLines.push(`#if defined(ESP32)`)
    globalLines.push(`HardwareSerial _midiSerial_${id}(${uart});`)
    globalLines.push(`#endif`)
    globalLines.push(`static float _midiVel_${id} = 0.0f, _midiCc_${id} = 0.0f; static uint8_t _midiStatus_${id} = 0, _midiData_${id}[2], _midiCount_${id} = 0;`)
    setupLines.push(`#if defined(ESP32)`)
    setupLines.push(`  _midiSerial_${id}.begin(${MIDI_BAUD}, SERIAL_8N1, ${rxPin}, -1);  // DIN MIDI in`)
    setupLines.push(`#endif`)
    ln(`#if defined(ESP32)`)
    ln(`  while (_midiSerial_${id}.available() > 0) {`)
    ln(`    uint8_t _b = (uint8_t)_midiSerial_${id}.read();`)
    ln(`    if (_b >= 0xF8) continue;  // real-time messages never disturb running status`)
    ln(`    if (_b & 0x80) { _midiStatus_${id} = _b < 0xF0 ? _b : 0; _midiCount_${id} = 0; continue; }`)
    ln(`    if (!_midiStatus_${id}) continue;`)
    ln(`    _midiData_${id}[_midiCount_${id}++] = _b;`)
    ln(`    uint8_t _kind = _midiStatus_${id} & 0xF0, _ch = (_midiStatus_${id} & 0x0F) + 1;`)
    ln(`    uint8_t _need = (_kind == 0xC0 || _kind == 0xD0) ? 1 : 2;`)
    ln(`    if (_midiCount_${id} < _need) continue;`)
    ln(`    _midiCount_${id} = 0;`)
    ln(`    if (${channel} != 0 && _ch != ${channel}) continue;`)
    ln(`    if ((_kind == 0x90 || _kind == 0x80) && _midiData_${id}[0] == ${note}) _midiVel_${id} = (_kind == 0x90 && _midiData_${id}[1] > 0) ? _midiData_${id}[1] / 127.0f : 0.0f;`)
    ln(`    else if (_kind == 0xB0 && _midiData_${id}[0] == ${cc}) _midiCc_${id} = _midiData_${id}[1] / 127.0f;`)
    ln(`  }`)
    ln(`#endif`)
    ln(`  float ${v('note')} = _midiVel_${id}; bool ${v('gate')} = _midiVel_${id} > 0.0f; float ${v('cc')} = _midiCc_${id};`)
  },
}
