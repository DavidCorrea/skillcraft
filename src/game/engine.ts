import { actorLabelForLog } from './actor-label'
import type {
  ActorId,
  ActorState,
  BattleConfig,
  BattleLogEntry,
  Coord,
  CpuDifficulty,
  GameState,
  MatchMode,
  MatchSettings,
  PatternOffset,
  SkillId,
  SkillLoadoutEntry,
  StatusInstance,
  StatusTag,
  TileImpact,
  TraitPoints,
} from './types'
import {
  chebyshevDistance,
  currentOvertimeDamageAmount,
  isOvertimeLethal,
  rollStormActivation,
  SHRINK_EVERY_OT_ROUNDS,
} from './overtime'
import type { StatusReactionMessage } from './status-reference'
import {
  boardSizeForMatch,
  canDamageTarget,
  coordKey,
  isOpponentActor,
  manhattan,
  orthNeighbors,
  spawnPositionsForActors,
} from './board'
import { deriveMatchMode, normalizeBattleConfig } from './match-roster'

export { normalizeBattleConfig } from './match-roster'
export {
  chebyshevDistance,
  currentOvertimeDamageAmount,
  isOvertimeLethal,
} from './overtime'
import {
  buildStatusForSkill,
  castResourceCost,
  cellsForPattern,
  countHitsOnEnemy,
  damageForCast,
  effectiveCastRangeForLoadout,
  getSkillDef,
  minCastManhattanForLoadout,
  focusBonusDamage,
  immunizeChargesFromStacks,
  mendHealAmount,
  overclockManaRestore,
  overclockSlowDuration,
  patternFullyInBounds,
  patternRespectsAoE,
  purgeCleanseCount,
  wardbreakShredAmount,
  wardShieldAmount,
} from './skills'
import {
  buildBleedingTag,
  buildSlowTag,
  elementalSkillDamageDealt,
  physicalSkillDamageDealt,
  physicalStrikeDamageDealt,
  BASE_MAX_HP,
  HP_PER_VITALITY,
  MANA_PER_WISDOM,
  maxStaminaForTraits,
  STAMINA_MOVE_COST_PER_TILE,
  STAMINA_REGEN_PER_TURN,
  totalStrikeDamage,
} from './traits'
import { cloneTag, resolveStatusesAfterAdd } from './reactions'

export type GameAction =
  | { type: 'move'; to: Coord }
  | { type: 'cast'; skillId: SkillId; target: Coord }
  /** End turn without moving or casting (e.g. no stamina, rooted, silenced/disarmed with no affordable casts). */
  | { type: 'skip' }

let statusSeq = 0

export function resetIdsForTests(): void {
  statusSeq = 0
}

function nextStatusId(): string {
  statusSeq += 1
  return `st${statusSeq}`
}

export function actorsAtCell(state: GameState, c: Coord): ActorId[] {
  const k = coordKey(c)
  const out: ActorId[] = []
  for (const id of state.turnOrder) {
    const a = state.actors[id]
    if (!a || a.hp <= 0) continue
    if (coordKey(a.pos) === k) out.push(id)
  }
  return out
}

function actorAt(state: GameState, c: Coord): ActorId | null {
  const xs = actorsAtCell(state, c)
  return xs[0] ?? null
}

function buildRosterFromMatchSettings(ms: MatchSettings): {
  turnOrder: ActorId[]
  loadouts: Record<ActorId, SkillLoadoutEntry[]>
  traitsByActor: Record<ActorId, TraitPoints>
  teamByActor: Record<ActorId, number>
  matchMode: MatchMode
  friendlyFire: boolean
  cpuDifficulty: Record<ActorId, CpuDifficulty>
  humanActorId: ActorId
} {
  const roster = ms.roster
  const matchMode = deriveMatchMode(roster)
  const turnOrder = roster.map((r) => r.actorId)
  const loadouts: Record<ActorId, SkillLoadoutEntry[]> = {}
  const traitsByActor: Record<ActorId, TraitPoints> = {}
  const teamByActor: Record<ActorId, number> = {}
  const cpuDifficulty: Record<ActorId, CpuDifficulty> = {}
  const defDiff = ms.defaultCpuDifficulty
  for (const r of roster) {
    loadouts[r.actorId] = r.loadout
    traitsByActor[r.actorId] = r.traits
    teamByActor[r.actorId] = r.teamId
    if (!r.isHuman) {
      cpuDifficulty[r.actorId] = ms.perCpuDifficulty?.[r.actorId] ?? defDiff
    }
  }
  return {
    turnOrder,
    loadouts,
    traitsByActor,
    teamByActor,
    matchMode,
    friendlyFire: ms.friendlyFire,
    cpuDifficulty,
    humanActorId: ms.humanActorId,
  }
}

function actorFromTraits(
  id: ActorId,
  pos: Coord,
  level: number,
  traits: TraitPoints,
  displayName?: string,
): ActorState {
  const maxHp = BASE_MAX_HP + traits.vitality * HP_PER_VITALITY
  const maxMana = level + traits.wisdom * MANA_PER_WISDOM
  const maxStamina = maxStaminaForTraits(traits)
  return {
    id,
    displayName,
    pos,
    hp: maxHp,
    maxHp,
    mana: maxMana,
    maxMana,
    stamina: maxStamina,
    maxStamina,
    traits,
    moveMaxSteps: 1 + traits.agility,
    manaRegenPerTurn: 1 + traits.intelligence,
    tilesMovedThisTurn: 0,
    physicalStreak: 0,
    statuses: [],
  }
}

/** How many turn handoffs the hazard survives (each advanceTurn tick). */
const IMPACT_DURATION_TURNS = 6

function shuffleActorIdsInPlace(ids: ActorId[], rnd: () => number): void {
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const t = ids[i]!
    ids[i] = ids[j]!
    ids[j] = t
  }
}

export type CreateInitialStateOptions = {
  /**
   * When true (default), round-robin order is shuffled so who goes first is random.
   * When false, roster order is used (deterministic; used by tests).
   */
  randomizeTurnOrder?: boolean
  /** Used only when randomizing turn order; defaults to `Math.random`. */
  rng?: () => number
}

export function createInitialState(config: BattleConfig, options?: CreateInitialStateOptions): GameState {
  resetIdsForTests()
  const normalized = normalizeBattleConfig(config)
  const built = buildRosterFromMatchSettings(normalized.match)
  const rosterTurnOrder = built.turnOrder
  const size = boardSizeForMatch(config.level, rosterTurnOrder.length, normalized.match.boardSize)
  const spawns = spawnPositionsForActors(size, rosterTurnOrder, built.humanActorId)
  const rowById = new Map(normalized.match.roster.map((r) => [r.actorId, r]))
  const actors: Record<ActorId, ActorState> = {}
  for (const id of rosterTurnOrder) {
    const pos = spawns[id]
    if (!pos) throw new Error(`No spawn for ${id}`)
    const row = rowById.get(id)
    actors[id] = actorFromTraits(id, pos, config.level, built.traitsByActor[id]!, row?.displayName)
  }
  const randomize = options?.randomizeTurnOrder !== false
  const turnOrder = [...rosterTurnOrder]
  if (randomize) {
    shuffleActorIdsInPlace(turnOrder, options?.rng ?? Math.random)
  }
  const turn = turnOrder[0]!
  const ms = normalized.match
  const overtimeEnabled = ms.overtimeEnabled ?? false
  const roundsUntilOvertime = Math.max(1, ms.roundsUntilOvertime ?? 12)
  const initial: GameState = {
    size,
    actors,
    turn,
    turnOrder,
    winner: null,
    log: [],
    loadouts: built.loadouts,
    impactedTiles: {},
    matchMode: built.matchMode,
    friendlyFire: built.friendlyFire,
    teamByActor: built.teamByActor,
    humanActorId: built.humanActorId,
    cpuDifficulty: built.cpuDifficulty,
    fullRoundsCompleted: 0,
    overtimeEnabled,
    roundsUntilOvertime,
    overtime: null,
    tie: false,
  }
  initial.log = [{ text: 'Battle start.', detail: { kind: 'battle_start' } }, turnAnnouncement(initial, turn)]
  return initial
}

function loadoutEntry(actor: ActorId, skillId: SkillId, state: GameState): SkillLoadoutEntry | undefined {
  return state.loadouts[actor].find((e) => e.skillId === skillId)
}

