import { describe, expect, it } from 'vitest'
import { coordKey } from '../../game/board'
import { applyAction, createInitialState, resetIdsForTests } from '../../game/engine'
import type { BattleConfig, GameState, TileImpact } from '../../game/types'
import { defaultTraitPoints } from '../../game/traits'
import { duelBattleConfig, TID } from '../../game/test-fixtures'
import { describeBattleCellTooltip } from './cell-tooltip'

const sampleConfig: BattleConfig = duelBattleConfig({
  level: 8,
  playerLoadout: [
    {
      skillId: 'ember',
      pattern: [{ dx: 0, dy: 0 }],
      statusStacks: 2,
      costDiscount: 0,
      rangeTier: 3,
    },
  ],
  cpuLoadout: [
    { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, costDiscount: 0, rangeTier: 3 },
  ],
  playerTraits: defaultTraitPoints(),
  cpuTraits: defaultTraitPoints(),
})

function hazardAt(owner: string): TileImpact {
  return {
    skillId: 'ember',
    statusStacks: 2,
    casterStatusPotency: 0,
    owner,
    turnsRemaining: 4,
  }
}

describe('describeBattleCellTooltip', () => {
  it('returns null for an empty cell', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig, { randomizeTurnOrder: false })
    expect(describeBattleCellTooltip(s, { x: 0, y: 0 })).toBeNull()
  })

  it('describes a lingering hazard only', () => {
    resetIdsForTests()
    let s = createInitialState(sampleConfig, { randomizeTurnOrder: false })
    s = applyAction(s, TID.human, { type: 'cast', skillId: 'ember', target: { x: 3, y: 2 } }).state!
    const t = describeBattleCellTooltip(s, { x: 3, y: 2 })
    expect(t).toContain('Lingering: Ember')
    expect(t).toMatch(/\d+ turns/)
    expect(t).toContain('Vex')
  })

  it('describes an actor only', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig, { randomizeTurnOrder: false })
    const p = s.actors[TID.human]!.pos
    const t = describeBattleCellTooltip(s, p)
    expect(t).toMatch(/^Vex — \d+\/\d+$/)
  })

  it('describes actor with statuses', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig, { randomizeTurnOrder: false })
    const player = {
      ...s.actors[TID.human]!,
      statuses: [{ id: 'st1', tag: { t: 'burning' as const, duration: 2, dot: 3 } }],
    }
    const next: GameState = { ...s, actors: { ...s.actors, [TID.human]: player } }
    const t = describeBattleCellTooltip(next, player.pos)
    expect(t).toContain('burning')
  })

  it('groups duplicate status kinds in the one-line summary (e.g. two slows)', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig, { randomizeTurnOrder: false })
    const player = {
      ...s.actors[TID.human]!,
      statuses: [
        { id: 'a', tag: { t: 'slowed' as const, duration: 2 } },
        { id: 'b', tag: { t: 'slowed' as const, duration: 3 } },
      ],
    }
    const next: GameState = { ...s, actors: { ...s.actors, [TID.human]: player } }
    const t = describeBattleCellTooltip(next, player.pos)
    expect(t).toContain('slowed ×2')
    expect(t).not.toMatch(/slowed,\s*slowed/)
  })

  it('describes hazard and actor when both present', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig, { randomizeTurnOrder: false })
    const k = coordKey(s.actors[TID.human]!.pos)
    const next: GameState = {
      ...s,
      impactedTiles: { ...s.impactedTiles, [k]: hazardAt(TID.human) },
    }
    const t = describeBattleCellTooltip(next, s.actors[TID.human]!.pos)
    expect(t).toContain('Vex —')
    expect(t).toContain('Lingering: Ember')
  })

  it('lists two actors on the same cell', () => {
    resetIdsForTests()
    const s = createInitialState(sampleConfig, { randomizeTurnOrder: false })
    const pos = { x: 2, y: 4 }
    const next: GameState = {
      ...s,
      actors: {
        ...s.actors,
        [TID.human]: { ...s.actors[TID.human]!, pos },
        [TID.cpu]: { ...s.actors[TID.cpu]!, pos },
      },
    }
    const t = describeBattleCellTooltip(next, pos)
    expect(t).toContain('\n')
    expect(t).toContain('Vex —')
    expect(t).toContain('Hostile —')
  })
})
