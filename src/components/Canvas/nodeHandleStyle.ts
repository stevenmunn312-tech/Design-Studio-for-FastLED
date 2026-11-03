import type { CSSProperties } from 'react'
import { PORT_SYMBOL_HANDLE, portSymbol } from '../icons/portSymbols'

/** Shared geometry for every patch-bay socket, including custom node bodies. */
export const NODE_HANDLE_STYLE = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  border: 'none',
} satisfies CSSProperties

/**
 * A socket cut to its data type's symbol (see `portSymbols.ts`) in the port
 * colour. Matte: the wire's packets carry the light, the socket does not.
 */
export function portHandleStyle(dataType: string | undefined, color: string): CSSProperties {
  return { ...NODE_HANDLE_STYLE, ...PORT_SYMBOL_HANDLE[portSymbol(dataType)], backgroundColor: color }
}
