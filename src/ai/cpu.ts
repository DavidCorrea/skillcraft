import type { GameAction } from '../game/engine'
import { applyAction, allLegalActions, gatherOffensiveHits } from '../game/engine'
import { cpuActionHistoryKey, hashCpuSearchPosition } from './cpuPositionHash'
import type { ActorId, ActorState, CpuDifficulty, GameState } from '../game/types'
import { coordKey, isOpponentActor, manhattan } from '../game/board'
import { currentOvertimeDamageAmount, isOvertimeLethal } from '../game/overtime'
import {
  damageForCast,
  focusBonusDamage,
  getSkillDef,
  immunizeChargesFromStacks,
  isAdjacentPhysicalOffense,
  mendHealAmount,
  overclockManaRestore,
  purgeCleanseCount,
  wardbreakShredAmount,
  wardShieldAmount,
} from '../game/skills'
import {
  physicalDamageDealt,
  physicalOffenseDamagePerHit,
  physicalStrikeDamageDealt,
  totalStrikeDamage,
} from '../game/traits'

const WIN_SCORE = 1_000_000
const LOSS_SCORE = -1_000_000

type TtFlag = 'exact' | 'lower' | 'upper'

type TtEntry = {
  score: number
  flag: TtFlag
}

/** Key = position hash XOR depth tag — entries are only valid for that remaining depth. */
function ttCompositeKey(positionHash: bigint, depth: number): bigint {
  return (positionHash ^ (BigInt(depth) * 1000003n)) & ((1n << 64n) - 1n)
}

type SearchTables = {
  tt: Map<bigint, TtEntry>
  history: Map<string, number>
  killer0: Map<number, GameAction>
  killer1: Map<number, GameAction>
}

function createSearchTables(): SearchTables {
  return {
    tt: new Map(),
    history: new Map(),
    killer0: new Map(),
    killer1: new Map(),
  }
}

function ttProbe(tables: SearchTables, key: bigint, alpha: number, beta: number): number | null {
  const entry = tables.tt.get(key)
  if (!entry) return null
  if (entry.flag === 'exact') return entry.score
  if (entry.flag === 'lower' && entry.score >= beta) return entry.score
  if (entry.flag === 'upper' && entry.score <= alpha) return entry.score
  return null
}

function ttStore(tables: SearchTables, key: bigint, value: number, alpha: number, beta: number) {
  let flag: TtFlag
  if (value <= alpha) flag = 'upper'
  else if (value >= beta) flag = 'lower'
  else flag = 'exact'

  tables.tt.set(key, { score: value, flag })
}

function gameActionsEqual(a: GameAction, b: GameAction): boolean {
  if (a.type !== b.type) return false
  switch (a.type) {
    case 'skip':
      return true
    case 'move':
      return b.type === 'move' && a.to.x === b.to.x && a.to.y === b.to.y
    case 'cast':
      return (
        b.type === 'cast' &&
        a.skillId === b.skillId &&
        a.target.x === b.target.x &&
        a.target.y === b.target.y
      )
  }
}

function recordKiller(tables: SearchTables, depth: number, action: GameAction) {
  const k0 = tables.killer0.get(depth)
  if (k0 && gameActionsEqual(k0, action)) return
  if (k0 !== undefined) tables.killer1.set(depth, k0)
  tables.killer0.set(depth, action)
}

function bumpHistory(tables: SearchTables, actor: ActorId, action: GameAction, depth: number) {
  const k = cpuActionHistoryKey(actor, action)
  tables.history.set(k, (tables.history.get(k) ?? 0) + depth * depth)
}

function searchPliesForDifficulty(d: CpuDifficulty): number {
  if (d === 'easy') return 2
  /** Above Hard (6); keep bounded so duel turns stay responsive in the browser. */
  if (d === 'nightmare') return 8
  if (d === 'hard') return 6
  return 4
}

/**
 * Paranoid search depth for 3+ fighters (team vs everyone else).
 * Kept below duel depth — branching is much higher (casts/moves × actors).
 */
function searchPliesMulti(d: CpuDifficulty): number {
  if (d === 'nightmare') return 5
  if (d === 'hard') return 4
  return 3
}

function sameTeam(state: GameState, a: ActorId, b: ActorId): boolean {
  return state.teamByActor[a] === state.teamByActor[b]
}

