import type { ActorId, ActorState, GameState, StatusInstance, StatusTag, TraitPoints } from '../game/types'

/** FNV-1a 64-bit; position keys for CPU transposition table (one search tree — not cryptographic). */
const FNV_OFFSET = 1469598103934665603n
const FNV_PRIME = 1099511628211n
const MASK64 = (1n << 64n) - 1n

function mix64(h: bigint, v: bigint): bigint {
  h = (h ^ v) & MASK64
  return (h * FNV_PRIME) & MASK64
}

/** FNV-1a 32-bit — one mix64 per string (hot path: actor ids, turn order). */
function quickStrHash(s: string): number {
  let x = 2166136261
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i)
    x = Math.imul(x, 16777619)
  }
  return x | 0
}

function mixOpaqueId(h: bigint, id: string): bigint {
  return mixInt(h, quickStrHash(id))
}

function mixShortKeyword(h: bigint, s: string): bigint {
  for (let i = 0; i < s.length; i++) {
    h = mix64(h, BigInt(s.charCodeAt(i)))
  }
  return h
}

function mixInt(h: bigint, n: number): bigint {
  return mix64(h, BigInt(Math.trunc(n)))
}

function mixTraits(h: bigint, t: TraitPoints): bigint {
  const keys = Object.keys(t) as (keyof TraitPoints)[]
  keys.sort()
  for (const k of keys) {
    h = mixInt(h, quickStrHash(k))
    h = mixInt(h, t[k] as number)
  }
  return h
}

function statusSortKey(s: StatusInstance): string {
  return s.id
}

/** Numeric-only tag mix — avoids JSON.stringify on the hot search path. */
function mixStatusTag(h: bigint, tag: StatusTag): bigint {
  switch (tag.t) {
    case 'burning':
      return mixInt(mixInt(mixInt(h, 1), tag.duration), tag.dot)
    case 'chilled':
      return mixInt(mixInt(h, 2), tag.duration)
    case 'frozen':
      return mixInt(mixInt(h, 3), tag.turns)
    case 'soaked':
      return mixInt(mixInt(h, 4), tag.duration)
    case 'shocked':
      return mixInt(mixInt(mixInt(h, 5), tag.duration), tag.vuln)
    case 'poisoned':
      return mixInt(mixInt(mixInt(h, 6), tag.duration), tag.dot)
    case 'bleeding':
      return mixInt(mixInt(mixInt(h, 7), tag.duration), tag.dot)
    case 'slowed':
      return mixInt(mixInt(h, 8), tag.duration)
    case 'marked':
      return mixInt(mixInt(mixInt(h, 9), tag.duration), tag.extra)
    case 'rooted':
      return mixInt(mixInt(h, 10), tag.duration)
    case 'silenced':
      return mixInt(mixInt(h, 11), tag.duration)
    case 'regenBlocked':
      return mixInt(mixInt(h, 12), tag.duration)
    case 'muddy':
      return mixInt(mixInt(h, 13), tag.duration)
    case 'shield':
      return mixInt(mixInt(h, 14), tag.amount)
  }
}

function mixStatuses(h: bigint, statuses: StatusInstance[]): bigint {
  const sorted = [...statuses].sort((a, b) => statusSortKey(a).localeCompare(statusSortKey(b)))
  for (const s of sorted) {
    h = mixOpaqueId(h, s.id)
    h = mixStatusTag(h, s.tag)
  }
  return h
}

function mixActor(h: bigint, a: ActorState): bigint {
  h = mixOpaqueId(h, a.id)
  h = mixInt(h, a.pos.x)
  h = mixInt(h, a.pos.y)
  h = mixInt(h, a.hp)
  h = mixInt(h, a.maxHp)
  h = mixInt(h, a.mana)
  h = mixInt(h, a.maxMana)
  h = mixInt(h, a.stamina)
  h = mixInt(h, a.maxStamina)
  h = mixTraits(h, a.traits)
  h = mixInt(h, a.moveMaxSteps)
  h = mixInt(h, a.manaRegenPerTurn)
  h = mixInt(h, a.tilesMovedThisTurn)
  h = mixInt(h, a.strikeStreak)
  h = mixStatuses(h, a.statuses)
  return h
}

