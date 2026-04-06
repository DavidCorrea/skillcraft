import { pickCpuAction } from '../ai/cpu'
import { applyAction, createInitialState } from './engine'
import type {
  ActorId,
  BattleConfig,
  CpuDifficulty,
  GameState,
  SkillLoadoutEntry,
  TraitPoints,
} from './types'

export type DuelSimulationResult = {
  winner: ActorId | null
  tie: boolean
  plies: number
  /** True when `maxPlies` was reached without a win/tie (likely stalemate or pathological loop). */
  truncated: boolean
}

export type SimulateDuelOptions = {
  /** Used for both fighters so the duel is symmetric AI-wise. Default `easy` (fast); use `hard` for stronger play (slower). */
  cpuDifficulty?: CpuDifficulty
  /** When false, first actor in roster order goes first. Default true. */
  randomizeTurnOrder?: boolean
  rng?: () => number
  /** Safety cap; raise if legitimate long games get cut off. Default 20_000. */
  maxPlies?: number
}

/**
 * Runs a 1v1 battle with {@link pickCpuAction} for every turn until win, tie, or `maxPlies`.
 * Sets `cpuDifficulty` for **both** roster actors (including the human slot) so behavior matches CPU vs CPU.
 */
export function simulateDuelCpuVsCpu(
  battleConfig: BattleConfig,
  options: SimulateDuelOptions = {},
): DuelSimulationResult {
  const cpuDifficulty = options.cpuDifficulty ?? 'easy'
  const maxPlies = options.maxPlies ?? 20_000

  let state: GameState = createInitialState(battleConfig, {
    randomizeTurnOrder: options.randomizeTurnOrder ?? true,
    rng: options.rng,
  })

  const ids = state.turnOrder
  const diffMap: Record<ActorId, CpuDifficulty> = { ...state.cpuDifficulty }
  for (const id of ids) {
    diffMap[id] = cpuDifficulty
  }
  state = { ...state, cpuDifficulty: diffMap }

  let plies = 0
  while (!state.winner && !state.tie && plies < maxPlies) {
    const actor = state.turn
    const action = pickCpuAction(state, actor)
    const res = applyAction(state, actor, action)
    if (res.error) {
      throw new Error(`simulateDuelCpuVsCpu: illegal action after pickCpuAction — ${res.error}`)
    }
    state = res.state!
    plies += 1
  }

  if (plies >= maxPlies && !state.winner && !state.tie) {
    return { winner: null, tie: false, plies, truncated: true }
  }

  return {
    winner: state.winner,
    tie: state.tie,
    plies,
    truncated: false,
  }
}

export type MonteCarloSummary = {
  games: number
  /** Wins keyed by actor id (e.g. test fixture `player` / `cpu`). */
  winsByActor: Record<string, number>
  ties: number
  truncated: number
  avgPlies: number
}

/**
 * Many random loadouts at `level` (via `randomCpuBuild`), CPU vs CPU.
 * Pairing: independent random builds for side A and side B each game.
 */
export function monteCarloRandomDuels(args: {
  games: number
  level: number
  cpuDifficulty: CpuDifficulty
  randomCpuBuild: (level: number, difficulty: CpuDifficulty) => {
    cpuLoadout: SkillLoadoutEntry[]
    cpuTraits: TraitPoints
  }
  duelBattleConfig: (partial: Pick<
    BattleConfig,
    'level' | 'playerLoadout' | 'cpuLoadout' | 'playerTraits' | 'cpuTraits'
  >) => BattleConfig
  maxPlies?: number
}): MonteCarloSummary {
  const {
    games,
    level,
    cpuDifficulty,
    randomCpuBuild,
    duelBattleConfig,
    maxPlies,
  } = args

  const winsByActor: Record<string, number> = {}
  let ties = 0
  let truncated = 0
  let pliesSum = 0

  for (let i = 0; i < games; i++) {
    const a = randomCpuBuild(level, cpuDifficulty)
    const b = randomCpuBuild(level, cpuDifficulty)
    const config = duelBattleConfig({
      level,
      playerLoadout: a.cpuLoadout,
      cpuLoadout: b.cpuLoadout,
      playerTraits: a.cpuTraits,
      cpuTraits: b.cpuTraits,
    })
    const r = simulateDuelCpuVsCpu(config, { cpuDifficulty, maxPlies })
    pliesSum += r.plies
    if (r.truncated) {
      truncated += 1
      continue
    }
    if (r.tie) {
      ties += 1
      continue
    }
    if (r.winner) {
      winsByActor[r.winner] = (winsByActor[r.winner] ?? 0) + 1
    }
  }

  return {
    games,
    winsByActor,
    ties,
    truncated,
    avgPlies: games > 0 ? pliesSum / games : 0,
  }
}

/** One-line summary for logging or copying into design notes. */
export function formatMonteCarloSummary(s: MonteCarloSummary): string {
  const parts = Object.entries(s.winsByActor).map(([id, n]) => `${id}=${n}`)
  return (
    `games=${s.games} ${parts.join(' ')} ties=${s.ties} truncated=${s.truncated} avgPlies=${s.avgPlies.toFixed(1)}`
  )
}
