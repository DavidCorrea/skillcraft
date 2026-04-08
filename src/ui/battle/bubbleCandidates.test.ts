import { describe, expect, it } from 'vitest'
import { bubbleCandidatesAtIndices, bubbleCandidatesForNewLogEntries } from './bubbleCandidates'
import type { BattleLogEntry, GameState } from '../../game/types'

function minimalGame(overrides: Partial<GameState> = {}): GameState {
  return {
    size: 5,
    actors: {},
    turn: 'h',
    turnOrder: ['h', 'c1'],
    winner: null,
    log: [],
    loadouts: {},
    impactedTiles: {},
    matchMode: 'ffa',
    friendlyFire: false,
    teamByActor: { h: 0, c1: 1 },
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

describe('bubbleCandidatesForNewLogEntries', () => {
  it('returns actor-voice broadcast lines for new indices only', () => {
    const game = minimalGame()
    const log: BattleLogEntry[] = [
      {
        text: 'x',
        subject: 'c1',
        detail: { kind: 'strike', actorId: 'c1', targetId: 'h', damage: 3 },
      },
    ]
    const lines = bubbleCandidatesForNewLogEntries(0, log, game, 'broadcast')
    expect(lines.length).toBeGreaterThanOrEqual(2)
    expect(lines.some((l) => l.actorId === 'c1')).toBe(true)
    expect(lines.some((l) => l.actorId === 'h')).toBe(true)
    expect(bubbleCandidatesForNewLogEntries(1, log, game, 'broadcast')).toEqual([])
  })

  it('uses classic formatted rows with subject', () => {
    const game = minimalGame()
    const log: BattleLogEntry[] = [
      { text: 'Hostile moves.', subject: 'c1', detail: { kind: 'move', actorId: 'c1' } },
    ]
    const lines = bubbleCandidatesForNewLogEntries(0, log, game, 'classic')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.actorId).toBe('c1')
    expect(lines[0]!.text).toMatch(/shift|move|position/i)
  })
})

describe('bubbleCandidatesAtIndices', () => {
  it('matches bubbleCandidatesForNewLogEntries for a contiguous index range', () => {
    const game = minimalGame()
    const log: BattleLogEntry[] = [
      { text: 'a', subject: 'c1', detail: { kind: 'move', actorId: 'c1' } },
      { text: 'b', subject: 'h', detail: { kind: 'move', actorId: 'h' } },
    ]
    const range = bubbleCandidatesForNewLogEntries(0, log, game, 'classic')
    const atIdx = bubbleCandidatesAtIndices(log, [0, 1], game, 'classic')
    expect(atIdx).toEqual(range)
  })

  it('only includes bubbles for log entries new after a ring-buffer-style rotate', () => {
    const game = minimalGame()
    const stale = Array.from({ length: 39 }, (_, i) => ({
      text: `old-${i}`,
      subject: 'h' as const,
      detail: { kind: 'move' as const, actorId: 'h' as const },
    }))
    const fresh: BattleLogEntry = {
      text: 'Hostile moves.',
      subject: 'c1',
      detail: { kind: 'move', actorId: 'c1' },
    }
    const prevLog = [...stale, { text: 'drop-me', subject: 'h', detail: { kind: 'move', actorId: 'h' } }]
    const newLog = [...prevLog.slice(1), fresh]
    const prevSet = new Set(prevLog)
    const newIndices: number[] = []
    for (let i = 0; i < newLog.length; i++) {
      if (!prevSet.has(newLog[i]!)) newIndices.push(i)
    }
    expect(newIndices).toEqual([39])
    const lines = bubbleCandidatesAtIndices(newLog, newIndices, game, 'classic')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.actorId).toBe('c1')
  })
})