function winningSideScore(state: GameState, perspectiveId: ActorId): number | null {
  if (state.tie) return 0
  if (!state.winner) return null
  return sameTeam(state, state.winner, perspectiveId) ? WIN_SCORE : LOSS_SCORE
}

function closestEnemyId(state: GameState, actor: ActorId): ActorId | null {
  const ids = enemyIds(state, actor)
  if (ids.length === 0) return null
  const me = state.actors[actor]!
  let bestId = ids[0]!
  let bestD = manhattan(me.pos, state.actors[bestId]!.pos)
  for (let i = 1; i < ids.length; i++) {
    const id = ids[i]!
    const d = manhattan(me.pos, state.actors[id]!.pos)
    if (d < bestD) {
      bestD = d
      bestId = id
    }
  }
  return bestId
}

function enemyIds(state: GameState, actor: ActorId): ActorId[] {
  return state.turnOrder.filter((id) => {
    if (id === actor) return false
    if (state.actors[id]!.hp <= 0) return false
    return isOpponentActor(state.matchMode, state.teamByActor, actor, id)
  })
}

function closestEnemy(state: GameState, actor: ActorId): ActorState | null {
  const me = state.actors[actor]
  const ids = enemyIds(state, actor)
  if (ids.length === 0) return null
  let best = state.actors[ids[0]!]!
  let bestD = manhattan(me.pos, best.pos)
  for (let i = 1; i < ids.length; i++) {
    const e = state.actors[ids[i]!]!
    const d = manhattan(me.pos, e.pos)
    if (d < bestD) {
      bestD = d
      best = e
    }
  }
  return best
}

function otherInDuel(state: GameState, self: ActorId): ActorId {
  return state.turnOrder.find((id) => id !== self)!
}

/**
 * Chooses a CPU / AI action. 1v1: two-player minimax. 3+ fighters: paranoid team search (Normal+).
 * Easy: greedy with random noise.
 */
export function pickCpuAction(state: GameState, actorId: ActorId): GameAction {
  if (state.tie) {
    throw new Error('Game over (tie)')
  }
  const actions = allLegalActions(state, actorId)
  if (actions.length === 0) {
    throw new Error(`${actorId} has no legal actions`)
  }

  const diff: CpuDifficulty = state.cpuDifficulty[actorId] ?? 'normal'

  for (const action of actions) {
    const res = applyAction(state, actorId, action)
    if (!res.error && res.state.winner === actorId) {
      return action
    }
  }

  if (diff === 'easy') {
    return pickCpuGreedy(state, actorId, diff)
  }

  const tables = createSearchTables()

  const jitter =
    diff === 'nightmare'
      ? Math.random() * 0.001
      : diff === 'hard'
        ? Math.random() * 0.008
        : Math.random() * 0.015

  if (state.turnOrder.length === 2) {
    const plies = searchPliesForDifficulty(diff)
    const ordered = orderedActions(state, actorId, plies - 1, tables)
    let best: GameAction = ordered[0]!
    let bestScore = -Infinity
    const other = otherInDuel(state, actorId)

    for (const action of ordered) {
      const res = applyAction(state, actorId, action)
      if (res.error) continue
      const next = res.state
      if (next.winner === other) continue

      const score = minimax(next, plies - 1, -Infinity, Infinity, actorId, other, tables)
      if (score + jitter > bestScore) {
        bestScore = score + jitter
        best = action
      }
    }

    return best
  }

  const pliesMulti = searchPliesMulti(diff)
  const orderedMulti = orderedActions(state, actorId, pliesMulti - 1, tables)
  let bestM: GameAction = orderedMulti[0]!
  let bestScoreM = -Infinity

  for (const action of orderedMulti) {
    const res = applyAction(state, actorId, action)
    if (res.error) continue
    const next = res.state
    const term = winningSideScore(next, actorId)
    if (term === LOSS_SCORE) continue

    const score =
      term === WIN_SCORE
        ? WIN_SCORE
        : paranoidSearch(next, pliesMulti - 1, -Infinity, Infinity, actorId, tables)
    if (score + jitter > bestScoreM) {
      bestScoreM = score + jitter
      bestM = action
    }
  }

  return bestM
}

