import { describe, expect, it } from 'vitest'
import { cpuThinkRemainingRatio } from './cpuThinkBudget'

describe('cpuThinkRemainingRatio', () => {
  it('returns 1 when the full budget remains', () => {
    expect(cpuThinkRemainingRatio(70_000, 10_000, 60_000)).toBe(1)
  })

  it('returns 0 at or past deadline', () => {
    expect(cpuThinkRemainingRatio(10000, 10000, 60000)).toBe(0)
    expect(cpuThinkRemainingRatio(10000, 11000, 60000)).toBe(0)
  })

  it('clamps to [0, 1]', () => {
    expect(cpuThinkRemainingRatio(100_000, 10_000, 60_000)).toBe(1)
    expect(cpuThinkRemainingRatio(10_000, 10_000, 60_000)).toBe(0)
  })
})
