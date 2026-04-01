import type { GameAction } from '../game/engine'
import { applyAction, allLegalActions, gatherOffensiveHits } from '../game/engine'
import type { ActorId, ActorState, CpuDifficulty, GameState } from '../game/types'
import { canDamageTarget, coordKey, manhattan } from '../game/board'
import { damageForCast, getSkillDef, mendHealAmount } from '../game/skills'
import { physicalStrikeDamageDealt, totalStrikeDamage } from '../game/traits'

const WIN_SCORE = 1_000_000
const LOSS_SCORE = -1_000_000

function searchPliesForDifficulty(d: CpuDifficulty): number {
  if (d === 'easy') return 2
  if (d === 'hard') return 6
  return 4
}

function enemyIds(state: GameState, actor: ActorId): ActorId[] {
  return state.turnOrder.filter((id) => {
    if (id === actor) return false
    if (state.actors[id]!.hp <= 0) return false
    return canDamageTarget(state.matchMode, state.friendlyFire, state.teamByActor, actor, id)
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
 * Chooses a CPU / AI action. Uses minimax for 1v1 duels when difficulty is not easy,
 * otherwise greedy heuristic (also used for multi-actor matches).
 */
export function pickCpuAction(state: GameState, actorId: ActorId): GameAction {
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

  if (state.turnOrder.length > 2 || diff === 'easy') {
    return pickCpuGreedy(state, actorId, diff)
  }

  const plies = searchPliesForDifficulty(diff)
  const ordered = [...actions].sort(
    (a, b) => tacticalPriority(state, actorId, b) - tacticalPriority(state, actorId, a),
  )

  let best: GameAction = ordered[0]!
  let bestScore = -Infinity
  const other = otherInDuel(state, actorId)

  for (const action of ordered) {
    const res = applyAction(state, actorId, action)
    if (res.error) continue
    const next = res.state
    if (next.winner === other) continue

    const score = minimax(next, plies - 1, -Infinity, Infinity, actorId, other)
    const jitter = diff === 'hard' ? Math.random() * 0.008 : Math.random() * 0.015
    if (score + jitter > bestScore) {
      bestScore = score + jitter
      best = action
    }
  }

  return best
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

function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  perspectiveId: ActorId,
  opponentId: ActorId,
): number {
  if (state.winner === perspectiveId) return WIN_SCORE
  if (state.winner === opponentId) return LOSS_SCORE
  if (depth === 0) return evaluateStaticDuel(state, perspectiveId, opponentId)

  const actor = state.turn
  const actions = orderedActions(state, actor)
  if (actions.length === 0) return evaluateStaticDuel(state, perspectiveId, opponentId)

  const isMax = actor === perspectiveId

  if (isMax) {
    let value = -Infinity
    for (const action of actions) {
      const res = applyAction(state, actor, action)
      if (res.error) continue
      if (res.state.winner === perspectiveId) return WIN_SCORE
      value = Math.max(value, minimax(res.state, depth - 1, alpha, beta, perspectiveId, opponentId))
      if (value > beta) return value
      alpha = Math.max(alpha, value)
    }
    return value === -Infinity ? evaluateStaticDuel(state, perspectiveId, opponentId) : value
  }

  let value = Infinity
  for (const action of actions) {
    const res = applyAction(state, actor, action)
    if (res.error) continue
    if (res.state.winner === opponentId) return LOSS_SCORE
    value = Math.min(value, minimax(res.state, depth - 1, alpha, beta, perspectiveId, opponentId))
    if (value < alpha) return value
    beta = Math.min(beta, value)
  }
  return value === Infinity ? evaluateStaticDuel(state, perspectiveId, opponentId) : value
}

function orderedActions(state: GameState, actor: ActorId): GameAction[] {
  const raw = allLegalActions(state, actor)
  return [...raw].sort((a, b) => tacticalPriority(state, actor, b) - tacticalPriority(state, actor, a))
}

/** Higher = search first (better for alpha-beta). */
function tacticalPriority(state: GameState, actor: ActorId, action: GameAction): number {
  const me = state.actors[actor]
  const foe = closestEnemy(state, actor)
  if (!foe) return 0

  if (action.type === 'strike') {
    return 8_000_000
  }

  if (action.type === 'cast') {
    const entry = state.loadouts[actor].find((e) => e.skillId === action.skillId)
    const def = getSkillDef(action.skillId)
    if (!entry) return 0

    if (def.selfTarget) {
      if (action.skillId === 'mend') {
        const heal = mendHealAmount(entry.statusStacks, me.traits.statusPotency)
        return 2_000_000 + heal * 24 + (me.maxHp - me.hp) * 8
      }
      return 1_600_000
    }

    const hitList = gatherOffensiveHits(state, actor, action.target, entry.pattern)
    let totalHits = 0
    let totalDmg = 0
    for (const { targetId, hits } of hitList) {
      totalHits += hits
      const t = state.actors[targetId]!
      totalDmg += damageForCast(def, hits) * (t.hp > 0 ? 1 : 0)
    }
    return 5_000_000 + totalDmg * 120 + totalHits * 80 + (totalHits > 0 ? 400 : 0)
  }

  if (action.type === 'move') {
    const d = manhattan(action.to, foe.pos)
    return 3_000_000 - d * 2_500
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
    const playerThreat = approxStrikeDamage(p, c)
    const cpuThreat = approxStrikeDamage(c, p)
    score -= playerThreat * 0.42
    score += cpuThreat * 0.34
  }

  score += residualTilePressure(state, p.pos, opponentId) * 4
  score -= residualTilePressure(state, c.pos, perspectiveId) * 4

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

function approxStrikeDamage(attacker: ActorState, defender: ActorState): number {
  const raw = totalStrikeDamage(attacker.traits, attacker.tilesMovedThisTurn, attacker.strikeStreak)
  return Math.max(
    1,
    physicalStrikeDamageDealt(raw, defender.traits) + extraVulnerabilityFlat(defender),
  )
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
