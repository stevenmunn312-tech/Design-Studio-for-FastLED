import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_WEB_REMOTE_CONTROLS,
  WEB_REMOTE_CONTROL_TYPES,
  appendWebRemoteControl,
  fqbnHasWifi,
  normalizeWebRemoteControls,
  parseWebRemotePortId,
  patchWebRemoteControl,
  webRemoteControlDataType,
  webRemoteControlOutput,
  webRemoteMdnsName,
  webRemoteOutputs,
  webRemotePortId,
  webRemoteQuantize,
  webRemoteStartState,
} from '../webRemote'
import {
  readWebRemoteControl,
  resetWebRemoteRuntime,
  sampleWebRemoteControl,
  subscribeWebRemote,
  writeWebRemoteControl,
} from '../webRemoteRuntime'
import { escapeHtml, webRemotePageHtml } from '../webRemotePage'
import {
  TOUCH_CONTROL_ADD_DATA_TYPE,
  TOUCH_CONTROL_ADD_HANDLE,
  displayControlOutput,
  displayControlStartValue,
  displayWidgetDefinition,
} from '../../displays/displayRegistry'

/*
 * The Web Remote's control list: what a saved list may hold, the ports it
 * derives, and the values its controls start at and report, held to the
 * screen widgets they borrow their meaning from.
 */

describe('normalizeWebRemoteControls', () => {
  it('keeps known control types with unique, port-safe ids and bounded labels', () => {
    const controls = normalizeWebRemoteControls([
      { id: 'Speed!', type: 'Slider', label: '  Speed  ', properties: { min: 0, max: 4, step: 0.5 } },
      { id: 'speed', type: 'Slider', label: 'Second' },
      { id: 'x', type: 'Image/Icon', label: 'Not a control' },
      { id: 'y', type: 'Text Box', label: 'Unknown type' },
      'junk',
      null,
      { type: 'Toggle', label: 'x'.repeat(200) },
    ])
    expect(controls.map((control) => control.id)).toEqual(['speed', 'speed-2', 'toggle'])
    expect(controls[0].label).toBe('Speed')
    expect(controls[2].label).toHaveLength(40)
  })

  it('bounds the list, strips control characters and falls back to a label', () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ id: `b${index}`, type: 'Button', label: `B${index}` }))
    expect(normalizeWebRemoteControls(many)).toHaveLength(MAX_WEB_REMOTE_CONTROLS)
    const [control] = normalizeWebRemoteControls([{ id: 'a', type: 'Button', label: '\u0000\u001f' }])
    expect(control.label).toBe('Button 1')
    expect(normalizeWebRemoteControls('not a list')).toEqual([])
  })

  it('keeps only the properties its widget declares, bounded by the widget inspector', () => {
    const [slider, choice] = normalizeWebRemoteControls([
      { id: 's', type: 'Slider', label: 'S', properties: { min: -5e9, max: 2, step: 0.1, orientation: 'vertical', assetId: 'x', controlRole: 'volume', evil: '<script>' } },
      { id: 'c', type: 'Choice Strip', label: 'C', properties: { options: 'Calm, Lively, Peak', initial: 9 } },
    ])
    expect(slider.properties).toEqual({ min: -1000000, max: 2, step: 0.1 })
    expect(choice.properties).toEqual({ options: 'Calm, Lively, Peak', initial: 5 })
  })
})

describe('ports', () => {
  const controls = [
    { id: 'go', type: 'Button', label: 'Go' },
    { id: 'on', type: 'Toggle', label: 'On' },
    { id: 'level', type: 'Slider', label: 'Level' },
    { id: 'steps', type: 'Step Control', label: 'Steps' },
    { id: 'mood', type: 'Choice Strip', label: 'Mood' },
    { id: 'tint', type: 'Colour Picker', label: 'Tint' },
  ]

  it('derives one output per control from its id, typed by its widget, then the invitation', () => {
    expect(webRemoteOutputs(controls)).toEqual([
      { id: 'remote:go', label: 'Go', dataType: 'bool' },
      { id: 'remote:on', label: 'On', dataType: 'bool' },
      { id: 'remote:level', label: 'Level', dataType: 'float' },
      { id: 'remote:steps', label: 'Steps', dataType: 'float' },
      { id: 'remote:mood', label: 'Mood', dataType: 'float' },
      { id: 'remote:tint', label: 'Tint', dataType: 'color' },
      { id: TOUCH_CONTROL_ADD_HANDLE, label: 'Add control…', dataType: TOUCH_CONTROL_ADD_DATA_TYPE },
    ])
    expect(webRemoteOutputs(controls, false)).toHaveLength(controls.length)
  })

  it('keeps a port id when the label changes, and reads it back', () => {
    const renamed = patchWebRemoteControl(controls, 'level', { label: 'Brightness' })
    expect(webRemoteOutputs(renamed)[2]).toMatchObject({ id: 'remote:level', label: 'Brightness' })
    expect(parseWebRemotePortId(webRemotePortId('level'))).toBe('level')
    expect(parseWebRemotePortId('widget:level:out')).toBeNull()
    expect(parseWebRemotePortId('remote:Bad Id')).toBeNull()
  })

  it('drops the invitation once the remote is full', () => {
    const full = Array.from({ length: MAX_WEB_REMOTE_CONTROLS }, (_, index) => ({ id: `b${index}`, type: 'Button', label: 'B' }))
    expect(webRemoteOutputs(full).some((port) => port.id === TOUCH_CONTROL_ADD_HANDLE)).toBe(false)
    expect(appendWebRemoteControl(full, 'Toggle').added).toBeNull()
  })

  it('reads every control type as its own widget does', () => {
    for (const type of WEB_REMOTE_CONTROL_TYPES) {
      const role = displayWidgetDefinition(type).portRoles.find((port) => port.direction === 'output')
      expect(webRemoteControlDataType(type), type).toBe(role?.dataType)
    }
  })
})

