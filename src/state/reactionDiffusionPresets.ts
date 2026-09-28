/**
 * Named Gray-Scott feed/kill pairs for Reaction Diffusion. The preview and the
 * generator both resolve through `reactionDiffusionRates`, so a preset can
 * never mean one pair in the browser and another on the controller.
 *
 * The regimes are Pearson's, but the pairs are tuned for this node's solver
 * rather than copied from the usual tables. It diffuses at 0.16 and 0.08 per
 * step, several times slower than Karl Sims' 1.0 and 0.5, which moves every
 * regime boundary toward lower feed: the familiar coral pair (0.0545, 0.062)
 * only holds its starting square here. Each pair was chosen by sweeping feed
 * and kill at 16×16, 32×32 and 64×64 and keeping the one that shows its
 * regime at all three sizes within about ten seconds at the default speed.
 */
export const REACTION_DIFFUSION_PRESETS = ['custom', 'spots', 'stripes', 'worms', 'coral', 'mitosis'] as const

export type ReactionDiffusionPreset = typeof REACTION_DIFFUSION_PRESETS[number]

export const REACTION_DIFFUSION_RATES: Readonly<Record<Exclude<ReactionDiffusionPreset, 'custom'>, { feed: number; kill: number }>> = {
  spots: { feed: 0.025, kill: 0.06 },
  stripes: { feed: 0.02, kill: 0.05 },
  worms: { feed: 0.022, kill: 0.053 },
  coral: { feed: 0.04, kill: 0.0625 },
  mitosis: { feed: 0.028, kill: 0.062 },
}

/** An unknown or missing preset reads as `custom`, so feed and kill apply. */
export function reactionDiffusionPreset(value: unknown): ReactionDiffusionPreset {
  return typeof value === 'string' && (REACTION_DIFFUSION_PRESETS as readonly string[]).includes(value)
    ? value as ReactionDiffusionPreset
    : 'custom'
}

/**
 * The feed/kill pair a preset fixes, or `null` for `custom`, where the node's
 * own knobs (and any wires into them) apply.
 */
export function reactionDiffusionRates(value: unknown): { feed: number; kill: number } | null {
  const preset = reactionDiffusionPreset(value)
  return preset === 'custom' ? null : REACTION_DIFFUSION_RATES[preset]
}
