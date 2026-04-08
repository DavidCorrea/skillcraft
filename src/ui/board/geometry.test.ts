import { describe, expect, it } from 'vitest'
import {
  cellCenterNormalized,
  pathLinesD,
  pieceAnchorNormalized,
  speechBubbleTopNormalized,
} from './geometry'

describe('cellCenterNormalized', () => {
  it('centers corners and middle for a 7×7 grid with gap', () => {
    const size = 7
    const g = 0.04
    const tl = cellCenterNormalized({ x: 0, y: 0 }, size, g)
    const br = cellCenterNormalized({ x: 6, y: 6 }, size, g)
    const mid = cellCenterNormalized({ x: 3, y: 3 }, size, g)
    expect(tl.nx).toBeLessThan(mid.nx)
    expect(tl.ny).toBeLessThan(mid.ny)
    expect(br.nx).toBeGreaterThan(mid.nx)
    expect(br.ny).toBeGreaterThan(mid.ny)
    expect(mid.nx).toBeCloseTo(0.5, 5)
    expect(mid.ny).toBeCloseTo(0.5, 5)
  })
})

describe('pieceAnchorNormalized', () => {
  it('matches cell center for a lone piece', () => {
    const size = 7
    const g = 0.038
    const c = { x: 2, y: 3 }
    expect(pieceAnchorNormalized(c, size, g, 0, 1)).toEqual(cellCenterNormalized(c, size, g))
  })

  it('offsets the two-piece slots symmetrically from center', () => {
    const size = 7
    const g = 0.038
    const c = { x: 1, y: 1 }
    const mid = cellCenterNormalized(c, size, g)
    const a0 = pieceAnchorNormalized(c, size, g, 0, 2)
    const a1 = pieceAnchorNormalized(c, size, g, 1, 2)
    const cell = (1 - (size - 1) * g) / size
    const d = 0.12 * cell
    expect(a0.nx).toBeCloseTo(mid.nx - d, 6)
    expect(a0.ny).toBeCloseTo(mid.ny - d, 6)
    expect(a1.nx).toBeCloseTo(mid.nx + d, 6)
    expect(a1.ny).toBeCloseTo(mid.ny + d, 6)
  })
})

describe('speechBubbleTopNormalized', () => {
  it('places the bubble tail above the token center', () => {
    const size = 7
    const g = 0.038
    const mid = cellCenterNormalized({ x: 3, y: 3 }, size, g)
    const top = speechBubbleTopNormalized(mid.ny, size, g)
    expect(top).toBeLessThan(mid.ny)
    const cell = (1 - (size - 1) * g) / size
    expect(top).toBeCloseTo(mid.ny - 0.29 * cell - 0.01, 6)
  })
})

describe('pathLinesD', () => {
  it('returns empty when no targets', () => {
    expect(pathLinesD({ x: 0, y: 0 }, [], 7, 0.04)).toBe('')
  })

  it('emits move commands for each segment', () => {
    const d = pathLinesD({ x: 3, y: 3 }, [{ x: 3, y: 4 }, { x: 4, y: 3 }], 7, 0.04)
    expect(d.startsWith('M ')).toBe(true)
    expect(d.split('M ').length).toBe(3)
  })
})
