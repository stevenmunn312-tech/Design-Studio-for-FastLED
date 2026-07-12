export function shouldConsumeWheel({
  scrollTop,
  clientHeight,
  scrollHeight,
}: {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}, deltaY: number) {
  if (deltaY === 0 || scrollHeight <= clientHeight) return false
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight)
  if (deltaY < 0) return scrollTop > 0
  return scrollTop < maxScrollTop
}

export function shouldConsumeFocusedWheel(currentTarget: Element | null, activeElement: Element | null) {
  return currentTarget !== null && activeElement !== null && currentTarget === activeElement
}

export function stopWheelWhileFocused(event: {
  currentTarget: Element
  stopPropagation: () => void
}) {
  const activeElement = typeof document !== 'undefined' ? document.activeElement : null
  if (shouldConsumeFocusedWheel(event.currentTarget, activeElement)) event.stopPropagation()
}