function castResourceWord(def: ReturnType<typeof getSkillDef>): 'mana' | 'stamina' {
  return def.school === 'physical' ? 'stamina' : 'mana'
}

/** Magic casts reset physical streak; deduct mana or stamina. */
function payCastResource(actor: ActorState, def: ReturnType<typeof getSkillDef>, cost: number): ActorState {
  const physicalStreak = def.school === 'magic' ? 0 : actor.physicalStreak
  if (def.school === 'magic') {
    return { ...actor, mana: actor.mana - cost, physicalStreak }
  }
  return { ...actor, stamina: actor.stamina - cost, physicalStreak }
}

function bumpPhysicalOffenseStreak(
  state: GameState,
  actorId: ActorId,
  def: ReturnType<typeof getSkillDef>,
): GameState {
  const dmgKind = def.damageKind ?? 'elemental'
  if (def.school !== 'physical' || dmgKind !== 'physical') return state
  const a = state.actors[actorId]!
  return withActor(state, actorId, { ...a, physicalStreak: a.physicalStreak + 1 })
}

function decayImpacts(state: GameState): GameState {
  const next: Record<string, TileImpact> = {}
  for (const [k, v] of Object.entries(state.impactedTiles)) {
    const tr = v.turnsRemaining - 1
    if (tr > 0) next[k] = { ...v, turnsRemaining: tr }
  }
  return { ...state, impactedTiles: next }
}

function layImpacts(
  state: GameState,
  anchor: Coord,
  entry: SkillLoadoutEntry,
  owner: ActorId,
  casterStatusPotency: number,
): GameState {
  const cells = cellsForPattern(anchor, entry.pattern)
  const seen = new Set<string>()
  const impactedTiles = { ...state.impactedTiles }
  for (const c of cells) {
    const k = coordKey(c)
    if (seen.has(k)) continue
    seen.add(k)
    impactedTiles[k] = {
      skillId: entry.skillId,
      statusStacks: entry.statusStacks,
      casterStatusPotency,
      owner,
      turnsRemaining: IMPACT_DURATION_TURNS,
    }
  }
  return { ...state, impactedTiles }
}

function turnAnnouncement(state: GameState, actorId: ActorId): BattleLogEntry {
  const text =
    actorId === state.humanActorId
      ? 'Your turn.'
      : `${actorLabelForLog(state, actorId)}'s turn.`
  return { text, subject: actorId, detail: { kind: 'turn', actorId } }
}

/** Opponent entering a lingering tile suffers one hit of damage + status (same skill). */
function applyImpactsOnEnter(
  state: GameState,
  moverId: ActorId,
  cell: Coord,
): { state: GameState; entries: BattleLogEntry[] } {
  const k = coordKey(cell)
  const impact = state.impactedTiles[k]
  if (!impact) return { state, entries: [] }
  if (
    !canDamageTarget(state.matchMode, state.friendlyFire, state.teamByActor, impact.owner, moverId)
  ) {
    return { state, entries: [] }
  }

  const owner = state.actors[impact.owner]
  const victimBefore = state.actors[moverId]
  const def = getSkillDef(impact.skillId)
  const dmgKind = def.damageKind ?? 'elemental'
  const moverLabel = actorLabelForLog(state, moverId)

  const rawDamage = damageForCast(def, 1)
  let dmg = 0
  let next = state

  if (dmgKind === 'elemental') {
    const afterElem = elementalSkillDamageDealt(
      rawDamage,
      victimBefore.traits,
      def.element,
      owner.traits.spellFocus,
    )
    dmg = damageWithShock(afterElem, victimBefore)
    dmg += vulnerabilityFlat(victimBefore)
    dmg = Math.max(1, dmg)
    next = applyHpLoss(next, moverId, dmg)
  } else if (dmgKind === 'physical') {
    const afterPhys = physicalSkillDamageDealt(
      rawDamage,
      victimBefore.traits,
      manhattan(owner.pos, victimBefore.pos) === 1,
    )
    dmg = damageWithShock(afterPhys, victimBefore)
    dmg += vulnerabilityFlat(victimBefore)
    dmg = Math.max(1, dmg)
    next = applyHpLoss(next, moverId, dmg)
  } else {
    return { state, entries: [] }
  }

  const victimAfter = next.actors[moverId]!
  const residualDetail = {
    kind: 'residual_trigger' as const,
    skillId: impact.skillId,
    victimId: moverId,
    damage: dmg,
    victimHpAfter: victimAfter.hp,
    victimMaxHp: victimAfter.maxHp,
    killed: victimAfter.hp <= 0,
  }

  const damageEntry: BattleLogEntry = {
    text: `${moverLabel} triggers residual ${def.name} for ${dmg} damage.`,
    subject: moverId,
    detail: residualDetail,
  }
  next = appendLog(next, [damageEntry])
  next = afterHpChanges(next)
  if (next.winner || next.tie) {
    return { state: next, entries: [damageEntry] }
  }

  const tag = buildStatusForSkill(impact.skillId, impact.statusStacks, impact.casterStatusPotency)
  const afterStatus = addStatusToTarget(next, moverId, tag)
  next = afterStatus.state
  const entries: BattleLogEntry[] = [
    damageEntry,
    ...statusReactionEntries(moverId, afterStatus.messages),
  ]
  return { state: next, entries }
}

function decayStatuses(statuses: StatusInstance[]): StatusInstance[] {
  const out: StatusInstance[] = []
  for (const s of statuses) {
    const t = s.tag
    switch (t.t) {
      case 'burning': {
        const duration = t.duration - 1
        if (duration > 0) out.push({ ...s, tag: { ...t, duration } })
        break
      }
      case 'chilled': {
        const duration = t.duration - 1
        if (duration > 0) out.push({ ...s, tag: { ...t, duration } })
        break
      }
      case 'frozen':
        out.push(s)
        break
      case 'soaked': {
        const duration = t.duration - 1
        if (duration > 0) out.push({ ...s, tag: { ...t, duration } })
        break
      }
      case 'shocked': {
        const duration = t.duration - 1
        if (duration > 0) out.push({ ...s, tag: { ...t, duration } })
        break
      }
      case 'poisoned': {
        const duration = t.duration - 1
        if (duration > 0) out.push({ ...s, tag: { ...t, duration } })
        break
      }
      case 'bleeding': {
        const duration = t.duration - 1
        if (duration > 0) out.push({ ...s, tag: { ...t, duration } })
        break
      }
      case 'slowed': {
        const duration = t.duration - 1
        if (duration > 0) out.push({ ...s, tag: { ...t, duration } })
        break
      }
      case 'marked': {
        const duration = t.duration - 1
        if (duration > 0) out.push({ ...s, tag: { ...t, duration } })
        break
      }
      case 'rooted': {
        const duration = t.duration - 1
        if (duration > 0) out.push({ ...s, tag: { ...t, duration } })
        break
      }
      case 'silenced': {
        const duration = t.duration - 1
        if (duration > 0) out.push({ ...s, tag: { ...t, duration } })
        break
      }
      case 'disarmed': {
        const duration = t.duration - 1
        if (duration > 0) out.push({ ...s, tag: { ...t, duration } })
        break
      }
      case 'regenBlocked': {
        const duration = t.duration - 1
        if (duration > 0) out.push({ ...s, tag: { ...t, duration } })
        break
      }
      case 'muddy': {
        const duration = t.duration - 1
        if (duration > 0) out.push({ ...s, tag: { ...t, duration } })
        break
      }
      case 'shield':
        out.push(s)
        break
      case 'skillFocus':
      case 'immunized':
        out.push(s)
        break
    }
  }
  return out
}

/** Metrics for turn-start DoT, regen, and resource refresh (for battle log). */
export function computeTurnStartTick(actor: ActorState): {
  actor: ActorState
  dotDamage: number
  regenApplied: number
  manaGained: number
  staminaGained: number
} {
  const ten = actor.traits.tenacity
  let dotDamage = 0
  for (const s of actor.statuses) {
    if (s.tag.t === 'burning') dotDamage += Math.max(0, s.tag.dot - ten)
    if (s.tag.t === 'poisoned') dotDamage += Math.max(0, s.tag.dot - ten)
    if (s.tag.t === 'bleeding') dotDamage += Math.max(0, s.tag.dot - ten)
  }
  let hp = Math.max(0, actor.hp - dotDamage)
  let regen = actor.traits.regeneration
  if (actor.statuses.some((s) => s.tag.t === 'regenBlocked')) {
    regen = Math.floor(regen / 2)
  }
  const hpBeforeRegen = hp
  hp = Math.min(actor.maxHp, hp + regen)
  const regenApplied = hp - hpBeforeRegen
  const statuses = decayStatuses(actor.statuses)
  const manaBefore = actor.mana
  const staminaBefore = actor.stamina
  const mana = Math.min(actor.maxMana, actor.mana + actor.manaRegenPerTurn)
  const stamina = Math.min(actor.maxStamina, actor.stamina + STAMINA_REGEN_PER_TURN)
  return {
    actor: { ...actor, hp, statuses, mana, stamina, tilesMovedThisTurn: 0 },
    dotDamage,
    regenApplied,
    manaGained: mana - manaBefore,
    staminaGained: stamina - staminaBefore,
  }
}

