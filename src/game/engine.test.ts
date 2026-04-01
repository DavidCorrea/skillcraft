import { describe, expect, it } from 'vitest'
import {
  applyAction,
  allLegalActions,
  applyTurnEntry,
  applyTurnStartHooks,
  castReachableAnchors,
  createInitialState,
  legalCasts,
  resetIdsForTests,
} from './engine'
import type { BattleConfig } from './types'
import { coordKey } from './board'
import { defaultTraitPoints, STAMINA_REGEN_PER_TURN, STAMINA_STRIKE_COST } from './traits'
import { duelBattleConfig, matchSettingsFfa, TID } from './test-fixtures'

const sampleConfig: BattleConfig = duelBattleConfig({
  level: 8,
  playerLoadout: [
    { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, manaDiscount: 0 },
    { skillId: 'frost_bolt', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, manaDiscount: 0 },
  ],
  cpuLoadout: [{ skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, manaDiscount: 0 }],
  playerTraits: defaultTraitPoints(),
  cpuTraits: defaultTraitPoints(),
})

describe('createInitialState', () => {
  it('places actors on opposite mid edges', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig)
    expect(s.actors[TID.human]!.pos).toEqual({ x: 3, y: 6 })
    expect(s.actors[TID.cpu]!.pos).toEqual({ x: 3, y: 0 })
    expect(s.turn).toBe(TID.human)
  })
})

describe('applyAction', () => {
  it('allows orthogonal move', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig)
    const r = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } })
    expect(r.error).toBeUndefined()
    expect(r.state!.actors[TID.human]!.pos).toEqual({ x: 3, y: 5 })
    expect(r.state!.turn).toBe(TID.cpu)
  })

  it('rejects out-of-turn action', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig)
    const r = applyAction(s, TID.cpu, { type: 'move', to: { x: 3, y: 1 } })
    expect(r.error).toBe('Not your turn.')
  })

  it('rejects strike when not adjacent to enemy', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig)
    const r = applyAction(s, TID.human, { type: 'strike' })
    expect(r.error).toMatch(/adjacent/)
  })

  it('deducts stamina on move', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig)
    const startStamina = s.actors[TID.human]!.stamina
    const r = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } })
    expect(r.error).toBeUndefined()
    expect(r.state!.actors[TID.human]!.stamina).toBe(startStamina - 1)
  })

  it('rejects strike when stamina is too low', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig)
    const low = {
      ...s,
      actors: {
        ...s.actors,
        [TID.human]: { ...s.actors[TID.human]!, stamina: STAMINA_STRIKE_COST - 1 },
        [TID.cpu]: { ...s.actors[TID.cpu]!, pos: { x: 3, y: 5 } },
      },
    }
    const r = applyAction(low, TID.human, { type: 'strike' })
    expect(r.error).toMatch(/stamina/i)
  })

  it('skip ends turn and logs', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig)
    const r = applyAction(s, TID.human, { type: 'skip' })
    expect(r.error).toBeUndefined()
    expect(r.state!.turn).toBe(TID.cpu)
    expect(r.state!.log.some((l) => l.text.includes('skips'))).toBe(true)
  })
})

describe('applyTurnStartHooks', () => {
  it('applies DoT from burning', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig)
    const actor = {
      ...s.actors[TID.human]!,
      mana: 5,
      maxMana: 10,
      manaRegenPerTurn: 1,
      stamina: 4,
      maxStamina: 8,
      statuses: [{ id: 'x', tag: { t: 'burning' as const, duration: 2, dot: 5 } }],
    }
    const next = applyTurnStartHooks(actor)
    expect(next.hp).toBe(actor.hp - 5)
    expect(next.mana).toBe(6)
    expect(next.stamina).toBe(4 + STAMINA_REGEN_PER_TURN)
  })
})

describe('castReachableAnchors', () => {
  it('includes in-range anchors even when the enemy is not in the pattern', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig)
    const r = castReachableAnchors(s, TID.human, 'ember')
    expect(r.length).toBeGreaterThan(0)
    const legal = legalCasts(s, TID.human).filter((x) => x.skillId === 'ember')
    expect(r.length).toBeGreaterThanOrEqual(legal.length)
  })
})

