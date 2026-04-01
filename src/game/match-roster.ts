import type {
  ActorId,
  BattleConfig,
  CpuDifficulty,
  LegacyMatchSettings,
  MatchMode,
  MatchRosterEntry,
  MatchSettings,
  SkillLoadoutEntry,
  TraitPoints,
} from './types'

function generateActorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

const DISPLAY_SYLLABLES = ['Vex', 'Shard', 'Null', 'Rook', 'Flux', 'Hex', 'Ion', 'Sol']

function displayNameForSlot(index: number): string {
  const a = DISPLAY_SYLLABLES[index % DISPLAY_SYLLABLES.length]!
  const n = Math.floor(index / DISPLAY_SYLLABLES.length)
  return n > 0 ? `${a}-${n}` : a
}

/** True if some team id appears on more than one fighter. */
export function rosterHasMultiMemberTeam(roster: MatchRosterEntry[]): boolean {
  const counts = new Map<number, number>()
  for (const r of roster) {
    counts.set(r.teamId, (counts.get(r.teamId) ?? 0) + 1)
  }
  for (const c of counts.values()) {
    if (c > 1) return true
  }
  return false
}

/** FFA when every fighter has a distinct team id. */
export function deriveMatchMode(roster: MatchRosterEntry[]): MatchMode {
  const seen = new Set<number>()
  for (const r of roster) {
    if (seen.has(r.teamId)) return 'teams'
    seen.add(r.teamId)
  }
  return 'ffa'
}

export function coerceFriendlyFire(roster: MatchRosterEntry[], requested: boolean): boolean {
  if (!rosterHasMultiMemberTeam(roster)) return false
  return requested
}

