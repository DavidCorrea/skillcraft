import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canSelectLoadoutPreviewAnchor,
  defaultPreviewAnchor,
  randomPreviewAnchorInRange,
} from './skillLoadoutPreviewAnchor'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('canSelectLoadoutPreviewAnchor', () => {
  it('allows feet (distance 0) when min cast range is 1', () => {
    expect(canSelectLoadoutPreviewAnchor(0, 3, 1)).toBe(true)
  })

  it('still rejects distances between 0 and min when not at feet', () => {
    expect(canSelectLoadoutPreviewAnchor(0, 3, 2)).toBe(true)
    expect(canSelectLoadoutPreviewAnchor(1, 3, 2)).toBe(false)
  })

  it('respects max range', () => {
    expect(canSelectLoadoutPreviewAnchor(4, 3, 0)).toBe(false)
  })
})

describe('randomPreviewAnchorInRange', () => {
  it('with min=max=1, only picks Manhattan distance 1', () => {
    const you = { x: 3, y: 3 }
    const boardSize = 7
    const allowed = new Set(['3,2', '3,4', '2,3', '4,3'])

    const rnd = vi.spyOn(Math, 'random')
    for (let i = 0; i < 20; i++) {
      rnd.mockReturnValue((i % 10) / 10)
      const c = randomPreviewAnchorInRange(you, 1, 1, boardSize)
      expect(allowed.has(`${c.x},${c.y}`)).toBe(true)
    }
  })

  it('with min 0 max 2, may pick distance 2', () => {
    const you = { x: 3, y: 3 }
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const c = randomPreviewAnchorInRange(you, 0, 2, 7)
    vi.restoreAllMocks()
    const dist = Math.abs(c.x - you.x) + Math.abs(c.y - you.y)
    expect(dist).toBeLessThanOrEqual(2)
  })

  it('uses injected rng', () => {
    const you = { x: 1, y: 1 }
    const rng = vi.fn().mockReturnValue(0)
    const c = randomPreviewAnchorInRange(you, 1, 1, 7, rng)
    expect(rng).toHaveBeenCalled()
    expect(c).toEqual({ x: 1, y: 0 })
  })
})

describe('defaultPreviewAnchor', () => {
  it('returns north when in range', () => {
    expect(defaultPreviewAnchor({ x: 3, y: 3 }, 4, 7, 0)).toEqual({ x: 3, y: 2 })
  })
})
