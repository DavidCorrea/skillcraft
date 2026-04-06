import { describe, expect, it } from 'vitest'
import { maxSkillsForLevel, totalLoadoutPoints, validateLoadout } from './skills'
import { PRESET_PLAYER_BUILDS } from './preset-builds'

describe('PRESET_PLAYER_BUILDS', () => {
  it('every preset passes validateLoadout at its level', () => {
    for (const p of PRESET_PLAYER_BUILDS) {
      const err = validateLoadout(p.level, p.entries, maxSkillsForLevel(p.level), p.traits)
      expect(err, p.id).toBeNull()
    }
  })

  it('every preset spends exactly the level budget', () => {
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
})
