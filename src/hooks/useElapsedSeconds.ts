import { useEffect, useState } from 'react'

/** Whole seconds since `startedAt`, ticking once a second while `running`.
 *  Counted from the timestamp rather than from mount, so every surface showing
 *  the same run shows the same number. */
export function useElapsedSeconds(startedAt: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running, startedAt])
  return running && startedAt !== null ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0
}
