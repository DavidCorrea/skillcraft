import { describe, expect, it } from 'vitest'
import { applyAction, allLegalActions, createInitialState, resetIdsForTests } from '../game/engine'
import { buildCustomMatchSettings } from '../game/match-roster'
import { pickCpuAction } from './cpu'
import type { BattleConfig, SkillLoadoutEntry } from '../game/types'
import { defaultTraitPoints } from '../game/traits'
import { duelBattleConfig, ffaBattleConfig, TID } from '../game/test-fixtures'

const strikeOnlyLoadout: SkillLoadoutEntry[] = [
  { skillId: 'strike', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, costDiscount: 0 },
]

const cfg: BattleConfig = duelBattleConfig({
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

describe('pickCpuAction', () => {
  it('returns an action that applyAction accepts', { timeout: 15_000 }, () => {
    resetIdsForTests()
    let s = createInitialState(cfg, { randomizeTurnOrder: false })
    const r0 = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } })
    s = r0.state!
    const a = pickCpuAction(s, TID.cpu)
    const r = applyAction(s, TID.cpu, a)
    expect(r.error).toBeUndefined()
  })

  it('matches one of the enumerated legal actions', { timeout: 15_000 }, () => {
    resetIdsForTests()
    let s = createInitialState(cfg, { randomizeTurnOrder: false })
    s = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } }).state!
    const legal = allLegalActions(s, TID.cpu)
    const picked = pickCpuAction(s, TID.cpu)
    const same = legal.some((x) => {
      if (x.type !== picked.type) return false
      if (x.type === 'skip') return true
      if (x.type === 'move' && picked.type === 'move')
        return x.to.x === picked.to.x && x.to.y === picked.to.y
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
    let s = createInitialState(cfg, { randomizeTurnOrder: false })
    s = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } }).state!
    // Rooted + no mana + not adjacent to human → no move or cast.
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
    let s = createInitialState(ffaCfg, { randomizeTurnOrder: false })
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

  it('in a team match, prefers strike cast on an enemy over an adjacent ally', { timeout: 20_000 }, () => {
    resetIdsForTests()
    const ms = buildCustomMatchSettings({
      humanLoadout: strikeOnlyLoadout,
      humanTraits: defaultTraitPoints(),
      cpuBuilds: [
        { loadout: strikeOnlyLoadout, traits: defaultTraitPoints() },
        { loadout: strikeOnlyLoadout, traits: defaultTraitPoints() },
      ],
      teamIds: [0, 0, 1],
      defaultCpuDifficulty: 'hard',
    })
    const cfg: BattleConfig = {
      level: 8,
      playerLoadout: ms.roster[0]!.loadout,
      cpuLoadout: ms.roster[1]!.loadout,
      playerTraits: ms.roster[0]!.traits,
      cpuTraits: ms.roster[1]!.traits,
      match: ms,
    }
    let s = createInitialState(cfg, { randomizeTurnOrder: false })
    const humanId = ms.humanActorId
    const allyCpuId = ms.roster[1]!.actorId
    const enemyCpuId = ms.roster[2]!.actorId
    s = {
      ...s,
      turn: allyCpuId,
      cpuDifficulty: { ...s.cpuDifficulty, [allyCpuId]: 'hard' },
      actors: {
        ...s.actors,
        [humanId]: { ...s.actors[humanId]!, pos: { x: 3, y: 4 }, mana: 0 },
        [allyCpuId]: { ...s.actors[allyCpuId]!, pos: { x: 3, y: 3 }, mana: 0 },
        [enemyCpuId]: { ...s.actors[enemyCpuId]!, pos: { x: 3, y: 2 }, mana: 0 },
      },
    }
    expect(pickCpuAction(s, allyCpuId)).toEqual({
      type: 'cast',
      skillId: 'strike',
      target: { x: 3, y: 2 },
    })
  })

  it('chooses strike cast when it immediately wins', () => {
    resetIdsForTests()
    let s = createInitialState(cfg, { randomizeTurnOrder: false })
    s = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } }).state!
    s = {
      ...s,
      loadouts: {
        ...s.loadouts,
        [TID.cpu]: strikeOnlyLoadout,
      },
      actors: {
        ...s.actors,
        [TID.human]: { ...s.actors[TID.human]!, hp: 1, pos: { x: 3, y: 5 } },
        [TID.cpu]: { ...s.actors[TID.cpu]!, pos: { x: 3, y: 4 } },
      },
      turn: TID.cpu,
    }
    expect(pickCpuAction(s, TID.cpu)).toEqual({
      type: 'cast',
      skillId: 'strike',
      target: { x: 3, y: 5 },
    })
  })
})
