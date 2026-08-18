/**
 * The motion signature a noodle carries per signal family.
 *
 * Shared by `GlowEdge` (the graph canvas) and the hardware view's links, so an
 * audio run between two parts animates exactly like the audio noodle the same
 * connection draws on the canvas. Kept apart from either component because both
 * render it and neither owns it.
 */
export type SignalFamily = 'frame' | 'audio' | 'color' | 'control'

export interface NoodleMotion {
  outerWidth: number
  outerOpacity: number
  midWidth: number
  midOpacity: number
  coreWidth: number
  dash: string
  duration: number
  packetDuration: number
  packetRadii: number[]
}

export function signalFamily(dataType?: string): SignalFamily {
  if (dataType === 'frame') return 'frame'
  if (dataType === 'audio') return 'audio'
  if (dataType === 'color' || dataType === 'palette') return 'color'
  return 'control'
}

export function familyMotion(family: SignalFamily): NoodleMotion {
  switch (family) {
    case 'frame':
      return {
        outerWidth: 16,
        outerOpacity: 0.045,
        midWidth: 8,
        midOpacity: 0.12,
        coreWidth: 2.8,
        dash: '24 18',
        duration: 3.2,
        packetDuration: 2.8,
        packetRadii: [3.4, 2.5, 1.8],
      }
    case 'audio':
      return {
        outerWidth: 15,
        outerOpacity: 0.05,
        midWidth: 7,
        midOpacity: 0.14,
        coreWidth: 2.8,
        dash: '5 10',
        duration: 0.72,
        packetDuration: 0.88,
        packetRadii: [3.5, 2.4],
      }
    case 'color':
      return {
        outerWidth: 14,
        outerOpacity: 0.04,
        midWidth: 7,
        midOpacity: 0.13,
        coreWidth: 2.6,
        dash: '2 14',
        duration: 1.55,
        packetDuration: 1.7,
        packetRadii: [3, 2.1],
      }
    default:
      return {
        outerWidth: 13,
        outerOpacity: 0.035,
        midWidth: 6,
        midOpacity: 0.1,
        coreWidth: 2.3,
        dash: '11 8',
        duration: 1.18,
        packetDuration: 1.42,
        packetRadii: [2.2],
      }
  }
}
