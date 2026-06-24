import styles from './WaveScope.module.css'

const VIEW_W = 200
const VIEW_H = 40
const PAD = 3

/** A tiny oscilloscope that plots a normalised series as a polyline. */
export default function WaveScope({ samples }: { samples: number[] }) {
  if (samples.length < 2) return null

  let min = Infinity, max = -Infinity
  for (const s of samples) {
    if (s < min) min = s
    if (s > max) max = s
  }
  const range = Math.max(1e-6, max - min)

  const points = samples
    .map((s, i) => {
      const x = PAD + (i / (samples.length - 1)) * (VIEW_W - 2 * PAD)
      const y = PAD + (1 - (s - min) / range) * (VIEW_H - 2 * PAD)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  // Zero line (only drawn when 0 falls within the sample range).
  const zeroY = min <= 0 && max >= 0
    ? PAD + (1 - (0 - min) / range) * (VIEW_H - 2 * PAD)
    : null

  return (
    <svg
      className={styles.scope}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {zeroY !== null && (
        <line x1={0} y1={zeroY} x2={VIEW_W} y2={zeroY} className={styles.zero} />
      )}
      <polyline points={points} className={styles.trace} fill="none" />
    </svg>
  )
}
