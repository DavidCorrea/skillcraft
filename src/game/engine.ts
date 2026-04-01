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
  boardSizeForMatch,
  canDamageTarget,
  coordKey,
  manhattan,
  orthNeighbors,
  spawnPositionsForActors,
} from './board'
import { deriveMatchMode, normalizeBattleConfig } from './match-roster'

export { normalizeBattleConfig } from './match-roster'
import {
  buildStatusForSkill,
  cellsForPattern,
  countHitsOnEnemy,
  damageForCast,
  effectiveCastRangeForLoadout,
  getSkillDef,
  manaCostForCast,
  mendHealAmount,
  patternFullyInBounds,
  purgeCleanseCount,
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
  STAMINA_STRIKE_COST,
  totalStrikeDamage,
} from './traits'
import { cloneTag, resolveStatusesAfterAdd } from './reactions'

export type GameAction =
  | { type: 'move'; to: Coord }
  | { type: 'cast'; skillId: SkillId; target: Coord }
  /** Required when multiple adjacent enemies; optional when exactly one legal target. */
  | { type: 'strike'; targetId?: ActorId }
  /** End turn without moving, striking, or casting (e.g. no stamina, rooted, silenced with no affordable casts). */
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
    strikeStreak: 0,
    statuses: [],
  }
}

/** How many turn handoffs the hazard survives (each advanceTurn tick). */
const IMPACT_DURATION_TURNS = 6

export function createInitialState(config: BattleConfig): GameState {
  resetIdsForTests()
  const normalized = normalizeBattleConfig(config)
  const built = buildRosterFromMatchSettings(normalized.match)
  const size = boardSizeForMatch(config.level, built.turnOrder.length, normalized.match.boardSize)
  const spawns = spawnPositionsForActors(size, built.turnOrder, built.humanActorId)
  const rowById = new Map(normalized.match.roster.map((r) => [r.actorId, r]))
  const actors: Record<ActorId, ActorState> = {}
  for (const id of built.turnOrder) {
    const pos = spawns[id]
    if (!pos) throw new Error(`No spawn for ${id}`)
    const row = rowById.get(id)
    actors[id] = actorFromTraits(id, pos, config.level, built.traitsByActor[id]!, row?.displayName)
  }
  const turn = built.turnOrder[0]!
  const initial: GameState = {
    size,
    actors,
    turn,
    turnOrder: [...built.turnOrder],
    winner: null,
    log: [],
    loadouts: built.loadouts,
    impactedTiles: {},
    matchMode: built.matchMode,
    friendlyFire: built.friendlyFire,
    teamByActor: built.teamByActor,
    humanActorId: built.humanActorId,
    cpuDifficulty: built.cpuDifficulty,
  }
  initial.log = [{ text: 'Battle start.' }, turnAnnouncement(initial, turn)]
  return initial
}

function loadoutEntry(actor: ActorId, skillId: SkillId, state: GameState): SkillLoadoutEntry | undefined {
  return state.loadouts[actor].find((e) => e.skillId === skillId)
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
  return { text, subject: actorId }
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

  const wAfter = checkWinner(next)
  if (wAfter) {
    return {
      state: { ...next, winner: wAfter },
      entries: [
        {
          text: `${moverLabel} triggers residual ${def.name} for ${dmg} damage.`,
          subject: moverId,
        },
        { text: `${actorLabelForLog(next, wAfter)} wins!`, subject: wAfter },
      ],
    }
  }

  const tag = buildStatusForSkill(impact.skillId, impact.statusStacks, impact.casterStatusPotency)
  const afterStatus = addStatusToTarget(next, moverId, tag)
  next = afterStatus.state
  const entries: BattleLogEntry[] = [
    { text: `${moverLabel} triggers residual ${def.name} for ${dmg} damage.`, subject: moverId },
    ...afterStatus.messages.map((m) => ({ text: m, subject: moverId })),
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
    }
  }
  return out
}