/** Apply DoT and duration decay at start of an actor's turn. Frozen forces skip (handled separately). */
export function applyTurnStartHooks(actor: ActorState): ActorState {
  return computeTurnStartTick(actor).actor
}

export function hasFrozen(actor: ActorState): boolean {
  return actor.statuses.some((s) => s.tag.t === 'frozen')
}

/** Remove one frozen stack (one skipped action). */
export function consumeFrozen(actor: ActorState): ActorState {
  const idx = actor.statuses.findIndex((s) => s.tag.t === 'frozen')
  if (idx === -1) return actor
  const next = [...actor.statuses]
  const s = next[idx]!
  if (s.tag.t !== 'frozen') return actor
  const turns = s.tag.turns - 1
  if (turns <= 0) next.splice(idx, 1)
  else next[idx] = { ...s, tag: { t: 'frozen', turns } }
  return { ...actor, statuses: next }
}

function appendLog(state: GameState, entries: BattleLogEntry[]): GameState {
  return { ...state, log: [...state.log, ...entries].slice(-40) }
}

function findNewlyEliminated(before: GameState, after: GameState): ActorId | null {
  for (const id of after.turnOrder) {
    if (before.actors[id]!.hp > 0 && after.actors[id]!.hp <= 0) return id
  }
  return null
}

function maybeFirstBloodEntry(before: GameState, after: GameState): BattleLogEntry | null {
  if (after.firstBloodLogged) return null
  const victim = findNewlyEliminated(before, after)
  if (!victim) return null
  return {
    text: `First blood — ${actorLabelForLog(after, victim)} is eliminated!`,
    subject: victim,
    detail: { kind: 'battle_milestone', milestone: 'first_blood', victimId: victim },
    classicVisible: false,
  }
}

function appendLogWithFirstBlood(before: GameState, after: GameState, entries: BattleLogEntry[]): GameState {
  let next = appendLog(after, entries)
  const fb = maybeFirstBloodEntry(before, after)
  if (fb && !after.firstBloodLogged) {
    next = appendLog({ ...next, firstBloodLogged: true }, [fb])
  }
  return next
}

function turnTickResourceEntries(
  game: GameState,
  actorId: ActorId,
  tick: ReturnType<typeof computeTurnStartTick>,
): BattleLogEntry[] {
  const entries: BattleLogEntry[] = []
  if (tick.dotDamage > 0 || tick.regenApplied > 0) {
    const label = actorLabelForLog(game, actorId)
    const text =
      tick.dotDamage > 0 && tick.regenApplied > 0
        ? `${label} takes ${tick.dotDamage} from DoTs and heals ${tick.regenApplied} from regeneration.`
        : tick.dotDamage > 0
          ? `${label} takes ${tick.dotDamage} from DoTs.`
          : `${label} heals ${tick.regenApplied} from regeneration.`
    entries.push({
      text,
      subject: actorId,
      detail: {
        kind: 'turn_tick',
        actorId,
        ...(tick.dotDamage > 0 ? { dotDamage: tick.dotDamage } : {}),
        ...(tick.regenApplied > 0 ? { regen: tick.regenApplied } : {}),
      },
    })
  }
  if (tick.manaGained > 0 || tick.staminaGained > 0) {
    entries.push({
      text: `${actorLabelForLog(game, actorId)} gains ${tick.manaGained} mana and ${tick.staminaGained} stamina.`,
      subject: actorId,
      detail: {
        kind: 'resource_tick',
        actorId,
        manaGained: tick.manaGained,
        staminaGained: tick.staminaGained,
      },
      classicVisible: false,
    })
  }
  return entries
}

function statusReactionEntries(targetId: ActorId, messages: StatusReactionMessage[]): BattleLogEntry[] {
  return messages.map((m) => ({
    text: m.text,
    subject: targetId,
    detail: { kind: 'status_reaction', reactionKey: m.key, targetId },
  }))
}

/** Enemies who could be targeted but took no damage from this spell (broadcast relief). */
function spellFocusRelievedIds(
  state: GameState,
  actor: ActorId,
  hitList: { targetId: ActorId }[],
): ActorId[] {
  if (hitList.length === 0) return []
  const hitIds = new Set(hitList.map((h) => h.targetId))
  return state.turnOrder.filter((id) => {
    if (id === actor) return false
    const t = state.actors[id]
    if (!t || t.hp <= 0) return false
    if (!isOpponentActor(state.matchMode, state.teamByActor, actor, id)) return false
    if (hitIds.has(id)) return false
    if (id === state.humanActorId) return false
    return true
  })
}

function winnerLog(state: GameState, w: ActorId): BattleLogEntry {
  const a = state.actors[w]!
  return {
    text: `${actorLabelForLog(state, w)} wins!`,
    subject: w,
    detail: {
      kind: 'win',
      winnerId: w,
      winnerHpAfter: a.hp,
      winnerMaxHp: a.maxHp,
    },
  }
}

function checkWinner(state: GameState): ActorId | null {
  if (state.tie) return null
  const alive = state.turnOrder.filter((id) => state.actors[id]!.hp > 0)
  if (alive.length === 0) return null
  if (state.matchMode === 'ffa') {
    if (alive.length === 1) return alive[0]!
    return null
  }
  const teamsAlive = new Set(alive.map((id) => state.teamByActor[id]!))
  if (teamsAlive.size <= 1 && alive.length >= 1) {
    return alive[0]!
  }
  return null
}

function withActor(state: GameState, id: ActorId, actor: ActorState): GameState {
  return { ...state, actors: { ...state.actors, [id]: actor } }
}

/** All cells reachable in ≤ maxSteps orthogonal steps through empty cells (BFS). */
export function cellsReachableInSteps(
  state: GameState,
  actor: ActorId,
  maxSteps: number,
): Coord[] {
  const start = state.actors[actor].pos
  const dist = new Map<string, number>()
  const queue: Coord[] = [start]
  dist.set(coordKey(start), 0)
  const results: Coord[] = []
  let qi = 0
  while (qi < queue.length) {
    const c = queue[qi++]!
    const d = dist.get(coordKey(c))!
    if (d > 0) results.push(c)
    if (d === maxSteps) continue
    for (const n of orthNeighbors(c, state.size)) {
      if (actorAt(state, n) !== null) continue
      const nk = coordKey(n)
      if (dist.has(nk)) continue
      dist.set(nk, d + 1)
      queue.push(n)
    }
  }
  return results
}

function damageWithShock(base: number, target: ActorState): number {
  const shock = target.statuses.find((s) => s.tag.t === 'shocked')
  const bonus = shock && shock.tag.t === 'shocked' ? shock.tag.vuln : 0
  return base + bonus
}

/** Extra flat damage from marked / muddy on the defender. */
function vulnerabilityFlat(target: ActorState): number {
  let n = 0
  for (const s of target.statuses) {
    if (s.tag.t === 'marked') n += s.tag.extra
    if (s.tag.t === 'muddy') n += 1
  }
  return n
}

/** Absorb damage with shield status first, then HP. */
function applyHpLoss(state: GameState, targetId: ActorId, amount: number): GameState {
  let remaining = Math.max(0, amount)
  const actor = state.actors[targetId]
  const statuses = [...actor.statuses]
  const shieldIdx = statuses.findIndex((s) => s.tag.t === 'shield')
  if (shieldIdx !== -1) {
    const sh = statuses[shieldIdx]!
    if (sh.tag.t === 'shield') {
      const amt = sh.tag.amount
      if (remaining >= amt) {
        remaining -= amt
        statuses.splice(shieldIdx, 1)
      } else {
        statuses[shieldIdx] = {
          ...sh,
          tag: { t: 'shield', amount: amt - remaining },
        }
        remaining = 0
      }
    }
  }
  const hp = Math.max(0, actor.hp - remaining)
  return withActor(state, targetId, { ...actor, hp, statuses })
}

