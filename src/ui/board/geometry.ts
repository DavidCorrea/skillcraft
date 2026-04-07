import type { Coord } from '../../game/types'

/** Gap as a fraction of inner grid width; must match `.holo-board` gap + padding in CSS. */
export const HOLO_GRID_GAP_FRACTION = 0.038

/**
 * Normalized center (0–1) for a cell in a square grid with uniform gaps between cells.
 * Used for SVG overlays aligned with the same grid as the board.
 */
export function cellCenterNormalized(
  c: Coord,
  size: number,
  gapFraction: number,
): { nx: number; ny: number } {
  if (size <= 0) return { nx: 0.5, ny: 0.5 }
  const g = Math.max(0, Math.min(0.2, gapFraction))
  /** Cell width so that `size` cells + `(size - 1)` gaps fill 1.0 */
  const cell = (1 - (size - 1) * g) / size
  const nx = c.x * (cell + g) + cell / 2
  const ny = c.y * (cell + g) + cell / 2
  return { nx, ny }
}

/** SVG path d attribute: straight lines from `from` to each `tos`, viewBox 0 0 1 1. */
export function pathLinesD(
  from: Coord,
  tos: Coord[],
  size: number,
  gapFraction: number,
): string {
  if (tos.length === 0) return ''
  const a = cellCenterNormalized(from, size, gapFraction)
  const parts: string[] = []
  for (const t of tos) {
    const b = cellCenterNormalized(t, size, gapFraction)
    parts.push(`M ${a.nx} ${a.ny} L ${b.nx} ${b.ny}`)
  }
  return parts.join(' ')
}
