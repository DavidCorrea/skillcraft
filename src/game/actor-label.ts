import type { ActorId, GameState } from './types'

/** Human-readable name for log lines and UI (callsign / You / Ally / Hostile). */
export function actorLabelForLog(state: GameState, id: ActorId): string {
  const a = state.actors[id]
  if (a?.displayName) return a.displayName
  if (id === state.humanActorId) return 'You'
  if (state.matchMode === 'teams' && state.teamByActor[id] === state.teamByActor[state.humanActorId]) {
    return 'Ally'
  }
  return 'Hostile'
}
