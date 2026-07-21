// Dev-only guard against a Chromium GPU-memory footgun: a CSS `filter` or
// `backdrop-filter` on an element running an *infinite* animation makes the
// compositor allocate a fresh GPU filter buffer every frame and never reclaim
// it — unbounded GPU/compositor memory growth that crashes the tab and is
// invisible to every JS heap/canvas/texture metric. It cost a very long hunt to
// find once (edges' `.packet`/`.core` glows + the `.fieldScan` backdrop), so
// this warns the moment such a pair exists again. Zero cost in production
// (whole module is gated to DEV and tree-shaken out).

export interface AnimationFilterLeak {
  source: string
  element: string
  filter: string
}

function elementLabel(el: Element): string {
  const cls = typeof el.className === 'string' ? el.className : el.getAttribute('class') ?? ''
  return `${el.tagName.toLowerCase()}.${cls.split(' ')[0]}`
}

function cssFilter(style: CSSStyleDeclaration): string {
  return style.filter && style.filter !== 'none' ? style.filter
    : style.backdropFilter && style.backdropFilter !== 'none' ? `backdrop-filter: ${style.backdropFilter}`
    : ''
}

/** Elements that carry a CSS filter over content that changes every frame — the
 *  Chromium GPU-memory leak. Two shapes: (1) an infinitely-animated element with
 *  a filter, and (2) a <canvas> with a filter (canvases are redrawn via JS, so a
 *  filter re-rasterises per frame just the same — this shape has no CSS animation
 *  and is invisible to getAnimations). Reads computed style only, so it works in
 *  a hidden tab. Exposed on `window.__scanAnimFilters()` in dev. */
export function findAnimationFilterLeaks(): AnimationFilterLeak[] {
  if (typeof document === 'undefined') return []
  const seen = new Set<string>()
  const leaks: AnimationFilterLeak[] = []
  // Shape 1: infinitely-animated element + filter.
  if (typeof document.getAnimations === 'function') {
    for (const anim of document.getAnimations()) {
      const effect = anim.effect
      if (!(effect instanceof KeyframeEffect)) continue
      const target = effect.target
      if (!(target instanceof Element)) continue
      if (effect.getTiming().iterations !== Infinity) continue
      const filter = cssFilter(getComputedStyle(target))
      if (!filter) continue
      const name = anim instanceof CSSAnimation ? anim.animationName : anim.id || '(unnamed)'
      const key = `anim|${name}|${elementLabel(target)}`
      if (seen.has(key)) continue
      seen.add(key)
      leaks.push({ source: `animation:${name}`, element: elementLabel(target), filter: filter.slice(0, 80) })
    }
  }
  // Shape 2: a <canvas> with a filter (redrawn every frame → same leak).
  for (const canvas of document.querySelectorAll('canvas')) {
    const filter = cssFilter(getComputedStyle(canvas))
    if (!filter) continue
    const key = `canvas|${elementLabel(canvas)}`
    if (seen.has(key)) continue
    seen.add(key)
    leaks.push({ source: 'canvas', element: elementLabel(canvas), filter: filter.slice(0, 80) })
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
