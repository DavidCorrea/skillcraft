import { describe, expect, it } from 'vitest'
import { formatClassicRow } from './classicLog'
import type { ActorState, GameState } from '../../game/types'
import { defaultTraitPoints } from '../../game/traits'

function minimalActor(id: string, displayName: string): ActorState {
  return {
    id,
    displayName,
    pos: { x: 0, y: 0 },
    hp: 10,
    maxHp: 10,
    mana: 5,
    maxMana: 10,
    stamina: 5,
    maxStamina: 10,
    traits: defaultTraitPoints(),
    moveMaxSteps: 2,
    manaRegenPerTurn: 1,
    tilesMovedThisTurn: 0,
    strikeStreak: 0,
    statuses: [],
  }
}

function game(partial: Partial<GameState> = {}): GameState {
  return {
    size: 5,
    actors: {
      h: minimalActor('h', 'Vex'),
      c: minimalActor('c', 'Shard'),
      ...partial.actors,
    },
    turn: 'h',
    turnOrder: ['h', 'c'],
    winner: null,
    log: [],
    loadouts: {},
    impactedTiles: {},
    matchMode: 'ffa',
    friendlyFire: false,
    teamByActor: { h: 0, c: 1 },
    humanActorId: 'h',
    cpuDifficulty: {},
    ...partial,
  } as GameState
}

describe('formatClassicRow', () => {
  it('shows only turn and first-person actions; hides synergy and situational', () => {
    const g = game()
    expect(formatClassicRow({ text: 'x', detail: { kind: 'battle_start' } }, g)).toBeNull()
    expect(formatClassicRow({ text: 'x', detail: { kind: 'status_reaction', reactionKey: 'melt', targetId: 'c' } }, g)).toBeNull()
    expect(
      formatClassicRow(
        {
          text: '',
          classicVisible: false,
          detail: {
            kind: 'cpu_situational',
            flavor: 'relief_not_melee_chosen',
            attackerId: 'c',
            focusTargetId: 'h',
            relievedIds: [],
          },
        },
        g,
      ),
    ).toBeNull()
  })

  it('formats human turn and actions with callsign (third person)', () => {
    const g = game()
    expect(formatClassicRow({ text: 'x', detail: { kind: 'turn', actorId: 'h' } }, g)?.text).toBe("Vex's turn.")
    expect(formatClassicRow({ text: 'x', detail: { kind: 'move', actorId: 'h' } }, g)?.text).toBe('Vex moves.')
    expect(
      formatClassicRow({ text: 'x', detail: { kind: 'strike', actorId: 'h', targetId: 'c', damage: 4 } }, g)?.text,
    ).toBe('Vex strikes for 4 damage.')
  })

  it('formats CPU turn and actions with varied phrasing', () => {
    const g = game()
    const turnPool = ['My turn.', 'Up to me.', "It's my turn.", 'Clock is mine.']
    expect(turnPool).toContain(formatClassicRow({ text: 'x', detail: { kind: 'turn', actorId: 'c' } }, g, 0)?.text)
    const movePool = ['I move.', 'I shift position.', 'Repositioning.', 'Sliding to a better tile.']
    expect(movePool).toContain(formatClassicRow({ text: 'x', detail: { kind: 'move', actorId: 'c' } }, g, 0)?.text)
    const strikePool = [
      'I strike for 3 damage.',
      'My swing lands for 3.',
      'Connecting for 3 damage.',
      'Hit for 3 damage.',
    ]
    expect(strikePool).toContain(
      formatClassicRow({ text: 'x', detail: { kind: 'strike', actorId: 'c', targetId: 'h', damage: 3 } }, g, 0)?.text,
    )
  })

  it('rotates CPU phrasing by log index so lines are not all identical', () => {
    const g = game()
    const texts = Array.from({ length: 32 }, (_, i) =>
      formatClassicRow({ text: 'x', detail: { kind: 'move', actorId: 'c' } }, g, i)?.text,
    )
    expect(new Set(texts).size).toBeGreaterThan(1)
    expect(texts.some((t) => t && !t.startsWith('I '))).toBe(true)
  })

  it('formats turn_tick DoT and regen in third person for human', () => {
    const g = game()
    expect(
      formatClassicRow(
        { text: 'x', detail: { kind: 'turn_tick', actorId: 'h', dotDamage: 2, regen: 1 } },
        g,
      )?.text,
    ).toBe('Vex takes 2 from DoTs and heals 1.')
    expect(
      ['I take 4 from DoTs.', 'DoTs tick for 4.', 'Ouch—4 from status damage.'].includes(
        formatClassicRow({ text: 'x', detail: { kind: 'turn_tick', actorId: 'c', dotDamage: 4 } }, g, 0)?.text ??
          '',
      ),
    ).toBe(true)
  })

  it('hides resource_tick from classic', () => {
    const g = game()
    expect(
      formatClassicRow(
        {
          text: 'x',
          detail: { kind: 'resource_tick', actorId: 'h', manaGained: 1, staminaGained: 1 },
        },
        g,
      ),
    ).toBeNull()
  })

  it('formats knockback from human attacker perspective', () => {
    const g = game()
    expect(
      formatClassicRow({ text: 'x', detail: { kind: 'knockback', attackerId: 'h', targetId: 'c' } }, g)?.text,
    ).toBe('Vex knocks the enemy back.')
    expect(
      formatClassicRow({ text: 'x', detail: { kind: 'knockback', attackerId: 'c', targetId: 'h' } }, g)?.text,
    ).toBe('Vex gets knocked back.')
  })
})
