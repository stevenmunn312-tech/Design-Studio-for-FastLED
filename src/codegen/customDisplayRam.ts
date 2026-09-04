import { DISPLAY_DOCUMENT_LIMITS, type DisplayDocument } from '../state/displayDocument'
import { tftControllerForProps } from '../state/nodeLibrary'
import { asTftRotation, TFT_CONTROLLERS } from '../state/tftSurface'
import { CUSTOM_DISPLAY_PANEL_RAM_BYTES, customDisplayPanelBufferPixels } from './customDisplayPanelCpp'
import { CUSTOM_DISPLAY_WIDGET_RAM_BYTES } from './customDisplayLvglCpp'

/** Per-screen static RAM, excluding the one shared LVGL heap. Hardware owns
 * the mounted geometry; a stale document size must not price a different buffer.
 * Missing documents reserve the maximum cache array until validation repairs
 * them. Fonts and baked image/thumbnail bytes stay in flash, not internal RAM. */
export function customDisplayRamBytes(props: Record<string, unknown>, document?: DisplayDocument): number {
  const controller = tftControllerForProps(props) ?? TFT_CONTROLLERS.ST7789V
  const pixels = customDisplayPanelBufferPixels(controller, asTftRotation(props.tftRotation))
  const widgets = Math.max(1, document?.widgets.length ?? DISPLAY_DOCUMENT_LIMITS.widgetsPerDocument)
  return CUSTOM_DISPLAY_PANEL_RAM_BYTES + pixels * 2 + widgets * CUSTOM_DISPLAY_WIDGET_RAM_BYTES
}
