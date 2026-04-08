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
  | { t: 'disarmed'; duration: number }
  | { t: 'regenBlocked'; duration: number }
  | { t: 'muddy'; duration: number }
  | { t: 'shield'; amount: number }
  /** Next offensive skill cast adds this much flat damage per damage instance (consumed on cast). */
  | { t: 'skillFocus'; bonus: number }
  /** Blocks incoming harmful status applications; one charge per block. */
  | { t: 'immunized'; charges: number }

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
  /** Bonus damage on each hit of physical damage skills (Strike, Splinter, …). */
  strength: number
  /** Extra bleeding DoT/duration on each physical damage hit (before skill-specific statuses). */
  bleedBonus: number
  /** Heal this much HP after a physical damage cast that hit at least one valid target (1 pt = 1 HP). */
  physicalLifesteal: number
  /** If ≥1, physical damage skills (except Shove) may push the target one tile when that cell is free. */
  physicalKnockback: number
  /** If ≥1, physical damage hits apply slowed; duration scales with points. */
  physicalSlow: number
  /** Bonus damage on physical damage skills if you moved ≤1 tile this turn. */
  physicalTempo: number
  /** Bonus on every 2nd consecutive physical offense (any physical damage skill); move or magic breaks the chain. */
  physicalRhythm: number
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
  /** Flat reduction to physical damage (toughness + armor in one stat). */
  fortitude: number
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
  /** Spent on Move and physical-school casts; regens each turn up to maxStamina. */
  stamina: number
  maxStamina: number
  traits: TraitPoints
  /** Max orthogonal steps in one move (1 + agility). */
  moveMaxSteps: number
  /** Mana gained at start of your turn (1 + intelligence). */
  manaRegenPerTurn: number
  /** Orthogonal tiles moved this turn (reset at turn start). Used for physical tempo. */
  tilesMovedThisTurn: number
  /** Consecutive physical offense casts without a reset (move or magic cast); utility physical does not change this. */
  physicalStreak: number
  /**
   * Level used for this fighter’s loadout validation, max mana formula, and high-level combat pool bands.
   * Usually equals match {@link BattleConfig.level}; challenge CPUs may use a higher value.
   */
  combatLevel: number
  statuses: StatusInstance[]
  /** From roster; selects richer CPU banter pools in broadcast mode. */
  personality?: CombatVoicePersonality
}

export type SkillId =
  | 'strike'
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
  | 'focus'
  | 'wardbreak'
  | 'immunize'
  | 'overclock'
  | 'splinter'
  | 'cleave'
  | 'shove'
  | 'hamstring'
  | 'rend'
  | 'caustic_cloud'

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

/** Broadcast log: fighter barks — keys phrase tables in `broadcastLog.ts`. */
export type CombatVoicePersonality =
  | 'stoic'
  | 'snarky'
  | 'hot_headed'
  | 'tactical'
  | 'unhinged'
  | 'grim'
  | 'cocky'

/** Caster (announcer) phrase set for broadcast mode. */
export type CasterToneId =
  | 'classic_arena'
  | 'grim_war_report'
  | 'snarky_desk'
  | 'arcane_showman'
  | 'cold_analyst'

/** Who took damage relative to the attacker — for friendly-fire-aware copy. */
export type HitRelation = 'self' | 'ally' | 'enemy'

/** Logged when a legal action attempt fails (broadcast-first; classic often hidden). */
export type ActionDeniedReason =
  | 'mana'
  | 'stamina'
  | 'move_stamina'
  | 'range'
  | 'silenced'
  | 'disarmed'
  | 'rooted'
  | 'frozen'
  | 'game_over'
  | 'wrong_turn'
  | 'out_of_bounds'
  | 'cell_occupied'
  | 'destination_unreachable'
  | 'invalid_action_type'
  | 'skill_not_in_loadout'
  | 'invalid_cast_target'
  | 'pattern_out_of_bounds'
  | 'pattern_aoe_exceeded'
  | 'unsupported_utility'

/** Visual palette slot for board tokens and UI (maps to CSS `t0`–`t7`). */
export type TeamColorSlot = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