/** Apply DoT and duration decay at start of an actor's turn. Frozen forces skip (handled separately). */
export function applyTurnStartHooks(actor: ActorState): ActorState {
  const ten = actor.traits.tenacity
  let hp = actor.hp
  for (const s of actor.statuses) {
    if (s.tag.t === 'burning') hp -= Math.max(0, s.tag.dot - ten)
    if (s.tag.t === 'poisoned') hp -= Math.max(0, s.tag.dot - ten)
    if (s.tag.t === 'bleeding') hp -= Math.max(0, s.tag.dot - ten)
  }
  hp = Math.max(0, hp)
  let regen = actor.traits.regeneration
  if (actor.statuses.some((s) => s.tag.t === 'regenBlocked')) {
    regen = Math.floor(regen / 2)
  }
  hp = Math.min(actor.maxHp, hp + regen)
  const statuses = decayStatuses(actor.statuses)
  const mana = Math.min(actor.maxMana, actor.mana + actor.manaRegenPerTurn)
  const stamina = Math.min(actor.maxStamina, actor.stamina + STAMINA_REGEN_PER_TURN)
  return { ...actor, hp, statuses, mana, stamina, tilesMovedThisTurn: 0 }
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

function winnerLog(state: GameState, w: ActorId): BattleLogEntry {
  return { text: `${actorLabelForLog(state, w)} wins!`, subject: w }
}

function checkWinner(state: GameState): ActorId | null {
  const alive = state.turnOrder.filter((id) => state.actors[id]!.hp > 0)
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

/** Physical Strike: duel, fortitude, physical armor (raw damage before this). */
function applyDamageFromAttacker(
  state: GameState,
  targetId: ActorId,
  attackerId: ActorId,
  rawAmount: number,
  opts?: { physicalStrike?: boolean },
): GameState {
  const target = state.actors[targetId]
  const attacker = state.actors[attackerId]
  let n = rawAmount
  if (opts?.physicalStrike) {
    if (manhattan(attacker.pos, target.pos) === 1) {
      n = Math.max(1, n - target.traits.meleeDuelReduction)
    }
    n = Math.max(1, n - target.traits.fortitude - target.traits.physicalArmor)
  }
  n += vulnerabilityFlat(target)
  n = Math.max(1, n)
  return applyHpLoss(state, targetId, n)
}

function effectiveMoveSteps(actor: ActorState): number {
  const slowed = actor.statuses.some((s) => s.tag.t === 'slowed')
  const muddy = actor.statuses.some((s) => s.tag.t === 'muddy')
  let pen = 0
  if (slowed) pen += 1
  if (muddy) pen += 1
  return Math.max(1, actor.moveMaxSteps - pen)
}

function applyKnockbackFromStrike(
  state: GameState,
  strikerId: ActorId,
  enemyId: ActorId,
): { state: GameState; hazardEntries: BattleLogEntry[] } {
  const striker = state.actors[strikerId]
  if (striker.traits.strikeKnockback < 1) return { state, hazardEntries: [] }
  const enemy = state.actors[enemyId]
  if (enemy.hp <= 0) return { state, hazardEntries: [] }
  const dx = Math.sign(enemy.pos.x - striker.pos.x)
  const dy = Math.sign(enemy.pos.y - striker.pos.y)
  const np = { x: enemy.pos.x + dx, y: enemy.pos.y + dy }
  const sz = state.size
  if (np.x < 0 || np.x >= sz || np.y < 0 || np.y >= sz) return { state, hazardEntries: [] }
  if (actorAt(state, np) !== null) return { state, hazardEntries: [] }
  let next = withActor(state, enemyId, { ...enemy, pos: np })
  const enter = applyImpactsOnEnter(next, enemyId, np)
  next = enter.state
  return { state: next, hazardEntries: enter.entries }
}

function addStatusToTarget(
  state: GameState,
  targetId: ActorId,
  tag: StatusTag,
): { state: GameState; messages: string[] } {
  const target = state.actors[targetId]
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
  return s.tag.t !== 'shield'
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

export function hasRooted(actor: ActorState): boolean {
  return actor.statuses.some((s) => s.tag.t === 'rooted')
}

export function legalStrikeTargets(state: GameState, actor: ActorId): ActorId[] {
  if (state.winner || state.turn !== actor) return []
  const me = state.actors[actor]
  if (hasFrozen(me)) return []
  if (me.stamina < STAMINA_STRIKE_COST) return []
  const out: ActorId[] = []
  for (const id of state.turnOrder) {
    if (id === actor) continue
    const t = state.actors[id]
    if (!t || t.hp <= 0) continue
    if (!canDamageTarget(state.matchMode, state.friendlyFire, state.teamByActor, actor, id)) continue
    if (manhattan(me.pos, t.pos) === 1) out.push(id)
  }
  return out
}

export function gatherOffensiveHits(
  state: GameState,
  actor: ActorId,
  anchor: Coord,
  pattern: PatternOffset[],
): { targetId: ActorId; hits: number }[] {
  const out: { targetId: ActorId; hits: number }[] = []
  for (const id of state.turnOrder) {
    if (id === actor) continue
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
  if (state.winner) return { state, error: 'Game is over.' }
  if (state.turn !== actor) return { state, error: 'Not your turn.' }

  let me = state.actors[actor]
  if (hasFrozen(me)) {
    return { state, error: 'Frozen — you cannot act.' }
  }

  if (action.type === 'move') {
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
      strikeStreak: 0,
    }
    let next = withActor(state, actor, me)
    const enter = applyImpactsOnEnter(next, actor, to)
    next = enter.state
    const moveEntries: BattleLogEntry[] = [
      { text: `${actorLabelForLog(next, actor)} moves.`, subject: actor },
      ...enter.entries,
    ]
    const wMove = checkWinner(next)
    if (wMove) {
      next = appendLog(next, moveEntries)
      return { state: { ...next, winner: wMove } }
    }
    next = appendLog(next, moveEntries)
    next = advanceTurn(next, actor)
    return { state: next }
  }

  if (action.type === 'strike') {
    if (me.stamina < STAMINA_STRIKE_COST) {
      return { state, error: 'Not enough stamina to strike.' }
    }
    const legal = legalStrikeTargets(state, actor)
    let enemyId = action.targetId
    if (enemyId === undefined) {
      if (legal.length === 0) {
        return { state, error: 'Strike requires being adjacent to an enemy.' }
      }
      if (legal.length !== 1) {
        return { state, error: 'Must choose a strike target.' }
      }
      enemyId = legal[0]!
    } else if (!legal.includes(enemyId)) {
      return { state, error: 'Invalid strike target.' }
    }
    const enemy = state.actors[enemyId]!
    const rawDmg = totalStrikeDamage(me.traits, me.tilesMovedThisTurn, me.strikeStreak)
    const dmgDealt = Math.max(
      1,
      physicalStrikeDamageDealt(rawDmg, enemy.traits) + vulnerabilityFlat(enemy),
    )
    me = { ...me, stamina: me.stamina - STAMINA_STRIKE_COST }
    let next = withActor(state, actor, me)
    next = applyDamageFromAttacker(next, enemyId, actor, rawDmg, { physicalStrike: true })

    let meAfter = next.actors[actor]
    const heal = meAfter.traits.meleeLifesteal
    meAfter = {
      ...meAfter,
      hp: Math.min(meAfter.maxHp, meAfter.hp + heal),
      strikeStreak: meAfter.strikeStreak + 1,
    }
    next = withActor(next, actor, meAfter)

    const kb = applyKnockbackFromStrike(next, actor, enemyId)
    next = kb.state

    const strikerLabel = actorLabelForLog(next, actor)
    const wAfterHit = checkWinner(next)
    if (wAfterHit) {
      next = appendLog(next, [
        { text: `${strikerLabel} strikes for ${dmgDealt} physical damage.`, subject: actor },
        ...kb.hazardEntries,
        winnerLog(next, wAfterHit),
      ])
      return { state: { ...next, winner: wAfterHit } }
    }

    const strikerTraits = next.actors[actor].traits
    const bleedTag = buildBleedingTag(strikerTraits.bleedBonus, strikerTraits.statusPotency)
    const afterBleed = addStatusToTarget(next, enemyId, bleedTag)
    next = afterBleed.state
    let strikeEntries: BattleLogEntry[] = [
      { text: `${strikerLabel} strikes for ${dmgDealt} physical damage.`, subject: actor },
      ...afterBleed.messages.map((m) => ({ text: m, subject: enemyId })),
    ]
    if (kb.hazardEntries.length > 0) strikeEntries = [...strikeEntries, ...kb.hazardEntries]

    if (strikerTraits.strikeSlow >= 1) {
      const slowTag = buildSlowTag(strikerTraits.strikeSlow)
      const afterSlow = addStatusToTarget(next, enemyId, slowTag)
      next = afterSlow.state
      strikeEntries = [
        ...strikeEntries,
        ...afterSlow.messages.map((m) => ({ text: m, subject: enemyId })),
      ]
    }

    if (heal > 0) {
      strikeEntries.push({ text: `${strikerLabel} heals ${heal} from lifesteal.`, subject: actor })
    }

    next = appendLog(next, strikeEntries)

    const w = checkWinner(next)
    if (w) {
      next = { ...next, winner: w, log: [...next.log, winnerLog(next, w)] }
      return { state: next }
    }

    next = advanceTurn(next, actor)
    return { state: next }
  }

  if (action.type === 'skip') {
    const label = actorLabelForLog(state, actor)
    let next = appendLog(state, [{ text: `${label} skips.`, subject: actor }])
    next = advanceTurn(next, actor)
    return { state: next }
  }

  if (hasSilenced(me)) {
    return { state, error: 'Silenced — you cannot cast.' }
  }

  const entry = loadoutEntry(actor, action.skillId, state)
  if (!entry) return { state, error: 'Skill not in loadout.' }

  const def = getSkillDef(action.skillId)
  const target = action.target
  const anchorDist = def.selfTarget ? 0 : manhattan(me.pos, target)
  const manaCost = manaCostForCast(entry, anchorDist)
  if (me.mana < manaCost) return { state, error: 'Not enough mana.' }
  const sz = state.size
  if (target.x < 0 || target.x >= sz || target.y < 0 || target.y >= sz) {
    return { state, error: 'Invalid target.' }
  }
  const maxRange = effectiveCastRangeForLoadout(def, entry, me.traits)
  if (manhattan(me.pos, target) > maxRange) return { state, error: 'Target out of range.' }

  if (!patternFullyInBounds(target, entry.pattern, sz)) {
    return { state, error: 'Pattern would leave the board from this target.' }
  }

  const dmgKind = def.damageKind ?? 'elemental'

  if (def.selfTarget) {
    if (coordKey(target) !== coordKey(me.pos)) {
      return { state, error: 'Self skills must target your own cell.' }
    }
    me = { ...me, mana: me.mana - manaCost, strikeStreak: 0 }
    let next = withActor(state, actor, me)
    const potency = me.traits.statusPotency

    const casterLabel = actorLabelForLog(next, actor)
    if (action.skillId === 'mend') {
      const heal = mendHealAmount(entry.statusStacks, potency)
      const healed = next.actors[actor]
      const hp = Math.min(healed.maxHp, healed.hp + heal)
      next = withActor(next, actor, { ...healed, hp })
      next = appendLog(next, [
        { text: `${casterLabel} casts ${def.name} for +${heal} HP (${manaCost} mana).`, subject: actor },
      ])
    } else if (action.skillId === 'ward') {
      const tag = buildStatusForSkill('ward', entry.statusStacks, potency)
      const cur = next.actors[actor]
      const shIdx = cur.statuses.findIndex((s) => s.tag.t === 'shield')
      let finalTag: StatusTag = tag
      if (tag.t === 'shield' && shIdx !== -1) {
        const ex = cur.statuses[shIdx]!
        if (ex.tag.t === 'shield') {
          finalTag = { t: 'shield', amount: ex.tag.amount + tag.amount }
        }
      }
      const stripped =
        shIdx !== -1 && finalTag.t === 'shield' ? cur.statuses.filter((_, i) => i !== shIdx) : cur.statuses
      next = withActor(next, actor, { ...cur, statuses: stripped })
      const after = addStatusToTarget(next, actor, finalTag)
      next = after.state
      next = appendLog(next, [
        { text: `${casterLabel} casts ${def.name} (${manaCost} mana).`, subject: actor },
        ...after.messages.map((m) => ({ text: m, subject: actor })),
      ])
    } else if (action.skillId === 'purge') {
      const n = purgeCleanseCount(entry.statusStacks)
      const purged = purgeDebuffs(next.actors[actor], n)
      next = withActor(next, actor, purged)
      next = appendLog(next, [
        { text: `${casterLabel} casts ${def.name}, cleanses ${n} (${manaCost} mana).`, subject: actor },
      ])
    }

    const w = checkWinner(next)
    if (w) {
      next = { ...next, winner: w, log: [...next.log, winnerLog(next, w)] }
      return { state: next }
    }
    next = advanceTurn(next, actor)
    return { state: next }
  }

  const hitList = gatherOffensiveHits(state, actor, target, entry.pattern)
  const totalHits = hitList.reduce((s, h) => s + h.hits, 0)

  me = { ...me, mana: me.mana - manaCost, strikeStreak: 0 }
  let next = withActor(state, actor, me)
  const potency = me.traits.statusPotency

  if (totalHits === 0) {
    next = layImpacts(next, target, entry, actor, potency)
    next = appendLog(next, [
      {
        text: `${actorLabelForLog(next, actor)} casts ${def.name} — residual energy lingers on the tiles (${manaCost} mana).`,
        subject: actor,
      },
    ])
    const w = checkWinner(next)
    if (w) {
      next = { ...next, winner: w, log: [...next.log, winnerLog(next, w)] }
      return { state: next }
    }
    next = advanceTurn(next, actor)
    return { state: next }
  }

  let sumDmg = 0
  for (const { targetId, hits } of hitList) {
    const enemy = next.actors[targetId]!
    const rawDamage = damageForCast(def, hits)
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
      dmg = Math.max(1, dmg)
      next = applyHpLoss(next, targetId, dmg)
    } else if (dmgKind === 'physical') {
      const afterPhys = physicalSkillDamageDealt(
        rawDamage,
        enemy.traits,
        manhattan(me.pos, enemy.pos) === 1,
      )
      dmg = damageWithShock(afterPhys, enemy)
      dmg += vulnerabilityFlat(enemy)
      dmg = Math.max(1, dmg)
      next = applyHpLoss(next, targetId, dmg)
    }
    sumDmg += dmg
  }

  next = layImpacts(next, target, entry, actor, potency)

  const wAfterHit = checkWinner(next)
  if (wAfterHit) {
    next = appendLog(next, [
      {
        text: `${actorLabelForLog(next, actor)} casts ${def.name} for ${sumDmg} damage (${manaCost} mana).`,
        subject: actor,
      },
      winnerLog(next, wAfterHit),
    ])
    return { state: { ...next, winner: wAfterHit } }
  }

  const tag = buildStatusForSkill(action.skillId, entry.statusStacks, me.traits.statusPotency)
  let castEntries: BattleLogEntry[] = [
    {
      text: `${actorLabelForLog(next, actor)} casts ${def.name} for ${sumDmg} damage (${manaCost} mana).`,
      subject: actor,
    },
  ]
  for (const { targetId } of hitList) {
    const afterStatus = addStatusToTarget(next, targetId, tag)
    next = afterStatus.state
    castEntries = [
      ...castEntries,
      ...afterStatus.messages.map((m) => ({ text: m, subject: targetId })),
    ]
  }
  next = appendLog(next, castEntries)

  const w = checkWinner(next)
  if (w) {
    next = { ...next, winner: w, log: [...next.log, winnerLog(next, w)] }
    return { state: next }
  }

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
  let next = decayImpacts({ ...state, turn: nextTurn })
  let actor = next.actors[nextTurn]!
  actor = applyTurnStartHooks(actor)
  next = withActor(next, nextTurn, actor)

  const w = checkWinner(next)
  if (w) {
    return { ...next, winner: w, log: [...next.log, winnerLog(next, w)] }
  }

  if (hasFrozen(actor)) {
    const unfrozen = consumeFrozen(actor)
    next = withActor(next, nextTurn, unfrozen)
    next = appendLog(next, [
      {
        text: `${actorLabelForLog(next, nextTurn)} is frozen and skips a turn.`,
        subject: nextTurn,
      },
    ])
    return advanceTurn(next, nextTurn)
  }

  next = appendLog(next, [turnAnnouncement(next, nextTurn)])
  return next
}

export function legalMoves(state: GameState, actor: ActorId): Coord[] {
  if (state.winner || state.turn !== actor) return []
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
  if (state.winner || state.turn !== actor) return []
  const me = state.actors[actor]
  if (hasFrozen(me)) return []
  if (hasSilenced(me)) return []
  const out: { skillId: SkillId; target: Coord }[] = []

  for (const entry of state.loadouts[actor]) {
    const def = getSkillDef(entry.skillId)
    const maxRange = effectiveCastRangeForLoadout(def, entry, me.traits)

    if (def.selfTarget) {
      const target = me.pos
      if (manhattan(me.pos, target) > maxRange) continue
      if (!patternFullyInBounds(target, entry.pattern, state.size)) continue
      if (me.mana < manaCostForCast(entry, 0)) continue
      out.push({ skillId: entry.skillId, target })
      continue
    }

    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        const target = { x, y }
        if (manhattan(me.pos, target) > maxRange) continue
        if (!patternFullyInBounds(target, entry.pattern, state.size)) continue
        if (me.mana < manaCostForCast(entry, manhattan(me.pos, target))) continue
        out.push({ skillId: entry.skillId, target })
      }
    }
  }
  return out
}

