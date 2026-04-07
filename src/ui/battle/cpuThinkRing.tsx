import { CPU_THINK_TIMEOUT_MS } from '../../ai/cpuThinkBudget'

const R = 10
const CIRC = 2 * Math.PI * R

/** Remaining fraction of the think budget in [0, 1]. */
export function cpuThinkRemainingRatio(deadlineMs: number, nowMs: number, totalMs: number): number {
  if (totalMs <= 0) return 0
  return Math.max(0, Math.min(1, (deadlineMs - nowMs) / totalMs))
}

export function CpuThinkRing({
  deadlineMs,
  nowMs,
  totalMs = CPU_THINK_TIMEOUT_MS,
  label,
}: {
  deadlineMs: number
  nowMs: number
  totalMs?: number
  /** Accessible name, e.g. "CPU 1 deciding" */
  label: string
}) {
  const remaining = cpuThinkRemainingRatio(deadlineMs, nowMs, totalMs)
  const offset = CIRC * (1 - remaining)
  const secLeft = Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000))

  return (
    <span className="bs-cpu-think-ring" role="img" aria-label={`${label}, about ${secLeft} seconds until fallback`}>
      <svg className="bs-cpu-think-ring__svg" viewBox="0 0 24 24" aria-hidden>
        <circle
          className="bs-cpu-think-ring__track"
          cx="12"
          cy="12"
          r={R}
          fill="none"
          strokeWidth="2.25"
        />
        <circle
          className="bs-cpu-think-ring__arc"
          cx="12"
          cy="12"
          r={R}
          fill="none"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset={offset}
          transform="rotate(-90 12 12)"
        />
      </svg>
    </span>
  )
}