/** Keys matching `reactionMessages` in status-reference (for battle log detail). */
export type StatusReactionKey =
  | 'melt'
  | 'evaporate'
  | 'detonate'
  | 'overload'
  | 'cauterize'
  | 'coagulate'
  | 'wildfire'
  | 'parch'
  | 'meltWard'
  | 'flashFreeze'
  | 'mud'
  | 'waterlogged'
  | 'stranglehold'
  | 'grounded'
  | 'crystallize'
  | 'brittle'
  | 'caustic'
  | 'conductive'
  | 'disrupt'
  | 'groundGrip'
  | 'calledShot'
  | 'necrosis'
  | 'tar'
  | 'stagger'

/** Status families that can expire from duration decay at turn start (see engine `decayStatuses`). */
export type ExpiringStatusKind = Exclude<
  StatusTag['t'],
  'frozen' | 'shield' | 'skillFocus' | 'immunized'
>

/** Structured payload for broadcast log; Classic uses `text` only. */
export type BattleLogDetail =
  | { kind: 'battle_start' }
  | { kind: 'turn'; actorId: ActorId }
  | { kind: 'move'; actorId: ActorId }
  | { kind: 'skip'; actorId: ActorId }
  | {
      kind: 'strike'
      actorId: ActorId
      targetId: ActorId
      damage: number
      /** After damage; for broadcast clutch / elimination copy. */
      targetHpAfter?: number
      targetMaxHp?: number
      killed?: boolean
      /** Damage absorbed by shield before HP. */
      shieldAbsorbed?: number
      /** Orthogonal adjacent opponents when the Strike skill hit landed (broadcast flavor). */
      positionalContext?: 'flanked' | 'surrounded'
    }
  | { kind: 'lifesteal'; actorId: ActorId; amount: number }
  | {
      kind: 'cast_area_heal'
      skillId: SkillId
      actorId: ActorId
      manaCost: number
      totalHeal: number
      targets: { targetId: ActorId; heal: number }[]
    }
  | {
      kind: 'cast_area_ward'
      skillId: SkillId
      actorId: ActorId
      manaCost: number
      targetIds: ActorId[]
    }
  | {
      kind: 'cast_area_purge'
      skillId: SkillId
      actorId: ActorId
      manaCost: number
      targets: { targetId: ActorId; cleanseCount: number }[]
    }
  | {
      kind: 'cast_area_focus'
      skillId: SkillId
      actorId: ActorId
      manaCost: number
      targets: { targetId: ActorId; bonus: number }[]
    }
  | {
      kind: 'cast_area_wardbreak'
      skillId: SkillId
      actorId: ActorId
      manaCost: number
      targets: { targetId: ActorId; stripped: number }[]
    }
  | {
      kind: 'cast_area_immunize'
      skillId: SkillId
      actorId: ActorId
      manaCost: number
      targets: { targetId: ActorId; charges: number }[]
    }
  | {
      kind: 'cast_area_overclock'
      skillId: SkillId
      actorId: ActorId
      manaCost: number
      targets: { targetId: ActorId; manaRestored: number; slowTurns: number }[]
    }
  | { kind: 'cast_linger'; skillId: SkillId; actorId: ActorId; manaCost: number }
  /** Damage skill found no valid targets (e.g. whiffed Strike); not a lingering tile cast. */
  | {
      kind: 'offensive_whiff'
      skillId: SkillId
      actorId: ActorId
      manaCost: number
      resource: 'mana' | 'stamina'
    }
  | {
      kind: 'cast_damage'
      skillId: SkillId
      actorId: ActorId
      totalDamage: number
      manaCost: number
      targetCount: number
      /** Per target after damage — for broadcast clutch / multi-hit narration. */
      hitSnapshots?: {
        targetId: ActorId
        hpAfter: number
        maxHp: number
        relation?: HitRelation
        shieldAbsorbed?: number
      }[]
    }
  | { kind: 'action_denied'; actorId: ActorId; reason: ActionDeniedReason }
  | {
      kind: 'residual_trigger'
      skillId: SkillId
      victimId: ActorId
      damage: number
      victimHpAfter?: number
      victimMaxHp?: number
      killed?: boolean
      shieldAbsorbed?: number
    }
  | { kind: 'status_reaction'; reactionKey: StatusReactionKey; targetId: ActorId }
  | { kind: 'frozen_skip'; actorId: ActorId }
  | { kind: 'win'; winnerId: ActorId; winnerHpAfter?: number; winnerMaxHp?: number }
  | { kind: 'turn_tick'; actorId: ActorId; dotDamage?: number; regen?: number }
  | { kind: 'resource_tick'; actorId: ActorId; manaGained: number; staminaGained: number }
  | { kind: 'knockback'; attackerId: ActorId; targetId: ActorId }
  | { kind: 'battle_milestone'; milestone: 'first_blood'; victimId: ActorId }
  | {
      kind: 'battle_milestone'
      milestone: 'kill_steal'
      killerId: ActorId
      victimId: ActorId
      /** Actor who dealt HP damage to the victim before the killing blow. */
      creditedDamagerId: ActorId
    }
  | { kind: 'cpu_thinking'; actorId: ActorId }
  | {
      kind: 'cpu_situational'
      flavor: 'relief_not_melee_chosen' | 'relief_not_spell_focus'
      attackerId: ActorId
      /** Primary victim: melee target, or first target hit by the spell. */
      focusTargetId: ActorId
      relievedIds: ActorId[]
    }
  | { kind: 'overtime_begin' }
  | {
      kind: 'overtime_storm'
      victimId: ActorId
      damage: number
      reason: 'periodic' | 'engulf'
    }
  | { kind: 'overtime_shrink'; safeRadiusAfter: number }
  | { kind: 'tie' }
  /** Lingering tiles removed after the global decay step in advanceTurn. */
  | {
      kind: 'lingering_expired'
      tiles: { coordKey: string; skillId: SkillId; owner: ActorId }[]
    }
  /** Duration-based statuses that fully dropped off at this actor's turn start (after computeTurnStartTick). */
  | { kind: 'status_expired'; actorId: ActorId; tags: ExpiringStatusKind[] }
  /** Knockback was attempted but the target did not move. */
  | {
      kind: 'knockback_failed'
      attackerId: ActorId
      targetId: ActorId
      reason: 'map_edge' | 'cell_blocked'
    }
  /** Full round just completed; only when sudden death rules are off for this match. */
  | { kind: 'round_complete'; round: number }

