/**
 * How a peripheral reader turns a saved part id into the id it looks up.
 *
 * A *missing* id (undefined, null, empty or blank) is a node nobody has picked a
 * module for, so the type's own default part is looked up, by that default's id.
 * An *unknown* id is looked up as itself and finds nothing; the reader then
 * returns `null` and no other part's facts. `partResolution.ts` holds the node
 * before any generator reads it, so a `null` is only ever seen by the preview,
 * the bench and validation, which treat it as inert.
 */
export function partIdOrDefault(partId: unknown, defaultId: string): string {
  if (partId === undefined || partId === null) return defaultId
  const id = String(partId)
  return id.trim() === '' ? defaultId : id
}

/**
 * The facts of a type's *default* part, for a node definition's starting
 * values. A bundled default is always in the catalogue, so a miss is a broken
 * build, not a case to paper over with another part's numbers.
 */
export function requireDefaultSpec<T>(spec: T | null | undefined, what: string): T {
  if (spec === null || spec === undefined) throw new Error(`The default ${what} is missing from the part catalogue`)
  return spec
}