function firstAliveInTurnOrder(state: GameState): ActorId | null {
  for (const id of state.turnOrder) {
    if (state.actors[id]!.hp > 0) return id
  }
  return null
}

function isRoundComplete(state: GameState, nextTurn: ActorId): boolean {
  const first = firstAliveInTurnOrder(state)
  return first !== null && nextTurn === first
}

function finalizeEliminations(state: GameState): GameState {
  const alive = state.turnOrder.filter((id) => state.actors[id]!.hp > 0)
  if (alive.length > 0 || state.tie) return state
  return {
    ...appendLog(state, [{ text: 'Everyone is down — tie game.', detail: { kind: 'tie' } }]),
    tie: true,
    winner: null,
  }
}

/** After any HP change: mass elimination → tie; else single winner if applicable. */
function afterHpChanges(state: GameState): GameState {
  const s = finalizeEliminations(state)
  if (s.tie || s.winner) return s
  const w = checkWinner(s)
  if (!w) return s
  return { ...appendLog(s, [winnerLog(s, w)]), winner: w }
}

type StormReason = 'periodic' | 'engulf'

function applyStormDamageBatch(
  state: GameState,
  shouldHit: (id: ActorId) => boolean,
  amount: number,
  reason: StormReason,
): GameState {
  let s = state
  for (const id of state.turnOrder) {
    const a = s.actors[id]
    if (!a || a.hp <= 0) continue
    if (!shouldHit(id)) continue
    s = applyHpLoss(s, id, amount)
    s = appendLog(s, [
      {
        text: `${actorLabelForLog(s, id)} takes ${amount} from the storm.`,
        subject: id,
        detail: { kind: 'overtime_storm', victimId: id, damage: amount, reason },
      },
    ])
  }
  return s
}

function activateOvertime(state: GameState): GameState {
  const ot = rollStormActivation(state.size, Math.random)
  /** First full round after activation is preview only; first damage tick is the following boundary. */
  let s: GameState = { ...state, overtime: { ...ot, stormSkipsNextBoundary: true } }
  s = appendLog(s, [
    {
      text: 'Sudden death — the kill zone is marked. The storm strikes on alternate full rounds.',
      detail: { kind: 'overtime_begin' },
    },
  ])
  return s
}

function applyOvertimePeriodicStorm(state: GameState): GameState {
  const ot = state.overtime!
  const amt = currentOvertimeDamageAmount(ot)
  return applyStormDamageBatch(
    state,
    (id) => isOvertimeLethal(state, state.actors[id]!.pos),
    amt,
    'periodic',
  )
}

function applyOvertimeShrink(state: GameState): GameState {
  const ot = state.overtime!
  const oldR = ot.safeRadius
  const newSafe = oldR - 1
  const newStep = ot.damageStep + 1
  let s: GameState = {
    ...state,
    overtime: { ...ot, safeRadius: newSafe, damageStep: newStep },
  }
  const amt = currentOvertimeDamageAmount(s.overtime!)
  s = appendLog(s, [
    {
      text: `The safe zone shrinks (${newSafe} tiles from storm center).`,
      detail: { kind: 'overtime_shrink', safeRadiusAfter: newSafe },
    },
  ])
  s = applyStormDamageBatch(
    s,
    (id) => {
      const pos = s.actors[id]!.pos
      return chebyshevDistance(pos, s.overtime!.stormCenter) === oldR
    },
    amt,
    'engulf',
  )
  s = applyStormDamageBatch(
    s,
    (id) => {
      const pos = s.actors[id]!.pos
      return chebyshevDistance(pos, s.overtime!.stormCenter) > oldR
    },
    amt,
    'periodic',
  )
  return s
}

function processFullRoundBoundary(state: GameState): GameState {
  let s: GameState = { ...state, fullRoundsCompleted: state.fullRoundsCompleted + 1 }
  if (!s.overtimeEnabled) return s

  if (!s.overtime) {
    if (s.fullRoundsCompleted >= s.roundsUntilOvertime) {
      s = activateOvertime(s)
      return finalizeEliminations(s)
    }
    return s
  }

  const prevOt = s.overtime!
  s = {
    ...s,
    overtime: { ...prevOt, otRoundsCompleted: prevOt.otRoundsCompleted + 1 },
  }
  const ot = s.overtime!
  if (ot.stormSkipsNextBoundary) {
    const wouldShrink = ot.otRoundsCompleted > 0 && ot.otRoundsCompleted % SHRINK_EVERY_OT_ROUNDS === 0
    s = {
      ...s,
      overtime: {
        ...ot,
        stormSkipsNextBoundary: false,
        deferredShrink: ot.deferredShrink || wouldShrink,
      },
    }
    return finalizeEliminations(s)
  }

  const wouldShrink = ot.otRoundsCompleted > 0 && ot.otRoundsCompleted % SHRINK_EVERY_OT_ROUNDS === 0
  const doShrink = ot.deferredShrink || wouldShrink
  if (doShrink) {
    s = applyOvertimeShrink(s)
  } else {
    s = applyOvertimePeriodicStorm(s)
  }
  s = {
    ...s,
    overtime: { ...s.overtime!, deferredShrink: false, stormSkipsNextBoundary: true },
  }
  return finalizeEliminations(s)
}

function effectiveMoveSteps(actor: ActorState): number {
  const slowed = actor.statuses.some((s) => s.tag.t === 'slowed')
  const muddy = actor.statuses.some((s) => s.tag.t === 'muddy')
  let pen = 0
  if (slowed) pen += 1
  if (muddy) pen += 1
  return Math.max(1, actor.moveMaxSteps - pen)
}

function applyKnockbackFromAttacker(
  state: GameState,
  strikerId: ActorId,
  enemyId: ActorId,
  requireStrikeTrait: boolean,
): { state: GameState; hazardEntries: BattleLogEntry[]; knockedBack: boolean } {
  const striker = state.actors[strikerId]
  if (requireStrikeTrait && striker.traits.strikeKnockback < 1) {
    return { state, hazardEntries: [], knockedBack: false }
  }
  const enemy = state.actors[enemyId]
  if (enemy.hp <= 0) return { state, hazardEntries: [], knockedBack: false }
  const dx = Math.sign(enemy.pos.x - striker.pos.x)
  const dy = Math.sign(enemy.pos.y - striker.pos.y)
  const np = { x: enemy.pos.x + dx, y: enemy.pos.y + dy }
  const sz = state.size
  if (np.x < 0 || np.x >= sz || np.y < 0 || np.y >= sz) return { state, hazardEntries: [], knockedBack: false }
  if (actorAt(state, np) !== null) return { state, hazardEntries: [], knockedBack: false }
  let next = withActor(state, enemyId, { ...enemy, pos: np })
  const enter = applyImpactsOnEnter(next, enemyId, np)
  next = enter.state
  return { state: next, hazardEntries: enter.entries, knockedBack: true }
}

function addStatusToTarget(
  state: GameState,
  targetId: ActorId,
  tag: StatusTag,
  opts?: { bypassImmunize?: boolean },
): { state: GameState; messages: StatusReactionMessage[] } {
  const target = state.actors[targetId]
  if (!opts?.bypassImmunize) {
    const imm = tryConsumeImmunize(target, tag)
    if (imm.blocked) {
      return { state: withActor(state, targetId, imm.actor), messages: [] }
    }
  }
  const incoming: StatusInstance = { id: nextStatusId(), tag: cloneTag(tag) }
  const { statuses, messages, immediateDamage } = resolveStatusesAfterAdd(
    target.statuses,
    incoming,
    nextStatusId,
  )
  let next = withActor(state, targetId, { ...target, statuses })
  if (immediateDamage !== undefined && immediateDamage > 0) {
    next = applyHpLoss(next, targetId, immediateDamage)
  }
  return {
    state: next,
    messages,
  }
}

function isDebuffStatus(s: StatusInstance): boolean {
  const t = s.tag.t
  return t !== 'shield' && t !== 'skillFocus' && t !== 'immunized'
}

function incomingBlockedByImmunize(tag: StatusTag): boolean {
  switch (tag.t) {
    case 'shield':
    case 'skillFocus':
    case 'immunized':
      return false
    default:
      return true
  }
}