describe('values', () => {
  it('starts each control where the screen widget starts', () => {
    const [slider, choice, picker, button] = normalizeWebRemoteControls([
      { id: 's', type: 'Slider', label: 'S', properties: { min: 2, max: 8, step: 1, initial: 5 } },
      { id: 'c', type: 'Choice Strip', label: 'C', properties: { options: 'A, B, C', initial: 2 } },
      { id: 'p', type: 'Colour Picker', label: 'P', properties: { initial: 120, saturation: 1, brightness: 0.5 } },
      { id: 'b', type: 'Button', label: 'B' },
    ])
    expect(webRemoteStartState(slider)).toBe(displayControlStartValue(slider))
    expect(webRemoteStartState(choice)).toBe(2)
    expect(webRemoteStartState(button)).toBe(false)
    expect(webRemoteControlOutput(picker, webRemoteStartState(picker))).toEqual(displayControlOutput(picker, 120))
    expect(webRemoteControlOutput(picker, 120)).toEqual({ r: 0, g: 128, b: 0 })
  })

  it('clamps and snaps a value from the page into the control range', () => {
    const [slider, step, choice, picker, toggle] = normalizeWebRemoteControls([
      { id: 's', type: 'Slider', label: 'S', properties: { min: 0, max: 1, step: 0.1 } },
      { id: 't', type: 'Step Control', label: 'T', properties: { min: 1, max: 12, step: 1 } },
      { id: 'c', type: 'Choice Strip', label: 'C', properties: { options: 'A, B, C' } },
      { id: 'p', type: 'Colour Picker', label: 'P' },
      { id: 'g', type: 'Toggle', label: 'G' },
    ])
    expect(webRemoteQuantize(slider, 0.34)).toBe(0.3)
    expect(webRemoteQuantize(slider, 7)).toBe(1)
    expect(webRemoteQuantize(slider, 'nonsense')).toBe(0)
    expect(webRemoteQuantize(step, 0)).toBe(1)
    expect(webRemoteQuantize(step, 6.6)).toBe(7)
    expect(webRemoteQuantize(choice, 9)).toBe(2)
    expect(webRemoteQuantize(picker, 400)).toBe(360)
    expect(webRemoteQuantize(toggle, 0.7)).toBe(true)
    expect(webRemoteQuantize(toggle, Number.NaN)).toBe(false)
  })

  it('names the board for mDNS from its hostname', () => {
    expect(webRemoteMdnsName('Shelf Lights!')).toBe('shelf-lights')
    expect(webRemoteMdnsName('')).toBe('fastled-remote')
    expect(webRemoteMdnsName('a'.repeat(50))).toHaveLength(32)
  })

  it('knows which board targets have Wi-Fi', () => {
    expect(fqbnHasWifi('esp32:esp32:esp32s3')).toBe(true)
    expect(fqbnHasWifi('esp8266:esp8266:nodemcuv2')).toBe(true)
    expect(fqbnHasWifi('esp32:esp32:esp32h2')).toBe(false)
    expect(fqbnHasWifi('esp32:esp32:esp32p4')).toBe(false)
    expect(fqbnHasWifi('arduino:avr:uno')).toBe(false)
    expect(fqbnHasWifi('rp2040:rp2040:rpipico')).toBe(false)
  })
})

