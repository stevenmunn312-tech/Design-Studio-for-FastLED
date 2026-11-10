// The one font every fixed display layout is drawn in.
//
// Fixed layouts are measured against a font: row pitch, how many characters a
// field holds, where a right-aligned reading starts. So a fixed display has no
// Font property — a second font would need every layout measured a second
// time. A panel that wants a choice of type mounts a screen design instead.
//
// 5x8 rather than the 3x5 the LED Text node defaults to: it has lower case, so
// a track title or a pattern name reads as it was written, and a 128x64 OLED
// still holds 20 characters a row and six rows.

import { TEXT_FONTS, type BitmapFont } from '../../nodes/shared/font'

export const DISPLAY_FONT: BitmapFont = TEXT_FONTS['5x8']
