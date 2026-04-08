import type {
  ActorId,
  BattleConfig,
  CasterToneId,
  CombatVoicePersonality,
  CpuDifficulty,
  LegacyMatchSettings,
  MatchMode,
  MatchRosterEntry,
  MatchSettings,
  SkillLoadoutEntry,
  TeamColorSlot,
  TraitPoints,
} from './types'

function generateActorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/** Pool for per-match callsigns (shuffled; suffix added if roster exceeds unique combinations). */
const CALLSIGN_PARTS = [
  'Vex',
  'Shard',
  'Null',
  'Rook',
  'Flux',
  'Hex',
  'Ion',
  'Sol',
  'Ash',
  'Bolt',
  'Crow',
  'Dusk',
  'Echo',
  'Frost',
  'Glint',
  'Haze',
]

function shuffleInPlace<T>(arr: T[], rnd: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const t = arr[i]!
    arr[i] = arr[j]!
    arr[j] = t
  }
}

/**
 * Unique random-ish callsigns for every fighter in a match (human + CPUs + ally).
 * Uses a shuffled pool; adds `-1`, `-2`, … style disambiguators when count exceeds one pass over the pool.
 */
export function assignCallsigns(count: number): string[] {
  if (count <= 0) return []
  const pool = [...CALLSIGN_PARTS]
  shuffleInPlace(pool, Math.random)
  const out: string[] = []
  let i = 0
  while (out.length < count) {
    const base = pool[i % pool.length]!
    const pass = Math.floor(i / pool.length)
    out.push(pass === 0 ? base : `${base}-${pass}`)
    i++
  }
  return out
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

/** Always true — stored on {@link MatchSettings} for compatibility; targeting is unrestricted in combat. */
export function coerceFriendlyFire(_roster: MatchRosterEntry[]): boolean {
  return true
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

const MAX_FIGHTERS = 8
const MAX_TEAM_INDEX = 7

/**
 * Validates per-slot team assignment for custom matches (slot 0 = you).
 * Returns `null` if valid, otherwise a short user-facing message.
 */
export function validateCustomTeamIds(teamIds: number[]): string | null {
  if (teamIds.length < 2 || teamIds.length > MAX_FIGHTERS) {
    return `Choose 2–${MAX_FIGHTERS} fighters.`
  }
  for (const t of teamIds) {
    if (!Number.isInteger(t) || t < 0 || t > MAX_TEAM_INDEX) {
      return 'Each team must be a whole number from 0–7 (A–H).'
    }
  }
  const distinct = new Set(teamIds)
  if (distinct.size < 2) {
    return 'Need at least two different teams so there is an opponent.'
  }
  return null
}

/**
 * Balanced block assignment: `teamCount` contiguous groups using ids `0 … teamCount-1`.
 * Slot 0 (you) is always team 0. Valid when 2 ≤ fighters ≤ 8, 2 ≤ teamCount ≤ min(fighters, 8).
 */
export function balancedTeamIdsForSplit(fighterCount: number, teamCount: number): number[] {
  if (
    fighterCount < 2 ||
    fighterCount > MAX_FIGHTERS ||
    teamCount < 2 ||
    teamCount > fighterCount ||
    teamCount > MAX_TEAM_INDEX + 1
  ) {
    return []
  }
  const base = Math.floor(fighterCount / teamCount)
  const extra = fighterCount % teamCount
  const out: number[] = []
  for (let team = 0; team < teamCount; team++) {
    const n = base + (team < extra ? 1 : 0)
    for (let j = 0; j < n; j++) out.push(team)
  }
  return out
}

export interface CustomCpuBuildInput {
  loadout: SkillLoadoutEntry[]
  traits: TraitPoints
  /** When set, this CPU’s combat pools use this level (e.g. player L + challenge offset). */
  loadoutLevel?: number
  /** Battle-log banter; omit to assign elsewhere (e.g. random at match start). */
  personality?: CombatVoicePersonality
}

/**
 * Palette slot for a roster team id: optional override, else `clamp(floor(teamId), 0, 7)`.
 */
export function resolveTeamColorSlotForTeamId(
  teamId: number,
  teamColorSlotByTeamId: Partial<Record<number, TeamColorSlot>> | undefined,
): TeamColorSlot {
  const override = teamColorSlotByTeamId?.[teamId]
  if (override !== undefined) return override
  const t = Math.min(7, Math.max(0, Math.floor(teamId)))
  return t as TeamColorSlot
}

/**
 * Builds roster-based match settings for the custom setup flow (you in slot 0, CPUs after).
 */
export function buildCustomMatchSettings(args: {
  humanLoadout: SkillLoadoutEntry[]
  humanTraits: TraitPoints
  cpuBuilds: CustomCpuBuildInput[]
  teamIds: number[]
  boardSize?: number
  defaultCpuDifficulty: CpuDifficulty
  /** One entry per CPU (same order as `cpuBuilds`). Omitted entries use `defaultCpuDifficulty`. */
  cpuDifficulties?: CpuDifficulty[]
  teamColorSlotByTeamId?: Partial<Record<number, TeamColorSlot>>
  overtimeEnabled?: boolean
  roundsUntilOvertime?: number
  casterTone?: CasterToneId
  /** Battle-log banter for the human fighter; omit for generic human lines. */
  humanPersonality?: CombatVoicePersonality
}): MatchSettings {
  const { teamIds, cpuBuilds } = args
  const err = validateCustomTeamIds(teamIds)
  if (err) throw new Error(err)
  if (cpuBuilds.length !== teamIds.length - 1) {
    throw new Error('CPU builds must match fighter count minus one')
  }
  if (args.cpuDifficulties !== undefined && args.cpuDifficulties.length !== cpuBuilds.length) {
    throw new Error('cpuDifficulties must match cpuBuilds length')
  }

  const humanId = generateActorId()
  const names = assignCallsigns(1 + cpuBuilds.length)
  const roster: MatchRosterEntry[] = [
    {
      actorId: humanId,
      teamId: teamIds[0]!,
      loadout: args.humanLoadout,
      traits: args.humanTraits,
      isHuman: true,
      displayName: names[0]!,
      ...(args.humanPersonality !== undefined ? { personality: args.humanPersonality } : {}),
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
      displayName: names[i + 1]!,
      ...(b.loadoutLevel !== undefined ? { loadoutLevel: b.loadoutLevel } : {}),
      ...(b.personality !== undefined ? { personality: b.personality } : {}),
    })
    perCpuDifficulty[id] = args.cpuDifficulties?.[i] ?? defDiff
  }

  return validateRosterMatch({
    roster,
    humanActorId: humanId,
    friendlyFire: coerceFriendlyFire(roster),
    boardSize: args.boardSize,
    defaultCpuDifficulty: defDiff,
    perCpuDifficulty,
    teamColorSlotByTeamId: args.teamColorSlotByTeamId,
    ...(args.overtimeEnabled !== undefined ? { overtimeEnabled: args.overtimeEnabled } : {}),
    ...(args.roundsUntilOvertime !== undefined
      ? { roundsUntilOvertime: Math.max(1, args.roundsUntilOvertime) }
      : {}),
    ...(args.casterTone !== undefined ? { casterTone: args.casterTone } : {}),
  })
}

function validateTeamColorSlotMap(
  teamColorSlotByTeamId: Partial<Record<number, TeamColorSlot>> | undefined,
): void {
  if (!teamColorSlotByTeamId) return
  for (const v of Object.values(teamColorSlotByTeamId)) {
    if (v === undefined) continue
    if (!Number.isInteger(v) || v < 0 || v > 7) {
      throw new Error('teamColorSlotByTeamId values must be integers 0–7')
    }
  }
}

function validateRosterMatch(ms: MatchSettings): MatchSettings {
  const { roster, humanActorId } = ms
  if (roster.length < 2 || roster.length > MAX_FIGHTERS) {
    throw new Error(`Roster must have 2–${MAX_FIGHTERS} fighters`)
  }
  validateTeamColorSlotMap(ms.teamColorSlotByTeamId)
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
    friendlyFire: coerceFriendlyFire(roster),
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
    const names = assignCallsigns(2)
    const cpuId = generateActorId()
    const roster: MatchRosterEntry[] = [
      {
        actorId: humanId,
        teamId: 0,
        loadout: config.playerLoadout,
        traits: config.playerTraits,
        isHuman: true,
        displayName: names[0]!,
      },
      {
        actorId: cpuId,
        teamId: 1,
        loadout: config.cpuLoadout,
        traits: config.cpuTraits,
        isHuman: false,
        displayName: names[1]!,
      },
    ]
    return {
      roster,
      humanActorId: humanId,
      friendlyFire: coerceFriendlyFire(roster),
      boardSize: legacy.boardSize,
      defaultCpuDifficulty: defDiff,
      perCpuDifficulty: { [cpuId]: cpuDiffForLegacyKey('cpu') },
    }
  }

  if (legacy.preset === '1v3') {
    const extra = legacy.extraCpus ?? []
    if (extra.length !== 2) throw new Error('1v3 requires exactly two extra CPU builds')
    const names = assignCallsigns(4)
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
        displayName: names[0]!,
      },
      {
        actorId: c0,
        teamId: 1,
        loadout: config.cpuLoadout,
        traits: config.cpuTraits,
        isHuman: false,
        displayName: names[1]!,
      },
      {
        actorId: c1,
        teamId: 1,
        loadout: extra[0]!.loadout,
        traits: extra[0]!.traits,
        isHuman: false,
        displayName: names[2]!,
      },
      {
        actorId: c2,
        teamId: 1,
        loadout: extra[1]!.loadout,
        traits: extra[1]!.traits,
        isHuman: false,
        displayName: names[3]!,
      },
    ]
    return {
      roster,
      humanActorId: humanId,
      friendlyFire: coerceFriendlyFire(roster),
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
    const names = assignCallsigns(4)
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
        displayName: names[0]!,
      },
      {
        actorId: c0,
        teamId: 1,
        loadout: config.cpuLoadout,
        traits: config.cpuTraits,
        isHuman: false,
        displayName: names[1]!,
      },
      {
        actorId: c1,
        teamId: 2,
        loadout: extra[0]!.loadout,
        traits: extra[0]!.traits,
        isHuman: false,
        displayName: names[2]!,
      },
      {
        actorId: c2,
        teamId: 3,
        loadout: extra[1]!.loadout,
        traits: extra[1]!.traits,
        isHuman: false,
        displayName: names[3]!,
      },
    ]
    return {
      roster,
      humanActorId: humanId,
      friendlyFire: coerceFriendlyFire(roster),
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
    const names = assignCallsigns(4)
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
        displayName: names[0]!,
      },
      {
        actorId: allyId,
        teamId: 0,
        loadout: legacy.ally.loadout,
        traits: legacy.ally.traits,
        isHuman: false,
        displayName: names[1]!,
      },
      {
        actorId: cpuA,
        teamId: 1,
        loadout: config.cpuLoadout,
        traits: config.cpuTraits,
        isHuman: false,
        displayName: names[2]!,
      },
      {
        actorId: cpuB,
        teamId: 1,
        loadout: legacy.extraCpus![0]!.loadout,
        traits: legacy.extraCpus![0]!.traits,
        isHuman: false,
        displayName: names[3]!,
      },
    ]
    return {
      roster,
      humanActorId: humanId,
      friendlyFire: coerceFriendlyFire(roster),
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
 * Ensures `config.match` is roster-based; sets `friendlyFire` (always true); validates.
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
