/**
 * The safety notice for Build Diagram. Its wiring, fusing and power figures go
 * to people who will build from them, so the first visit on a machine asks the
 * user to acknowledge that they are guidance, and the panel keeps a short
 * reminder after that.
 */

const ACCEPTED_KEY = 'design-studio-for-fastled-build-safety-accepted'

export const BUILD_SAFETY_TITLE = 'Before you build'

export const BUILD_SAFETY_MESSAGE = [
  'Build Diagram shows wiring, fusing and power figures to help you plan a build. They are guidance, not a certified design, and they can be wrong for your parts, your supply or your installation.',
  'LED projects can carry high currents. A wiring mistake, an undersized wire or fuse, or an overloaded supply can overheat, damage parts or start a fire. Mains (AC) wiring can kill.',
  'Check every figure against your parts’ datasheets and your local electrical rules. If you are not comfortable with any part of the wiring, get help from a qualified person before you power anything up.',
  'You build and power your project at your own risk.',
].join('\n\n')

export const BUILD_SAFETY_REMINDER = 'These figures are guidance, not a certified design. Check them against your parts’ datasheets and local electrical rules, and get help from a qualified person if you are not comfortable with the wiring. Mains (AC) wiring can kill.'

/** One line for the foot of every printed sheet, since pages get separated. */
export const BUILD_SAFETY_PRINT_LINE = 'Guidance only, not a certified design. Check ratings against your parts and local rules; get a qualified person’s help if unsure. Mains wiring can kill. Build at your own risk.'

export function hasAcceptedBuildSafety(): boolean {
  try {
    return localStorage.getItem(ACCEPTED_KEY) === 'true'
  } catch {
    return false
  }
}

export function acceptBuildSafety(): void {
  try {
    localStorage.setItem(ACCEPTED_KEY, 'true')
  } catch {
    // Storage unavailable: the notice asks again next visit, which is the safe side.
  }
}
