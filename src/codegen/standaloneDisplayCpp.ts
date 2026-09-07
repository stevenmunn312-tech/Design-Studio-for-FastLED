// Fixed displays shared by the two intentionally small sketches: wiring
// diagnostics and the serial frame receiver.  Neither has a graph runtime,
// but that is not a reason to drop configured hardware on the floor.  These
// emit the same drivers, declarations, setup and conditional refresh paths as
// the normal/show/player generators, with the fixed layouts' honest waiting
// state when no runtime source exists.

import type { StudioNode } from '../state/graphStore'
import { playerDisplaysFromGraph } from './playerDisplays'
import {
  INFO_DISPLAY_CPP_FORWARD, infoDisplayGlobalCpp, infoDisplayHelpersCpp,
  infoDisplayLoopCpp, infoDisplaySetupCpp, type InfoDisplayEmit,
} from './infoDisplayCpp'
import {
  SEGMENT_DISPLAY_CPP_FORWARD, SEGMENT_DISPLAY_CPP_HELPERS,
  segmentDisplayGlobalCpp, segmentDisplayLoopCpp, segmentDisplaySetupCpp,
  type SegmentDisplayEmit,
} from './segmentDisplayCpp'
import {
  TFT_DISPLAY_CPP_FORWARD, TFT_DISPLAY_CPP_INCLUDES,
  tftDisplayGlobalCpp, tftDisplayHelpersCpp, tftDisplayLoopCpp, tftDisplaySetupCpp,
  type TftDisplayEmit,
} from './tftDisplayCpp'
import {
  TFT_TOUCH_CPP_HELPERS, tftTouchGlobalCpp, tftTouchServiceCpp, tftTouchSetupCpp,
  type TftTouchEmit,
} from './tftTouchCpp'

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_')

/** Display fragments for sketches that own hardware but no display signal graph. */
export interface StandaloneDisplayEmission {
  includes: string[]
  forwards: string[]
  helpers: string[]
  setup: string[]
  /** Touch sampling comes before paint so the Diagnostics layout shows this pass's point. */
  loop: string[]
}

/**
 * Emit every configured fixed display for a standalone sketch.
 *
 * `playerDisplaysFromGraph` remains the one place that resolves part identity,
 * transports, controller geometry and disabled state. With no edges, OLEDs
 * and segment modules deliberately render their waiting state; a configured
 * TFT keeps its chosen fixed layout, including the self-contained Diagnostics
 * touch test.
 */
export function standaloneDisplaysCpp(nodes: StudioNode[]): StandaloneDisplayEmission {
  const displays = playerDisplaysFromGraph(nodes as never, [] as never)
  const hasInfo = displays.info.length > 0
  const hasSegment = displays.segment.length > 0
  const hasTft = displays.tft.length > 0

  const info: InfoDisplayEmit[] = displays.info.map((display) => ({
    id: safeId(display.id), controller: display.controller, transport: display.transport,
    csPin: display.csPin, dcPin: display.dcPin, resetPin: display.resetPin,
    sckPin: display.sckPin, mosiPin: display.mosiPin, address: display.address,
    columnOffset: display.columnOffset, segmentRemap: display.segmentRemap,
    comScan: display.comScan, layout: display.layout, width: display.width, height: display.height,
    enabledExpr: display.enabled ? 'true' : 'false',
    titleExpr: null, line2Expr: null, valueExpr: '0.0f', progressExpr: '0.0f',
    playingExpr: 'false', volumeExpr: '0.0f', durationExpr: '0.0f', dateTimeExpr: null,
  }))
  const segment: SegmentDisplayEmit[] = displays.segment.map((display) => ({
    id: safeId(display.id), controller: display.controller, digits: display.digits,
    clkPin: display.clkPin, dataPin: display.dataPin, csPin: display.csPin,
    brightness: display.brightness, mode: display.mode, showColon: display.showColon,
    valueExpr: null, dateTimeExpr: null, enabledExpr: display.enabled ? 'true' : 'false',
  }))
  const tft: TftDisplayEmit[] = displays.tft.map((display) => ({
    id: safeId(display.id), controller: display.controller, rotation: display.rotation,
    layout: display.layout, csPin: display.csPin, dcPin: display.dcPin,
    resetPin: display.resetPin, sckPin: display.sckPin, mosiPin: display.mosiPin,
    backlightPin: display.backlightPin, enabledExpr: display.enabled ? 'true' : 'false',
    dateTimeExpr: null,
    titleExpr: null, artistExpr: null, patternNameExpr: null,
    elapsedExpr: '0.0f', durationExpr: '0.0f', progressExpr: '0.0f',
    playingExpr: 'false', volumeExpr: '0.0f', patternIndexExpr: '0', patternCountExpr: '0',
    browsingExpr: 'false', highlightNameExpr: null, highlightIndexExpr: '0.0f',
    diagnosticTouch: display.layout === 'Diagnostics' && display.touch !== null,
  }))
  const touch: TftTouchEmit[] = displays.tft
    .filter((display) => display.touch !== null)
    .map((display) => ({
      id: safeId(display.id), controller: display.controller, rotation: display.rotation,
      layout: display.layout, enabled: display.enabled, touch: display.touch!,
    }))
  const i2c = displays.info.filter((display) => display.transport === 'i2c')

  return {
    // The OLED helper contains a compiled Wire branch even for SPI panels.
    includes: [
      ...(hasInfo ? ['#include <Wire.h>'] : []),
      ...(hasTft ? [TFT_DISPLAY_CPP_INCLUDES] : []),
    ],
    forwards: [
      ...(hasInfo ? [INFO_DISPLAY_CPP_FORWARD] : []),
      ...(hasSegment ? [SEGMENT_DISPLAY_CPP_FORWARD] : []),
      ...(hasTft ? [TFT_DISPLAY_CPP_FORWARD] : []),
    ],
    helpers: [
      ...(hasInfo ? [infoDisplayHelpersCpp(), info.map(infoDisplayGlobalCpp).join('\n')] : []),
      ...(hasSegment ? [SEGMENT_DISPLAY_CPP_HELPERS, segment.map(segmentDisplayGlobalCpp).join('\n')] : []),
      ...(hasTft ? [tftDisplayHelpersCpp(), tft.map(tftDisplayGlobalCpp).join('\n')] : []),
      ...(touch.length > 0 ? [TFT_TOUCH_CPP_HELPERS, touch.map(tftTouchGlobalCpp).join('\n')] : []),
    ],
    setup: [
      ...(i2c.length > 0 ? [`  Wire.begin(${i2c[0].sdaPin}, ${i2c[0].sclPin});  // I2C displays`] : []),
      ...info.flatMap(infoDisplaySetupCpp),
      ...segment.flatMap(segmentDisplaySetupCpp),
      ...tft.flatMap(tftDisplaySetupCpp),
      ...touch.flatMap(tftTouchSetupCpp),
    ],
    loop: [
      ...touch.flatMap((display) => tftTouchServiceCpp(display)),
      ...info.flatMap(infoDisplayLoopCpp),
      ...segment.flatMap(segmentDisplayLoopCpp),
      ...tft.flatMap(tftDisplayLoopCpp),
    ],
  }
}
