import { describe, expect, it } from 'vitest'
import { applyAction, allLegalActions, createInitialState, resetIdsForTests } from '../game/engine'
import { pickCpuAction } from './cpu'
import type { BattleConfig } from '../game/types'
import { defaultTraitPoints } from '../game/traits'
import { duelBattleConfig, ffaBattleConfig, TID } from '../game/test-fixtures'

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

describe('pickCpuAction', () => {
  it('returns an action that applyAction accepts', () => {
    resetIdsForTests()
    let s = createInitialState(cfg)
    const r0 = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } })
    s = r0.state!
    const a = pickCpuAction(s, TID.cpu)
    const r = applyAction(s, TID.cpu, a)
    expect(r.error).toBeUndefined()
  })

  it('matches one of the enumerated legal actions', () => {
    resetIdsForTests()
    let s = createInitialState(cfg)
    s = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } }).state!
    const legal = allLegalActions(s, TID.cpu)
    const picked = pickCpuAction(s, TID.cpu)
    const same = legal.some((x) => {
      if (x.type !== picked.type) return false
      if (x.type === 'skip') return true
      if (x.type === 'move' && picked.type === 'move')
        return x.to.x === picked.to.x && x.to.y === picked.to.y
      if (x.type === 'strike' && picked.type === 'strike')
        return x.targetId === picked.targetId
      return (
        x.type === 'cast' &&
        picked.type === 'cast' &&
        x.skillId === picked.skillId &&
        x.target.x === picked.target.x &&
        x.target.y === picked.target.y
      )
    })
    expect(same).toBe(true)
  })

  it('picks skip when skip is the only legal action', () => {
    resetIdsForTests()
    let s = createInitialState(cfg)
    s = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } }).state!
    // Rooted + no mana + not adjacent to human → no move, strike, or cast.
    s = {
      ...s,
      actors: {
        ...s.actors,
        [TID.cpu]: {
          ...s.actors[TID.cpu]!,
          pos: { x: 0, y: 0 },
          mana: 0,
          statuses: [{ id: 'r1', tag: { t: 'rooted', duration: 2 } }],
        },
        [TID.human]: { ...s.actors[TID.human]!, pos: { x: 6, y: 6 } },
      },
    }
    expect(allLegalActions(s, TID.cpu)).toEqual([{ type: 'skip' }])
    expect(pickCpuAction(s, TID.cpu)).toEqual({ type: 'skip' })
    const sNightmare = {
      ...s,
      cpuDifficulty: { ...s.cpuDifficulty, [TID.cpu]: 'nightmare' as const },
    }
    expect(pickCpuAction(sNightmare, TID.cpu)).toEqual({ type: 'skip' })
    const r = applyAction(s, TID.cpu, { type: 'skip' })
    expect(r.error).toBeUndefined()
    expect(r.state!.turn).toBe(TID.human)
  })

  it('FFA non-easy CPU picks a legal action (paranoid multi-actor search)', () => {
    resetIdsForTests()
    const ffaCfg = ffaBattleConfig({
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
    let s = createInitialState(ffaCfg)
    const skip = applyAction(s, TID.human, { type: 'skip' })
    expect(skip.error).toBeUndefined()
    s = skip.state!
    expect(s.turn).toBe(TID.cpu)
    s = { ...s, cpuDifficulty: { ...s.cpuDifficulty, [TID.cpu]: 'normal' } }
    const legal = allLegalActions(s, TID.cpu)
    const picked = pickCpuAction(s, TID.cpu)
    const ok = legal.some((x) => {
      if (x.type !== picked.type) return false
      if (x.type === 'skip') return true
      if (x.type === 'move' && picked.type === 'move')
        return x.to.x === picked.to.x && x.to.y === picked.to.y
      if (x.type === 'strike' && picked.type === 'strike')
        return x.targetId === picked.targetId
      return (
        x.type === 'cast' &&
        picked.type === 'cast' &&
        x.skillId === picked.skillId &&
        x.target.x === picked.target.x &&
        x.target.y === picked.target.y
      )
    })
    expect(ok).toBe(true)
  })

  it('chooses strike when it immediately wins', () => {
    resetIdsForTests()
    let s = createInitialState(cfg)
    s = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } }).state!
    s = {
      ...s,
      actors: {
        ...s.actors,
        [TID.human]: { ...s.actors[TID.human]!, hp: 1, pos: { x: 3, y: 5 } },
        [TID.cpu]: { ...s.actors[TID.cpu]!, pos: { x: 3, y: 4 } },
      },
      turn: TID.cpu,
    }
    expect(pickCpuAction(s, TID.cpu)).toEqual({ type: 'strike', targetId: TID.human })
  })
})
