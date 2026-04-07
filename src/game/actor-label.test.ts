import { describe, expect, it } from 'vitest'
import { actorLabelForLog } from './actor-label'
import { defaultTraitPoints } from './traits'
import type { GameState } from './types'

const traits = defaultTraitPoints()

function baseGame(over: Partial<GameState> = {}): GameState {
  return {
    size: 5,
    actors: {},
    turn: 'h',
    turnOrder: ['h', 'c'],
    winner: null,
    log: [],
    loadouts: {},
    impactedTiles: {},
    matchMode: 'teams',
    friendlyFire: true,
    teamByActor: { h: 0, c: 1 },
    humanActorId: 'h',
    cpuDifficulty: {},
    ...over,
  } as GameState
}

describe('actorLabelForLog', () => {
  it('prefers displayName for the human when set', () => {
    const g = baseGame({
      actors: {
        h: { id: 'h', displayName: 'Vex', pos: { x: 0, y: 0 }, hp: 10, maxHp: 10, mana: 0, maxMana: 10, stamina: 0, maxStamina: 10, traits, moveMaxSteps: 2, manaRegenPerTurn: 1, tilesMovedThisTurn: 0, physicalStreak: 0, statuses: [] },
      },
    })
    expect(actorLabelForLog(g, 'h')).toBe('Vex')
  })

  it('falls back to You for the human without displayName', () => {
    const g = baseGame({
      actors: {
        h: { id: 'h', pos: { x: 0, y: 0 }, hp: 10, maxHp: 10, mana: 0, maxMana: 10, stamina: 0, maxStamina: 10, traits, moveMaxSteps: 2, manaRegenPerTurn: 1, tilesMovedThisTurn: 0, physicalStreak: 0, statuses: [] },
      },
    })
    expect(actorLabelForLog(g, 'h')).toBe('You')
  })

  it('uses Ally for same-team fighter without displayName in team mode', () => {
    const g = baseGame({
      teamByActor: { h: 0, a: 0 },
      actors: {
        h: { id: 'h', displayName: 'Vex', pos: { x: 0, y: 0 }, hp: 10, maxHp: 10, mana: 0, maxMana: 10, stamina: 0, maxStamina: 10, traits, moveMaxSteps: 2, manaRegenPerTurn: 1, tilesMovedThisTurn: 0, physicalStreak: 0, statuses: [] },
        a: { id: 'a', pos: { x: 1, y: 0 }, hp: 10, maxHp: 10, mana: 0, maxMana: 10, stamina: 0, maxStamina: 10, traits, moveMaxSteps: 2, manaRegenPerTurn: 1, tilesMovedThisTurn: 0, physicalStreak: 0, statuses: [] },
      },
    })
    expect(actorLabelForLog(g, 'a')).toBe('Ally')
  })
})
