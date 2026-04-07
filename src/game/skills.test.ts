import { describe, expect, it } from 'vitest'
import {
  clampSkillLoadoutEntry,
  countGridToPatternOffsets,
  countHitsOnEnemy,
  effectiveCastRangeForLoadout,
  entryPointCost,
  fitPlayerBudgetToLevel,
  focusBonusDamage,
  getSkillDef,
  immunizeChargesFromStacks,
  manaCostForCast,
  maxSkillPointsBudget,
  maxSkillsForLevel,
  minCastManhattanForLoadout,
  overclockSlowDuration,
  patternOffsetsToCountGrid,
  SKILL_ROSTER,
  skillLoadoutSection,
  tierPointCost,
  totalLoadoutPoints,
  validateLoadout,
} from './skills'
import type { SkillLoadoutEntry } from './types'
import { defaultTraitPoints } from './traits'

function patternMultisetKey(p: { dx: number; dy: number }[]): string {
  return p
    .map((o) => `${o.dx},${o.dy}`)
    .sort()
    .join('|')
}

describe('Skill craft copy', () => {
  it('every roster skill has flavor and effects summary text', () => {
    for (const s of SKILL_ROSTER) {
      expect(s.flavor.trim().length, s.id).toBeGreaterThan(0)
      expect(s.effectsLine.trim().length, s.id).toBeGreaterThan(0)
    }
  })
})

describe('patternOffsetsToCountGrid', () => {
  it('round-trips with countGridToPatternOffsets preserving multiset', () => {
    const pattern = [
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 },
      { dx: -1, dy: 0 },
    ]
    const grid = patternOffsetsToCountGrid(pattern)
    const back = countGridToPatternOffsets(grid)
    expect(patternMultisetKey(back)).toBe(patternMultisetKey(pattern))
  })

  it('supports enlarged radius for loadout planner', () => {
    const pattern = [
      { dx: 0, dy: 0 },
      { dx: 6, dy: -4 },
    ]
    const grid = patternOffsetsToCountGrid(pattern, 6)
    expect(grid.length).toBe(13)
    const back = countGridToPatternOffsets(grid)
    expect(patternMultisetKey(back)).toBe(patternMultisetKey(pattern))
  })
})

describe('entryPointCost', () => {
  it('counts pattern, stacks, and mana discount', () => {
    const e: SkillLoadoutEntry = {
      skillId: 'ember',
      pattern: [
        { dx: 0, dy: 0 },
        { dx: 0, dy: 0 },
      ],
      statusStacks: 2,
      costDiscount: 2,
    }
    expect(entryPointCost(e)).toBe(6)
  })

  it('adds triangular cost for cast and AoE tiers', () => {
    const e: SkillLoadoutEntry = {
      skillId: 'ember',
      pattern: [{ dx: 0, dy: 0 }],
      statusStacks: 1,
      costDiscount: 0,
      rangeTier: 2,
      aoeTier: 2,
    }
    expect(entryPointCost(e)).toBe(2 + tierPointCost(2) + tierPointCost(2))
  })
})

describe('effectiveCastRangeForLoadout', () => {
  it('uses max Manhattan tier + 1 for non-self skills', () => {
    const def = getSkillDef('ember')
    const entry: SkillLoadoutEntry = {
      skillId: 'ember',
      pattern: [{ dx: 0, dy: 0 }],
      statusStacks: 1,
      rangeTier: 0,
    }
    expect(effectiveCastRangeForLoadout(def, entry, defaultTraitPoints())).toBe(1)
    expect(
      effectiveCastRangeForLoadout(
        def,
        { ...entry, rangeTier: 2 },
        defaultTraitPoints(),
      ),
    ).toBe(3)
  })

  it('requires distance 1 when cast range tier is 0 (non-self)', () => {
    const def = getSkillDef('ember')
    const entry: SkillLoadoutEntry = {
      skillId: 'ember',
      pattern: [{ dx: 0, dy: 0 }],
      statusStacks: 1,
      rangeTier: 0,
    }
    expect(minCastManhattanForLoadout(def, entry)).toBe(1)
    expect(
      minCastManhattanForLoadout(def, { ...entry, rangeTier: 1 }),
    ).toBe(0)
  })

  it('utility skills allow anchor on self (min 0) and add arcane reach to max range', () => {
    const def = getSkillDef('mend')
    const entry: SkillLoadoutEntry = {
      skillId: 'mend',
      pattern: [{ dx: 0, dy: 0 }],
      statusStacks: 1,
      rangeTier: 0,
    }
    expect(minCastManhattanForLoadout(def, entry)).toBe(0)
    expect(effectiveCastRangeForLoadout(def, entry, defaultTraitPoints())).toBe(1)
    expect(
      effectiveCastRangeForLoadout(def, entry, { ...defaultTraitPoints(), arcaneReach: 4 }),
    ).toBe(3)
  })
})

