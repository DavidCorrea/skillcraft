import { describe, expect, it } from 'vitest'
import { applyAction, createInitialState, resetIdsForTests } from '../game/engine'
import { requestCpuPick } from './requestCpuPick'
import { defaultTraitPoints } from '../game/traits'
import { duelBattleConfig, TID } from '../game/test-fixtures'

const cfg = duelBattleConfig({
  level: 8,
  playerLoadout: [
    { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, manaDiscount: 0 },
    { skillId: 'tide_touch', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, manaDiscount: 0 },
  ],
  cpuLoadout: [
    { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, manaDiscount: 0 },
    { skillId: 'spark', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, manaDiscount: 0 },
  ],
  playerTraits: defaultTraitPoints(),
  cpuTraits: defaultTraitPoints(),
})

describe('requestCpuPick', () => {
  it('uses synchronous pickCpuAction in Vitest (no Web Worker)', async () => {
    resetIdsForTests()
    let s = createInitialState(cfg)
    s = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } }).state!
    const action = await requestCpuPick(s, TID.cpu, null)
    expect(['move', 'strike', 'cast', 'skip']).toContain(action.type)
  })
})
