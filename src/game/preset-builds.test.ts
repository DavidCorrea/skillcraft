import { describe, expect, it } from 'vitest'
import type { SkillId } from './types'
import { maxSkillsForLevel, SKILL_ROSTER, totalLoadoutPoints, validateLoadout } from './skills'
import { PRESET_PLAYER_BUILDS } from './preset-builds'

describe('PRESET_PLAYER_BUILDS', () => {
  it('every preset passes validateLoadout at its level', () => {
    for (const p of PRESET_PLAYER_BUILDS) {
      const err = validateLoadout(p.level, p.entries, maxSkillsForLevel(p.level), p.traits)
      expect(err, p.id).toBeNull()
    }
  })

  it('every preset fills the level budget (traits + skill tuning)', () => {
    for (const p of PRESET_PLAYER_BUILDS) {
      expect(totalLoadoutPoints(p.entries, p.traits), p.id).toBe(p.level)
    }
  })

  it('has unique ids', () => {
    const ids = new Set<string>()
    for (const p of PRESET_PLAYER_BUILDS) {
      expect(ids.has(p.id), `duplicate id ${p.id}`).toBe(false)
      ids.add(p.id)
    }
  })

  it('every roster skill appears in at least one preset', () => {
    const used = new Set<SkillId>()
    for (const p of PRESET_PLAYER_BUILDS) {
      for (const e of p.entries) used.add(e.skillId)
    }
    for (const def of SKILL_ROSTER) {
      expect(used.has(def.id), `no preset uses ${def.id}`).toBe(true)
    }
  })
})
