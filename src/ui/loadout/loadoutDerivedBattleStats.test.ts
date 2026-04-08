import { describe, expect, it } from 'vitest'
import { defaultTraitPoints } from '../../game/traits'
import { deriveLoadoutBattleStats, derivedStatRowKeysAfterPlusOneOnTrait } from './loadoutDerivedBattleStats'

describe('deriveLoadoutBattleStats', () => {
  it('reflects agility on steps and stamina', () => {
    const t = { ...defaultTraitPoints(), agility: 2 }
    const g = deriveLoadoutBattleStats(t, 10)
    const mov = g.find((x) => x.title === 'Movement & stamina')!
    expect(mov.rows.find((r) => r.label === 'Steps per Move')!.value).toBe('3')
    expect(mov.rows.find((r) => r.label === 'Max stamina')!.value).toBe('12')
  })

  it('reflects vitality and wisdom on pools', () => {
    const t = { ...defaultTraitPoints(), vitality: 1, wisdom: 3 }
    const g = deriveLoadoutBattleStats(t, 5)
    const pools = g.find((x) => x.title === 'Mana & HP')!
    expect(pools.rows.find((r) => r.label === 'Max HP')!.value).toBe('84')
    expect(pools.rows.find((r) => r.label === 'Max mana')!.value).toBe('8')
  })

  it('includes physical rhythm preview on second chain', () => {
    const t = { ...defaultTraitPoints(), strength: 1, physicalRhythm: 2 }
    const g = deriveLoadoutBattleStats(t, 1)
    const phys = g.find((x) => x.title === 'Physical damage skills (before their mitigations)')!
    const base = Number(phys.rows.find((r) => r.label === 'Strike skill base (2 + Strength)')!.value)
    const r2 = Number(phys.rows.find((r) => r.label === '2nd-chain hit (rhythm)')!.value)
    expect(r2).toBeGreaterThan(base)
  })
})

describe('derivedStatRowKeysAfterPlusOneOnTrait', () => {
  it('lists movement rows when Agility is bumped', () => {
    const t = defaultTraitPoints()
    const keys = derivedStatRowKeysAfterPlusOneOnTrait(t, 10, 'agility')
    expect(keys.size).toBeGreaterThanOrEqual(2)
    expect(
      [...keys].some((k) => k.includes('Movement') && k.includes('Steps per Move')),
    ).toBe(true)
    expect(
      [...keys].some((k) => k.includes('Movement') && k.includes('Max stamina')),
    ).toBe(true)
  })

  it('lists mitigation row when bumping fortitude only', () => {
    const t = defaultTraitPoints()
    const keys = derivedStatRowKeysAfterPlusOneOnTrait(t, 10, 'fortitude')
    expect(keys.size).toBe(1)
    expect([...keys][0]!.includes('Fortitude')).toBe(true)
  })
})
