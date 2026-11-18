// The online parts library for the shelf: the verified index, once per session.
//
// With no parts host configured this does nothing: no effect runs a request and
// the state is `off`, so the shelf shows nothing extra.

import { useEffect, useState } from 'react'
import { getPartsLibrary, type PartsLibrary } from '../../build/parts/partsLibrary'
import { buildCategoryTree, type CategoryTree, type PartsIndex } from '../../build/parts/remote'

export type RemotePartsState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; index: PartsIndex; tree: CategoryTree; offline: boolean }
  | { status: 'unavailable'; reason: 'offline' | 'needs-newer-app' | 'cannot-verify' | 'invalid' }

/** Libraries whose index this session has already refreshed from the network. */
const refreshed = new WeakSet<PartsLibrary>()

export function useRemoteParts(library: PartsLibrary = getPartsLibrary()): RemotePartsState {
  const [state, setState] = useState<RemotePartsState>(
    library.configured ? { status: 'loading' } : { status: 'off' },
  )

  useEffect(() => {
    if (!library.configured) return
    let cancelled = false
    const refresh = !refreshed.has(library)
    refreshed.add(library)
    void library.loadIndex({ refresh }).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setState({
          status: 'ready',
          index: result.index,
          tree: buildCategoryTree(result.index.categories, result.index.parts),
          offline: result.refreshError !== undefined,
        })
      } else if (result.reason === 'needs-newer-app' || result.reason === 'cannot-verify' || result.reason === 'invalid') {
        setState({ status: 'unavailable', reason: result.reason })
      } else {
        setState({ status: 'unavailable', reason: 'offline' })
      }
    }, () => {
      if (!cancelled) setState({ status: 'unavailable', reason: 'offline' })
    })
    return () => { cancelled = true }
  }, [library])

  return library.configured ? state : { status: 'off' }
}
