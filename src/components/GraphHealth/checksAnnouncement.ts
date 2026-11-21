/** The Checks summary as one spoken sentence. */
export function checksAnnouncement(errors: number, warnings: number, worst?: string): string {
  if (errors === 0 && warnings === 0) return 'Checks: all good.'
  const parts = [
    errors > 0 ? `${errors} ${errors === 1 ? 'problem blocks' : 'problems block'} upload` : '',
    warnings > 0 ? `${warnings} suggestion${warnings === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  return `Checks: ${parts.join(', ')}.${worst ? ` ${worst}.` : ''}`
}