function mixOvertime(h: bigint, state: GameState): bigint {
  const o = state.overtime
  if (!o) {
    h = mixInt(h, 0)
    return h
  }
  h = mixInt(h, 1)
  h = mixInt(h, o.stormCenter.x)
  h = mixInt(h, o.stormCenter.y)
  h = mixInt(h, o.safeRadius)
  h = mixInt(h, o.damageStep)
  h = mixInt(h, o.otRoundsCompleted)
  h = mixInt(h, o.stormSkipsNextBoundary ? 1 : 0)
  h = mixInt(h, o.deferredShrink ? 1 : 0)
  return h
}

function mixImpactedTiles(h: bigint, state: GameState): bigint {
  const keys = Object.keys(state.impactedTiles).sort()
  for (const k of keys) {
    const t = state.impactedTiles[k]!
    h = mixInt(h, quickStrHash(k))
    h = mixInt(h, quickStrHash(t.skillId))
    h = mixInt(h, t.statusStacks)
    h = mixInt(h, Math.round(t.casterStatusPotency * 1_000))
    h = mixOpaqueId(h, t.owner)
    h = mixInt(h, t.turnsRemaining)
  }
  return h
}

function mixTeamMap(h: bigint, state: GameState): bigint {
  const ids = Object.keys(state.teamByActor).sort()
  for (const id of ids) {
    h = mixOpaqueId(h, id)
    h = mixInt(h, state.teamByActor[id]!)
  }
  return h
}

/**
 * Canonical position fingerprint for CPU search. Excludes log, humanActorId, cpuDifficulty,
 * and other fields that do not affect legality or evaluation.
 */
export function hashCpuSearchPosition(
  state: GameState,
  mode: 'duel' | 'multi',
  perspectiveId: ActorId,
  opponentId: ActorId | undefined,
): bigint {
  let h = FNV_OFFSET
  h = mixShortKeyword(h, mode)
  h = mixOpaqueId(h, perspectiveId)
  if (mode === 'duel' && opponentId !== undefined) {
    h = mixOpaqueId(h, opponentId)
  }

  h = mixInt(h, state.size)
  h = mixOpaqueId(h, state.turn)
  for (const id of state.turnOrder) {
    h = mixOpaqueId(h, id)
  }
  if (state.winner) h = mixOpaqueId(h, state.winner)
  else h = mixInt(h, 0)
  h = mixInt(h, state.tie ? 1 : 0)
  h = mixShortKeyword(h, state.matchMode)
  h = mixInt(h, state.friendlyFire ? 1 : 0)
  h = mixInt(h, state.fullRoundsCompleted)
  h = mixInt(h, state.overtimeEnabled ? 1 : 0)
  h = mixInt(h, state.roundsUntilOvertime)
  h = mixOvertime(h, state)
  h = mixTeamMap(h, state)
  h = mixImpactedTiles(h, state)

  for (const id of state.turnOrder) {
    const a = state.actors[id]
    if (!a) continue
    h = mixActor(h, a)
  }

  return h
}

/** Hash of a board cell key for history heuristic (stable string). */
export function cpuActionHistoryKey(actorId: ActorId, action: import('../game/engine').GameAction): string {
  return `${actorId}\0${actionSignature(action)}`
}

function actionSignature(a: import('../game/engine').GameAction): string {
  switch (a.type) {
    case 'skip':
      return 'skip'
    case 'move':
      return `move:${a.to.x},${a.to.y}`
    case 'strike':
      return `strike:${a.targetId ?? ''}`
    case 'cast':
      return `cast:${a.skillId}:${a.target.x},${a.target.y}`
    default:
      return '?'
  }
}
