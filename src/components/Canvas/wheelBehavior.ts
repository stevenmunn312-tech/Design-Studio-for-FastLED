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