/**
 * All cells you may use as cast anchors for one skill (range + pattern in bounds, enough mana).
 * Includes targets that do not overlap the enemy — use with {@link legalCasts} for full vs miss highlights.
 */
export function castReachableAnchors(state: GameState, actor: ActorId, skillId: SkillId): Coord[] {
  if (state.winner || state.turn !== actor) return []
  const me = state.actors[actor]
  if (hasFrozen(me)) return []
  if (hasSilenced(me)) return []
  const entry = loadoutEntry(actor, skillId, state)
  if (!entry) return []
  const def = getSkillDef(skillId)
  const maxRange = effectiveCastRangeForLoadout(def, entry, me.traits)
  const out: Coord[] = []
  if (def.selfTarget) {
    const target = me.pos
    if (
      manhattan(me.pos, target) <= maxRange &&
      patternFullyInBounds(target, entry.pattern, state.size) &&
      me.mana >= manaCostForCast(entry, 0)
    ) {
      out.push(target)
    }
    return out
  }
  for (let y = 0; y < state.size; y++) {
    for (let x = 0; x < state.size; x++) {
      const target = { x, y }
      if (manhattan(me.pos, target) > maxRange) continue
      if (!patternFullyInBounds(target, entry.pattern, state.size)) continue
      if (me.mana < manaCostForCast(entry, manhattan(me.pos, target))) continue
      out.push(target)
    }
  }
  return out
}