function tryConsumeImmunize(actor: ActorState, tag: StatusTag): { actor: ActorState; blocked: boolean } {
  if (!incomingBlockedByImmunize(tag)) return { actor, blocked: false }
  const idx = actor.statuses.findIndex((s) => s.tag.t === 'immunized')
  if (idx === -1) return { actor, blocked: false }
  const inst = actor.statuses[idx]!
  if (inst.tag.t !== 'immunized') return { actor, blocked: false }
  const ch = inst.tag.charges
  const next = [...actor.statuses]
  if (ch <= 1) {
    next.splice(idx, 1)
  } else {
    next[idx] = { ...inst, tag: { t: 'immunized', charges: ch - 1 } }
  }
  return { actor: { ...actor, statuses: next }, blocked: true }
}

function stripSkillFocusFromCaster(actor: ActorState): { actor: ActorState; bonus: number } {
  let bonus = 0
  const statuses = actor.statuses.filter((s) => {
    if (s.tag.t === 'skillFocus') {
      bonus += s.tag.bonus
      return false
    }
    return true
  })
  return { actor: { ...actor, statuses }, bonus }
}

/** Reduce shield absorb; returns shield HP actually removed. */
function reduceShieldOnActor(actor: ActorState, amount: number): { actor: ActorState; stripped: number } {
  const shIdx = actor.statuses.findIndex((s) => s.tag.t === 'shield')
  if (shIdx === -1) return { actor, stripped: 0 }
  const ex = actor.statuses[shIdx]!
  if (ex.tag.t !== 'shield') return { actor, stripped: 0 }
  const prev = ex.tag.amount
  const stripped = Math.min(prev, Math.max(0, amount))
  const left = prev - stripped
  const rest = actor.statuses.filter((_, i) => i !== shIdx)
  if (left <= 0) return { actor: { ...actor, statuses: rest }, stripped }
  return {
    actor: { ...actor, statuses: [...rest, { ...ex, tag: { t: 'shield', amount: left } }] },
    stripped,
  }
}

function purgeDebuffs(actor: ActorState, count: number): ActorState {
  let removed = 0
  const statuses = actor.statuses.filter((s) => {
    if (removed >= count) return true
    if (!isDebuffStatus(s)) return true
    removed += 1
    return false
  })
  return { ...actor, statuses }
}

export function hasSilenced(actor: ActorState): boolean {
  return actor.statuses.some((s) => s.tag.t === 'silenced')
}

export function hasDisarmed(actor: ActorState): boolean {
  return actor.statuses.some((s) => s.tag.t === 'disarmed')
}

export function hasRooted(actor: ActorState): boolean {
  return actor.statuses.some((s) => s.tag.t === 'rooted')
}

export function gatherOffensiveHits(
  state: GameState,
  actor: ActorId,
  anchor: Coord,
  pattern: PatternOffset[],
): { targetId: ActorId; hits: number }[] {
  const out: { targetId: ActorId; hits: number }[] = []
  for (const id of state.turnOrder) {
    const t = state.actors[id]
    if (!t || t.hp <= 0) continue
    if (!canDamageTarget(state.matchMode, state.friendlyFire, state.teamByActor, actor, id)) continue
    const hits = countHitsOnEnemy(t.pos, anchor, pattern)
    if (hits > 0) out.push({ targetId: id, hits })
  }
  return out
}