describe('residual tile impacts', () => {
  it('allows a cast when the enemy is not in the pattern and lays a lingering tile', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig)
    const r = applyAction(s, TID.human, { type: 'cast', skillId: 'ember', target: { x: 3, y: 2 } })
    expect(r.error).toBeUndefined()
    expect(r.state!.impactedTiles[coordKey({ x: 3, y: 2 })]).toMatchObject({
      skillId: 'ember',
      owner: TID.human,
    })
    expect(r.state!.log.some((l) => l.text.includes('residual'))).toBe(true)
  })

  it('harms the opponent when they move onto a lingering tile', () => {
    resetIdsForTests()
    let s = createInitialState(sampleConfig)
    s = applyAction(s, TID.human, { type: 'cast', skillId: 'ember', target: { x: 3, y: 2 } }).state!
    expect(s.turn).toBe(TID.cpu)
    const hp0 = s.actors[TID.cpu]!.hp
    s = applyAction(s, TID.cpu, { type: 'move', to: { x: 3, y: 1 } }).state!
    s = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } }).state!
    const r = applyAction(s, TID.cpu, { type: 'move', to: { x: 3, y: 2 } })
    expect(r.error).toBeUndefined()
    expect(r.state!.actors[TID.cpu]!.hp).toBeLessThan(hp0)
    expect(r.state!.log.some((l) => l.text.includes('residual'))).toBe(true)
  })

  it('harms the caster when they move onto their own lingering tile', () => {
    resetIdsForTests()
    let s = createInitialState(sampleConfig)
    const hpBefore = s.actors[TID.human]!.hp
    s = applyAction(s, TID.human, { type: 'cast', skillId: 'ember', target: { x: 3, y: 5 } }).state!
    expect(s.turn).toBe(TID.cpu)
    s = applyAction(s, TID.cpu, { type: 'skip' }).state!
    const r = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } })
    expect(r.error).toBeUndefined()
    expect(r.state!.actors[TID.human]!.hp).toBeLessThan(hpBefore)
    expect(r.state!.log.some((l) => l.text.includes('residual'))).toBe(true)
  })
})

describe('self-damage from offensive skills', () => {
  it('damages the caster when the pattern includes their cell', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig)
    const hp0 = s.actors[TID.human]!.hp
    const r = applyAction(s, TID.human, { type: 'cast', skillId: 'ember', target: { x: 3, y: 6 } })
    expect(r.error).toBeUndefined()
    expect(r.state!.actors[TID.human]!.hp).toBeLessThan(hp0)
    expect(r.state!.log.some((l) => l.text.includes('damage'))).toBe(true)
  })
})

describe('allLegalActions', () => {
  it('returns only legal actions for cpu on cpu turn', () => {
    resetIdsForTests()
    let s = createInitialState(sampleConfig)
    const r = applyAction(s, TID.human, { type: 'move', to: { x: 3, y: 5 } })
    s = r.state!
    const actions = allLegalActions(s, TID.cpu)
    expect(actions.length).toBeGreaterThan(0)
    for (const a of actions) {
      const out = applyAction(s, TID.cpu, a)
      expect(out.error).toBeUndefined()
    }
  })
})

const ffaConfig: BattleConfig = {
  level: 8,
  playerLoadout: sampleConfig.playerLoadout,
  cpuLoadout: sampleConfig.cpuLoadout,
  playerTraits: defaultTraitPoints(),
  cpuTraits: defaultTraitPoints(),
  match: matchSettingsFfa({
    playerLoadout: sampleConfig.playerLoadout,
    cpuLoadout: sampleConfig.cpuLoadout,
    playerTraits: defaultTraitPoints(),
    cpuTraits: defaultTraitPoints(),
    extra: [
      { loadout: sampleConfig.cpuLoadout, traits: defaultTraitPoints() },
      { loadout: sampleConfig.cpuLoadout, traits: defaultTraitPoints() },
    ],
  }),
}

describe('multi-actor strike', () => {
  it('rejects ambiguous strike without targetId when two enemies are adjacent', () => {
    resetIdsForTests()
    let s = createInitialState(ffaConfig)
    s = {
      ...s,
      actors: {
        ...s.actors,
        [TID.human]: { ...s.actors[TID.human]!, pos: { x: 3, y: 3 } },
        [TID.cpu]: { ...s.actors[TID.cpu]!, pos: { x: 3, y: 2 } },
        [TID.cpu2]: { ...s.actors[TID.cpu2]!, pos: { x: 2, y: 3 } },
        [TID.cpu3]: { ...s.actors[TID.cpu3]!, pos: { x: 0, y: 0 } },
      },
    }
    const r = applyAction(s, TID.human, { type: 'strike' })
    expect(r.error).toMatch(/choose|target/i)
  })

  it('accepts strike with explicit targetId', () => {
    resetIdsForTests()
    let s = createInitialState(ffaConfig)
    s = {
      ...s,
      actors: {
        ...s.actors,
        [TID.human]: { ...s.actors[TID.human]!, pos: { x: 3, y: 3 } },
        [TID.cpu]: { ...s.actors[TID.cpu]!, pos: { x: 3, y: 2 } },
        [TID.cpu2]: { ...s.actors[TID.cpu2]!, pos: { x: 2, y: 3 } },
        [TID.cpu3]: { ...s.actors[TID.cpu3]!, pos: { x: 0, y: 0 } },
      },
    }
    const r = applyAction(s, TID.human, { type: 'strike', targetId: TID.cpu })
    expect(r.error).toBeUndefined()
  })
})

describe('FFA win condition', () => {
  it('declares last actor alive as winner', () => {
    resetIdsForTests()
    const s = createInitialState(ffaConfig)
    const oneLeft = {
      ...s,
      actors: {
        ...s.actors,
        [TID.cpu]: { ...s.actors[TID.cpu]!, hp: 0 },
        [TID.cpu2]: { ...s.actors[TID.cpu2]!, hp: 0 },
        [TID.cpu3]: { ...s.actors[TID.cpu3]!, hp: 0 },
      },
    }
    const r = applyTurnEntry(oneLeft)
    expect(r.winner).toBe(TID.human)
  })
})
