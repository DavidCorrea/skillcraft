/** Opaque string per fighter (often a UUID after roster normalization). */
export type ActorId = string

/** @deprecated Use `GameState.humanActorId` instead of assuming this id. */
export const PLAYER_ID = 'player'
/** @deprecated Legacy preset builds only. */
export const CPU_ID = 'cpu'
/** @deprecated Legacy preset builds only. */
export const ALLY_ID = 'ally'

export interface Coord {
  x: number
  y: number
}

export type StatusTag =
  | { t: 'burning'; duration: number; dot: number }
  | { t: 'chilled'; duration: number }
  | { t: 'frozen'; turns: number }
  | { t: 'soaked'; duration: number }
  | { t: 'shocked'; duration: number; vuln: number }
  | { t: 'poisoned'; duration: number; dot: number }
  | { t: 'bleeding'; duration: number; dot: number }
  | { t: 'slowed'; duration: number }
  | { t: 'marked'; duration: number; extra: number }
  | { t: 'rooted'; duration: number }
  | { t: 'silenced'; duration: number }
  | { t: 'regenBlocked'; duration: number }
  | { t: 'muddy'; duration: number }
  | { t: 'shield'; amount: number }

export interface StatusInstance {
  id: string
  tag: StatusTag
}

/** Loadout traits (1 pt each); frozen on each actor at battle start. */
export interface TraitPoints {
  /** +1 orthogonal step per move per point (base 1 step). */
  agility: number
  /** +1 mana at start of your turn per point (base +1/turn). */
  intelligence: number
  /** Melee strike damage scaling. */
  strength: number
  /** Bleed potency/duration from strikes. */
  bleedBonus: number
  /** Heal this much HP on each successful Strike (1 pt = 1 HP). */
  meleeLifesteal: number
  /** If ≥1, Strike pushes the enemy one tile away when that cell is free. */
  strikeKnockback: number
  /** If ≥1, Strike applies slowed (duration scales with points). */
  strikeSlow: number
  /** Flat damage reduction when hit by an attacker in an adjacent cell. */
  meleeDuelReduction: number
  /** Bonus Strike damage if you moved ≤1 tile this turn. */
  strikeTempo: number
  /** Bonus Strike damage on every 2nd consecutive Strike (move/cast breaks the chain). */
  strikeRhythm: number
  /** +max HP per point (see traits.ts HP_PER_VITALITY). */
  vitality: number
  /** +max mana per point beyond level (see traits.ts MANA_PER_WISDOM). */
  wisdom: number
  /** Heal this much HP at the start of each of your turns. */
  regeneration: number
  /** Subtract from each DoT tick (burn, poison, bleed). */
  tenacity: number
  /** +1 base skill range per 2 points (see traits.effectiveSkillRange). */
  arcaneReach: number
  /** Flat reduction to physical Strike damage (after duel reduction). */
  fortitude: number
  /** Flat reduction vs Strikes and physical skills (after fortitude). */
  physicalArmor: number
  /** Bonus to elemental skill damage after defense (per hit). */
  spellFocus: number
  /** Stronger skill-applied DoTs, shock vuln, and durations. */
  statusPotency: number
  defenseFire: number
  defenseIce: number
  defenseWater: number
  defenseElectric: number
  defensePoison: number
  defenseWind: number
  defenseEarth: number
  defenseArcane: number
}

export interface ActorState {
  id: ActorId
  /** UI label from roster; optional for backwards test configs. */
  displayName?: string
  pos: Coord
  hp: number
  maxHp: number
  /** Spent on skills; regens each turn up to maxMana. */
  mana: number
  maxMana: number
  /** Spent on Move and Strike; regens each turn up to maxStamina. */
  stamina: number
  maxStamina: number
  traits: TraitPoints
  /** Max orthogonal steps in one move (1 + agility). */
  moveMaxSteps: number
  /** Mana gained at start of your turn (1 + intelligence). */
  manaRegenPerTurn: number
  /** Orthogonal tiles moved this turn (reset at turn start). Used for Strike tempo. */
  tilesMovedThisTurn: number
  /** Consecutive Strikes without Move/Cast in between (for rhythm). */
  strikeStreak: number
  statuses: StatusInstance[]
}

/** Lingering skill energy on a board cell — harms enemies (per friendly-fire rules) when they enter. */
export interface TileImpact {
  skillId: SkillId
  statusStacks: number
  casterStatusPotency: number
  owner: ActorId
  /** Decrements when a turn passes to the next actor (see engine advanceTurn). */
  turnsRemaining: number
}

export type MatchMode = 'teams' | 'ffa'

export type CpuDifficulty = 'easy' | 'normal' | 'hard' | 'nightmare'

/** Visual palette slot for board tokens and UI (maps to CSS `t0`–`t7`). */
export type TeamColorSlot = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

