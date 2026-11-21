import { useEffect, type RefObject } from 'react'

/** Put focus on a dialog's own starting field once `useModalFocus` has moved it
 * to the first focusable element. Call it after `useModalFocus` in the same
 * component: both wait a 0 ms timeout, and timers fire in the order they were
 * set, so this one lands last. Without it a header close button that precedes
 * the field in the DOM takes the focus the field's `autoFocus` asked for. */
export function useModalInitialFocus(target: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const timer = window.setTimeout(() => target.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [target])
}
