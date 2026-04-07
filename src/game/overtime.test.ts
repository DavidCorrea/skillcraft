import { describe, expect, it } from 'vitest'
import {
  chebyshevDistance,
  isOvertimeStormPulseRound,
  maxChebyshevFromCenter,
  rollStormActivation,
  STORM_MIN_SAFE_CELLS,
  stormCenterCandidates,
} from './overtime'
import { applyAction, createInitialState, resetIdsForTests } from './engine'
import type { BattleConfig, MatchSettings } from './types'
import { defaultTraitPoints } from './traits'
import { duelBattleConfig, TID } from './test-fixtures'

function countCellsInChebyshevBallLocal(center: { x: number; y: number }, radius: number, size: number): number {
  let n = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (chebyshevDistance({ x, y }, center) <= radius) n++
    }
  }
  return n
}

describe('rollStormActivation', () => {
  it('produces a center in the edge margin and enough initial safe cells', () => {
    const rnd = () => 0.42
    for (let t = 0; t < 30; t++) {
      const ot = rollStormActivation(7, rnd)
      const edge = Math.min(
        ot.stormCenter.x,
        ot.stormCenter.y,
        6 - ot.stormCenter.x,
        6 - ot.stormCenter.y,
      )
      expect(edge).toBeLessThanOrEqual(2)
      const rMax = maxChebyshevFromCenter(ot.stormCenter, 7)
      expect(ot.safeRadius).toBe(rMax - 1)
      expect(countCellsInChebyshevBallLocal(ot.stormCenter, ot.safeRadius, 7)).toBeGreaterThanOrEqual(
        STORM_MIN_SAFE_CELLS,
      )
    }
  })
})

describe('stormCenterCandidates', () => {
  it('includes edge cells and excludes deep center on 7×7', () => {
    const c = stormCenterCandidates(7, 2)
    expect(c.some((p) => p.x === 0 && p.y === 0)).toBe(true)
    expect(c.some((p) => p.x === 3 && p.y === 3)).toBe(false)
  })
})

function stormLogCount(s: { log: { detail?: { kind?: string } }[] }): number {
  return s.log.filter((e) => e.detail?.kind === 'overtime_storm').length
}

describe('sudden death storm cadence', () => {
  it('does not damage on activation; alternates damage and skip; pulse flag tracks skip round', () => {
    resetIdsForTests()
    const base = duelBattleConfig({
      level: 8,
      playerLoadout: [{ skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, costDiscount: 0 }],
      cpuLoadout: [{ skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, costDiscount: 0 }],
      playerTraits: defaultTraitPoints(),
      cpuTraits: defaultTraitPoints(),
    })
    const cfg: BattleConfig = {
      ...base,
      match: { ...(base.match as MatchSettings), overtimeEnabled: true, roundsUntilOvertime: 1 },
    }
    let s = createInitialState(cfg, { randomizeTurnOrder: false })
    s = applyAction(s, TID.human, { type: 'skip' }).state!
    s = applyAction(s, TID.cpu, { type: 'skip' }).state!
    expect(s.overtime).not.toBeNull()
    expect(stormLogCount(s)).toBe(0)
    expect(s.overtime!.stormSkipsNextBoundary).toBe(true)
    expect(isOvertimeStormPulseRound(s)).toBe(true)

    s = applyAction(s, TID.human, { type: 'skip' }).state!
    s = applyAction(s, TID.cpu, { type: 'skip' }).state!
    expect(stormLogCount(s)).toBe(0)
    expect(s.overtime!.stormSkipsNextBoundary).toBe(false)
    expect(isOvertimeStormPulseRound(s)).toBe(false)

    s = applyAction(s, TID.human, { type: 'skip' }).state!
    s = applyAction(s, TID.cpu, { type: 'skip' }).state!
    expect(stormLogCount(s)).toBeGreaterThan(0)
    expect(s.overtime!.stormSkipsNextBoundary).toBe(true)
    expect(isOvertimeStormPulseRound(s)).toBe(true)

    const nAfterFirstStrike = stormLogCount(s)
    s = applyAction(s, TID.human, { type: 'skip' }).state!
    s = applyAction(s, TID.cpu, { type: 'skip' }).state!
    expect(stormLogCount(s)).toBe(nAfterFirstStrike)
    expect(s.overtime!.stormSkipsNextBoundary).toBe(false)
    expect(isOvertimeStormPulseRound(s)).toBe(false)

    s = applyAction(s, TID.human, { type: 'skip' }).state!
    s = applyAction(s, TID.cpu, { type: 'skip' }).state!
    expect(stormLogCount(s)).toBeGreaterThan(nAfterFirstStrike)
  })
})
