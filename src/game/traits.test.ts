import { describe, expect, it } from 'vitest'
import {
  damageAfterElementalDefense,
  defaultTraitPoints,
  effectiveSkillRange,
  maxStaminaForTraits,
  shrinkOnePointFromTraits,
  strikeDamage,
  totalStrikeDamage,
  totalTraitPoints,
} from './traits'

describe('shrinkOnePointFromTraits', () => {
  it('removes one point from the first non-zero trait', () => {
    const t = { ...defaultTraitPoints(), agility: 1, intelligence: 2 }
    const next = shrinkOnePointFromTraits(t)
    expect(totalTraitPoints(next)).toBe(totalTraitPoints(t) - 1)
    expect(next.agility).toBe(0)
  })
})

describe('effectiveSkillRange', () => {
  it('adds one range per two arcane reach points', () => {
    const t = { ...defaultTraitPoints(), arcaneReach: 3 }
    expect(effectiveSkillRange(4, t)).toBe(5)
  })
})

describe('maxStaminaForTraits', () => {
  it('scales base pool with agility', () => {
    const base = maxStaminaForTraits(defaultTraitPoints())
    const agi = maxStaminaForTraits({ ...defaultTraitPoints(), agility: 2 })
    expect(agi).toBeGreaterThan(base)
  })
})

describe('damageAfterElementalDefense', () => {
  it('subtracts matching elemental defense and floors at 1', () => {
    const t = { ...defaultTraitPoints(), defenseFire: 3 }
    expect(damageAfterElementalDefense(10, t, 'fire')).toBe(7)
    expect(damageAfterElementalDefense(2, t, 'fire')).toBe(1)
  })

  it('uses arcane defense for arcane element', () => {
    const t = { ...defaultTraitPoints(), defenseArcane: 2 }
    expect(damageAfterElementalDefense(5, t, 'arcane')).toBe(3)
  })
})

describe('strikeDamage', () => {
  it('scales with strength', () => {
    expect(strikeDamage(0)).toBeGreaterThanOrEqual(1)
    expect(strikeDamage(2)).toBeGreaterThan(strikeDamage(0))
  })
})

describe('totalStrikeDamage', () => {
  it('adds tempo when movement this turn is at most 1', () => {
    const t = { ...defaultTraitPoints(), strength: 1, strikeTempo: 2 }
    expect(totalStrikeDamage(t, 0, 0)).toBeGreaterThan(totalStrikeDamage(t, 2, 0))
  })

  it('adds rhythm on even-numbered consecutive strikes', () => {
    const t = { ...defaultTraitPoints(), strength: 0, strikeRhythm: 3 }
    expect(totalStrikeDamage(t, 0, 0)).toBe(strikeDamage(0))
    expect(totalStrikeDamage(t, 0, 1)).toBeGreaterThan(strikeDamage(0))
  })
})
