import { describe, expect, it } from 'vitest'
import {
  buildCustomMatchSettings,
  coerceFriendlyFire,
  resolveTeamColorSlotForTeamId,
  teamIdsHaveMultiMemberTeam,
  validateCustomTeamIds,
} from './match-roster'
import { defaultTraitPoints } from './traits'
import type { SkillLoadoutEntry, TraitPoints } from './types'

const emptyLoadout: SkillLoadoutEntry[] = []
const traits: TraitPoints = defaultTraitPoints()

describe('validateCustomTeamIds', () => {
  it('accepts 2v1v1 style teams', () => {
    expect(validateCustomTeamIds([0, 0, 1, 2])).toBeNull()
  })

  it('accepts duel and FFA-style', () => {
    expect(validateCustomTeamIds([0, 1])).toBeNull()
    expect(validateCustomTeamIds([0, 1, 2])).toBeNull()
  })

  it('rejects a single team', () => {
    expect(validateCustomTeamIds([0, 0])).not.toBeNull()
    expect(validateCustomTeamIds([1, 1, 1])).not.toBeNull()
  })

  it('rejects wrong lengths', () => {
    expect(validateCustomTeamIds([0])).not.toBeNull()
    expect(validateCustomTeamIds([0, 1, 2, 3, 0])).not.toBeNull()
  })

  it('rejects non-integer or negative team ids', () => {
    expect(validateCustomTeamIds([0, 0.5])).not.toBeNull()
    expect(validateCustomTeamIds([-1, 0])).not.toBeNull()
  })
})

describe('teamIdsHaveMultiMemberTeam', () => {
  it('is true when a team repeats', () => {
    expect(teamIdsHaveMultiMemberTeam([0, 0, 1, 2])).toBe(true)
  })

  it('is false when all solo', () => {
    expect(teamIdsHaveMultiMemberTeam([0, 1, 2, 3])).toBe(false)
  })
})

describe('coerceFriendlyFire', () => {
  it('is true when a team has multiple fighters', () => {
    const ms = buildCustomMatchSettings({
      humanLoadout: emptyLoadout,
      humanTraits: traits,
      cpuBuilds: [
        { loadout: emptyLoadout, traits },
        { loadout: emptyLoadout, traits },
        { loadout: emptyLoadout, traits },
      ],
      teamIds: [0, 0, 1, 2],
      defaultCpuDifficulty: 'normal',
    })
    expect(coerceFriendlyFire(ms.roster)).toBe(true)
  })

  it('is false when every team is solo (duel / FFA-style)', () => {
    const ms = buildCustomMatchSettings({
      humanLoadout: emptyLoadout,
      humanTraits: traits,
      cpuBuilds: [{ loadout: emptyLoadout, traits }],
      teamIds: [0, 1],
      defaultCpuDifficulty: 'normal',
    })
    expect(coerceFriendlyFire(ms.roster)).toBe(false)
  })
})

describe('resolveTeamColorSlotForTeamId', () => {
  it('uses override when set', () => {
    expect(resolveTeamColorSlotForTeamId(0, { 0: 5 })).toBe(5)
    expect(resolveTeamColorSlotForTeamId(1, { 1: 7 })).toBe(7)
  })

  it('defaults to clamp(teamId, 0, 7) when no override', () => {
    expect(resolveTeamColorSlotForTeamId(0, undefined)).toBe(0)
    expect(resolveTeamColorSlotForTeamId(3, {})).toBe(3)
    expect(resolveTeamColorSlotForTeamId(9, undefined)).toBe(7)
  })
})

describe('buildCustomMatchSettings', () => {
  it('preserves teamColorSlotByTeamId', () => {
    const ms = buildCustomMatchSettings({
      humanLoadout: emptyLoadout,
      humanTraits: traits,
      cpuBuilds: [{ loadout: emptyLoadout, traits }],
      teamIds: [0, 1],
      defaultCpuDifficulty: 'normal',
      teamColorSlotByTeamId: { 0: 4, 1: 2 },
    })
    expect(ms.teamColorSlotByTeamId).toEqual({ 0: 4, 1: 2 })
  })

  it('rejects invalid team color slots', () => {
    expect(() =>
      buildCustomMatchSettings({
        humanLoadout: emptyLoadout,
        humanTraits: traits,
        cpuBuilds: [{ loadout: emptyLoadout, traits }],
        teamIds: [0, 1],
        defaultCpuDifficulty: 'normal',
        teamColorSlotByTeamId: { 0: 8 as 0 },
      }),
    ).toThrow(/teamColorSlotByTeamId/)
  })

  it('builds a valid MatchSettings for 2v1v1 with friendly fire on', () => {
    const ms = buildCustomMatchSettings({
      humanLoadout: emptyLoadout,
      humanTraits: traits,
      cpuBuilds: [
        { loadout: emptyLoadout, traits },
        { loadout: emptyLoadout, traits },
        { loadout: emptyLoadout, traits },
      ],
      teamIds: [0, 0, 1, 2],
      defaultCpuDifficulty: 'normal',
    })
    expect(ms.roster).toHaveLength(4)
    expect(ms.humanActorId).toBe(ms.roster.find((r) => r.isHuman)?.actorId)
    expect(ms.friendlyFire).toBe(true)
  })

  it('throws when team ids invalid', () => {
    expect(() =>
      buildCustomMatchSettings({
        humanLoadout: emptyLoadout,
        humanTraits: traits,
        cpuBuilds: [{ loadout: emptyLoadout, traits }],
        teamIds: [0, 0],
        defaultCpuDifficulty: 'normal',
      }),
    ).toThrow()
  })
})