/** One battle log line; `subject` selects team tint in the UI (omit for neutral flavor text). */
export interface BattleLogEntry {
  text: string
  subject?: ActorId
  /** Broadcast / tooling metadata; optional for backwards compatibility. */
  detail?: BattleLogDetail
  /** When false, Classic mode hides this row (broadcast-only situational lines). */
  classicVisible?: boolean
}

/** Sudden death / battle-royale storm — geometry rolled once at activation. */
export interface OvertimeState {
  stormCenter: Coord
  /** Safe Chebyshev disk: max(|x-cx|,|y-cy|) <= safeRadius. */
  safeRadius: number
  /** Increments on each shrink; damage scales with this. */
  damageStep: number
  /** Full rounds completed while overtime is active (for shrink cadence). */
  otRoundsCompleted: number
  /**
   * When true, the next full-round boundary will not apply storm damage (preview round).
   * After each damage boundary this is set true; after a skipped boundary it is false.
   */
  stormSkipsNextBoundary: boolean
  /**
   * When a shrink-qualified round was skipped (no-damage boundary), the next damage boundary
   * performs the shrink instead of periodic storm.
   */
  deferredShrink: boolean
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
  /** Copied from match settings; always true for new matches. */
  friendlyFire: boolean
  /** Same team id = allies in team mode. In FFA each actor should have a unique team id. */
  teamByActor: Record<ActorId, number>
  humanActorId: ActorId
  /** Per-CPU difficulty; keyed by actor id. */
  cpuDifficulty: Record<ActorId, CpuDifficulty>
  /** Set after the first elimination is logged (first blood). */
  firstBloodLogged?: boolean
  /** Full rounds completed (each living actor has acted once per round). */
  fullRoundsCompleted: number
  /** Copied from match settings at battle start. */
  overtimeEnabled: boolean
  /** Rounds until sudden death when overtime is enabled. */
  roundsUntilOvertime: number
  /** Null until sudden death activates. */
  overtime: OvertimeState | null
  /** Everyone eliminated at once (e.g. same storm tick). */
  tie: boolean
  /** Copied from match settings; broadcast caster phrase tables. */
  casterTone: CasterToneId
  /** Last actor who dealt HP damage (after shield) to each victim; used for kill-credit flavor. */
  lastHpDamageFrom: Partial<Record<ActorId, ActorId>>
}

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
   * Extra loadout points spent to lower cast cost in battle (1 pt each).
   * Cost = max(1, pattern.length + statusStacks - costDiscount + distance),
   * where distance is Manhattan tiles from caster to cast anchor (mana or stamina per skill school).
   */
  costDiscount: number
  /**
   * Per-skill cast range tiers beyond base + Arcane reach. Each tier +1 Manhattan range.
   * Loadout cost is triangular: tier T costs T*(T+1)/2 points total (0 = off).
   * Ignored for self-target skills.
   */
  rangeTier?: number
  /**
   * Per-skill AoE tiers: +1 Chebyshev radius from anchor per tier (tier 0 = anchor cell only, unless the skill sets `aoeBase`).
   * Same triangular point cost as `rangeTier`. Ignored for self-target skills.
   */
  aoeTier?: number
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
  /**
   * When set, {@link ActorState.combatLevel} and starting mana bands use this instead of the match’s top-level `level`.
   */
  loadoutLevel?: number
  /** Optional: CPU battle-log banter personality (human may omit). */
  personality?: CombatVoicePersonality
}

