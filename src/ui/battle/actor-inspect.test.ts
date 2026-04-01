import { describe, expect, it } from 'vitest'
import { defaultTraitPoints } from '../../game/traits'
import {
  buildPatternPreview,
  cpuDifficultyLabel,
  formatSkillInspectLine,
  formatStatusLine,
  traitZonesForInspect,
} from './actor-inspect'
import type { GameState, SkillLoadoutEntry } from '../../game/types'

describe('formatStatusLine', () => {
  it('formats burning with plural turns', () => {
    expect(formatStatusLine({ id: '1', tag: { t: 'burning', duration: 2, dot: 3 } })).toBe(
      'Burning — 2 turns, 3 DoT/tick',
    )
  })

  it('formats singular turn', () => {
    expect(formatStatusLine({ id: '1', tag: { t: 'chilled', duration: 1 } })).toBe('Chilled — 1 turn')
  })

  it('formats shield amount', () => {
    expect(formatStatusLine({ id: '1', tag: { t: 'shield', amount: 12 } })).toBe('Shield — 12 absorb')
  })

  it('formats frozen skips', () => {
    expect(formatStatusLine({ id: '1', tag: { t: 'frozen', turns: 1 } })).toBe('Frozen — skip 1 turn')
  })
})

describe('formatSkillInspectLine', () => {
  it('includes skill name element and mana range', () => {
    const traits = defaultTraitPoints()
    const entry: SkillLoadoutEntry = {
      skillId: 'ember',
      pattern: [{ dx: 0, dy: 0 }],
      statusStacks: 2,
      manaDiscount: 0,
    }
    const line = formatSkillInspectLine(entry, traits)
    expect(line).toContain('Ember')
    expect(line).toContain('fire')
    expect(line).toMatch(/\d+–\d+ MP/)
  })
})

describe('traitZonesForInspect', () => {
  it('groups traits by zone with non-zero before zeros in each zone', () => {
    const t = defaultTraitPoints()
    const zones = traitZonesForInspect({ ...t, agility: 2 })
    expect(zones[0]?.title).toBe('Core')
    const coreRows = zones[0]!.rows
    const firstZeroIdx = coreRows.findIndex((r) => r.value === 0)
    expect(coreRows[0]?.label).toBe('Agility')
    expect(coreRows[0]?.value).toBe(2)
    expect(coreRows.slice(0, firstZeroIdx).every((r) => r.value > 0)).toBe(true)
  })
})

describe('buildPatternPreview', () => {
  it('returns null for empty pattern', () => {
    expect(buildPatternPreview([])).toBeNull()
  })

  it('includes cast anchor (0,0) in bounds and marks hits', () => {
    const m = buildPatternPreview([
      { dx: 1, dy: 0 },
      { dx: 1, dy: 0 },
    ])
    expect(m).not.toBeNull()
    expect(m!.cols).toBe(2)
    expect(m!.rows).toBe(1)
    expect(m!.cells.find((c) => c.isAnchor && c.count === 0)).toBeDefined()
    expect(m!.cells.find((c) => !c.isAnchor && c.count === 2)).toBeDefined()
  })

  it('builds a plus shape around anchor', () => {
    const m = buildPatternPreview([
      { dx: 0, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ])
    expect(m!.cols).toBe(3)
    expect(m!.rows).toBe(3)
    expect(m!.cells.filter((c) => c.count > 0)).toHaveLength(5)
  })
})

describe('cpuDifficultyLabel', () => {
  it('returns null for human', () => {
    const state = { humanActorId: 'h' } as GameState
    expect(cpuDifficultyLabel(state, 'h')).toBeNull()
  })

  it('capitalizes cpu difficulty', () => {
    const state = {
      humanActorId: 'h',
      cpuDifficulty: { cpu: 'nightmare' },
    } as unknown as GameState
    expect(cpuDifficultyLabel(state, 'cpu')).toBe('Nightmare')
  })
})
