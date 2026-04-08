import { describe, expect, it } from 'vitest'
import {
  casterLinesForReaction,
  casterLinesForReactionWithTone,
  cpuLinesForReaction,
  cpuLinesForReactionWithPersonality,
} from './broadcastReactionPhrases'

describe('casterLinesForReactionWithTone', () => {
  it('matches classic reaction lines for classic_arena tone', () => {
    expect(casterLinesForReactionWithTone('melt', 'classic_arena')).toEqual(casterLinesForReaction('melt'))
  })

  it('prepends tone extras for grim tone so pool is longer and ends with classic lines', () => {
    const classic = casterLinesForReaction('melt')
    const grim = casterLinesForReactionWithTone('melt', 'grim_war_report')
    expect(grim.length).toBeGreaterThan(classic.length)
    expect(grim.slice(-classic.length)).toEqual([...classic])
  })
})

describe('cpuLinesForReactionWithPersonality', () => {
  it('returns base lines when personality is undefined', () => {
    expect(cpuLinesForReactionWithPersonality('melt', undefined)).toEqual(cpuLinesForReaction('melt'))
  })

  it('prepends personality extras so pool is longer than base', () => {
    const base = cpuLinesForReaction('melt')
    const merged = cpuLinesForReactionWithPersonality('melt', 'snarky')
    expect(merged.length).toBeGreaterThan(base.length)
    expect(merged.slice(-base.length)).toEqual([...base])
  })
})