export function applyAction(
  state: GameState,
  actor: ActorId,
  action: GameAction,
): { state: GameState; error?: string } {
  if (state.winner || state.tie) return { state, error: 'Game is over.' }
  if (state.turn !== actor) return { state, error: 'Not your turn.' }

  let me = state.actors[actor]
  if (hasFrozen(me)) {
    return { state, error: 'Frozen — you cannot act.' }
  }

  if (action.type === 'move') {
    const snapshotBefore = state
    if (hasRooted(me)) {
      return { state, error: 'Rooted — you cannot move.' }
    }
    const to = action.to
    const sz = state.size
    if (to.x < 0 || to.x >= sz || to.y < 0 || to.y >= sz) {
      return { state, error: 'Out of bounds.' }
    }
    if (actorAt(state, to) !== null) return { state, error: 'Cell occupied.' }
    const maxSteps = effectiveMoveSteps(me)
    const reachable = cellsReachableInSteps(state, actor, maxSteps)
    if (!reachable.some((c) => coordKey(c) === coordKey(to))) {
      return { state, error: 'Destination not reachable in your move range.' }
    }
    const dist = manhattan(me.pos, to)
    const moveCost = dist * STAMINA_MOVE_COST_PER_TILE
    if (me.stamina < moveCost) {
      return { state, error: 'Not enough stamina to move that far.' }
    }
    me = {
      ...me,
      pos: to,
      stamina: me.stamina - moveCost,
      tilesMovedThisTurn: me.tilesMovedThisTurn + dist,
      physicalStreak: 0,
    }
    let next = withActor(state, actor, me)
    const enter = applyImpactsOnEnter(next, actor, to)
    next = enter.state
    const moveLine: BattleLogEntry = {
      text: `${actorLabelForLog(next, actor)} moves.`,
      subject: actor,
      detail: { kind: 'move', actorId: actor },
    }
    if (next.winner || next.tie) {
      next = appendLogWithFirstBlood(snapshotBefore, next, [moveLine])
      return { state: next }
    }
    const moveEntries: BattleLogEntry[] = [moveLine, ...enter.entries]
    next = appendLogWithFirstBlood(snapshotBefore, next, moveEntries)
    next = advanceTurn(next, actor)
    return { state: next }
  }

  if (action.type === 'skip') {
    const label = actorLabelForLog(state, actor)
    let next = appendLog(state, [
      { text: `${label} skips.`, subject: actor, detail: { kind: 'skip', actorId: actor } },
    ])
    next = advanceTurn(next, actor)
    return { state: next }
  }

  if (action.type !== 'cast') {
    return { state, error: 'Invalid action.' }
  }

  const entry = loadoutEntry(actor, action.skillId, state)
  if (!entry) return { state, error: 'Skill not in loadout.' }

  const def = getSkillDef(action.skillId)
  if (def.school === 'magic' && hasSilenced(me)) {
    return { state, error: 'Silenced — you cannot cast magic.' }
  }
  if (def.school === 'physical' && hasDisarmed(me)) {
    return { state, error: 'Disarmed — you cannot use physical skills.' }
  }

  const target = action.target
  const anchorDist = manhattan(me.pos, target)
  const castCost = castResourceCost(entry, def, anchorDist)
  const resWord = castResourceWord(def)
  if (def.school === 'magic' && me.mana < castCost) return { state, error: 'Not enough mana.' }
  if (def.school === 'physical' && me.stamina < castCost) {
    return { state, error: 'Not enough stamina.' }
  }
  const sz = state.size
  if (target.x < 0 || target.x >= sz || target.y < 0 || target.y >= sz) {
    return { state, error: 'Invalid target.' }
  }
  const maxRange = effectiveCastRangeForLoadout(def, entry, me.traits)
  const minRange = minCastManhattanForLoadout(def, entry)
  if (anchorDist > maxRange || anchorDist < minRange) {
    return { state, error: 'Target out of range.' }
  }

  if (!patternFullyInBounds(target, entry.pattern, sz)) {
    return { state, error: 'Pattern would leave the board from this target.' }
  }

  if (!patternRespectsAoE(entry.pattern, def, entry)) {
    return { state, error: 'Pattern exceeds AoE for this skill.' }
  }

  const dmgKind = def.damageKind ?? 'elemental'

  if (dmgKind === 'none') {
    const snapshotBefore = state
    me = payCastResource(me, def, castCost)
    let next = withActor(state, actor, me)
    const potency = me.traits.statusPotency
    const casterLabel = actorLabelForLog(next, actor)
    const hitList = gatherOffensiveHits(next, actor, target, entry.pattern)
    const totalPatternHits = hitList.reduce((s, h) => s + h.hits, 0)

    if (totalPatternHits === 0) {
      next = layImpacts(next, target, entry, actor, potency)
      next = appendLogWithFirstBlood(snapshotBefore, next, [
        {
          text: `${casterLabel} casts ${def.name} — residual energy lingers on the tiles (${castCost} ${resWord}).`,
          subject: actor,
          detail: { kind: 'cast_linger', skillId: action.skillId, actorId: actor, manaCost: castCost },
        },
      ])
      next = afterHpChanges(next)
      if (next.winner || next.tie) {
        return { state: next }
      }
      next = advanceTurn(next, actor)
      return { state: next }
    }

    const skillId = action.skillId
    if (skillId === 'mend') {
      let totalHeal = 0
      const healTargets: { targetId: ActorId; heal: number }[] = []
      for (const { targetId, hits } of hitList) {
        const t = next.actors[targetId]!
        const heal = mendHealAmount(entry.statusStacks, potency) * hits
        const hp = Math.min(t.maxHp, t.hp + heal)
        const actual = hp - t.hp
        totalHeal += actual
        healTargets.push({ targetId, heal: actual })
        next = withActor(next, targetId, { ...t, hp })
      }
      next = layImpacts(next, target, entry, actor, potency)
      next = appendLogWithFirstBlood(snapshotBefore, next, [
        {
          text:
            healTargets.length === 1
              ? `${casterLabel} casts ${def.name} for +${healTargets[0]!.heal} HP (${castCost} ${resWord}).`
              : `${casterLabel} casts ${def.name} for +${totalHeal} HP (${healTargets.length} targets, ${castCost} ${resWord}).`,
          subject: actor,
          detail: {
            kind: 'cast_area_heal',
            skillId,
            actorId: actor,
            manaCost: castCost,
            totalHeal,
            targets: healTargets,
          },
        },
      ])
    } else if (skillId === 'ward') {
      const addPerHit = wardShieldAmount(entry.statusStacks, potency)
      const wardTargets: ActorId[] = []
      const reactionLogs: BattleLogEntry[] = []
      for (const { targetId, hits } of hitList) {
        const addAmt = addPerHit * hits
        wardTargets.push(targetId)
        const cur = next.actors[targetId]!
        const shIdx = cur.statuses.findIndex((s) => s.tag.t === 'shield')
        let finalTag: StatusTag = { t: 'shield', amount: addAmt }
        if (shIdx !== -1) {
          const ex = cur.statuses[shIdx]!
          if (ex.tag.t === 'shield') {
            finalTag = { t: 'shield', amount: ex.tag.amount + addAmt }
          }
        }
        const stripped =
          shIdx !== -1 && finalTag.t === 'shield' ? cur.statuses.filter((_, i) => i !== shIdx) : cur.statuses
        next = withActor(next, targetId, { ...cur, statuses: stripped })
        const after = addStatusToTarget(next, targetId, finalTag)
        next = after.state
        reactionLogs.push(...statusReactionEntries(targetId, after.messages))
      }
      next = layImpacts(next, target, entry, actor, potency)
      next = appendLogWithFirstBlood(snapshotBefore, next, [
        {
          text: `${casterLabel} casts ${def.name} (${wardTargets.length} target${wardTargets.length === 1 ? '' : 's'}, ${castCost} ${resWord}).`,
          subject: actor,
          detail: {
            kind: 'cast_area_ward',
            skillId,
            actorId: actor,
            manaCost: castCost,
            targetIds: wardTargets,
          },
        },
        ...reactionLogs,
      ])
    } else if (skillId === 'purge') {
      const per = purgeCleanseCount(entry.statusStacks)
      const purgeTargets: { targetId: ActorId; cleanseCount: number }[] = []
      for (const { targetId, hits } of hitList) {
        const n = per * hits
        const cur = next.actors[targetId]!
        const purged = purgeDebuffs(cur, n)
        next = withActor(next, targetId, purged)
        purgeTargets.push({ targetId, cleanseCount: n })
      }
      next = layImpacts(next, target, entry, actor, potency)
      const sumN = purgeTargets.reduce((s, x) => s + x.cleanseCount, 0)
      next = appendLogWithFirstBlood(snapshotBefore, next, [
        {
          text:
            purgeTargets.length === 1
              ? `${casterLabel} casts ${def.name}, cleanses ${purgeTargets[0]!.cleanseCount} (${castCost} ${resWord}).`
              : `${casterLabel} casts ${def.name}, cleanses ${sumN} total (${purgeTargets.length} targets, ${castCost} ${resWord}).`,
          subject: actor,
          detail: {
            kind: 'cast_area_purge',
            skillId,
            actorId: actor,
            manaCost: castCost,
            targets: purgeTargets,
          },
        },
      ])
    } else if (skillId === 'focus') {
      const focusTargets: { targetId: ActorId; bonus: number }[] = []
      const reactionLogs: BattleLogEntry[] = []
      for (const { targetId, hits } of hitList) {
        const bonus = focusBonusDamage(entry.statusStacks, potency) * hits
        const tag: StatusTag = { t: 'skillFocus', bonus }
        const after = addStatusToTarget(next, targetId, tag)
        next = after.state
        reactionLogs.push(...statusReactionEntries(targetId, after.messages))
        focusTargets.push({ targetId, bonus })
      }
      next = layImpacts(next, target, entry, actor, potency)
      next = appendLogWithFirstBlood(snapshotBefore, next, [
        {
          text:
            focusTargets.length === 1
              ? `${casterLabel} casts ${def.name} (+${focusTargets[0]!.bonus} next-hit damage, ${castCost} ${resWord}).`
              : `${casterLabel} casts ${def.name} (${focusTargets.length} targets, ${castCost} ${resWord}).`,
          subject: actor,
          detail: {
            kind: 'cast_area_focus',
            skillId,
            actorId: actor,
            manaCost: castCost,
            targets: focusTargets,
          },
        },
        ...reactionLogs,
      ])
    } else if (skillId === 'wardbreak') {
      const wbTargets: { targetId: ActorId; stripped: number }[] = []
      for (const { targetId, hits } of hitList) {
        const strip = wardbreakShredAmount(entry.statusStacks, potency) * hits
        const cur = next.actors[targetId]!
        const { actor: na, stripped } = reduceShieldOnActor(cur, strip)
        next = withActor(next, targetId, na)
        if (stripped > 0) wbTargets.push({ targetId, stripped })
      }
      next = layImpacts(next, target, entry, actor, potency)
      const sumStrip = wbTargets.reduce((s, x) => s + x.stripped, 0)
      next = appendLogWithFirstBlood(snapshotBefore, next, [
        {
          text:
            wbTargets.length === 0
              ? `${casterLabel} casts ${def.name} — no shields to shred (${castCost} ${resWord}).`
              : wbTargets.length === 1
                ? `${casterLabel} casts ${def.name}, shreds ${wbTargets[0]!.stripped} shield (${castCost} ${resWord}).`
                : `${casterLabel} casts ${def.name}, shreds ${sumStrip} shield (${wbTargets.length} targets, ${castCost} ${resWord}).`,
          subject: actor,
          detail: {
            kind: 'cast_area_wardbreak',
            skillId,
            actorId: actor,
            manaCost: castCost,
            targets: wbTargets,
          },
        },
      ])
    } else if (skillId === 'immunize') {
      const imTargets: { targetId: ActorId; charges: number }[] = []
      const reactionLogs: BattleLogEntry[] = []
      for (const { targetId, hits } of hitList) {
        const ch = immunizeChargesFromStacks(entry.statusStacks) * hits
        const tag: StatusTag = { t: 'immunized', charges: ch }
        const after = addStatusToTarget(next, targetId, tag)
        next = after.state
        reactionLogs.push(...statusReactionEntries(targetId, after.messages))
        imTargets.push({ targetId, charges: ch })
      }
      next = layImpacts(next, target, entry, actor, potency)
      next = appendLogWithFirstBlood(snapshotBefore, next, [
        {
          text:
            imTargets.length === 1
              ? `${casterLabel} casts ${def.name} (${imTargets[0]!.charges} block${imTargets[0]!.charges === 1 ? '' : 's'}, ${castCost} ${resWord}).`
              : `${casterLabel} casts ${def.name} (${imTargets.length} targets, ${castCost} ${resWord}).`,
          subject: actor,
          detail: {
            kind: 'cast_area_immunize',
            skillId,
            actorId: actor,
            manaCost: castCost,
            targets: imTargets,
          },
        },
        ...reactionLogs,
      ])
    } else if (skillId === 'overclock') {
      const ocTargets: { targetId: ActorId; manaRestored: number; slowTurns: number }[] = []
      const slowDur = overclockSlowDuration(entry.statusStacks)
      const reactionLogs: BattleLogEntry[] = []
      for (const { targetId, hits } of hitList) {
        const gain = overclockManaRestore(entry.statusStacks, potency) * hits
        const t = next.actors[targetId]!
        const mana = Math.min(t.maxMana, t.mana + gain)
        const actual = mana - t.mana
        next = withActor(next, targetId, { ...t, mana })
        const afterSlow = addStatusToTarget(
          next,
          targetId,
          { t: 'slowed', duration: slowDur },
          { bypassImmunize: true },
        )
        next = afterSlow.state
        reactionLogs.push(...statusReactionEntries(targetId, afterSlow.messages))
        ocTargets.push({ targetId, manaRestored: actual, slowTurns: slowDur })
      }
      next = layImpacts(next, target, entry, actor, potency)
      next = appendLogWithFirstBlood(snapshotBefore, next, [
        {
          text:
            ocTargets.length === 1
              ? `${casterLabel} casts ${def.name} (+${ocTargets[0]!.manaRestored} mana, slowed ${slowDur}t, ${castCost} ${resWord}).`
              : `${casterLabel} casts ${def.name} (${ocTargets.length} targets, ${castCost} ${resWord}).`,
          subject: actor,
          detail: {
            kind: 'cast_area_overclock',
            skillId,
            actorId: actor,
            manaCost: castCost,
            targets: ocTargets,
          },
        },
        ...reactionLogs,
      ])
    } else {
      return { state, error: 'Unsupported utility cast.' }
    }

    next = afterHpChanges(next)
    if (next.winner || next.tie) {
      return { state: next }
    }
    next = advanceTurn(next, actor)
    return { state: next }
  }

  const snapshotOffense = state
  const hitList = gatherOffensiveHits(state, actor, target, entry.pattern)
  const totalHits = hitList.reduce((s, h) => s + h.hits, 0)

  me = payCastResource(me, def, castCost)
  const { actor: meStrippedFocus, bonus: skillFocusFlat } = stripSkillFocusFromCaster(me)
  me = meStrippedFocus
  let next = withActor(state, actor, me)
  const potency = me.traits.statusPotency

  if (totalHits === 0) {
    if (action.skillId !== 'strike') {
      next = layImpacts(next, target, entry, actor, potency)
    }
    next = appendLogWithFirstBlood(snapshotOffense, next, [
      {
        text: `${actorLabelForLog(next, actor)} casts ${def.name} — residual energy lingers on the tiles (${castCost} ${resWord}).`,
        subject: actor,
        detail: { kind: 'cast_linger', skillId: action.skillId, actorId: actor, manaCost: castCost },
      },
    ])
    next = afterHpChanges(next)
    if (next.winner || next.tie) {
      return { state: next }
    }
    next = bumpPhysicalOffenseStreak(next, actor, def)
    next = advanceTurn(next, actor)
    return { state: next }
  }

  let sumDmg = 0
  const offensiveSkillId = action.skillId
  for (const { targetId, hits } of hitList) {
    const enemy = next.actors[targetId]!
    const rawDamage =
      offensiveSkillId === 'strike'
        ? totalStrikeDamage(me.traits, me.tilesMovedThisTurn, me.physicalStreak) * hits
        : damageForCast(def, hits)
    let dmg = 0
    if (dmgKind === 'elemental') {
      const afterElem = elementalSkillDamageDealt(
        rawDamage,
        enemy.traits,
        def.element,
        me.traits.spellFocus,
      )
      dmg = damageWithShock(afterElem, enemy)
      dmg += vulnerabilityFlat(enemy)
      dmg = Math.max(1, dmg + skillFocusFlat)
      next = applyHpLoss(next, targetId, dmg)
    } else if (dmgKind === 'physical') {
      if (offensiveSkillId === 'strike') {
        const afterStrike = physicalStrikeDamageDealt(rawDamage, enemy.traits)
        dmg = damageWithShock(afterStrike, enemy)
        dmg += vulnerabilityFlat(enemy)
        dmg = Math.max(1, dmg + skillFocusFlat)
        sumDmg += dmg
        next = applyHpLoss(next, targetId, dmg)
        continue
      }
      const afterPhys = physicalSkillDamageDealt(
        rawDamage,
        enemy.traits,
        manhattan(me.pos, enemy.pos) === 1,
      )
      dmg = damageWithShock(afterPhys, enemy)
      dmg += vulnerabilityFlat(enemy)
      dmg = Math.max(1, dmg + skillFocusFlat)
      next = applyHpLoss(next, targetId, dmg)
    }
    sumDmg += dmg
  }

  if (offensiveSkillId === 'shove') {
    for (const { targetId } of hitList) {
      if (
        !canDamageTarget(
          next.matchMode,
          next.friendlyFire,
          next.teamByActor,
          actor,
          targetId,
        )
      ) {
        continue
      }
      const kb = applyKnockbackFromAttacker(next, actor, targetId, false)
      next = kb.state
    }
  }

  if (offensiveSkillId !== 'strike') {
    next = layImpacts(next, target, entry, actor, potency)
  }

  const hitSnapshots = hitList.map(({ targetId }) => {
    const a = next.actors[targetId]!
    return { targetId, hpAfter: a.hp, maxHp: a.maxHp }
  })
  const spellRelievedIds = spellFocusRelievedIds(state, actor, hitList)
  const castDamageDetail = {
    kind: 'cast_damage' as const,
    skillId: action.skillId,
    actorId: actor,
    totalDamage: sumDmg,
    manaCost: castCost,
    targetCount: hitList.length,
    hitSnapshots,
  }

  const winCastEntries: BattleLogEntry[] = [
    {
      text: `${actorLabelForLog(next, actor)} casts ${def.name} for ${sumDmg} damage (${castCost} ${resWord}).`,
      subject: actor,
      detail: castDamageDetail,
    },
  ]
  if (spellRelievedIds.length > 0) {
    winCastEntries.push({
      text: '',
      classicVisible: false,
      detail: {
        kind: 'cpu_situational',
        flavor: 'relief_not_spell_focus',
        attackerId: actor,
        focusTargetId: hitList[0]!.targetId,
        relievedIds: spellRelievedIds,
      },
    })
  }

  next = finalizeEliminations(next)
  if (next.tie) {
    return { state: appendLogWithFirstBlood(snapshotOffense, next, winCastEntries) }
  }
  const winFromCast = checkWinner(next)
  if (winFromCast) {
    next = appendLogWithFirstBlood(snapshotOffense, next, winCastEntries)
    next = appendLog(next, [winnerLog(next, winFromCast)])
    return { state: { ...next, winner: winFromCast } }
  }

  let castEntries: BattleLogEntry[] = [
    {
      text: `${actorLabelForLog(next, actor)} casts ${def.name} for ${sumDmg} damage (${castCost} ${resWord}).`,
      subject: actor,
      detail: castDamageDetail,
    },
  ]

  if (offensiveSkillId === 'strike') {
    const strikerTraits = next.actors[actor]!.traits
    const casterLabel = actorLabelForLog(next, actor)
    for (const { targetId } of hitList) {
      if (
        !canDamageTarget(next.matchMode, next.friendlyFire, next.teamByActor, actor, targetId)
      ) {
        continue
      }
      const t = next.actors[targetId]!
      if (t.hp <= 0) continue
      const bleedTag = buildBleedingTag(strikerTraits.bleedBonus, strikerTraits.statusPotency)
      const afterBleed = addStatusToTarget(next, targetId, bleedTag)
      next = afterBleed.state
      castEntries = [...castEntries, ...statusReactionEntries(targetId, afterBleed.messages)]
      if (strikerTraits.strikeSlow >= 1) {
        const slowTag = buildSlowTag(strikerTraits.strikeSlow)
        const afterSlow = addStatusToTarget(next, targetId, slowTag)
        next = afterSlow.state
        castEntries = [...castEntries, ...statusReactionEntries(targetId, afterSlow.messages)]
      }
      const kb = applyKnockbackFromAttacker(next, actor, targetId, true)
      next = kb.state
      if (kb.knockedBack) {
        castEntries.push({
          text: `${casterLabel} knocks ${actorLabelForLog(next, targetId)} back.`,
          subject: actor,
          detail: { kind: 'knockback', attackerId: actor, targetId },
        })
      }
      castEntries.push(...kb.hazardEntries)
    }
    const heal = strikerTraits.meleeLifesteal
    if (heal > 0) {
      const cur = next.actors[actor]!
      next = withActor(next, actor, { ...cur, hp: Math.min(cur.maxHp, cur.hp + heal) })
      castEntries.push({
        text: `${casterLabel} heals ${heal} from lifesteal.`,
        subject: actor,
        detail: { kind: 'lifesteal', actorId: actor, amount: heal },
      })
    }
  } else {
    const tag = buildStatusForSkill(action.skillId, entry.statusStacks, me.traits.statusPotency)
    for (const { targetId } of hitList) {
      const afterStatus = addStatusToTarget(next, targetId, tag)
      next = afterStatus.state
      castEntries = [...castEntries, ...statusReactionEntries(targetId, afterStatus.messages)]
    }
  }
  if (spellRelievedIds.length > 0) {
    castEntries.push({
      text: '',
      classicVisible: false,
      detail: {
        kind: 'cpu_situational',
        flavor: 'relief_not_spell_focus',
        attackerId: actor,
        focusTargetId: hitList[0]!.targetId,
        relievedIds: spellRelievedIds,
      },
    })
  }
  next = appendLogWithFirstBlood(snapshotOffense, next, castEntries)

  next = afterHpChanges(next)
  if (next.winner || next.tie) {
    return { state: next }
  }

  next = bumpPhysicalOffenseStreak(next, actor, def)
  next = advanceTurn(next, actor)
  return { state: next }
}

