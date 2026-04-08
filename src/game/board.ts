import type { ActorId, Coord, MatchMode } from './types'

/** Default / minimum board dimension (odd — middle spawns). */
export const BOARD_SIZE = 7

/** Max board dimension for multi-actor matches. */
export const BOARD_MAX = 19

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
 * Board size: duels use level curve; 3+ fighters bump toward larger grids; cap {@link BOARD_MAX}×{@link BOARD_MAX}.
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
  if (actorCount >= 6) base = Math.max(base, 15)
  if (actorCount >= 7) base = Math.max(base, 17)
  if (actorCount >= 8) base = Math.max(base, 19)
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

/**
 * Perimeter cells in clockwise order from NW, one step per cell (length `4 * size - 4` for size ≥ 2).
 */
export function perimeterCellsClockwise(size: number): Coord[] {
  const last = size - 1
  if (last < 1) return []
  const out: Coord[] = []
  for (let x = 0; x <= last; x++) out.push({ x, y: 0 })
  for (let y = 1; y <= last; y++) out.push({ x: last, y })
  for (let x = last - 1; x >= 0; x--) out.push({ x, y: last })
  for (let y = last - 1; y >= 1; y--) out.push({ x: 0, y })
  return out
}

/** `n` distinct perimeter coords, spaced evenly around the border (roster index order). */
export function evenlySpacedPerimeterPositions(size: number, n: number): Coord[] {
  const ring = perimeterCellsClockwise(size)
  const L = ring.length
  if (n <= 0 || n > L) {
    throw new Error(`evenlySpacedPerimeterPositions: need 1–${L} fighters for size ${size}, got ${n}`)
  }
  const out: Coord[] = []
  for (let i = 0; i < n; i++) {
    out.push(ring[Math.floor((i * L) / n)]!)
  }
  return out
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

/**
 * Whether `attacker` may damage `target` (offensive skills, tile hazards).
 * Always true — any actor may be hit; aim and pattern geometry are the only gates.
 */
export function canDamageTarget(
  _matchMode: MatchMode,
  _friendlyFire: boolean,
  _teamByActor: Record<ActorId, number>,
  _attacker: ActorId,
  _target: ActorId,
): boolean {
  return true
}

/**
 * Tactical opponent for AI and log flavor (not targeting legality): FFA = everyone else;
 * teams = different `teamId`. False for self.
 */
export function isOpponentActor(
  matchMode: MatchMode,
  teamByActor: Record<ActorId, number>,
  attacker: ActorId,
  target: ActorId,
): boolean {
  if (attacker === target) return false
  if (matchMode === 'ffa') return true
  const ta = teamByActor[attacker]
  const tb = teamByActor[target]
  if (ta === undefined || tb === undefined) return true
  return ta !== tb
}

/**
 * Spawn positions for all actors. Pass **roster order** (not shuffled initiative): two actors —
 * human south, other north; 3–4 — corners NW → NE → SE → SW; 5+ — evenly spaced around the perimeter.
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

  const out: Record<ActorId, Coord> = {}
  if (ids.length <= 4) {
    const corners = cornerCells(size)
    for (let i = 0; i < ids.length; i++) {
      const c = corners[i]
      if (!c) throw new Error(`spawnPositionsForActors: at most ${corners.length} corner slots`)
      out[ids[i]!] = c
    }
    return out
  }

  const ring = evenlySpacedPerimeterPositions(size, ids.length)
  for (let i = 0; i < ids.length; i++) {
    out[ids[i]!] = ring[i]!
  }
  return out
}
