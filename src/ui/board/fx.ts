import type { Element } from '../../game/elements'
import type { ActorId, Coord, GameState, SkillId, StatusInstance } from '../../game/types'
import { coordKey } from '../../game/board'
import { cellsForPattern } from '../../game/skills'

/** Transient board presentation state (not game rules). */
export type BoardFxState =
  | { kind: 'move'; actor: ActorId; from: Coord; to: Coord }
  | { kind: 'strike'; attacker: ActorId; defenderKey: string; defenderId: ActorId }
  | { kind: 'castOffensive'; element: Element; stagger: Map<string, number> }
  | { kind: 'castSelf'; casterKey: string; element: Element }
  | { kind: 'reject'; cellKey: string }

/** Pattern cells for a cast; `null` if skill not in loadout. */
export function patternCellsForCast(
  state: GameState,
  actor: ActorId,
  skillId: SkillId,
  anchor: Coord,
): Coord[] | null {
  const entry = state.loadouts[actor].find((e) => e.skillId === skillId)
  if (!entry) return null
  return cellsForPattern(anchor, entry.pattern)
}

/** Stagger index: same cell hit multiple times uses the latest pattern index (later flash). */
export function castResolveStaggerMap(cells: Coord[]): Map<string, number> {
  const m = new Map<string, number>()
  cells.forEach((c, i) => {
    const k = coordKey(c)
    m.set(k, Math.max(m.get(k) ?? -1, i))
  })
  return m
}

const STATUS_CLASS: Record<string, string> = {
  burning: 'holo-piece--status-burning',
  chilled: 'holo-piece--status-chilled',
  frozen: 'holo-piece--status-frozen',
  soaked: 'holo-piece--status-soaked',
  shocked: 'holo-piece--status-shocked',
  poisoned: 'holo-piece--status-poisoned',
  bleeding: 'holo-piece--status-bleeding',
  slowed: 'holo-piece--status-slowed',
  marked: 'holo-piece--status-marked',
  rooted: 'holo-piece--status-rooted',
  silenced: 'holo-piece--status-silenced',
  regenBlocked: 'holo-piece--status-regenBlocked',
  muddy: 'holo-piece--status-muddy',
  shield: 'holo-piece--status-shield',
}

/** Space-separated status classes for a piece (deduped). */
export function statusPieceClasses(statuses: StatusInstance[]): string {
  const set = new Set<string>()
  for (const s of statuses) {
    const cls = STATUS_CLASS[s.tag.t]
    if (cls) set.add(cls)
  }
  return [...set].join(' ')
}

/** If the defender moved (e.g. knockback), return a move FX for that actor. */
export function knockbackMoveFx(
  prev: GameState,
  next: GameState,
  _attacker: ActorId,
  defender: ActorId,
): BoardFxState | null {
  const a = prev.actors[defender].pos
  const b = next.actors[defender].pos
  if (coordKey(a) === coordKey(b)) return null
  return { kind: 'move', actor: defender, from: a, to: b }
}