function nextAliveAfter(state: GameState, finished: ActorId): ActorId {
  const idx = state.turnOrder.indexOf(finished)
  for (let step = 1; step <= state.turnOrder.length; step++) {
    const id = state.turnOrder[(idx + step) % state.turnOrder.length]!
    if (state.actors[id]!.hp > 0) return id
  }
  return finished
}

/** After a successful action, pass turn to the next living actor and run their turn-start hooks. */
function advanceTurn(state: GameState, finished: ActorId): GameState {
  const nextTurn = nextAliveAfter(state, finished)
  const roundComplete = isRoundComplete(state, nextTurn)
  let next = decayImpacts({ ...state, turn: nextTurn })
  const beforeRoundBoundary = next
  if (roundComplete) {
    next = processFullRoundBoundary(next)
    if (next.tie) {
      return appendLogWithFirstBlood(beforeRoundBoundary, next, [])
    }
    next = afterHpChanges(next)
    if (next.winner || next.tie) {
      return appendLogWithFirstBlood(beforeRoundBoundary, next, [])
    }
  }
  const beforeHooks = next
  let actor = next.actors[nextTurn]!
  const tick = computeTurnStartTick(actor)
  actor = tick.actor
  next = withActor(next, nextTurn, actor)

  const tickEntries = turnTickResourceEntries(next, nextTurn, tick)

  let result = appendLogWithFirstBlood(beforeHooks, next, tickEntries)
  result = afterHpChanges(result)
  if (result.winner || result.tie) {
    return result
  }

  if (hasFrozen(actor)) {
    const unfrozen = consumeFrozen(actor)
    next = withActor(next, nextTurn, unfrozen)
    let result = appendLogWithFirstBlood(beforeHooks, next, tickEntries)
    result = appendLog(result, [
      {
        text: `${actorLabelForLog(result, nextTurn)} is frozen and skips a turn.`,
        subject: nextTurn,
        detail: { kind: 'frozen_skip', actorId: nextTurn },
      },
    ])
    return advanceTurn(result, nextTurn)
  }

  next = appendLogWithFirstBlood(beforeHooks, next, tickEntries)
  next = appendLog(next, [turnAnnouncement(next, nextTurn)])
  return next
}

