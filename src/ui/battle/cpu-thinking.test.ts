import { describe, expect, it } from 'vitest'
import { pickCpuThinkingPhrase } from './cpu-thinking'

describe('pickCpuThinkingPhrase', () => {
  it('uses implicit first person without a leading I-statement', () => {
    const s = pickCpuThinkingPhrase('Vex')
    expect(s.length).toBeGreaterThan(10)
    expect(s.trimStart().toLowerCase()).not.toMatch(/^i\s/)
  })

  it('returns a non-empty string', () => {
    expect(pickCpuThinkingPhrase('Hostile').length).toBeGreaterThan(10)
  })
})