/** Canonical match definition (roster-first). */
export interface MatchSettings {
  roster: MatchRosterEntry[]
  /** Must equal the `actorId` of the unique `isHuman` row. */
  humanActorId: ActorId
  /** Always true when built via `match-roster` (`coerceFriendlyFire`); kept for saves / hashing. Combat does not restrict hits by team. */
  friendlyFire: boolean
  /** If set, clamped 7–19; else computed from level + actor count. */
  boardSize?: number
  defaultCpuDifficulty: CpuDifficulty
  perCpuDifficulty?: Partial<Record<ActorId, CpuDifficulty>>
  /**
   * Optional: map roster `teamId` → palette slot for board/side panel/log.
   * Defaults to `clamp(teamId, 0, 7)` when absent or for a team with no entry.
   */
  teamColorSlotByTeamId?: Partial<Record<number, TeamColorSlot>>
  /** Broadcast announcer voice; default `classic_arena`. */
  casterTone?: CasterToneId
  /**
   * When true, sudden death activates after `roundsUntilOvertime` full rounds.
   * Default false for existing matches / tests.
   */
  overtimeEnabled?: boolean
  /** Required when overtime is on; typical default 12. */
  roundsUntilOvertime?: number
}

/**
 * @deprecated Input-only for {@link normalizeBattleConfig}; use {@link MatchSettings} roster.
 */
export interface LegacyMatchSettings {
  mode: MatchMode
  /** Ignored when building match settings — coerced to true in `validateRosterMatch`. */
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
  /**
   * Challenge: CPU roster builds and their combat level use `level + cpuBudgetOffset` (player stays at `level`).
   * Default 0 (fair duel).
   */
  cpuBudgetOffset?: number
  playerLoadout: SkillLoadoutEntry[]
  /** First enemy loadout template (legacy + CPU slot in presets). */
  cpuLoadout: SkillLoadoutEntry[]
  playerTraits: TraitPoints
  cpuTraits: TraitPoints
  /** Omit for duel; may be {@link LegacyMatchSettings} until {@link normalizeBattleConfig} runs. */
  match?: MatchSettings | LegacyMatchSettings
}
