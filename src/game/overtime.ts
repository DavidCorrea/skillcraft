import type { Coord, GameState, OvertimeState } from './types'

/** Storm center is uniform among cells within this Chebyshev distance of any board edge. */
export const STORM_EDGE_MARGIN_CELLS = 2

/** Re-roll storm center until the initial safe Chebyshev ball has at least this many cells. */
export const STORM_MIN_SAFE_CELLS = 9

export const STORM_BASE_DAMAGE = 3
export const STORM_DAMAGE_INCREMENT = 2

/** Shrink safe radius every N full rounds completed in overtime. */
export const SHRINK_EVERY_OT_ROUNDS = 2

const ROLL_MAX_ATTEMPTS = 80

export function chebyshevDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

export function edgeDistanceToBoard(c: Coord, size: number): number {
  return Math.min(c.x, c.y, size - 1 - c.x, size - 1 - c.y)
}

/** Cells eligible for storm center: near an edge (battle-royale style). */
export function stormCenterCandidates(size: number, margin: number): Coord[] {
  const out: Coord[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (edgeDistanceToBoard({ x, y }, size) <= margin) {
        out.push({ x, y })
      }
    }
  }
  return out
}

function countCellsInChebyshevBall(center: Coord, radius: number, size: number): number {
  let n = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (chebyshevDistance({ x, y }, center) <= radius) {
        n++
      }
    }
  }
  return n
}

/** Max Chebyshev distance from center to any cell on the board. */
export function maxChebyshevFromCenter(center: Coord, size: number): number {
  return Math.max(center.x, center.y, size - 1 - center.x, size - 1 - center.y)
}

/**
 * Roll storm center (uniform in edge margin) and initial safe radius (outer ring lethal, min safe area).
 */
export function rollStormActivation(
  size: number,
  rnd: () => number,
  margin: number = STORM_EDGE_MARGIN_CELLS,
  minSafeCells: number = STORM_MIN_SAFE_CELLS,
): OvertimeState {
  const candidates = stormCenterCandidates(size, margin)
  if (candidates.length === 0) {
    throw new Error('rollStormActivation: no storm center candidates')
  }

  for (let attempt = 0; attempt < ROLL_MAX_ATTEMPTS; attempt++) {
    const center = candidates[Math.floor(rnd() * candidates.length)]!
    const rMax = maxChebyshevFromCenter(center, size)
    if (rMax < 1) continue
    const safeRadius = rMax - 1
    if (countCellsInChebyshevBall(center, safeRadius, size) >= minSafeCells) {
      return {
        stormCenter: center,
        safeRadius,
        damageStep: 0,
        otRoundsCompleted: 0,
        stormSkipsNextBoundary: false,
        deferredShrink: false,
      }
    }
  }

  /** Fallback: board center with a smaller safe zone if rolls fail (should be rare on 7×7+). */
  const cx = Math.floor(size / 2)
  const cy = Math.floor(size / 2)
  const center = { x: cx, y: cy }
  const rMax = maxChebyshevFromCenter(center, size)
  const safeRadius = Math.max(0, rMax - 2)
  return {
    stormCenter: center,
    safeRadius,
    damageStep: 0,
    otRoundsCompleted: 0,
    stormSkipsNextBoundary: false,
    deferredShrink: false,
  }
}

export function currentOvertimeDamageAmount(ot: OvertimeState): number {
  return STORM_BASE_DAMAGE + ot.damageStep * STORM_DAMAGE_INCREMENT
}

export function isOvertimeLethal(state: GameState, pos: Coord): boolean {
  if (!state.overtime) return false
  return chebyshevDistance(pos, state.overtime.stormCenter) > state.overtime.safeRadius
}

/** True while the next full-round boundary will skip storm damage (lethal band should pulse). */
export function isOvertimeStormPulseRound(state: GameState): boolean {
  return state.overtime !== null && state.overtime.stormSkipsNextBoundary
}