export function legalMoves(state: GameState, actor: ActorId): Coord[] {
  if (state.winner || state.tie || state.turn !== actor) return []
  const me = state.actors[actor]
  if (hasFrozen(me)) return []
  if (hasRooted(me)) return []
  const start = me.pos
  const maxSteps = effectiveMoveSteps(me)
  const reachable = cellsReachableInSteps(state, actor, maxSteps)
  const maxTilesByStamina = Math.floor(me.stamina / STAMINA_MOVE_COST_PER_TILE)
  return reachable.filter((c) => manhattan(start, c) <= maxTilesByStamina)
}

export function legalCasts(state: GameState, actor: ActorId): { skillId: SkillId; target: Coord }[] {
  if (state.winner || state.tie || state.turn !== actor) return []
  const me = state.actors[actor]
  if (hasFrozen(me)) return []
  const out: { skillId: SkillId; target: Coord }[] = []

  for (const entry of state.loadouts[actor]) {
    const def = getSkillDef(entry.skillId)
    if (def.school === 'magic' && hasSilenced(me)) continue
    if (def.school === 'physical' && hasDisarmed(me)) continue
    if (!patternRespectsAoE(entry.pattern, def, entry)) continue
    const maxRange = effectiveCastRangeForLoadout(def, entry, me.traits)
    const minRange = minCastManhattanForLoadout(def, entry)

    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        const target = { x, y }
        const d = manhattan(me.pos, target)
        if (d > maxRange || d < minRange) continue
        if (!patternFullyInBounds(target, entry.pattern, state.size)) continue
        const cost = castResourceCost(entry, def, d)
        if (def.school === 'magic' && me.mana < cost) continue
        if (def.school === 'physical' && me.stamina < cost) continue
        out.push({ skillId: entry.skillId, target })
      }
    }
  }
  return out
}

/**
 * All cells you may use as cast anchors for one skill (range + pattern in bounds, enough mana/stamina).
 * Includes targets that do not overlap the enemy — use with {@link legalCasts} for full vs miss highlights.
 */
export function castReachableAnchors(state: GameState, actor: ActorId, skillId: SkillId): Coord[] {
  if (state.winner || state.tie || state.turn !== actor) return []
  const me = state.actors[actor]
  if (hasFrozen(me)) return []
  const entry = loadoutEntry(actor, skillId, state)
  if (!entry) return []
  const def = getSkillDef(skillId)
  if (def.school === 'magic' && hasSilenced(me)) return []
  if (def.school === 'physical' && hasDisarmed(me)) return []
  if (!patternRespectsAoE(entry.pattern, def, entry)) return []
  const maxRange = effectiveCastRangeForLoadout(def, entry, me.traits)
  const minRange = minCastManhattanForLoadout(def, entry)
  const out: Coord[] = []
  for (let y = 0; y < state.size; y++) {
    for (let x = 0; x < state.size; x++) {
      const target = { x, y }
      const d = manhattan(me.pos, target)
      if (d > maxRange || d < minRange) continue
      if (!patternFullyInBounds(target, entry.pattern, state.size)) continue
      const cost = castResourceCost(entry, def, d)
      if (def.school === 'magic' && me.mana < cost) continue
      if (def.school === 'physical' && me.stamina < cost) continue
      out.push(target)
    }
  }
  return out
}

export function allLegalActions(state: GameState, actor: ActorId): GameAction[] {
  const moves = legalMoves(state, actor).map((to) => ({ type: 'move' as const, to }))
  const casts = legalCasts(state, actor).map((c) => ({
    type: 'cast' as const,
    skillId: c.skillId,
    target: c.target,
  }))
  const base = [...moves, ...casts]
  if (state.winner || state.tie || state.turn !== actor) return base
  const me = state.actors[actor]
  if (!me || hasFrozen(me)) return base
  return [...base, { type: 'skip' as const }]
}

/** Run turn-start hooks when it becomes someone's turn (e.g. after loading a saved battle). */
export function applyTurnEntry(state: GameState): GameState {
  const actorId = state.turn
  const beforeHooks = state
  let actor = state.actors[actorId]!
  const tick = computeTurnStartTick(actor)
  actor = tick.actor
  let next = withActor(state, actorId, actor)
  const tickEntries = turnTickResourceEntries(next, actorId, tick)
  let result = appendLogWithFirstBlood(beforeHooks, next, tickEntries)
  result = afterHpChanges(result)
  if (result.winner || result.tie) {
    return result
  }
  if (hasFrozen(actor)) {
    const unfrozen = consumeFrozen(actor)
    next = withActor(next, actorId, unfrozen)
    let frozenSkip = appendLogWithFirstBlood(beforeHooks, next, tickEntries)
    frozenSkip = appendLog(frozenSkip, [
      {
        text: `${actorLabelForLog(frozenSkip, actorId)} is frozen and skips a turn.`,
        subject: actorId,
        detail: { kind: 'frozen_skip', actorId },
      },
    ])
    return advanceTurn(frozenSkip, actorId)
  }
  return result
}
