import { describe, expect, it } from 'vitest'
import { cellCenterNormalized, pathLinesD } from './geometry'

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