function pickCpuGreedy(state: GameState, actorId: ActorId, diff: CpuDifficulty): GameAction {
  const actions = allLegalActions(state, actorId)
  const ordered = [...actions].sort(
    (a, b) => tacticalPriority(state, actorId, b) - tacticalPriority(state, actorId, a),
  )
  if (diff === 'easy' && Math.random() < 0.45) {
    return actions[Math.floor(Math.random() * actions.length)]!
  }
  return ordered[0]!
}

/**
 * Team-based paranoid search: allies maximize shared eval; enemies minimize it (zero-sum).
 */
function paranoidSearch(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  perspectiveId: ActorId,
  tables: SearchTables,
): number {
  const alphaOrig = alpha
  const betaOrig = beta
  const ph = hashCpuSearchPosition(state, 'multi', perspectiveId, undefined)
  const key = ttCompositeKey(ph, depth)

  const terminal = winningSideScore(state, perspectiveId)
  if (terminal !== null) {
    ttStore(tables, key, terminal, alphaOrig, betaOrig)
    return terminal
  }

  const probed = ttProbe(tables, key, alpha, beta)
  if (probed !== null) return probed

  if (depth === 0) {
    const v = evaluateStaticMulti(state, perspectiveId)
    ttStore(tables, key, v, alphaOrig, betaOrig)
    return v
  }

  const actor = state.turn
  const actions = orderedActions(state, actor, depth, tables)
  if (actions.length === 0) {
    const v = evaluateStaticMulti(state, perspectiveId)
    ttStore(tables, key, v, alphaOrig, betaOrig)
    return v
  }

  const maximizing = sameTeam(state, actor, perspectiveId)

  if (maximizing) {
    let value = -Infinity
    for (const action of actions) {
      const res = applyAction(state, actor, action)
      if (res.error) continue
      const t = winningSideScore(res.state, perspectiveId)
      if (t === WIN_SCORE) {
        ttStore(tables, key, WIN_SCORE, alphaOrig, betaOrig)
        return WIN_SCORE
      }
      const child =
        t === LOSS_SCORE ? LOSS_SCORE : paranoidSearch(res.state, depth - 1, alpha, beta, perspectiveId, tables)
      value = Math.max(value, child)
      if (value > beta) {
        recordKiller(tables, depth, action)
        bumpHistory(tables, actor, action, depth)
        ttStore(tables, key, value, alphaOrig, betaOrig)
        return value
      }
      alpha = Math.max(alpha, value)
    }
    const v = value === -Infinity ? evaluateStaticMulti(state, perspectiveId) : value
    ttStore(tables, key, v, alphaOrig, betaOrig)
    return v
  }

  let value = Infinity
  for (const action of actions) {
    const res = applyAction(state, actor, action)
    if (res.error) continue
    const t = winningSideScore(res.state, perspectiveId)
    if (t === LOSS_SCORE) {
      ttStore(tables, key, LOSS_SCORE, alphaOrig, betaOrig)
      return LOSS_SCORE
    }
    const child =
      t === WIN_SCORE ? WIN_SCORE : paranoidSearch(res.state, depth - 1, alpha, beta, perspectiveId, tables)
    value = Math.min(value, child)
    if (value < alpha) {
      recordKiller(tables, depth, action)
      bumpHistory(tables, actor, action, depth)
      ttStore(tables, key, value, alphaOrig, betaOrig)
      return value
    }
    beta = Math.min(beta, value)
  }
  const v = value === Infinity ? evaluateStaticMulti(state, perspectiveId) : value
  ttStore(tables, key, v, alphaOrig, betaOrig)
  return v
}

