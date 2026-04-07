import { describe, expect, it } from 'vitest'
import {
  assignCallsigns,
  balancedTeamIdsForSplit,
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

describe('assignCallsigns', () => {
  it('returns unique names for typical roster sizes', () => {
    for (const n of [1, 2, 4, 8]) {
      const names = assignCallsigns(n)
      expect(names).toHaveLength(n)
      expect(new Set(names).size).toBe(n)
    }
  })

  it('returns empty for non-positive count', () => {
    expect(assignCallsigns(0)).toEqual([])
    expect(assignCallsigns(-1)).toEqual([])
  })
})

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
    expect(validateCustomTeamIds([0, 1, 2, 3, 4, 5, 6, 7, 0])).not.toBeNull()
  })

  it('accepts up to eight fighters with team ids 0–7', () => {
    expect(validateCustomTeamIds([0, 1, 2, 3, 4, 5, 6, 7])).toBeNull()
  })

  it('rejects non-integer, negative, or out-of-range team ids', () => {
    expect(validateCustomTeamIds([0, 0.5])).not.toBeNull()
    expect(validateCustomTeamIds([-1, 0])).not.toBeNull()
    expect(validateCustomTeamIds([0, 8])).not.toBeNull()
  })
})

describe('balancedTeamIdsForSplit', () => {
  it('returns empty for invalid arguments', () => {
    expect(balancedTeamIdsForSplit(1, 2)).toEqual([])
    expect(balancedTeamIdsForSplit(4, 1)).toEqual([])
    expect(balancedTeamIdsForSplit(4, 5)).toEqual([])
    expect(balancedTeamIdsForSplit(9, 2)).toEqual([])
  })

  it('produces valid rosters with exact team count and balanced sizes', () => {
    expect(balancedTeamIdsForSplit(2, 2)).toEqual([0, 1])
    expect(balancedTeamIdsForSplit(4, 2)).toEqual([0, 0, 1, 1])
    expect(balancedTeamIdsForSplit(4, 4)).toEqual([0, 1, 2, 3])
    expect(balancedTeamIdsForSplit(6, 3)).toEqual([0, 0, 1, 1, 2, 2])
    expect(balancedTeamIdsForSplit(7, 3)).toEqual([0, 0, 0, 1, 1, 2, 2])
    expect(balancedTeamIdsForSplit(8, 3)).toEqual([0, 0, 0, 1, 1, 1, 2, 2])
    for (const [f, t] of [
      [2, 2],
      [4, 2],
      [4, 4],
      [8, 3],
      [8, 8],
    ] as const) {
      const ids = balancedTeamIdsForSplit(f, t)
      expect(validateCustomTeamIds(ids)).toBeNull()
      expect(ids).toHaveLength(f)
      expect(new Set(ids).size).toBe(t)
    }
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

  it('is true even when every team is solo (duel / FFA-style)', () => {
    const ms = buildCustomMatchSettings({
      humanLoadout: emptyLoadout,
      humanTraits: traits,
      cpuBuilds: [{ loadout: emptyLoadout, traits }],
      teamIds: [0, 1],
      defaultCpuDifficulty: 'normal',
    })
    expect(coerceFriendlyFire(ms.roster)).toBe(true)
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

  it('maps per-cpu difficulties when cpuDifficulties is provided', () => {
    const ms = buildCustomMatchSettings({
      humanLoadout: emptyLoadout,
      humanTraits: traits,
      cpuBuilds: [
        { loadout: emptyLoadout, traits },
        { loadout: emptyLoadout, traits },
      ],
      teamIds: [0, 1, 2],
      defaultCpuDifficulty: 'normal',
      cpuDifficulties: ['easy', 'nightmare'],
    })
    const cpus = ms.roster.filter((r) => !r.isHuman)
    expect(cpus).toHaveLength(2)
    expect(ms.perCpuDifficulty?.[cpus[0]!.actorId]).toBe('easy')
    expect(ms.perCpuDifficulty?.[cpus[1]!.actorId]).toBe('nightmare')
  })

  it('throws when cpuDifficulties length does not match cpuBuilds', () => {
    expect(() =>
      buildCustomMatchSettings({
        humanLoadout: emptyLoadout,
        humanTraits: traits,
        cpuBuilds: [{ loadout: emptyLoadout, traits }],
        teamIds: [0, 1],
        defaultCpuDifficulty: 'normal',
        cpuDifficulties: ['easy', 'hard'],
      }),
    ).toThrow(/cpuDifficulties/)
  })

  it('builds a valid eight-fighter FFA roster', () => {
    const teamIds = [0, 1, 2, 3, 4, 5, 6, 7]
    const cpuBuilds = teamIds.slice(1).map(() => ({ loadout: emptyLoadout, traits }))
    const ms = buildCustomMatchSettings({
      humanLoadout: emptyLoadout,
      humanTraits: traits,
      cpuBuilds,
      teamIds,
      defaultCpuDifficulty: 'normal',
    })
    expect(ms.roster).toHaveLength(8)
  })
})
