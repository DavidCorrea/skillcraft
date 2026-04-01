/**
 * Deterministic actor ids and {@link MatchSettings} for tests (avoid random UUIDs).
 */
import type {
  BattleConfig,
  ExtraCpuBuild,
  MatchRosterEntry,
  MatchSettings,
  SkillLoadoutEntry,
  TraitPoints,
} from './types'

export const TID = {
  human: 'player',
  cpu: 'cpu',
  cpu2: 'cpu2',
  cpu3: 'cpu3',
} as const

export function matchSettingsDuel(args: {
  playerLoadout: SkillLoadoutEntry[]
  cpuLoadout: SkillLoadoutEntry[]
  playerTraits: TraitPoints
  cpuTraits: TraitPoints
}): MatchSettings {
  const roster: MatchRosterEntry[] = [
    {
      actorId: TID.human,
      teamId: 0,
      loadout: args.playerLoadout,
      traits: args.playerTraits,
      isHuman: true,
      displayName: 'You',
    },
    {
      actorId: TID.cpu,
      teamId: 1,
      loadout: args.cpuLoadout,
      traits: args.cpuTraits,
      isHuman: false,
      displayName: 'Hostile',
    },
  ]
  return {
    roster,
    humanActorId: TID.human,
    friendlyFire: false,
    defaultCpuDifficulty: 'normal',
    perCpuDifficulty: { [TID.cpu]: 'normal' },
  }
}

export function matchSettingsFfa(args: {
  playerLoadout: SkillLoadoutEntry[]
  cpuLoadout: SkillLoadoutEntry[]
  playerTraits: TraitPoints
  cpuTraits: TraitPoints
  extra: [ExtraCpuBuild, ExtraCpuBuild]
}): MatchSettings {
  const roster: MatchRosterEntry[] = [
    {
      actorId: TID.human,
      teamId: 0,
      loadout: args.playerLoadout,
      traits: args.playerTraits,
      isHuman: true,
      displayName: 'You',
    },
    {
      actorId: TID.cpu,
      teamId: 1,
      loadout: args.cpuLoadout,
      traits: args.cpuTraits,
      isHuman: false,
      displayName: 'Vex',
    },
    {
      actorId: TID.cpu2,
      teamId: 2,
      loadout: args.extra[0].loadout,
      traits: args.extra[0].traits,
      isHuman: false,
      displayName: 'Shard',
    },
    {
      actorId: TID.cpu3,
      teamId: 3,
      loadout: args.extra[1].loadout,
      traits: args.extra[1].traits,
      isHuman: false,
      displayName: 'Null',
    },
  ]
  return {
    roster,
    humanActorId: TID.human,
    friendlyFire: false,
    defaultCpuDifficulty: 'normal',
    perCpuDifficulty: {
      [TID.cpu]: 'normal',
      [TID.cpu2]: 'normal',
      [TID.cpu3]: 'normal',
    },
  }
}

/** Typical duel {@link BattleConfig} for tests — uses `matchSettingsDuel`. */
export function duelBattleConfig(partial: Pick<
  BattleConfig,
  'level' | 'playerLoadout' | 'cpuLoadout' | 'playerTraits' | 'cpuTraits'
>): BattleConfig {
  return {
    ...partial,
    match: matchSettingsDuel(partial),
  }
}

/** Four-way FFA — uses `matchSettingsFfa` (extra CPUs reuse the first CPU loadout/traits). */
export function ffaBattleConfig(partial: Pick<
  BattleConfig,
  'level' | 'playerLoadout' | 'cpuLoadout' | 'playerTraits' | 'cpuTraits'
>): BattleConfig {
  const extra: [ExtraCpuBuild, ExtraCpuBuild] = [
    { loadout: partial.cpuLoadout, traits: partial.cpuTraits },
    { loadout: partial.cpuLoadout, traits: partial.cpuTraits },
  ]
  return {
    ...partial,
    match: matchSettingsFfa({ ...partial, extra }),
  }
}