function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  perspectiveId: ActorId,
  opponentId: ActorId,
  tables: SearchTables,
): number {
  const alphaOrig = alpha
  const betaOrig = beta
  const ph = hashCpuSearchPosition(state, 'duel', perspectiveId, opponentId)
  const key = ttCompositeKey(ph, depth)

  if (state.tie) {
    const v = 0
    ttStore(tables, key, v, alphaOrig, betaOrig)
    return v
  }
  if (state.winner === perspectiveId) {
    const v = WIN_SCORE
    ttStore(tables, key, v, alphaOrig, betaOrig)
    return v
  }
  if (state.winner === opponentId) {
    const v = LOSS_SCORE
    ttStore(tables, key, v, alphaOrig, betaOrig)
    return v
  }

  const probed = ttProbe(tables, key, alpha, beta)
  if (probed !== null) return probed

  if (depth === 0) {
    const v = evaluateStaticDuel(state, perspectiveId, opponentId)
    ttStore(tables, key, v, alphaOrig, betaOrig)
    return v
  }

  const actor = state.turn
  const actions = orderedActions(state, actor, depth, tables)
  if (actions.length === 0) {
    const v = evaluateStaticDuel(state, perspectiveId, opponentId)
    ttStore(tables, key, v, alphaOrig, betaOrig)
    return v
  }

  const isMax = actor === perspectiveId

  if (isMax) {
    let value = -Infinity
    for (const action of actions) {
      const res = applyAction(state, actor, action)
      if (res.error) continue
      if (res.state.winner === perspectiveId) {
        ttStore(tables, key, WIN_SCORE, alphaOrig, betaOrig)
        return WIN_SCORE
      }
      const child = minimax(res.state, depth - 1, alpha, beta, perspectiveId, opponentId, tables)
      value = Math.max(value, child)
      if (value > beta) {
        recordKiller(tables, depth, action)
        bumpHistory(tables, actor, action, depth)
        ttStore(tables, key, value, alphaOrig, betaOrig)
        return value
      }
      alpha = Math.max(alpha, value)
    }
    const v = value === -Infinity ? evaluateStaticDuel(state, perspectiveId, opponentId) : value
    ttStore(tables, key, v, alphaOrig, betaOrig)
    return v
  }

  let value = Infinity
  for (const action of actions) {
    const res = applyAction(state, actor, action)
    if (res.error) continue
    if (res.state.winner === opponentId) {
      ttStore(tables, key, LOSS_SCORE, alphaOrig, betaOrig)
      return LOSS_SCORE
    }
    const child = minimax(res.state, depth - 1, alpha, beta, perspectiveId, opponentId, tables)
    value = Math.min(value, child)
    if (value < alpha) {
      recordKiller(tables, depth, action)
      bumpHistory(tables, actor, action, depth)
      ttStore(tables, key, value, alphaOrig, betaOrig)
      return value
    }
    beta = Math.min(beta, value)
  }
  const v = value === Infinity ? evaluateStaticDuel(state, perspectiveId, opponentId) : value
  ttStore(tables, key, v, alphaOrig, betaOrig)
  return v
}

function orderScore(
  state: GameState,
  actor: ActorId,
  action: GameAction,
  depth: number,
  tables: SearchTables,
): number {
  let s = tacticalPriority(state, actor, action)
  const hk = cpuActionHistoryKey(actor, action)
  s += (tables.history.get(hk) ?? 0) * 12
  const k0 = tables.killer0.get(depth)
  const k1 = tables.killer1.get(depth)
  if (k0 && gameActionsEqual(k0, action)) s += 25_000
  if (k1 && gameActionsEqual(k1, action)) s += 12_000
  return s
}

function orderedActions(state: GameState, actor: ActorId, depth: number, tables: SearchTables): GameAction[] {
  const raw = allLegalActions(state, actor)
  return [...raw].sort(
    (a, b) => orderScore(state, actor, b, depth, tables) - orderScore(state, actor, a, depth, tables),
  )
}

