// Re-render a component when a part is added to, or replaced in, the catalogue.
//
// The catalogue is a runtime registry (see partCatalogue.ts). A component that
// reads it while rendering calls this once; the returned version is also a
// dependency for any `useMemo` that reads the catalogue.

import { useSyncExternalStore } from 'react'
import { catalogueVersion, subscribeCatalogue } from './partCatalogue'

export function usePartCatalogueVersion(): number {
  return useSyncExternalStore(subscribeCatalogue, catalogueVersion, catalogueVersion)
}
