import { describe, expect, it } from 'vitest'
import { applyAction, createInitialState, resetIdsForTests } from '../game/engine'
import { hashCpuSearchPosition } from './cpuPositionHash'
import type { BattleConfig } from '../game/types'
import { defaultTraitPoints } from '../game/traits'
import { duelBattleConfig, TID } from '../game/test-fixtures'

const cfg: BattleConfig = duelBattleConfig({
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

describe('hashCpuSearchPosition', () => {
  it('matches for the same gameplay state and differs between duel / multi mode', () => {
    resetIdsForTests()
    let s = createInitialState(cfg, { randomizeTurnOrder: false })
    s = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } }).state!

    const hDuel = hashCpuSearchPosition(s, 'duel', TID.cpu, TID.human)
    const hDuel2 = hashCpuSearchPosition({ ...s }, 'duel', TID.cpu, TID.human)
    expect(hDuel2).toBe(hDuel)

    const hMulti = hashCpuSearchPosition(s, 'multi', TID.cpu, undefined)
    expect(hMulti).not.toBe(hDuel)
  })

  it('changes when a visible gameplay field changes', () => {
    resetIdsForTests()
    let s = createInitialState(cfg, { randomizeTurnOrder: false })
    s = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } }).state!
    const before = hashCpuSearchPosition(s, 'duel', TID.cpu, TID.human)
    const moved = {
      ...s,
      actors: {
        ...s.actors,
        [TID.cpu]: { ...s.actors[TID.cpu]!, pos: { x: 0, y: 0 } },
      },
    }
    const after = hashCpuSearchPosition(moved, 'duel', TID.cpu, TID.human)
    expect(after).not.toBe(before)
  })
})
