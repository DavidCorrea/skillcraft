import { describe, expect, it } from 'vitest'
import { CASTER_TONE_OPTIONS, PERSONALITY_SELECT_OPTIONS, rollVoicePersonality } from './voiceRoll'

describe('rollVoicePersonality', () => {
  it('returns a stable personality from a fixed rng', () => {
    const a = rollVoicePersonality(() => 0)
    const b = rollVoicePersonality(() => 0)
    expect(a).toBe(b)
    expect(typeof a).toBe('string')
  })
})

describe('CASTER_TONE_OPTIONS', () => {
  it('lists every tone once', () => {
    const values = CASTER_TONE_OPTIONS.map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('PERSONALITY_SELECT_OPTIONS', () => {
  it('lists every combat personality once', () => {
    const values = PERSONALITY_SELECT_OPTIONS.map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
    expect(values.length).toBeGreaterThan(0)
  })
})
