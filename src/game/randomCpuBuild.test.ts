import { describe, expect, it } from 'vitest'
import { maxSkillsForLevel, totalLoadoutPoints, validateLoadout } from './skills'
import { randomCpuBuild, randomFullPlayerLoadout } from './randomCpuBuild'
import { totalTraitPoints } from './traits'

describe('randomCpuBuild', () => {
  it('produces a valid loadout for many rolls at typical levels', () => {
    for (const level of [2, 5, 8, 12, 20]) {
      for (let i = 0; i < 40; i++) {
        const { cpuLoadout, cpuTraits } = randomCpuBuild(level)
        expect(validateLoadout(level, cpuLoadout, maxSkillsForLevel(level), cpuTraits)).toBeNull()
        expect(cpuLoadout.length).toBeGreaterThan(0)
        expect(totalTraitPoints(cpuTraits)).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('still rolls a legal opponent when battle level is 1 (minimum skill costs 2 points)', () => {
    const { cpuLoadout, cpuTraits } = randomCpuBuild(1)
    expect(cpuLoadout.length).toBeGreaterThan(0)
    expect(validateLoadout(2, cpuLoadout, maxSkillsForLevel(2), cpuTraits)).toBeNull()
  })
})

describe('randomFullPlayerLoadout', () => {
  it('spends the full level budget and stays valid for level ≥ 2', () => {
    for (const level of [2, 5, 10, 14, 20]) {
      for (let i = 0; i < 40; i++) {
        const { traits, entries } = randomFullPlayerLoadout(level)
        expect(validateLoadout(level, entries, maxSkillsForLevel(level), traits)).toBeNull()
        expect(totalLoadoutPoints(entries, traits)).toBe(level)
      }
    }
  })
})
