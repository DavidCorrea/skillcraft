import { traitDisplayByKey, traitReferenceZones } from '../../game/trait-reference'
import {
  effectiveAoERadius,
  effectiveCastRangeForLoadout,
  entryPointCost,
  getSkillDef,
  manaCostCastRange,
} from '../../game/skills'
import type { Element } from '../../game/elements'
import type {
  ActorId,
  GameState,
  PatternOffset,
  SkillLoadoutEntry,
  StatusInstance,
  TraitPoints,
} from '../../game/types'

export type TraitInspectRow = { short: string; label: string; value: number }

export type TraitInspectZone = { title: string; rows: TraitInspectRow[] }

/** One readable line per status (durations, stacks, amounts). */
export function formatStatusLine(s: StatusInstance): string {
  const t = s.tag
  switch (t.t) {
    case 'burning':
      return `Burning — ${t.duration} turn${t.duration === 1 ? '' : 's'}, ${t.dot} DoT/tick`
    case 'chilled':
      return `Chilled — ${t.duration} turn${t.duration === 1 ? '' : 's'}`
    case 'frozen':
      return `Frozen — skip ${t.turns} turn${t.turns === 1 ? '' : 's'}`
    case 'soaked':
      return `Soaked — ${t.duration} turn${t.duration === 1 ? '' : 's'}`
    case 'shocked':
      return `Shocked — ${t.duration} turn${t.duration === 1 ? '' : 's'}, +${t.vuln} bonus damage taken`
    case 'poisoned':
      return `Poisoned — ${t.duration} turn${t.duration === 1 ? '' : 's'}, ${t.dot} DoT/tick`
    case 'bleeding':
      return `Bleeding — ${t.duration} turn${t.duration === 1 ? '' : 's'}, ${t.dot} DoT/tick`
    case 'slowed':
      return `Slowed — ${t.duration} turn${t.duration === 1 ? '' : 's'}`
    case 'marked':
      return `Marked — ${t.duration} turn${t.duration === 1 ? '' : 's'}, +${t.extra} flat from hits`
    case 'rooted':
      return `Rooted — ${t.duration} turn${t.duration === 1 ? '' : 's'}`
    case 'silenced':
      return `Silenced — ${t.duration} turn${t.duration === 1 ? '' : 's'}`
    case 'regenBlocked':
      return `Regen blocked — ${t.duration} turn${t.duration === 1 ? '' : 's'}`
    case 'muddy':
      return `Muddy — ${t.duration} turn${t.duration === 1 ? '' : 's'}`
    case 'shield':
      return `Shield — ${t.amount} absorb`
    default: {
      const _exhaustive: never = t
      return String(_exhaustive)
    }
  }
}

/** Traits grouped like the loadout guide: Core, Melee, Defenses — non-zero first within each zone, then zeros. */
export function traitZonesForInspect(traits: TraitPoints): TraitInspectZone[] {
  return traitReferenceZones.map((zone) => {
    const nonZero: TraitInspectRow[] = []
    const zero: TraitInspectRow[] = []
    for (const ref of zone.traits) {
      const meta = traitDisplayByKey[ref.key]
      const value = traits[ref.key]
      const row: TraitInspectRow = { short: meta.short, label: meta.label, value }
      if (value > 0) nonZero.push(row)
      else zero.push(row)
    }
    return { title: zone.title, rows: [...nonZero, ...zero] }
  })
}

/** Hit counts per offset; anchor cell (0,0) always included in bounds so cast origin is visible. */
export function buildPatternPreview(pattern: PatternOffset[]): {
  cols: number
  rows: number
  cells: { count: number; isAnchor: boolean }[]
} | null {
  if (pattern.length === 0) return null
  const counts = new Map<string, number>()
  for (const o of pattern) {
    const k = `${o.dx},${o.dy}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let minDx = Infinity
  let maxDx = -Infinity
  let minDy = Infinity
  let maxDy = -Infinity
  for (const k of counts.keys()) {
    const [dx, dy] = k.split(',').map(Number) as [number, number]
    minDx = Math.min(minDx, dx)
    maxDx = Math.max(maxDx, dx)
    minDy = Math.min(minDy, dy)
    maxDy = Math.max(maxDy, dy)
  }
  minDx = Math.min(minDx, 0)
  maxDx = Math.max(maxDx, 0)
  minDy = Math.min(minDy, 0)
  maxDy = Math.max(maxDy, 0)

  const cols = maxDx - minDx + 1
  const rows = maxDy - minDy + 1
  const cells: { count: number; isAnchor: boolean }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dx = minDx + c
      const dy = minDy + r
      const count = counts.get(`${dx},${dy}`) ?? 0
      cells.push({ count, isAnchor: dx === 0 && dy === 0 })
    }
  }
  return { cols, rows, cells }
}

export type SkillInspectMeta = {
  name: string
  element: Element
  mpMin: number
  mpMax: number
  rangeLabel: string
  rangeTier: number
  aoeLabel: string
  aoeTier: number
  stacks: number
  loadoutPts: number
  selfTarget: boolean
}

export function skillInspectMeta(entry: SkillLoadoutEntry, traits: TraitPoints): SkillInspectMeta {
  const def = getSkillDef(entry.skillId)
  const maxR = effectiveCastRangeForLoadout(def, entry, traits)
  const { min: mpMin, max: mpMax } = manaCostCastRange(entry, def.selfTarget ? 0 : maxR)
  const aoeR = effectiveAoERadius(def, entry)
  return {
    name: def.name,
    element: def.element,
    mpMin,
    mpMax,
    rangeLabel: def.selfTarget ? 'Self-cast' : `Cast range ${maxR}`,
    rangeTier: entry.rangeTier ?? 0,
    aoeLabel: def.selfTarget ? '—' : `AoE radius ${aoeR}`,
    aoeTier: entry.aoeTier ?? 0,
    stacks: entry.statusStacks,
    loadoutPts: entryPointCost(entry),
    selfTarget: !!def.selfTarget,
  }
}

/** Skill line for inspect: name, element, loadout stats, MP range at current max range. */
export function formatSkillInspectLine(entry: SkillLoadoutEntry, traits: TraitPoints): string {
  const def = getSkillDef(entry.skillId)
  const maxR = effectiveCastRangeForLoadout(def, entry, traits)
  const { min: mMin, max: mMax } = manaCostCastRange(entry, def.selfTarget ? 0 : maxR)
  const manaStr = mMin === mMax ? `${mMin} MP` : `${mMin}–${mMax} MP`
  const tier = entry.rangeTier ?? 0
  const aoeT = entry.aoeTier ?? 0
  const aoeR = effectiveAoERadius(def, entry)
  const rangeBit = def.selfTarget ? 'self' : `range ${maxR}`
  const tierBit = def.selfTarget || tier === 0 ? '' : ` · cast+${tier}`
  const aoeBit = def.selfTarget || aoeT === 0 ? '' : ` · AoE ${aoeR} (+${aoeT})`
  const patternN = entry.pattern.length
  return `${def.name} (${def.element}) · ${patternN} cell${patternN === 1 ? '' : 's'} · ${entry.statusStacks} stack${entry.statusStacks === 1 ? '' : 's'} · ${manaStr} · ${rangeBit}${tierBit}${aoeBit} · ${entryPointCost(entry)} loadout pts`
}

export function cpuDifficultyLabel(state: GameState, id: ActorId): string | null {
  if (id === state.humanActorId) return null
  const d = state.cpuDifficulty[id]
  if (!d) return null
  return d.charAt(0).toUpperCase() + d.slice(1)
}
