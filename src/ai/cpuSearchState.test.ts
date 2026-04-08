import { describe, expect, it } from 'vitest'
import { createInitialState, resetIdsForTests } from '../game/engine'
import { duelBattleConfig } from '../game/test-fixtures'
import { defaultTraitPoints } from '../game/traits'
import { gameStateForCpuWorker } from './cpuSearchState'

describe('gameStateForCpuWorker', () => {
  it('clears log and preserves gameplay fields', () => {
    resetIdsForTests()
    const t = defaultTraitPoints()
    const cfg = duelBattleConfig({
      level: 4,
      playerLoadout: [
        { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, costDiscount: 0 },
      ],
      cpuLoadout: [
        { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, costDiscount: 0 },
      ],
      playerTraits: t,
      cpuTraits: t,
    })
    const s = createInitialState(cfg, { randomizeTurnOrder: false })
    expect(s.log.length).toBeGreaterThan(0)
    const w = gameStateForCpuWorker(s)
    expect(w.log).toEqual([])
    expect(w.turn).toBe(s.turn)
    expect(w.size).toBe(s.size)
    expect(w.actors).toBe(s.actors)
  })
})
