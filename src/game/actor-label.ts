import type { ActorId, GameState } from './types'

/** Human-readable name for log lines and UI (You / displayName / Ally / Hostile). */
export function actorLabelForLog(state: GameState, id: ActorId): string {
  if (id === state.humanActorId) return 'You'
  const a = state.actors[id]
  if (a?.displayName) return a.displayName
  if (state.matchMode === 'teams' && state.teamByActor[id] === state.teamByActor[state.humanActorId]) {
    return 'Ally'
  }
  return 'Hostile'
}
