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
}

export const battleActorLabel = actorLabelForLog

function formatStatusSummary(statuses: StatusInstance[]): string {
  if (statuses.length === 0) return ''
  const parts = statuses.map((s) => STATUS_LABEL[s.tag.t])
  return parts.join(', ')
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
    lines.push(`Lingering: ${def.name} · ${n} ${turnWord} · ${owner}`)
  }

  if (lines.length === 0) return null
  return lines.join('\n')
}