export function canStrike(state: GameState, actor: ActorId): boolean {
  return legalStrikeTargets(state, actor).length > 0
}

export function allLegalActions(state: GameState, actor: ActorId): GameAction[] {
  const moves = legalMoves(state, actor).map((to) => ({ type: 'move' as const, to }))
  const strikes: GameAction[] = legalStrikeTargets(state, actor).map((targetId) => ({
    type: 'strike' as const,
    targetId,
  }))
  const casts = legalCasts(state, actor).map((c) => ({
    type: 'cast' as const,
    skillId: c.skillId,
    target: c.target,
  }))
  const base = [...moves, ...strikes, ...casts]
  if (state.winner || state.turn !== actor) return base
  const me = state.actors[actor]
  if (!me || hasFrozen(me)) return base
  return [...base, { type: 'skip' as const }]
}

/** Run turn-start hooks when it becomes someone's turn (e.g. after loading a saved battle). */
export function applyTurnEntry(state: GameState): GameState {
  const actorId = state.turn
  let actor = state.actors[actorId]
  actor = applyTurnStartHooks(actor)
  let next = withActor(state, actorId, actor)
  const w = checkWinner(next)
  if (w) return { ...next, winner: w, log: [...next.log, winnerLog(next, w)] }
  if (hasFrozen(actor)) {
    const unfrozen = consumeFrozen(actor)
    next = withActor(next, actorId, unfrozen)
    next = appendLog(next, [
      {
        text: `${actorLabelForLog(next, actorId)} is frozen and skips a turn.`,
        subject: actorId,
      },
    ])
    return advanceTurn(next, actorId)
  }
  return next
}
