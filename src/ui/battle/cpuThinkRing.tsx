import { useEffect, useState } from 'react'
import { CPU_THINK_TIMEOUT_MS, cpuThinkRemainingRatio } from '../../ai/cpuThinkBudget'

const R = 10
const CIRC = 2 * Math.PI * R

export function CpuThinkRing({
  deadlineMs,
  totalMs = CPU_THINK_TIMEOUT_MS,
  label,
}: {
  deadlineMs: number
  totalMs?: number
  /** Accessible name, e.g. "CPU 1 deciding" */
  label: string
}) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [deadlineMs])

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
