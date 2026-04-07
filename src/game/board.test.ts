import { describe, expect, it } from 'vitest'
import {
  boardSizeForLevel,
  boardSizeForMatch,
  cornerCells,
  isOpponentActor,
  spawnPositionsForActors,
} from './board'

describe('boardSizeForMatch', () => {
  it('matches level curve for duels', () => {
    expect(boardSizeForMatch(10, 2)).toBe(boardSizeForLevel(10))
  })

  it('bumps size for more than two fighters', () => {
    expect(boardSizeForMatch(10, 3)).toBeGreaterThanOrEqual(9)
  })

  it('caps at 15', () => {
    expect(boardSizeForMatch(99, 6, 99)).toBe(15)
  })

  it('honors odd override in range', () => {
    expect(boardSizeForMatch(1, 2, 11)).toBe(11)
  })
})

describe('cornerCells', () => {
  it('returns NW, NE, SE, SW for a given size', () => {
    expect(cornerCells(7)).toEqual([
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 6 },
      { x: 0, y: 6 },
    ])
  })
})

describe('isOpponentActor', () => {
  const teams = { a: 0, b: 0, c: 1 } as Record<string, number>

  it('is false for self', () => {
    expect(isOpponentActor('teams', teams, 'a', 'a')).toBe(false)
  })

  it('is false for same-team pair in teams mode', () => {
    expect(isOpponentActor('teams', teams, 'a', 'b')).toBe(false)
  })

  it('is true for different teams in teams mode', () => {
    expect(isOpponentActor('teams', teams, 'a', 'c')).toBe(true)
  })

  it('is true for any distinct pair in FFA', () => {
    expect(isOpponentActor('ffa', teams, 'a', 'b')).toBe(true)
  })
})

describe('spawnPositionsForActors', () => {
  it('places duelists on south and north center (human south)', () => {
    const size = 7
    const human = 'h'
    const other = 'c'
    const sp = spawnPositionsForActors(size, [human, other], human)
    expect(sp[human]).toEqual({ x: 3, y: 6 })
    expect(sp[other]).toEqual({ x: 3, y: 0 })
  })

  it('places three or more fighters on corners in turn order', () => {
    const size = 11
    const ids = ['a', 'b', 'c', 'd'] as const
    const sp = spawnPositionsForActors(size, [...ids], ids[0]!)
    const corners = cornerCells(size)
    for (let i = 0; i < ids.length; i++) {
      expect(sp[ids[i]!]).toEqual(corners[i])
    }
  })
})
