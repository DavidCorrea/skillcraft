import { inBounds, manhattan } from '../game/board'
import type { Coord } from '../game/types'

/**
 * Loadout crafter only: you may preview the pattern with the anchor on your tile even when
 * {@link minCastManhattanForLoadout} is 1 (range tier 0 — battle casts still require a neighbor tile for damage skills).
 */
export function canSelectLoadoutPreviewAnchor(
  manhattanFromYou: number,
  maxRange: number,
  minCastRange: number,
): boolean {
  if (manhattanFromYou > maxRange) return false
  if (manhattanFromYou < minCastRange && manhattanFromYou !== 0) return false
  return true
}

/**
 * Default anchor: first cardinal neighbor in [min,max] (prefers north), else your tile if min is 0.
 */
export function defaultPreviewAnchor(
  you: Coord,
  maxRange: number,
  boardSize: number,
  minRange = 0,
): Coord {
  const ortho: Coord[] = [
    { x: you.x, y: you.y - 1 },
    { x: you.x, y: you.y + 1 },
    { x: you.x - 1, y: you.y },
    { x: you.x + 1, y: you.y },
  ]
  for (const c of ortho) {
    if (!inBounds(c, boardSize)) continue
    const d = manhattan(you, c)
    if (d >= minRange && d <= maxRange) return c
  }
  return minRange === 0 ? you : ortho.find((c) => inBounds(c, boardSize)) ?? you
}

/**
 * Random cast anchor for loadout shuffle: uniform among all cells with minRange ≤ Manhattan ≤ maxRange.
 */
export function randomPreviewAnchorInRange(
  you: Coord,
  minRange: number,
  maxRange: number,
  boardSize: number,
  rng: () => number = Math.random,
): Coord {
  const candidates: Coord[] = []
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const c = { x, y }
      const d = manhattan(you, c)
      if (d >= minRange && d <= maxRange) candidates.push(c)
    }
  }
  if (candidates.length === 0) return defaultPreviewAnchor(you, maxRange, boardSize, minRange)
  return candidates[Math.floor(rng() * candidates.length)]!
}
