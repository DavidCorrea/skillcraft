import { describe, expect, it } from 'vitest'
import { applyIntStep } from './numeric-stepper.tsx'

describe('applyIntStep', () => {
  it('clamps increment at max', () => {
    expect(applyIntStep(9, 1, 10, 5)).toBe(10)
  })

  it('clamps decrement at min', () => {
    expect(applyIntStep(2, 3, 10, -5)).toBe(3)
  })

  it('applies delta when in range', () => {
    expect(applyIntStep(5, 1, 99, 1)).toBe(6)
    expect(applyIntStep(5, 1, 99, -1)).toBe(4)
  })
})
