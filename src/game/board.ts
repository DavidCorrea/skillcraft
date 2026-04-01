import type { ActorId, Coord, MatchMode } from './types'

/** Default / minimum board dimension (odd — middle spawns). */
export const BOARD_SIZE = 7

/** Max board dimension for multi-actor matches. */
export const BOARD_MAX = 15

/**
 * Larger battles at higher level: 7×7 → 9×9 → 11×11.
 * Breakpoints tuned so default level ~14 stays on 7×7.
 */
export function boardSizeForLevel(level: number): number {
  if (level <= 20) return 7
  if (level <= 45) return 9
  return 11
}

/**
 * Board size: duels use level curve; 3+ fighters bump toward larger grids; cap 15×15.
 */
export function boardSizeForMatch(level: number, actorCount: number, override?: number): number {
  if (override !== undefined) {
    const o = Math.min(BOARD_MAX, Math.max(7, override))
    return o % 2 === 1 ? o : o - 1
  }
  if (actorCount <= 2) {
    return boardSizeForLevel(level)
  }
  let base = boardSizeForLevel(level)
  if (actorCount >= 3) base = Math.max(base, 9)
  if (actorCount >= 4) base = Math.max(base, 11)
  if (actorCount >= 5) base = Math.max(base, 13)
  return Math.min(BOARD_MAX, base)
}

export function inBounds(c: Coord, size: number): boolean {
  return c.x >= 0 && c.x < size && c.y >= 0 && c.y < size
}

export function coordKey(c: Coord): string {
  return `${c.x},${c.y}`
}

export function parseKey(key: string): Coord {
  const [x, y] = key.split(',').map(Number)
  return { x: x!, y: y! }
}

/** North edge, middle cell — CPU spawn (duel). */
export function spawnNorth(size: number): Coord {
  return { x: Math.floor(size / 2), y: 0 }
}

/** South edge, middle cell — player spawn (duel). */
export function spawnSouth(size: number): Coord {
  return { x: Math.floor(size / 2), y: size - 1 }
}

/** Four board corners in order: NW, NE, SE, SW (clockwise from top-left). */
export function cornerCells(size: number): Coord[] {
  const last = size - 1
  return [
    { x: 0, y: 0 },
    { x: last, y: 0 },
    { x: last, y: last },
    { x: 0, y: last },
  ]
}

export function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

const ORTH: Coord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

export function orthNeighbors(c: Coord, size: number): Coord[] {
  return ORTH.map((d) => ({ x: c.x + d.x, y: c.y + d.y })).filter((nc) => inBounds(nc, size))
}

export function allCells(size: number): Coord[] {
  const out: Coord[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out.push({ x, y })
    }
  }
  return out
}

/** Whether `attacker` may damage `target` (strikes, offensive skills, tile entry). */
export function canDamageTarget(
  matchMode: MatchMode,
  friendlyFire: boolean,
  teamByActor: Record<ActorId, number>,
  attacker: ActorId,
  target: ActorId,
): boolean {
  if (attacker === target) return false
  if (matchMode === 'ffa') return true
  const ta = teamByActor[attacker]
  const tb = teamByActor[target]
  if (ta === undefined || tb === undefined) return true
  if (ta !== tb) return true
  return friendlyFire
}

/**
 * Spawn positions for all actors. `turnOrder` defines initiative order.
 * Two actors: human south, other north. Three or more: corners NW → NE → SE → SW in order.
 */
export function spawnPositionsForActors(
  size: number,
  turnOrder: ActorId[],
  humanActorId: ActorId,
): Record<ActorId, Coord> {
  const ids = turnOrder
  if (ids.length === 2) {
    const out: Record<ActorId, Coord> = {}
    const other = ids.find((id) => id !== humanActorId) ?? ids[1]!
    out[humanActorId] = spawnSouth(size)
    out[other] = spawnNorth(size)
    return out
  }

  const corners = cornerCells(size)
  const out: Record<ActorId, Coord> = {}
  for (let i = 0; i < ids.length; i++) {
    const c = corners[i]
    if (!c) throw new Error(`spawnPositionsForActors: at most ${corners.length} corner slots`)
    out[ids[i]!] = c
  }
  return out
}
