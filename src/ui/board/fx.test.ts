import { describe, expect, it } from 'vitest'
import { createInitialState, resetIdsForTests } from '../../game/engine'
import type { BattleConfig } from '../../game/types'
import { defaultTraitPoints } from '../../game/traits'
import { duelBattleConfig, TID } from '../../game/test-fixtures'
import { castResolveStaggerMap, knockbackMoveFx, statusPieceClasses } from './fx'

const miniConfig: BattleConfig = duelBattleConfig({
  level: 1,
  playerLoadout: [{ skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, manaDiscount: 0 }],
  cpuLoadout: [{ skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, manaDiscount: 0 }],
  playerTraits: defaultTraitPoints(),
  cpuTraits: defaultTraitPoints(),
})

describe('castResolveStaggerMap', () => {
  it('maps coord keys to stagger index in order', () => {
    const m = castResolveStaggerMap([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0 },
    ])
    expect(m.get('0,0')).toBe(0)
    expect(m.get('1,0')).toBe(2)
  })
})

describe('knockbackMoveFx', () => {
  it('returns null when defender position unchanged', () => {
    resetIdsForTests()
    const s = createInitialState(miniConfig)
    expect(knockbackMoveFx(s, s, TID.human, TID.cpu)).toBeNull()
  })

  it('returns move fx for defender when position changes', () => {
    resetIdsForTests()
    const prev = createInitialState(miniConfig)
    const next = {
      ...prev,
      actors: {
        ...prev.actors,
        [TID.cpu]: { ...prev.actors[TID.cpu]!, pos: { x: prev.actors[TID.cpu]!.pos.x + 1, y: prev.actors[TID.cpu]!.pos.y } },
      },
    }
    const fx = knockbackMoveFx(prev, next, TID.human, TID.cpu)
    expect(fx?.kind).toBe('move')
    if (fx?.kind === 'move') {
      expect(fx.actor).toBe(TID.cpu)
    }
  })
})

describe('statusPieceClasses', () => {
  it('maps status tags to classes and dedupes', () => {
    const statuses = [
      { id: 'a', tag: { t: 'burning' as const, duration: 2, dot: 1 } },
      { id: 'b', tag: { t: 'burning' as const, duration: 2, dot: 1 } },
      { id: 'c', tag: { t: 'shield' as const, amount: 3 } },
    ]
    const cls = statusPieceClasses(statuses)
    expect(cls).toContain('holo-piece--status-burning')
    expect(cls).toContain('holo-piece--status-shield')
    expect(cls.split('holo-piece--status-burning').length - 1).toBe(1)
  })
})
