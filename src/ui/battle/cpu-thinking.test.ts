import { describe, expect, it } from 'vitest'
import { pickCpuThinkingPhrase } from './cpu-thinking'

describe('pickCpuThinkingPhrase', () => {
  it('includes the actor label', () => {
    const s = pickCpuThinkingPhrase('Vex')
    expect(s).toContain('Vex')
  })

  it('returns a non-empty string', () => {
    expect(pickCpuThinkingPhrase('Hostile').length).toBeGreaterThan(10)
  })
})
