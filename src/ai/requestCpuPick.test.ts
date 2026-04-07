import { describe, expect, it } from 'vitest'
import { applyAction, createInitialState, resetIdsForTests } from '../game/engine'
import { requestCpuPick } from './requestCpuPick'
import { defaultTraitPoints } from '../game/traits'
import { duelBattleConfig, TID } from '../game/test-fixtures'

const cfg = duelBattleConfig({
  level: 8,
  playerLoadout: [
    { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, costDiscount: 0 },
    { skillId: 'tide_touch', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, costDiscount: 0 },
  ],
  cpuLoadout: [
    { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, costDiscount: 0 },
    { skillId: 'spark', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, costDiscount: 0 },
  ],
  playerTraits: defaultTraitPoints(),
  cpuTraits: defaultTraitPoints(),
})

describe('requestCpuPick', () => {
  it('uses synchronous pickCpuAction in Vitest (no Web Worker)', { timeout: 15_000 }, async () => {
    resetIdsForTests()
    let s = createInitialState(cfg, { randomizeTurnOrder: false })
    s = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } }).state!
    const action = await requestCpuPick(s, TID.cpu, null)
    expect(['move', 'cast', 'skip']).toContain(action.type)
  })
})