/** One battle log line; `subject` selects team tint in the UI (omit for neutral flavor text). */
export interface BattleLogEntry {
  text: string
  subject?: ActorId
}

export interface GameState {
  size: number
  actors: Record<ActorId, ActorState>
  /** Current actor id. */
  turn: ActorId
  /** Round-robin order (includes all fighters). */
  turnOrder: ActorId[]
  winner: ActorId | null
  log: BattleLogEntry[]
  loadouts: Record<ActorId, SkillLoadoutEntry[]>
  /** Keyed by coordKey; residual effects from casts that can trigger when someone steps in. */
  impactedTiles: Record<string, TileImpact>
  matchMode: MatchMode
  friendlyFire: boolean
  /** Same team id = allies in team mode. In FFA each actor should have a unique team id. */
  teamByActor: Record<ActorId, number>
  humanActorId: ActorId
  /** Per-CPU difficulty; keyed by actor id. */
  cpuDifficulty: Record<ActorId, CpuDifficulty>
}

export type SkillId =
  | 'ember'
  | 'frost_bolt'
  | 'tide_touch'
  | 'spark'
  | 'venom_dart'
  | 'zephyr_cut'
  | 'tremor'
  | 'arcane_pulse'
  | 'void_lance'
  | 'mend'
  | 'ward'
  | 'purge'
  | 'splinter'
  | 'caustic_cloud'

/** Offset from the cast target cell; duplicates mean that cell is hit multiple times (extra damage). */
export interface PatternOffset {
  dx: number
  dy: number
}

export interface SkillLoadoutEntry {
  skillId: SkillId
  /** Which cells the skill affects relative to the target anchor. Each entry costs 1 point (duplicates = multi-hit). */
  pattern: PatternOffset[]
  /** Status intensity: each stack costs 1 point (minimum 1). */
  statusStacks: number
  /**
   * Extra loadout points spent to lower base mana in battle (1 pt each).
   * Mana cost = max(1, pattern.length + statusStacks - manaDiscount + distance),
   * where distance is Manhattan tiles from caster to cast anchor.
   */
  manaDiscount: number
  /**
   * Per-skill cast range tiers beyond base + Arcane reach. Each tier +1 Manhattan range.
   * Loadout cost is triangular: tier T costs T*(T+1)/2 points total (0 = off).
   * Ignored for self-target skills.
   */
  rangeTier?: number
}

/** Extra CPU beyond the first (`cpu`). */
export interface ExtraCpuBuild {
  loadout: SkillLoadoutEntry[]
  traits: TraitPoints
}

export type MatchPreset = 'duel' | 'ffa' | '1v3' | '2v2'

/** One fighter in turn order. Ids are opaque (e.g. UUID). */
export interface MatchRosterEntry {
  actorId: ActorId
  teamId: number
  loadout: SkillLoadoutEntry[]
  traits: TraitPoints
  isHuman: boolean
  displayName?: string
}

/** Canonical match definition (roster-first). */
export interface MatchSettings {
  roster: MatchRosterEntry[]
  /** Must equal the `actorId` of the unique `isHuman` row. */
  humanActorId: ActorId
  /** True when any team has 2+ fighters — allies can be hit by skills/Strikes. Set from the roster in `match-roster` (`coerceFriendlyFire`). */
  friendlyFire: boolean
  /** If set, clamped 7–15; else computed from level + actor count. */
  boardSize?: number
  defaultCpuDifficulty: CpuDifficulty
  perCpuDifficulty?: Partial<Record<ActorId, CpuDifficulty>>
  /**
   * Optional: map roster `teamId` → palette slot for board/side panel/log.
   * Defaults to `clamp(teamId, 0, 7)` when absent or for a team with no entry.
   */
  teamColorSlotByTeamId?: Partial<Record<number, TeamColorSlot>>
}

/**
 * @deprecated Input-only for {@link normalizeBattleConfig}; use {@link MatchSettings} roster.
 */
export interface LegacyMatchSettings {
  mode: MatchMode
  /** Ignored when building match settings — friendly fire is derived from the roster. */
  friendlyFire: boolean
  boardSize?: number
  defaultCpuDifficulty: CpuDifficulty
  perCpuDifficulty?: Partial<Record<ActorId, CpuDifficulty>>
  preset: MatchPreset
  extraCpus?: ExtraCpuBuild[]
  ally?: ExtraCpuBuild
}

export interface BattleConfig {
  level: number
  playerLoadout: SkillLoadoutEntry[]
  /** First enemy loadout template (legacy + CPU slot in presets). */
  cpuLoadout: SkillLoadoutEntry[]
  playerTraits: TraitPoints
  cpuTraits: TraitPoints
  /** Omit for duel; may be {@link LegacyMatchSettings} until {@link normalizeBattleConfig} runs. */
  match?: MatchSettings | LegacyMatchSettings
}