describe('webRemoteRuntime', () => {
  afterEach(() => resetWebRemoteRuntime())

  it('holds a quick tap true for exactly one sample', () => {
    writeWebRemoteControl('n', 'b', true)
    writeWebRemoteControl('n', 'b', false)
    expect(sampleWebRemoteControl('n', 'b', false)).toBe(true)
    expect(sampleWebRemoteControl('n', 'b', false)).toBe(false)
  })

  it('stays true while held and keeps a set value', () => {
    writeWebRemoteControl('n', 'b', true)
    expect(sampleWebRemoteControl('n', 'b', false)).toBe(true)
    expect(sampleWebRemoteControl('n', 'b', false)).toBe(true)
    writeWebRemoteControl('n', 's', 0.4)
    expect(sampleWebRemoteControl('n', 's', 0)).toBe(0.4)
    expect(readWebRemoteControl('n', 'missing', 0.25)).toBe(0.25)
  })

  it('notifies readers only when a value changes', () => {
    let calls = 0
    const stop = subscribeWebRemote('n', () => { calls += 1 })
    writeWebRemoteControl('n', 's', 0.5)
    writeWebRemoteControl('n', 's', 0.5)
    writeWebRemoteControl('n', 's', 0.6)
    stop()
    writeWebRemoteControl('n', 's', 0.7)
    expect(calls).toBe(2)
  })
})

describe('webRemotePageHtml', () => {
  const hostile = '</script><img src=x onerror=alert(1)> & "quoted" \'single\''
  const controls = normalizeWebRemoteControls([
    { id: 'go', type: 'Button', label: hostile, properties: { text: hostile } },
    { id: 'on', type: 'Toggle', label: 'On', properties: { offLabel: '<b>', onLabel: '"x"' } },
    { id: 'mood', type: 'Choice Strip', label: 'Mood', properties: { options: '<i>, ok' } },
    { id: 'level', type: 'Slider', label: 'Level', properties: { min: 0, max: 2, step: 0.25, initial: 0.5 } },
    { id: 'tint', type: 'Colour Picker', label: 'Tint' },
  ])
  const page = webRemotePageHtml(hostile, controls)

  it('escapes everything an author typed', () => {
    expect(page).not.toContain('<img')
    expect(page).not.toContain('<b>')
    expect(page).not.toContain('<i>')
    expect(page.match(/<\/script>/g)).toHaveLength(1)
    expect(page).toContain(`<h1>${escapeHtml(hostile.slice(0, 40))}</h1>`)
    expect(page).toContain('data-off="&lt;b&gt;" data-on="&quot;x&quot;"')
  })

  it('is phone-first and self-contained', () => {
    expect(page).toContain('<meta name="viewport" content="width=device-width')
    expect(page).not.toMatch(/https?:\/\//)
    expect(page).toContain('min-height:48px')
    expect(page).toContain(`<input id="c3" type="range" min="0" max="2" step="0.25" value="0.5">`)
  })

  it('gives the same bytes for the same controls, so preview and board cannot drift', () => {
    expect(webRemotePageHtml(hostile, controls)).toBe(page)
  })

  it('posts to the studio inside a srcdoc frame and to the board otherwise', () => {
    expect(page).toContain("location.protocol==='about:'")
    expect(page).toContain("fetch('/set'")
    expect(page).toContain("fetch('/s'")
    expect(page).toContain("parent.postMessage({fls:'wr',op:'set'")
  })
})

describe('Text Entry controls', () => {
  const [entry] = normalizeWebRemoteControls([
    { id: 'name', type: 'Text Entry', label: 'Name', properties: { text: 'Hello', placeholder: '<hint>', maxLength: 8, fontSize: 30 } },
  ])

  it('keeps its text, hint and length and outputs a string', () => {
    expect(entry.properties).toEqual({ text: 'Hello', placeholder: '<hint>', maxLength: 8 })
    expect(webRemoteControlDataType('Text Entry')).toBe('string')
    expect(webRemoteStartState(entry)).toBe('Hello')
    expect(webRemoteControlOutput(entry, 'Hi there')).toBe('Hi there')
  })

  it('holds text to the field: characters, one line, whole characters', () => {
    expect(webRemoteQuantize(entry, 'a\r\n\nb')).toBe('a b')
    expect(webRemoteQuantize(entry, 'abcdefghijk')).toBe('abcdefgh')
    expect(webRemoteQuantize(entry, 42)).toBe('')
    const [wide] = normalizeWebRemoteControls([{ id: 'w', type: 'Text Entry', label: 'W', properties: { maxLength: 63 } }])
    // 25 three-byte characters are 75 bytes; 21 of them fit the 63-byte budget.
    expect(webRemoteQuantize(wide, '€'.repeat(25))).toBe('€'.repeat(21))
  })

  it('draws a confirmable field with its text escaped', () => {
    const [hostile] = normalizeWebRemoteControls([
      { id: 'n', type: 'Text Entry', label: 'Name', properties: { text: '"><b>x', placeholder: '<i>' } },
    ])
    const page = webRemotePageHtml('T', [hostile])
    expect(page).toContain('value="&quot;&gt;&lt;b&gt;x"')
    expect(page).toContain('placeholder="&lt;i&gt;"')
    expect(page).toContain('<form class="x">')
    expect(page).toContain('enterkeyhint="send"')
    expect(page).not.toContain('<b>x')
    expect(page).toContain("body:'i='+i+'&v='+encodeURIComponent(v)")
  })
})
