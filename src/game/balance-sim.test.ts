import { describe, expect, it } from 'vitest'
import { formatMonteCarloSummary, monteCarloRandomDuels, simulateDuelCpuVsCpu } from './balance-sim'
import { defaultTraitPoints } from './traits'
import { randomCpuBuild } from './randomCpuBuild'
import { duelBattleConfig, TID } from './test-fixtures'

describe('simulateDuelCpuVsCpu', () => {
  it('finishes a small fixed duel without truncating', () => {
    const cfg = duelBattleConfig({
      level: 8,
      playerLoadout: [
        { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, costDiscount: 0 },
        { skillId: 'frost_bolt', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, costDiscount: 0 },
      ],
      cpuLoadout: [{ skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 2, costDiscount: 0 }],
      playerTraits: defaultTraitPoints(),
      cpuTraits: defaultTraitPoints(),
    })
    const r = simulateDuelCpuVsCpu(cfg, {
      // Easy = greedy AI; fast enough for CI. Use `hard` locally for stronger play.
      cpuDifficulty: 'easy',
      randomizeTurnOrder: false,
      maxPlies: 25_000,
    })
    expect(r.truncated).toBe(false)
    expect(r.tie || r.winner !== null).toBe(true)
    expect(r.plies).toBeGreaterThan(0)
  })
})

describe('formatMonteCarloSummary', () => {
  it('includes win counts and averages', () => {
    const line = formatMonteCarloSummary({
      games: 3,
      winsByActor: { x: 2, y: 1 },
      ties: 0,
      truncated: 0,
      avgPlies: 100.5,
    })
    expect(line).toContain('games=3')
    expect(line).toContain('x=2')
    expect(line).toContain('avgPlies=100.5')
  })
})

describe('monteCarloRandomDuels', () => {
  it('aggregates random build matchups (smoke + balance signal)', () => {
    const games = 24
    const level = 10
    const summary = monteCarloRandomDuels({
      games,
      level,
      cpuDifficulty: 'easy',
      randomCpuBuild,
      duelBattleConfig,
      maxPlies: 15_000,
    })

    const winTotal =
      (summary.winsByActor[TID.human] ?? 0) + (summary.winsByActor[TID.cpu] ?? 0)
    expect(winTotal + summary.ties + summary.truncated).toBe(games)
    expect(summary.avgPlies).toBeGreaterThan(0)
    // Stalemates should be rare; if this flakes, raise maxPlies or fix deadlock rules.
    expect(summary.truncated).toBeLessThanOrEqual(Math.ceil(games * 0.2))

    // eslint-disable-next-line no-console -- intentional balance harness output
    console.log(`[balance-sim] level=${level} easy CPU — ${formatMonteCarloSummary(summary)}`)
  })
})
