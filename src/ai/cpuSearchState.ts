import type { GameState } from '../game/types'

/**
 * Search and move legality do not depend on the battle log (`hashCpuSearchPosition` excludes it).
 * Stripping the log before `postMessage` reduces structured-clone cost for the CPU worker.
 */
export function gameStateForCpuWorker(state: GameState): GameState {
  return { ...state, log: [] }
}