/** Higher = search first (better for alpha-beta). */
function tacticalPriority(state: GameState, actor: ActorId, action: GameAction): number {
  const me = state.actors[actor]
  const foe = closestEnemy(state, actor)
  if (!foe) return 0

  if (action.type === 'cast') {
    const entry = state.loadouts[actor].find((e) => e.skillId === action.skillId)
    const def = getSkillDef(action.skillId)
    if (!entry) return 0

    if (def.damageKind === 'none') {
      const hitList = gatherOffensiveHits(state, actor, action.target, entry.pattern)
      const potency = me.traits.statusPotency
      let s = 1_750_000
      for (const { targetId, hits } of hitList) {
        const t = state.actors[targetId]!
        if (t.hp <= 0) continue
        if (action.skillId === 'mend') {
          const h = mendHealAmount(entry.statusStacks, potency) * hits
          if (targetId === actor) s += h * 22 + (me.maxHp - me.hp) * 6
          else if (sameTeam(state, actor, targetId)) s += h * 20
          else s -= h * 28
        } else if (action.skillId === 'ward') {
          const w = wardShieldAmount(entry.statusStacks, potency) * hits
          if (targetId === actor) s += w * 14
          else if (sameTeam(state, actor, targetId)) s += w * 13
          else s -= w * 17
        } else if (action.skillId === 'purge') {
          const c = purgeCleanseCount(entry.statusStacks) * hits
          const debuffW = t.statuses.filter(
            (st) => st.tag.t !== 'shield' && st.tag.t !== 'skillFocus' && st.tag.t !== 'immunized',
          ).length
          const weight = c * (6 + debuffW * 2)
          if (targetId === actor) s += weight * 10
          else if (sameTeam(state, actor, targetId)) s += weight * 9
          else s -= weight * 14
        } else if (action.skillId === 'focus') {
          const b = focusBonusDamage(entry.statusStacks, potency) * hits
          if (targetId === actor) s += b * 18
          else if (sameTeam(state, actor, targetId)) s += b * 16
          else s -= b * 12
        } else if (action.skillId === 'wardbreak') {
          const strip = wardbreakShredAmount(entry.statusStacks, potency) * hits
          const sh = t.statuses.find((st) => st.tag.t === 'shield')
          const amt = sh && sh.tag.t === 'shield' ? Math.min(sh.tag.amount, strip) : 0
          if (isOpponentActor(state.matchMode, state.teamByActor, actor, targetId)) s += amt * 25
          else s -= amt * 5
        } else if (action.skillId === 'immunize') {
          const ch = immunizeChargesFromStacks(entry.statusStacks) * hits
          const debuffW = t.statuses.filter(
            (st) => st.tag.t !== 'shield' && st.tag.t !== 'skillFocus' && st.tag.t !== 'immunized',
          ).length
          if (targetId === actor) s += ch * 45 + debuffW * 3
          else if (sameTeam(state, actor, targetId)) s += ch * 40
          else s -= ch * 20
        } else if (action.skillId === 'overclock') {
          const m = overclockManaRestore(entry.statusStacks, potency) * hits
          if (targetId === actor) s += m * 15 + (me.maxMana - me.mana) * 2
          else if (sameTeam(state, actor, targetId)) s += m * 12
          else s -= m * 18
        }
      }
      return s
    }

    const hitList = gatherOffensiveHits(state, actor, action.target, entry.pattern)
    let foeDmg = 0
    let foeHits = 0
    let friendlyDmg = 0
    let friendlyHits = 0
    for (const { targetId, hits } of hitList) {
      const t = state.actors[targetId]!
      if (t.hp <= 0) continue
      const chunk =
        def.damageKind === 'physical'
          ? physicalOffenseDamagePerHit(
              def.baseDamage,
              me.traits,
              me.tilesMovedThisTurn,
              me.physicalStreak,
            ) * hits
          : damageForCast(def, hits)
      if (isOpponentActor(state.matchMode, state.teamByActor, actor, targetId)) {
        foeDmg += chunk
        foeHits += hits
      } else {
        friendlyDmg += chunk
        friendlyHits += hits
      }
    }
    let score = 5_000_000 + foeDmg * 120 + foeHits * 80 + (foeHits > 0 ? 400 : 0)
    score -= friendlyDmg * 130 + friendlyHits * 90
    if (action.skillId === 'strike' && foeHits > 0) score += 3_000_000
    return score
  }

  if (action.type === 'move') {
    const d = manhattan(action.to, foe.pos)
    let p = 3_000_000 - d * 2_500
    if (isOvertimeLethal(state, action.to)) {
      p -= 80_000 + currentOvertimeDamageAmount(state.overtime!) * 6_000
    }
    return p
  }

  if (action.type === 'skip') {
    return -10_000_000
  }

  return 0
}

function evaluateStaticDuel(state: GameState, perspectiveId: ActorId, opponentId: ActorId): number {
  const p = state.actors[opponentId]
  const c = state.actors[perspectiveId]

  let score = 0
  score += (c.hp / Math.max(1, c.maxHp) - p.hp / Math.max(1, p.maxHp)) * 130
  score +=
    (c.mana / Math.max(1, c.maxMana) - p.mana / Math.max(1, p.maxMana)) * 32
  score +=
    (c.stamina / Math.max(1, c.maxStamina) - p.stamina / Math.max(1, p.maxStamina)) * 18

  const dist = manhattan(c.pos, p.pos)
  const maxD = state.size * 2 - 2
  score += ((maxD - dist) / Math.max(1, maxD)) * 42

  score += statusPressureOnActor(p) * 6
  score -= statusPressureOnActor(c) * 6

  if (dist === 1) {
    const playerThreat = approxAdjacentPhysicalThreat(state, opponentId, p, c)
    const cpuThreat = approxAdjacentPhysicalThreat(state, perspectiveId, c, p)
    score -= playerThreat * 0.42
    score += cpuThreat * 0.34
  }

  score += residualTilePressure(state, p.pos, opponentId) * 4
  score -= residualTilePressure(state, c.pos, perspectiveId) * 4

  score -= overtimePressure(state, c.pos)
  score += overtimePressure(state, p.pos)

  return score
}

