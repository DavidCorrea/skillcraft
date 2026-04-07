import { actorLabelForLog } from '../../game/actor-label'
import { coordKey } from '../../game/board'
import { actorsAtCell } from '../../game/engine'
import { getSkillDef } from '../../game/skills'
import type { ActorId, Coord, GameState, StatusInstance } from '../../game/types'

const STATUS_LABEL: Record<StatusInstance['tag']['t'], string> = {
  burning: 'burning',
  chilled: 'chilled',
  frozen: 'frozen',
  soaked: 'soaked',
  shocked: 'shocked',
  poisoned: 'poisoned',
  bleeding: 'bleeding',
  slowed: 'slowed',
  marked: 'marked',
  rooted: 'rooted',
  silenced: 'silenced',
  regenBlocked: 'regen blocked',
  muddy: 'muddy',
  shield: 'shield',
  skillFocus: 'focus',
  immunized: 'immunized',
}

export const battleActorLabel = actorLabelForLog

/** Combatant strip + log filter label: callsign, with "(You)" for the human player. */
export function battlePanelLabel(state: GameState, id: ActorId): string {
  const base = actorLabelForLog(state, id)
  return id === state.humanActorId ? `${base} (You)` : base
}

/** One label per status kind, in first-seen order; duplicate instances become "label ×n". */
function formatStatusSummary(statuses: StatusInstance[]): string {
  if (statuses.length === 0) return ''
  type Kind = StatusInstance['tag']['t']
  const counts = new Map<Kind, number>()
  const order: Kind[] = []
  for (const s of statuses) {
    const k = s.tag.t
    const n = counts.get(k) ?? 0
    counts.set(k, n + 1)
    if (n === 0) order.push(k)
  }
  return order
    .map((k) => {
      const n = counts.get(k)!
      const label = STATUS_LABEL[k]
      return n > 1 ? `${label} ×${n}` : label
    })
    .join(', ')
}

function actorLine(state: GameState, id: ActorId): string {
  const a = state.actors[id]!
  const label = battleActorLabel(state, id)
  const st = formatStatusSummary(a.statuses)
  const hp = `${a.hp}/${a.maxHp}`
  return st ? `${label} — ${hp} · ${st}` : `${label} — ${hp}`
}

/**
 * Multi-line description for battle grid tooltips: actors first, then lingering tile hazard.
 * Returns null when the cell is empty (no living actors and no tile impact).
 */
export function describeBattleCellTooltip(state: GameState, coord: Coord): string | null {
  const k = coordKey(coord)
  const ids = actorsAtCell(state, coord)
  const hazard = state.impactedTiles[k]

  const lines: string[] = []
  for (const id of ids) {
    lines.push(actorLine(state, id))
  }

  if (hazard) {
    const def = getSkillDef(hazard.skillId)
    const owner = battleActorLabel(state, hazard.owner)
    const n = hazard.turnsRemaining
    const turnWord = n === 1 ? 'turn' : 'turns'
    lines.push(`Lingering: ${def.name}`)
    lines.push(`${n} ${turnWord} · ${owner}`)
  }

  if (lines.length === 0) return null
  return lines.join('\n')
}
