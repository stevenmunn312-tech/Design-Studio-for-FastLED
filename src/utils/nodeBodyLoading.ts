// How many node bodies are still loading. StudioNode loads some bodies on
// demand (the Pattern Collection's list, the Transition Pool's cards, ...),
// and until one arrives its node measures as an empty card. Anything that
// lays out a freshly loaded graph by measured size waits for this to reach
// zero, or it spaces the nodes for the empty cards and the bodies then grow
// over their neighbours.

let pending = 0

export function nodeBodyLoadStarted(): void {
  pending += 1
}

export function nodeBodyLoadEnded(): void {
  pending = Math.max(0, pending - 1)
}

export function nodeBodiesLoading(): boolean {
  return pending > 0
}