/** Heuristic for 3+ fighters: team resource totals + primary threat vs nearest enemy. */
function evaluateStaticMulti(state: GameState, perspectiveId: ActorId): number {
  const myTeam = state.teamByActor[perspectiveId]!
  let score = 0
  for (const id of state.turnOrder) {
    const a = state.actors[id]!
    if (a.hp <= 0) continue
    const side = state.teamByActor[id] === myTeam ? 1 : -1
    score += side * (a.hp / Math.max(1, a.maxHp)) * 130
    score += side * (a.mana / Math.max(1, a.maxMana)) * 32
    score += side * (a.stamina / Math.max(1, a.maxStamina)) * 18
    score -= side * statusPressureOnActor(a) * 6
  }

  const me = state.actors[perspectiveId]!
  const foeId = closestEnemyId(state, perspectiveId)
  if (!foeId) return score
  const foe = state.actors[foeId]!
  const dist = manhattan(me.pos, foe.pos)
  const maxD = state.size * 2 - 2
  score += ((maxD - dist) / Math.max(1, maxD)) * 42

  if (dist === 1) {
    score -= approxAdjacentPhysicalThreat(state, foeId, foe, me) * 0.42
    score += approxAdjacentPhysicalThreat(state, perspectiveId, me, foe) * 0.34
  }

  score += residualTilePressure(state, foe.pos, foeId) * 4
  score -= residualTilePressure(state, me.pos, perspectiveId) * 4

  score -= overtimePressure(state, me.pos)
  score += overtimePressure(state, foe.pos)

  return score
}

function extraVulnerabilityFlat(target: ActorState): number {
  let n = 0
  for (const s of target.statuses) {
    if (s.tag.t === 'marked') n += s.tag.extra
    if (s.tag.t === 'muddy') n += 1
  }
  return n
}

function approxAdjacentPhysicalThreat(
  state: GameState,
  attackerId: ActorId,
  attacker: ActorState,
  defender: ActorState,
): number {
  let max = 0
  for (const e of state.loadouts[attackerId] ?? []) {
    const def = getSkillDef(e.skillId)
    if (!isAdjacentPhysicalOffense(def)) continue
    if (e.skillId === 'strike') {
      max = Math.max(max, approxStrikeCastDamage(attacker, defender))
      continue
    }
    const raw = physicalOffenseDamagePerHit(
      def.baseDamage,
      attacker.traits,
      attacker.tilesMovedThisTurn,
      attacker.physicalStreak,
    )
    const afterPhys = physicalDamageDealt(raw, defender.traits)
    max = Math.max(max, Math.max(1, afterPhys + extraVulnerabilityFlat(defender)))
  }
  return max
}

function approxStrikeCastDamage(attacker: ActorState, defender: ActorState): number {
  const raw = totalStrikeDamage(attacker.traits, attacker.tilesMovedThisTurn, attacker.physicalStreak)
  return Math.max(
    1,
    physicalStrikeDamageDealt(raw, defender.traits) + extraVulnerabilityFlat(defender),
  )
}

function overtimePressure(state: GameState, pos: { x: number; y: number }): number {
  if (!state.overtime || !isOvertimeLethal(state, pos)) return 0
  return currentOvertimeDamageAmount(state.overtime) * 18
}

function residualTilePressure(state: GameState, cell: { x: number; y: number }, standsOn: ActorId): number {
  const imp = state.impactedTiles[coordKey(cell)]
  if (!imp || imp.owner === standsOn) return 0
  return 1
}

function statusPressureOnActor(actor: ActorState): number {
  let w = 0
  for (const { tag } of actor.statuses) {
    if (tag.t === 'shield') w -= 2
    else w += 1
  }
  return w
}