describe('manaCostForCast', () => {
  it('subtracts discount from base power cost', () => {
    const e: SkillLoadoutEntry = {
      skillId: 'ember',
      pattern: [{ dx: 0, dy: 0 }],
      statusStacks: 3,
      costDiscount: 2,
    }
    expect(manaCostForCast(e, 0)).toBe(2)
  })

  it('adds Manhattan distance from caster to anchor', () => {
    const e: SkillLoadoutEntry = {
      skillId: 'ember',
      pattern: [{ dx: 0, dy: 0 }],
      statusStacks: 1,
      costDiscount: 0,
    }
    expect(manaCostForCast(e, 0)).toBe(2)
    expect(manaCostForCast(e, 3)).toBe(5)
  })

  it('never goes below 1', () => {
    const e: SkillLoadoutEntry = {
      skillId: 'ember',
      pattern: [{ dx: 0, dy: 0 }],
      statusStacks: 2,
      costDiscount: 5,
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
  it('ramps with level and caps at seven', () => {
    expect(maxSkillsForLevel(1)).toBe(1)
    expect(maxSkillsForLevel(5)).toBe(2)
    expect(maxSkillsForLevel(14)).toBe(4)
    expect(maxSkillsForLevel(99)).toBe(7)
  })
})

describe('validateLoadout', () => {
  it('accepts a baseline skill at level 1 (selection costs no budget)', () => {
    const entries: SkillLoadoutEntry[] = [
      { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, costDiscount: 0 },
    ]
    expect(validateLoadout(1, entries, maxSkillsForLevel(1), defaultTraitPoints())).toBeNull()
    expect(totalLoadoutPoints(entries, defaultTraitPoints())).toBe(0)
  })

  it('accepts valid allocation', () => {
    const entries: SkillLoadoutEntry[] = [
      { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, costDiscount: 0 },
      { skillId: 'spark', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, costDiscount: 0 },
    ]
    expect(validateLoadout(8, entries, maxSkillsForLevel(8), defaultTraitPoints())).toBeNull()
  })

  it('rejects when total points exceed level', () => {
    const entries: SkillLoadoutEntry[] = [
      { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 5, costDiscount: 0 },
    ]
    expect(validateLoadout(3, entries, maxSkillsForLevel(3), defaultTraitPoints())).not.toBeNull()
  })

  it('counts traits against the same budget as skills', () => {
    const entries: SkillLoadoutEntry[] = [
      { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, costDiscount: 0 },
    ]
    const t1 = { ...defaultTraitPoints(), agility: 2, intelligence: 2 }
    expect(validateLoadout(8, entries, maxSkillsForLevel(8), t1)).toBeNull()
    const t2 = { ...defaultTraitPoints(), agility: 4, intelligence: 4 }
    expect(validateLoadout(8, entries, maxSkillsForLevel(8), t2)).not.toBeNull()
  })

  it('rejects pattern offsets outside AoE Chebyshev radius', () => {
    const entries: SkillLoadoutEntry[] = [
      {
        skillId: 'ember',
        pattern: [
          { dx: 0, dy: 0 },
          { dx: 25, dy: 0 },
        ],
        statusStacks: 1,
        costDiscount: 0,
      },
    ]
    expect(validateLoadout(14, entries, maxSkillsForLevel(14), defaultTraitPoints())).not.toBeNull()
  })

  it('accepts multi-hit on anchor at AoE tier 0 (radius 0)', () => {
    const entries: SkillLoadoutEntry[] = [
      {
        skillId: 'ember',
        pattern: [
          { dx: 0, dy: 0 },
          { dx: 0, dy: 0 },
        ],
        statusStacks: 1,
        costDiscount: 0,
      },
    ]
    expect(validateLoadout(14, entries, maxSkillsForLevel(14), defaultTraitPoints())).toBeNull()
  })

  it('accepts off-anchor pattern when AoE tier covers Chebyshev radius', () => {
    const entries: SkillLoadoutEntry[] = [
      {
        skillId: 'ember',
        pattern: [
          { dx: 0, dy: 0 },
          { dx: 3, dy: -2 },
        ],
        statusStacks: 1,
        costDiscount: 0,
        aoeTier: 3,
      },
    ]
    expect(validateLoadout(14, entries, maxSkillsForLevel(14), defaultTraitPoints())).toBeNull()
  })

  it('rejects pattern beyond AoE tier 0 (anchor-only)', () => {
    const entries: SkillLoadoutEntry[] = [
      {
        skillId: 'ember',
        pattern: [
          { dx: 0, dy: 0 },
          { dx: 4, dy: 0 },
        ],
        statusStacks: 1,
        costDiscount: 0,
      },
    ]
    expect(validateLoadout(14, entries, maxSkillsForLevel(14), defaultTraitPoints())).not.toBeNull()
  })

  it('accepts wider pattern when AoE tier reaches needed Chebyshev radius', () => {
    const entries: SkillLoadoutEntry[] = [
      {
        skillId: 'ember',
        pattern: [
          { dx: 0, dy: 0 },
          { dx: 4, dy: 0 },
        ],
        statusStacks: 1,
        costDiscount: 0,
        aoeTier: 4,
      },
    ]
    expect(validateLoadout(14, entries, maxSkillsForLevel(14), defaultTraitPoints())).toBeNull()
  })

  it('respects max skill count for level', () => {
    const entries: SkillLoadoutEntry[] = [
      { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, costDiscount: 0 },
      { skillId: 'frost_bolt', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, costDiscount: 0 },
      { skillId: 'tide_touch', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, costDiscount: 0 },
      { skillId: 'spark', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, costDiscount: 0 },
      { skillId: 'zephyr_cut', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, costDiscount: 0 },
    ]
    expect(validateLoadout(40, entries, maxSkillsForLevel(40), defaultTraitPoints())).toBeNull()
    const six: SkillLoadoutEntry[] = [
      ...entries,
      { skillId: 'venom_dart', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, costDiscount: 0 },
    ]
    expect(validateLoadout(50, six, maxSkillsForLevel(50), defaultTraitPoints())).toBeNull()
    const seven: SkillLoadoutEntry[] = [
      ...six,
      { skillId: 'tremor', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, costDiscount: 0 },
    ]
    expect(validateLoadout(50, seven, maxSkillsForLevel(50), defaultTraitPoints())).toBeNull()
    const eight: SkillLoadoutEntry[] = [
      ...seven,
      { skillId: 'arcane_pulse', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, costDiscount: 0 },
    ]
    expect(validateLoadout(50, eight, maxSkillsForLevel(50), defaultTraitPoints())).not.toBeNull()
  })
})

describe('maxSkillPointsBudget', () => {
  it('reserves level minus traits and other skills’ chargeable spend, plus baseline for this skill', () => {
    const entries: SkillLoadoutEntry[] = [
      { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, costDiscount: 0 },
    ]
    const t = { ...defaultTraitPoints(), agility: 3 }
    expect(maxSkillPointsBudget(10, t, entries, 'ember')).toBe(9)
    expect(maxSkillPointsBudget(10, t, entries, 'spark')).toBe(8)
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
      costDiscount: 2,
    }
    const c = clampSkillLoadoutEntry(entry, def, 4)
    expect(entryPointCost(c)).toBeLessThanOrEqual(4)
  })
})

describe('fitPlayerBudgetToLevel', () => {
  it('shrinks traits then skills when level drops', () => {
    const entries: SkillLoadoutEntry[] = [
      { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 4, costDiscount: 0 },
    ]
    const traits = { ...defaultTraitPoints(), agility: 2 }
    const { traits: nt, entries: ne } = fitPlayerBudgetToLevel(5, traits, entries)
    expect(validateLoadout(5, ne, maxSkillsForLevel(5), nt)).toBeNull()
  })
})

describe('skillLoadoutSection', () => {
  it('treats non-damage skills as utility', () => {
    expect(skillLoadoutSection(getSkillDef('mend'))).toBe('utility')
    expect(skillLoadoutSection(getSkillDef('ward'))).toBe('utility')
    expect(skillLoadoutSection(getSkillDef('purge'))).toBe('utility')
    expect(skillLoadoutSection(getSkillDef('focus'))).toBe('utility')
    expect(skillLoadoutSection(getSkillDef('wardbreak'))).toBe('utility')
    expect(skillLoadoutSection(getSkillDef('immunize'))).toBe('utility')
    expect(skillLoadoutSection(getSkillDef('overclock'))).toBe('utility')
  })

  it('splits damage skills into magic vs physical', () => {
    expect(skillLoadoutSection(getSkillDef('ember'))).toBe('magic')
    expect(skillLoadoutSection(getSkillDef('splinter'))).toBe('physical')
    expect(skillLoadoutSection(getSkillDef('strike'))).toBe('physical')
  })
})

describe('utility skill helpers', () => {
  it('scales focus bonus with stacks and potency', () => {
    expect(focusBonusDamage(1, 0)).toBe(3)
    expect(focusBonusDamage(2, 3)).toBe(5)
    expect(immunizeChargesFromStacks(2)).toBe(2)
    expect(overclockSlowDuration(1)).toBe(1)
    expect(overclockSlowDuration(4)).toBe(3)
  })
})
