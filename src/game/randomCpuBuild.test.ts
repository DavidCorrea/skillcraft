import { describe, expect, it } from 'vitest'
import type { CpuDifficulty, TraitPoints } from './types'
import { getSkillDef, maxSkillsForLevel, totalLoadoutPoints, validateLoadout } from './skills'
import { cpuTraitRolePillarScores, randomCpuBuild, randomFullPlayerLoadout } from './randomCpuBuild'
import { defaultTraitPoints, totalTraitPoints } from './traits'

function coreTraitSum(t: TraitPoints): number {
  return (
    t.agility +
    t.intelligence +
    t.vitality +
    t.wisdom +
    t.spellFocus +
    t.tenacity +
    t.statusPotency
  )
}

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

  const difficulties: CpuDifficulty[] = ['easy', 'normal', 'hard', 'nightmare']

  it.each(difficulties)('produces valid loadouts for difficulty %s at typical levels', (d) => {
    for (const level of [2, 5, 12]) {
      for (let i = 0; i < 30; i++) {
        const { cpuLoadout, cpuTraits } = randomCpuBuild(level, d)
        expect(validateLoadout(level, cpuLoadout, maxSkillsForLevel(level), cpuTraits)).toBeNull()
        expect(cpuLoadout.length).toBeGreaterThan(0)
      }
    }
  })

  it('on average, nightmare allocates more core combat/caster traits than easy at mid level', () => {
    const level = 12
    const n = 400
    let easySum = 0
    let nightmareSum = 0
    for (let i = 0; i < n; i++) {
      easySum += coreTraitSum(randomCpuBuild(level, 'easy').cpuTraits)
      nightmareSum += coreTraitSum(randomCpuBuild(level, 'nightmare').cpuTraits)
    }
    expect(nightmareSum / n).toBeGreaterThan(easySum / n + 2)
  })

  it('nightmare skill picks include utilities often enough (weight bias)', () => {
    const level = 18
    const n = 280
    let withUtility = 0
    let utilPerBuild = 0
    for (let i = 0; i < n; i++) {
      const { cpuLoadout } = randomCpuBuild(level, 'nightmare')
      const u = cpuLoadout.filter((e) => getSkillDef(e.skillId).damageKind === 'none').length
      utilPerBuild += u
      if (u >= 1) withUtility += 1
    }
    expect(withUtility / n).toBeGreaterThanOrEqual(0.5)
    expect(utilPerBuild / n).toBeGreaterThanOrEqual(0.72)
  })

  it('easy CPUs lean into one combat pillar (role-biased traits)', () => {
    const level = 16
    const n = 220
    let peaked = 0
    let eligible = 0
    for (let i = 0; i < n; i++) {
      const t = randomCpuBuild(level, 'easy').cpuTraits
      const tp = totalTraitPoints(t)
      if (tp < 6) continue
      eligible++
      const { melee, caster, tank } = cpuTraitRolePillarScores(t)
      const dominant = Math.max(melee, caster, tank)
      if (dominant >= tp * 0.42) peaked += 1
    }
    expect(eligible).toBeGreaterThan(80)
    expect(peaked / eligible).toBeGreaterThanOrEqual(0.62)
  })

  it('cpuTraitRolePillarScores counts shared keys in each role bucket', () => {
    const t = defaultTraitPoints()
    t.vitality = 4
    const s = cpuTraitRolePillarScores(t)
    expect(s.melee).toBeGreaterThanOrEqual(4)
    expect(s.tank).toBeGreaterThanOrEqual(4)
  })
})

describe('randomFullPlayerLoadout', () => {
  it('sometimes rolls non-trivial pattern offsets or tiers at mid levels', () => {
    let sawNonOriginOffset = false
    let sawNonZeroTier = false
    for (let i = 0; i < 200; i++) {
      const { entries } = randomFullPlayerLoadout(12)
      for (const e of entries) {
        if (e.pattern.some((o) => o.dx !== 0 || o.dy !== 0)) sawNonOriginOffset = true
        if ((e.rangeTier ?? 0) > 0 || (e.aoeTier ?? 0) > 0) sawNonZeroTier = true
      }
      if (sawNonOriginOffset && sawNonZeroTier) break
    }
    expect(sawNonOriginOffset).toBe(true)
    expect(sawNonZeroTier).toBe(true)
  })

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
