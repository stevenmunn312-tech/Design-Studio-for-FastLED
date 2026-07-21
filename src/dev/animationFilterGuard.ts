// Dev-only guard against a Chromium GPU-memory footgun: a CSS `filter` or
// `backdrop-filter` on an element running an *infinite* animation makes the
// compositor allocate a fresh GPU filter buffer every frame and never reclaim
// it — unbounded GPU/compositor memory growth that crashes the tab and is
// invisible to every JS heap/canvas/texture metric. It cost a very long hunt to
// find once (edges' `.packet`/`.core` glows + the `.fieldScan` backdrop), so
// this warns the moment such a pair exists again. Zero cost in production
// (whole module is gated to DEV and tree-shaken out).

export interface AnimationFilterLeak {
  animation: string
  element: string
  filter: string
}

/** Every infinitely-animated element that also carries a CSS filter (the leak).
 *  Works even in a hidden tab — it reads declared animations + computed style,
 *  no rendering required. Exposed on `window.__scanAnimFilters()` in dev. */
export function findAnimationFilterLeaks(): AnimationFilterLeak[] {
  if (typeof document === 'undefined' || typeof document.getAnimations !== 'function') return []
  const seen = new Set<string>()
  const leaks: AnimationFilterLeak[] = []
  for (const anim of document.getAnimations()) {
    const effect = anim.effect
    if (!(effect instanceof KeyframeEffect)) continue
    const target = effect.target
    if (!(target instanceof Element)) continue
    if (effect.getTiming().iterations !== Infinity) continue
    const style = getComputedStyle(target)
    const filter =
      style.filter && style.filter !== 'none' ? style.filter
      : style.backdropFilter && style.backdropFilter !== 'none' ? `backdrop-filter: ${style.backdropFilter}`
      : ''
    if (!filter) continue
    const cls = typeof target.className === 'string' ? target.className : target.getAttribute('class') ?? ''
    const name = anim instanceof CSSAnimation ? anim.animationName : anim.id || '(unnamed)'
    const key = `${name}|${cls}`
    if (seen.has(key)) continue
    seen.add(key)
    leaks.push({ animation: name, element: `${target.tagName.toLowerCase()}.${cls.split(' ')[0]}`, filter: filter.slice(0, 80) })
  }
  return leaks
}

function warnOnAnimationFilterLeaks(): void {
  const leaks = findAnimationFilterLeaks()
  if (leaks.length === 0) return
  console.warn(
    `[anim-filter-guard] ${leaks.length} infinitely-animated element(s) carry a CSS filter — this leaks GPU compositor memory unbounded in Chromium ` +
      `(grows to multiple GB and crashes the tab; invisible to JS heap metrics). Remove the filter from the animated element and keep it on a static sibling.`,
    leaks,
  )
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as Window & { __scanAnimFilters?: typeof findAnimationFilterLeaks }).__scanAnimFilters = findAnimationFilterLeaks
  // Check a few seconds after load (animations have mounted), and again later
  // in case edges/nodes were added to the canvas after startup.
  const run = () => { window.setTimeout(warnOnAnimationFilterLeaks, 4000); window.setTimeout(warnOnAnimationFilterLeaks, 15000) }
  if (document.readyState === 'complete') run()
  else window.addEventListener('load', run, { once: true })
}
