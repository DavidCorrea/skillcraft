import { describe, expect, it } from 'vitest'
import {
  clampSkillLoadoutEntry,
  countHitsOnEnemy,
  entryPointCost,
  fitPlayerBudgetToLevel,
  getSkillDef,
  manaCostForCast,
  maxSkillPointsBudget,
  maxSkillsForLevel,
  validateLoadout,
} from './skills'
import type { SkillLoadoutEntry } from './types'
import { defaultTraitPoints } from './traits'

describe('entryPointCost', () => {
  it('counts pattern, stacks, and mana discount', () => {
    const e: SkillLoadoutEntry = {
      skillId: 'ember',
      pattern: [
        { dx: 0, dy: 0 },
        { dx: 0, dy: 0 },
      ],
      statusStacks: 2,
      manaDiscount: 2,
    }
    expect(entryPointCost(e)).toBe(6)
  })
})

describe('manaCostForCast', () => {
  it('subtracts discount from base power cost', () => {
    const e: SkillLoadoutEntry = {
      skillId: 'ember',
      pattern: [{ dx: 0, dy: 0 }],
      statusStacks: 3,
      manaDiscount: 2,
    }
    expect(manaCostForCast(e, 0)).toBe(2)
  })

  it('adds Manhattan distance from caster to anchor', () => {
    const e: SkillLoadoutEntry = {
      skillId: 'ember',
      pattern: [{ dx: 0, dy: 0 }],
      statusStacks: 1,
      manaDiscount: 0,
    }
    expect(manaCostForCast(e, 0)).toBe(2)
    expect(manaCostForCast(e, 3)).toBe(5)
  })

  it('never goes below 1', () => {
    const e: SkillLoadoutEntry = {
      skillId: 'ember',
      pattern: [{ dx: 0, dy: 0 }],
      statusStacks: 2,
      manaDiscount: 5,
    }
    expect(manaCostForCast(e, 0)).toBe(1)
  })
})

describe('countHitsOnEnemy', () => {
  it('counts duplicate offsets as multiple hits', () => {
    const enemy = { x: 3, y: 3 }
    const target = { x: 3, y: 3 }
    const n = countHitsOnEnemy(enemy, target, [
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 },
    ])
    expect(n).toBe(2)
  })
})

describe('maxSkillsForLevel', () => {
  it('ramps with level and caps at five', () => {
    expect(maxSkillsForLevel(1)).toBe(1)
    expect(maxSkillsForLevel(5)).toBe(2)
    expect(maxSkillsForLevel(14)).toBe(4)
    expect(maxSkillsForLevel(99)).toBe(5)
  })
})

describe('validateLoadout', () => {
  it('accepts valid allocation', () => {
    const entries: SkillLoadoutEntry[] = [
      { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, manaDiscount: 0 },
      { skillId: 'spark', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, manaDiscount: 0 },
    ]
    expect(validateLoadout(8, entries, maxSkillsForLevel(8), defaultTraitPoints())).toBeNull()
  })

  it('rejects when total points exceed level', () => {
    const entries: SkillLoadoutEntry[] = [
      { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 5, manaDiscount: 0 },
    ]
    expect(validateLoadout(3, entries, maxSkillsForLevel(3), defaultTraitPoints())).not.toBeNull()
  })

  it('counts traits against the same budget as skills', () => {
    const entries: SkillLoadoutEntry[] = [
      { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, manaDiscount: 0 },
    ]
    const t1 = { ...defaultTraitPoints(), agility: 2, intelligence: 2 }
    expect(validateLoadout(8, entries, maxSkillsForLevel(8), t1)).toBeNull()
    const t2 = { ...defaultTraitPoints(), agility: 4, intelligence: 4 }
    expect(validateLoadout(8, entries, maxSkillsForLevel(8), t2)).not.toBeNull()
  })

  it('respects max skill count for level', () => {
    const entries: SkillLoadoutEntry[] = [
      { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, manaDiscount: 0 },
      { skillId: 'frost_bolt', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, manaDiscount: 0 },
      { skillId: 'tide_touch', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, manaDiscount: 0 },
      { skillId: 'spark', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, manaDiscount: 0 },
      { skillId: 'zephyr_cut', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, manaDiscount: 0 },
    ]
    expect(validateLoadout(40, entries, maxSkillsForLevel(40), defaultTraitPoints())).toBeNull()
    const six: SkillLoadoutEntry[] = [
      ...entries,
      { skillId: 'venom_dart', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, manaDiscount: 0 },
    ]
    expect(validateLoadout(50, six, maxSkillsForLevel(50), defaultTraitPoints())).not.toBeNull()
  })
})

describe('maxSkillPointsBudget', () => {
  it('reserves level minus traits and other skills', () => {
    const entries: SkillLoadoutEntry[] = [
      { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, manaDiscount: 0 },
    ]
    const t = { ...defaultTraitPoints(), agility: 3 }
    expect(maxSkillPointsBudget(10, t, entries, 'ember')).toBe(7)
    expect(maxSkillPointsBudget(10, t, entries, 'spark')).toBe(4)
  })
})

describe('clampSkillLoadoutEntry', () => {
  it('trims discount, stacks, then pattern to fit budget', () => {
    const def = getSkillDef('ember')
    const entry: SkillLoadoutEntry = {
      skillId: 'ember',
      pattern: [
        { dx: 0, dy: 0 },
        { dx: 1, dy: 0 },
      ],
      statusStacks: 3,
      manaDiscount: 2,
    }
    const c = clampSkillLoadoutEntry(entry, def, 4)
    expect(entryPointCost(c)).toBeLessThanOrEqual(4)
  })
})

describe('fitPlayerBudgetToLevel', () => {
  it('shrinks traits then skills when level drops', () => {
    const entries: SkillLoadoutEntry[] = [
      { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 4, manaDiscount: 0 },
    ]
    const traits = { ...defaultTraitPoints(), agility: 2 }
    const { traits: nt, entries: ne } = fitPlayerBudgetToLevel(5, traits, entries)
    expect(validateLoadout(5, ne, maxSkillsForLevel(5), nt)).toBeNull()
  })
})
