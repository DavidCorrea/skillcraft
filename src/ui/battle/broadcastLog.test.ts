import { describe, expect, it } from 'vitest'
import { expandBroadcastRows } from './broadcastLog'
import type { BattleLogEntry, GameState } from '../../game/types'

function minimalGame(overrides: Partial<GameState> = {}): GameState {
  return {
    size: 5,
    actors: {},
    turn: 'h',
    turnOrder: ['h', 'c1', 'c2'],
    winner: null,
    log: [],
    loadouts: {},
    impactedTiles: {},
    matchMode: 'ffa',
    friendlyFire: false,
    teamByActor: { h: 0, c1: 1, c2: 2 },
    humanActorId: 'h',
    cpuDifficulty: {},
    casterTone: 'classic_arena',
    fullRoundsCompleted: 0,
    overtimeEnabled: false,
    roundsUntilOvertime: 12,
    overtime: null,
    tie: false,
    lastHpDamageFrom: {},
    ...overrides,
  } as GameState
}

describe('expandBroadcastRows', () => {
  it('expands strike with caster and CPU attacker/victim lines', () => {
    const game = minimalGame()
    const entry: BattleLogEntry = {
      text: 'Hostile lands Strike for 5 physical damage.',
      subject: 'c1',
      detail: { kind: 'strike', actorId: 'c1', targetId: 'c2', damage: 5 },
    }
    const rows = expandBroadcastRows(entry, game, 0)
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(rows[0]!.voice).toBe('caster')
    expect(rows.some((r) => r.subject === 'c1' && r.voice === 'actor')).toBe(true)
    expect(rows.some((r) => r.subject === 'c2' && r.voice === 'actor')).toBe(true)
  })

  it('adds actor banter for the human on their turn and when they land Strike', () => {
    const game = minimalGame()
    const turnRows = expandBroadcastRows(
      { text: '', detail: { kind: 'turn', actorId: 'h' } },
      game,
      0,
    )
    expect(turnRows.some((r) => r.subject === 'h' && r.voice === 'actor' && r.banter)).toBe(true)

    const strikeRows = expandBroadcastRows(
      {
        text: 'Strike.',
        subject: 'h',
        detail: { kind: 'strike', actorId: 'h', targetId: 'c1', damage: 4 },
      },
      game,
      1,
    )
    expect(strikeRows.some((r) => r.subject === 'h' && r.voice === 'actor')).toBe(true)
  })

  it('expands relief situational into caster plus one row per relieved CPU', () => {
    const game = minimalGame()
    const entry: BattleLogEntry = {
      text: '',
      classicVisible: false,
      detail: {
        kind: 'cpu_situational',
        flavor: 'relief_not_melee_chosen',
        attackerId: 'c1',
        focusTargetId: 'h',
        relievedIds: ['c2'],
      },
    }
    const rows = expandBroadcastRows(entry, game, 3)
    expect(rows[0]!.voice).toBe('caster')
    expect(rows.some((r) => r.subject === 'c2' && r.banter)).toBe(true)
  })

  it('uses status_reaction detail for status synergy lines', () => {
    const game = minimalGame()
    const entry: BattleLogEntry = {
      text: 'Detonate: poison and flame erupt.',
      subject: 'c1',
      detail: { kind: 'status_reaction', reactionKey: 'detonate', targetId: 'c1' },
    }
    const rows = expandBroadcastRows(entry, game, 0)
    expect(rows.some((r) => r.voice === 'caster')).toBe(true)
    expect(rows.some((r) => r.text.includes('Detonate'))).toBe(true)
  })

  it('falls back when detail is missing', () => {
    const game = minimalGame()
    const entry: BattleLogEntry = { text: 'Legacy line.', subject: 'c1' }
    const rows = expandBroadcastRows(entry, game, 0)
    expect(rows).toEqual([{ text: 'Legacy line.', subject: 'c1', voice: 'actor' }])
  })

  it('adds CPU victim banter for cast_damage hit snapshots', () => {
    const game = minimalGame()
    const entry: BattleLogEntry = {
      text: 'x',
      subject: 'h',
      detail: {
        kind: 'cast_damage',
        skillId: 'ember',
        actorId: 'h',
        totalDamage: 6,
        manaCost: 2,
        targetCount: 1,
        hitSnapshots: [{ targetId: 'c1', hpAfter: 10, maxHp: 20 }],
      },
    }
    const rows = expandBroadcastRows(entry, game, 0)
    expect(rows.some((r) => r.subject === 'c1' && r.banter && r.voice === 'actor')).toBe(true)
  })

  it('narrates first blood milestone', () => {
    const game = minimalGame()
    const entry: BattleLogEntry = {
      text: '',
      classicVisible: false,
      detail: { kind: 'battle_milestone', milestone: 'first_blood', victimId: 'c1' },
    }
    const rows = expandBroadcastRows(entry, game, 0)
    expect(rows[0]!.voice).toBe('caster')
    expect(rows[0]!.text.toLowerCase()).toMatch(/first blood|blood on the board/)
  })

  it('uses first-person human banter on human turn', () => {
    const game = minimalGame()
    const rows = expandBroadcastRows({ text: '', detail: { kind: 'turn', actorId: 'h' } }, game, 0)
    const humanRow = rows.find((r) => r.subject === 'h' && r.banter)
    expect(humanRow).toBeDefined()
    expect(
      new Set([
        'My turn — make it count.',
        'Clock is mine.',
        'Up — own the board.',
      ]).has(humanRow!.text),
    ).toBe(true)
  })

  it('expands knockback_failed into caster plus attacker and target banter', () => {
    const game = minimalGame()
    const entry: BattleLogEntry = {
      text: 'x',
      subject: 'c1',
      detail: {
        kind: 'knockback_failed',
        attackerId: 'c1',
        targetId: 'h',
        reason: 'map_edge',
      },
    }
    const rows = expandBroadcastRows(entry, game, 0)
    expect(rows).toHaveLength(3)
    expect(rows[0]!.voice).toBe('caster')
    expect(rows[1]!.subject).toBe('c1')
    expect(rows[2]!.subject).toBe('h')
  })

  it('expands lingering_expired and round_complete', () => {
    const game = minimalGame()
    const ling = expandBroadcastRows(
      {
        text: '2 residual fields dissipate.',
        detail: {
          kind: 'lingering_expired',
          tiles: [
            { coordKey: '1,1', skillId: 'ember', owner: 'h' },
            { coordKey: '2,2', skillId: 'ember', owner: 'h' },
          ],
        },
      },
      game,
      0,
    )
    expect(ling[0]!.voice).toBe('caster')

    const roundRows = expandBroadcastRows(
      { text: 'End of round 1.', detail: { kind: 'round_complete', round: 1 } },
      game,
      1,
    )
    expect(roundRows).toHaveLength(1)
    expect(roundRows[0]!.voice).toBe('caster')
  })
})

describe('classic visibility', () => {
  it('entries with classicVisible false are omitted in classic filter', () => {
    const entries: BattleLogEntry[] = [
      { text: 'a', detail: { kind: 'battle_start' } },
      { text: '', classicVisible: false, detail: { kind: 'cpu_situational', flavor: 'relief_not_melee_chosen', attackerId: 'c1', focusTargetId: 'c2', relievedIds: [] } },
    ]
    const classic = entries.filter((e) => e.classicVisible !== false)
    expect(classic).toHaveLength(1)
  })
})
