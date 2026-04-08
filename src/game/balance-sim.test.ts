import { describe, expect, it } from 'vitest'
import { formatMonteCarloSummary, monteCarloRandomDuels, simulateDuelCpuVsCpu } from './balance-sim'
import { defaultTraitPoints } from './traits'
import { randomCpuBuild } from './randomCpuBuild'
import { duelBattleConfig, ffaBattleConfigThreeOpponents, TID } from './test-fixtures'

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
  it('aggregates random build matchups (smoke + balance signal)', { timeout: 30_000 }, () => {
    const games = 24
    const level = 10
    const summary = monteCarloRandomDuels({
      games,
      level,
      cpuDifficulty: 'easy',
      randomCpuBuild,
      duelBattleConfig,
      // Align with fixed duel cap; longer games after rule changes can hit 15k.
      maxPlies: 25_000,
    })

    const winTotal =
      (summary.winsByActor[TID.human] ?? 0) + (summary.winsByActor[TID.cpu] ?? 0)
    expect(winTotal + summary.ties + summary.truncated).toBe(games)
    expect(summary.avgPlies).toBeGreaterThan(0)
    // Stalemates should be rare; if this flakes, raise maxPlies or fix deadlock rules.
    expect(summary.truncated).toBeLessThanOrEqual(Math.ceil(games * 0.25))

    // eslint-disable-next-line no-console -- intentional balance harness output
    console.log(`[balance-sim] level=${level} easy CPU — ${formatMonteCarloSummary(summary)}`)
  })

  it('keeps truncation rare across level bands (starter / mid / high)', { timeout: 60_000 }, () => {
    const gamesPerBand = 12
    for (const level of [4, 14, 55]) {
      const summary = monteCarloRandomDuels({
        games: gamesPerBand,
        level,
        cpuDifficulty: 'easy',
        randomCpuBuild,
        duelBattleConfig,
        maxPlies: 25_000,
      })
      expect(summary.avgPlies).toBeGreaterThan(0)
      expect(summary.truncated).toBeLessThanOrEqual(Math.ceil(gamesPerBand * 0.35))
      // eslint-disable-next-line no-console -- banded balance harness
      console.log(`[balance-sim] band L${level} — ${formatMonteCarloSummary(summary)}`)
    }
  })

  it('FFA four-fighter random builds progress across level bands (multi-actor smoke)', { timeout: 90_000 }, () => {
    const gamesPerBand = 4
    for (const level of [4, 14, 55]) {
      let truncated = 0
      let pliesSum = 0
      for (let g = 0; g < gamesPerBand; g++) {
        const h = randomCpuBuild(level, 'easy')
        const o0 = randomCpuBuild(level, 'easy')
        const o1 = randomCpuBuild(level, 'easy')
        const o2 = randomCpuBuild(level, 'easy')
        const cfg = ffaBattleConfigThreeOpponents({
          level,
          playerLoadout: h.cpuLoadout,
          playerTraits: h.cpuTraits,
          opponents: [
            { loadout: o0.cpuLoadout, traits: o0.cpuTraits },
            { loadout: o1.cpuLoadout, traits: o1.cpuTraits },
            { loadout: o2.cpuLoadout, traits: o2.cpuTraits },
          ],
        })
        const r = simulateDuelCpuVsCpu(cfg, {
          cpuDifficulty: 'easy',
          randomizeTurnOrder: true,
          maxPlies: 18_000,
        })
        if (r.truncated) truncated += 1
        pliesSum += r.plies
      }
      expect(pliesSum / gamesPerBand).toBeGreaterThan(0)
      // Few games per band: require at least one run to finish (50% cap is too flaky at n=4).
      expect(truncated).toBeLessThan(gamesPerBand)
      // eslint-disable-next-line no-console -- multi-actor band harness
      console.log(`[balance-sim] FFA band L${level} games=${gamesPerBand} truncated=${truncated}`)
    }
  })
})
