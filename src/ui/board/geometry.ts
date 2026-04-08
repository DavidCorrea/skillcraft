import type { Coord } from '../../game/types'

/**
 * Fallback gap as a fraction of inner grid width when DOM measurement is unavailable.
 * Live layout uses `measureHoloBoardGapFraction` so rem-based `gap` and overlays stay aligned.
 */
export const HOLO_GRID_GAP_FRACTION = 0.038

/**
 * Reads the actual column gap vs SVG overlay width from laid-out cells (matches `path` / bubble math to CSS grid).
 */
export function measureHoloBoardGapFraction(boardEl: HTMLElement): number | null {
  const overlay = boardEl.querySelector('.holo-board__paths')
  if (!(overlay instanceof SVGSVGElement)) return null
  const nodes = boardEl.querySelectorAll('button.holo-cell')
  if (nodes.length < 2) return null
  const a = nodes[0]!.getBoundingClientRect()
  const b = nodes[1]!.getBoundingClientRect()
  const innerW = overlay.getBoundingClientRect().width
  if (innerW < 1) return null
  const gapPx = b.left - a.right
  const g = gapPx / innerW
  if (!Number.isFinite(g) || g < 0) return null
  return Math.min(0.2, g)
}

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

/**
 * Normalized anchor for a token in a cell — matches `.holo-piece` placement (center, or 38%/62% when two share a cell).
 */
export function pieceAnchorNormalized(
  c: Coord,
  size: number,
  gapFraction: number,
  pieceIndex: number,
  piecesInCell: number,
): { nx: number; ny: number } {
  const base = cellCenterNormalized(c, size, gapFraction)
  if (piecesInCell <= 1 || pieceIndex < 0) return base
  const g = Math.max(0, Math.min(0.2, gapFraction))
  const cell = (1 - (size - 1) * g) / size
  if (piecesInCell === 2) {
    const local = pieceIndex === 0 ? { lx: 0.38, ly: 0.38 } : { lx: 0.62, ly: 0.62 }
    const dx = (local.lx - 0.5) * cell
    const dy = (local.ly - 0.5) * cell
    return { nx: base.nx + dx, ny: base.ny + dy }
  }
  return base
}

/**
 * Normalized `top` (0–1, board overlay) for a speech bubble: with `left` at token `nx` and
 * `transform: translate(-50%, calc(-100% - …))`, the bubble’s bottom edge sits above the token
 * disc (`.holo-piece` is 58% of the cell — half that in normalized span).
 */
export function speechBubbleTopNormalized(
  tokenCenterY: number,
  size: number,
  gapFraction: number,
): number {
  const g = Math.max(0, Math.min(0.2, gapFraction))
  const cell = (1 - (size - 1) * g) / size
  const halfTokenSpan = 0.29 * cell
  const airGap = 0.01
  return Math.max(0, tokenCenterY - halfTokenSpan - airGap)
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