/** True if any team number appears more than once (same as {@link rosterHasMultiMemberTeam} but for ids only). */
export function teamIdsHaveMultiMemberTeam(teamIds: number[]): boolean {
  const counts = new Map<number, number>()
  for (const t of teamIds) {
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  for (const c of counts.values()) {
    if (c > 1) return true
  }
  return false
}

/**
 * Validates per-slot team assignment for custom matches (slot 0 = you).
 * Returns `null` if valid, otherwise a short user-facing message.
 */
export function validateCustomTeamIds(teamIds: number[]): string | null {
  if (teamIds.length < 2 || teamIds.length > 4) {
    return 'Choose 2–4 fighters.'
  }
  for (const t of teamIds) {
    if (!Number.isInteger(t) || t < 0) {
      return 'Each team must be a non-negative whole number.'
    }
  }
  const distinct = new Set(teamIds)
  if (distinct.size < 2) {
    return 'Need at least two different teams so there is an opponent.'
  }
  return null
}

export interface CustomCpuBuildInput {
  loadout: SkillLoadoutEntry[]
  traits: TraitPoints
}

/**
 * Builds roster-based match settings for the custom setup flow (you in slot 0, CPUs after).
 */
export function buildCustomMatchSettings(args: {
  humanLoadout: SkillLoadoutEntry[]
  humanTraits: TraitPoints
  cpuBuilds: CustomCpuBuildInput[]
  teamIds: number[]
  friendlyFire: boolean
  boardSize?: number
  defaultCpuDifficulty: CpuDifficulty
}): MatchSettings {
  const { teamIds, cpuBuilds } = args
  const err = validateCustomTeamIds(teamIds)
  if (err) throw new Error(err)
  if (cpuBuilds.length !== teamIds.length - 1) {
    throw new Error('CPU builds must match fighter count minus one')
  }

  const humanId = generateActorId()
  const roster: MatchRosterEntry[] = [
    {
      actorId: humanId,
      teamId: teamIds[0]!,
      loadout: args.humanLoadout,
      traits: args.humanTraits,
      isHuman: true,
      displayName: 'You',
    },
  ]

  const perCpuDifficulty: Partial<Record<ActorId, CpuDifficulty>> = {}
  const defDiff = args.defaultCpuDifficulty

  for (let i = 0; i < cpuBuilds.length; i++) {
    const id = generateActorId()
    const b = cpuBuilds[i]!
    roster.push({
      actorId: id,
      teamId: teamIds[i + 1]!,
      loadout: b.loadout,
      traits: b.traits,
      isHuman: false,
      displayName: displayNameForSlot(i),
    })
    perCpuDifficulty[id] = defDiff
  }

  return validateRosterMatch({
    roster,
    humanActorId: humanId,
    friendlyFire: coerceFriendlyFire(roster, args.friendlyFire),
    boardSize: args.boardSize,
    defaultCpuDifficulty: defDiff,
    perCpuDifficulty,
  })
}

function validateRosterMatch(ms: MatchSettings): MatchSettings {
  const { roster, humanActorId } = ms
  if (roster.length < 2 || roster.length > 4) throw new Error('Roster must have 2–4 fighters')
  const ids = new Set<string>()
  let humanCount = 0
  for (const r of roster) {
    if (ids.has(r.actorId)) throw new Error('Duplicate actor id in roster')
    ids.add(r.actorId)
    if (r.isHuman) humanCount += 1
  }
  if (humanCount !== 1) throw new Error('Roster must have exactly one human')
  const humanRow = roster.find((r) => r.isHuman)
  if (!humanRow || humanRow.actorId !== humanActorId) throw new Error('humanActorId must match the isHuman row')
  return {
    ...ms,
    friendlyFire: coerceFriendlyFire(roster, ms.friendlyFire),
  }
}

function isLegacyMatch(m: unknown): m is LegacyMatchSettings {
  return (
    m !== null &&
    typeof m === 'object' &&
    'preset' in m &&
    !('roster' in m)
  )
}

function isRosterMatch(m: unknown): m is MatchSettings {
  return m !== null && typeof m === 'object' && 'roster' in m && Array.isArray((m as MatchSettings).roster)
}

/**
 * Build roster + humanActorId from legacy preset + top-level loadouts.
 * Assigns new {@link generateActorId} for every fighter.
 */
export function legacyPresetToMatchSettings(config: BattleConfig, legacy: LegacyMatchSettings): MatchSettings {
  const defDiff = legacy.defaultCpuDifficulty ?? 'normal'
  const per = legacy.perCpuDifficulty ?? {}

  const humanId = generateActorId()

  function cpuDiffForLegacyKey(key: string): CpuDifficulty {
    return (per as Record<string, CpuDifficulty | undefined>)[key] ?? defDiff
  }

  if (legacy.preset === 'duel') {
    const cpuId = generateActorId()
    const roster: MatchRosterEntry[] = [
      {
        actorId: humanId,
        teamId: 0,
        loadout: config.playerLoadout,
        traits: config.playerTraits,
        isHuman: true,
        displayName: 'You',
      },
      {
        actorId: cpuId,
        teamId: 1,
        loadout: config.cpuLoadout,
        traits: config.cpuTraits,
        isHuman: false,
        displayName: displayNameForSlot(0),
      },
    ]
    return {
      roster,
      humanActorId: humanId,
      friendlyFire: coerceFriendlyFire(roster, legacy.friendlyFire),
      boardSize: legacy.boardSize,
      defaultCpuDifficulty: defDiff,
      perCpuDifficulty: { [cpuId]: cpuDiffForLegacyKey('cpu') },
    }
  }

  if (legacy.preset === '1v3') {
    const extra = legacy.extraCpus ?? []
    if (extra.length !== 2) throw new Error('1v3 requires exactly two extra CPU builds')
    const c0 = generateActorId()
    const c1 = generateActorId()
    const c2 = generateActorId()
    const roster: MatchRosterEntry[] = [
      {
        actorId: humanId,
        teamId: 0,
        loadout: config.playerLoadout,
        traits: config.playerTraits,
        isHuman: true,
        displayName: 'You',
      },
      {
        actorId: c0,
        teamId: 1,
        loadout: config.cpuLoadout,
        traits: config.cpuTraits,
        isHuman: false,
        displayName: displayNameForSlot(0),
      },
      {
        actorId: c1,
        teamId: 1,
        loadout: extra[0]!.loadout,
        traits: extra[0]!.traits,
        isHuman: false,
        displayName: displayNameForSlot(1),
      },
      {
        actorId: c2,
        teamId: 1,
        loadout: extra[1]!.loadout,
        traits: extra[1]!.traits,
        isHuman: false,
        displayName: displayNameForSlot(2),
      },
    ]
    return {
      roster,
      humanActorId: humanId,
      friendlyFire: coerceFriendlyFire(roster, legacy.friendlyFire),
      boardSize: legacy.boardSize,
      defaultCpuDifficulty: defDiff,
      perCpuDifficulty: {
        [c0]: cpuDiffForLegacyKey('cpu'),
        [c1]: cpuDiffForLegacyKey('cpu2'),
        [c2]: cpuDiffForLegacyKey('cpu3'),
      },
    }
  }

  if (legacy.preset === 'ffa') {
    const extra = legacy.extraCpus ?? []
    if (extra.length !== 2) throw new Error('FFA requires exactly two extra CPU builds')
    const c0 = generateActorId()
    const c1 = generateActorId()
    const c2 = generateActorId()
    const roster: MatchRosterEntry[] = [
      {
        actorId: humanId,
        teamId: 0,
        loadout: config.playerLoadout,
        traits: config.playerTraits,
        isHuman: true,
        displayName: 'You',
      },
      {
        actorId: c0,
        teamId: 1,
        loadout: config.cpuLoadout,
        traits: config.cpuTraits,
        isHuman: false,
        displayName: displayNameForSlot(0),
      },
      {
        actorId: c1,
        teamId: 2,
        loadout: extra[0]!.loadout,
        traits: extra[0]!.traits,
        isHuman: false,
        displayName: displayNameForSlot(1),
      },
      {
        actorId: c2,
        teamId: 3,
        loadout: extra[1]!.loadout,
        traits: extra[1]!.traits,
        isHuman: false,
        displayName: displayNameForSlot(2),
      },
    ]
    return {
      roster,
      humanActorId: humanId,
      friendlyFire: false,
      boardSize: legacy.boardSize,
      defaultCpuDifficulty: defDiff,
      perCpuDifficulty: {
        [c0]: cpuDiffForLegacyKey('cpu'),
        [c1]: cpuDiffForLegacyKey('cpu2'),
        [c2]: cpuDiffForLegacyKey('cpu3'),
      },
    }
  }

  if (legacy.preset === '2v2') {
    if (!legacy.ally || (legacy.extraCpus ?? []).length !== 1) throw new Error('2v2 requires ally + one extra CPU build')
    const allyId = generateActorId()
    const cpuA = generateActorId()
    const cpuB = generateActorId()
    const roster: MatchRosterEntry[] = [
      {
        actorId: humanId,
        teamId: 0,
        loadout: config.playerLoadout,
        traits: config.playerTraits,
        isHuman: true,
        displayName: 'You',
      },
      {
        actorId: allyId,
        teamId: 0,
        loadout: legacy.ally.loadout,
        traits: legacy.ally.traits,
        isHuman: false,
        displayName: displayNameForSlot(0),
      },
      {
        actorId: cpuA,
        teamId: 1,
        loadout: config.cpuLoadout,
        traits: config.cpuTraits,
        isHuman: false,
        displayName: displayNameForSlot(1),
      },
      {
        actorId: cpuB,
        teamId: 1,
        loadout: legacy.extraCpus![0]!.loadout,
        traits: legacy.extraCpus![0]!.traits,
        isHuman: false,
        displayName: displayNameForSlot(2),
      },
    ]
    return {
      roster,
      humanActorId: humanId,
      friendlyFire: coerceFriendlyFire(roster, legacy.friendlyFire),
      boardSize: legacy.boardSize,
      defaultCpuDifficulty: defDiff,
      perCpuDifficulty: {
        [allyId]: cpuDiffForLegacyKey('ally'),
        [cpuA]: cpuDiffForLegacyKey('cpu'),
        [cpuB]: cpuDiffForLegacyKey('cpu2'),
      },
    }
  }

  throw new Error(`Unknown preset: ${String(legacy.preset)}`)
}

/**
 * Ensures `config.match` is roster-based; coerces friendly fire; validates.
 * Accepts legacy {@link LegacyMatchSettings} or full {@link MatchSettings}.
 */
export function normalizeBattleConfig(config: BattleConfig): BattleConfig & { match: MatchSettings } {
  const ms = config.match
  if (isRosterMatch(ms)) {
    return { ...config, match: validateRosterMatch(ms) }
  }
  if (isLegacyMatch(ms)) {
    return { ...config, match: validateRosterMatch(legacyPresetToMatchSettings(config, ms)) }
  }
  if (!ms) {
    return {
      ...config,
      match: validateRosterMatch(
        legacyPresetToMatchSettings(config, {
          preset: 'duel',
          mode: 'teams',
          friendlyFire: false,
          defaultCpuDifficulty: 'normal',
        }),
      ),
    }
  }
  throw new Error('Invalid match settings')
}
