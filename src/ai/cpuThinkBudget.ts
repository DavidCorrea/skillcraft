import type { CpuDifficulty } from '../game/types'

/**
 * Emergency wall-clock cap on the main thread’s wait for the worker. Should exceed the hardest
 * per-move search budget by a margin so normal completion wins; on breach the worker is
 * terminated and easy AI picks a move.
 */
export const CPU_THINK_TIMEOUT_MS = 60_000

/** Remaining fraction of the CPU think budget in `[0, 1]` (UI ring). */
export function cpuThinkRemainingRatio(deadlineMs: number, nowMs: number, totalMs: number): number {
  if (totalMs <= 0) return 0
  return Math.max(0, Math.min(1, (deadlineMs - nowMs) / totalMs))
}

/** Max transposition-table entries per CPU pick; trimmed when exceeded (see `cpu.ts` ttStore). */
export const CPU_SEARCH_TT_MAX_ENTRIES = 65_536

/** After a trim, target size (must be &lt; CPU_SEARCH_TT_MAX_ENTRIES). */
export const CPU_SEARCH_TT_TRIM_TO = 49_152

/** Wall-clock budget inside the worker for Normal / Hard / Nightmare search (Easy skips search). */
export function cpuSearchDeadlineMs(diff: CpuDifficulty, nowMs: number = Date.now()): number {
  switch (diff) {
    case 'easy':
      return nowMs
    case 'normal':
      return nowMs + 280
    case 'hard':
      return nowMs + 700
    case 'nightmare':
      return nowMs + 1800
  }
}

/** Approximate node-visitation cap (minimax / paranoid invocations, excluding TT hits). */
export function cpuSearchMaxNodes(diff: CpuDifficulty): number {
  switch (diff) {
    case 'easy':
      return 0
    case 'normal':
      return 90_000
    case 'hard':
      return 280_000
    case 'nightmare':
      return 900_000
  }
}

