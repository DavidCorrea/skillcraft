import type { Coord } from './types'
import type { Element } from './elements'
import type { PatternOffset, SkillId, SkillLoadoutEntry, StatusTag, TraitPoints } from './types'
import {
  defaultTraitPoints,
  effectiveSkillRange,
  shrinkOnePointFromTraits,
  totalTraitPoints,
} from './traits'
import { BOARD_SIZE } from './board'

/** @param boardSize grid width/height (default 7 for tests / editor). */
export function patternFullyInBounds(
  target: Coord,
  pattern: PatternOffset[],
  boardSize: number = BOARD_SIZE,
): boolean {
  return cellsForPattern(target, pattern).every(
    (c) => c.x >= 0 && c.x < boardSize && c.y >= 0 && c.y < boardSize,
  )
}

export interface SkillDefinition {
  id: SkillId
  name: string
  element: Element
  range: number
  baseDamage: number
  describePattern: string
  /** Only cast with anchor on your position; pattern must be a single {0,0} cell. */
  selfTarget?: boolean
  /** elemental = normal defenses; physical = fortitude path; none = mend/ward/purge. */
  damageKind?: 'elemental' | 'physical' | 'none'
  /**
   * Extra Chebyshev radius before AoE tiers (max(|dx|,|dy|) from anchor).
   * Defaults to 0 — at `aoeTier` 0 the pattern is anchor-only unless this is set.
   */
  aoeBase?: number
}

export const SKILL_ROSTER: SkillDefinition[] = [
  {
    id: 'ember',
    name: 'Ember',
    element: 'fire',
    range: 4,
    baseDamage: 4,
    describePattern: 'Custom relative to target',
    damageKind: 'elemental',
  },
  {
    id: 'frost_bolt',
    name: 'Frost Bolt',
    element: 'ice',
    range: 4,
    baseDamage: 3,
    describePattern: 'Custom relative to target',
    damageKind: 'elemental',
  },
  {
    id: 'tide_touch',
    name: 'Tide Touch',
    element: 'water',
    range: 3,
    baseDamage: 3,
    describePattern: 'Custom relative to target',
    damageKind: 'elemental',
  },
  {
    id: 'spark',
    name: 'Spark',
    element: 'electric',
    range: 4,
    baseDamage: 4,
    describePattern: 'Custom relative to target',
    damageKind: 'elemental',
  },
  {
    id: 'venom_dart',
    name: 'Venom Dart',
    element: 'poison',
    range: 4,
    baseDamage: 3,
    describePattern: 'Custom relative to target',
    damageKind: 'elemental',
  },
  {
    id: 'zephyr_cut',
    name: 'Zephyr Cut',
    element: 'wind',
    range: 4,
    baseDamage: 3,
    describePattern: 'Custom relative to target',
    damageKind: 'elemental',
  },
  {
    id: 'tremor',
    name: 'Tremor',
    element: 'earth',
    range: 3,
    baseDamage: 4,
    describePattern: 'Custom relative to target',
    damageKind: 'elemental',
  },
  {
    id: 'arcane_pulse',
    name: 'Arcane Pulse',
    element: 'arcane',
    range: 5,
    baseDamage: 3,
    describePattern: 'Custom relative to target',
    damageKind: 'elemental',
  },
  {
    id: 'void_lance',
    name: 'Void Lance',
    element: 'arcane',
    range: 4,
    baseDamage: 4,
    describePattern: 'Custom relative to target',
    damageKind: 'elemental',
  },
  {
    id: 'mend',
    name: 'Mend',
    element: 'water',
    range: 0,
    baseDamage: 0,
    describePattern: 'Self only',
    selfTarget: true,
    damageKind: 'none',
  },
  {
    id: 'ward',
    name: 'Ward',
    element: 'arcane',
    range: 0,
    baseDamage: 0,
    describePattern: 'Self only',
    selfTarget: true,
    damageKind: 'none',
  },
  {
    id: 'purge',
    name: 'Purge',
    element: 'wind',
    range: 0,
    baseDamage: 0,
    describePattern: 'Self only',
    selfTarget: true,
    damageKind: 'none',
  },
  {
    id: 'splinter',
    name: 'Splinter',
    element: 'physical',
    range: 4,
    baseDamage: 4,
    describePattern: 'Custom relative to target',
    damageKind: 'physical',
  },
  {
    id: 'caustic_cloud',
    name: 'Caustic Cloud',
    element: 'poison',
    range: 3,
    baseDamage: 3,
    describePattern: 'Custom relative to target',
    damageKind: 'elemental',
  },
]

const byId = Object.fromEntries(SKILL_ROSTER.map((s) => [s.id, s])) as Record<
  SkillId,
  SkillDefinition
>

/** Hard ceiling for skill slots (also caps {@link maxSkillsForLevel}). */
export const ABSOLUTE_MAX_SKILLS = 5

/**
 * More skills unlock every few levels; capped at {@link ABSOLUTE_MAX_SKILLS} and roster size.
 * At level 14 → 4 slots; at 17+ → 5.
 */
export function maxSkillsForLevel(level: number): number {
  const cap = Math.min(ABSOLUTE_MAX_SKILLS, SKILL_ROSTER.length)
  const lv = Math.max(1, Math.floor(level))
  const steps = 1 + Math.floor((lv - 1) / 4)
  return Math.min(cap, Math.max(1, steps))
}

export function getSkillDef(id: SkillId): SkillDefinition {
  return byId[id]
}

/** Default half-size for legacy standalone pattern UIs (7×7 grid). Not used as default combat AoE. */
export const PATTERN_GRID_RADIUS = 3

/** Triangular loadout cost for tier T: T*(T+1)/2 (used for cast range and AoE tiers). */
export function tierPointCost(tier: number): number {
  const t = Math.max(0, Math.floor(tier))
  return (t * (t + 1)) / 2
}

/** @deprecated Use {@link tierPointCost} (same formula). */
export function rangeTierPointCost(rangeTier: number): number {
  return tierPointCost(rangeTier)
}

/** Largest tier such that {@link tierPointCost}(tier) ≤ `loadoutPointsAvailable`. */
export function maxPurchasableRangeTier(loadoutPointsAvailable: number): number {
  let avail = Math.max(0, loadoutPointsAvailable)
  let t = 0
  while (tierPointCost(t + 1) <= avail) t += 1
  return Math.min(24, t)
}

/** Largest AoE tier affordable with the same triangular curve as cast range. */
export function maxPurchasableAoeTier(loadoutPointsAvailable: number): number {
  return maxPurchasableRangeTier(loadoutPointsAvailable)
}

/** Max cast Manhattan distance: base + Arcane reach + per-skill range tiers (non-self only). */
export function effectiveCastRangeForLoadout(
  def: SkillDefinition,
  entry: SkillLoadoutEntry,
  traits: TraitPoints,
): number {
  const base = effectiveSkillRange(def.range, traits)
  if (def.selfTarget) return base
  const tier = Math.max(0, Math.floor(entry.rangeTier ?? 0))
  return base + tier
}

/** Chebyshev radius: each pattern offset must satisfy max(|dx|,|dy|) ≤ this value. Tier 0 = anchor cell only. */
export function effectiveAoERadius(def: SkillDefinition, entry: SkillLoadoutEntry): number {
  if (def.selfTarget) return 0
  const base = def.aoeBase ?? 0
  return base + Math.max(0, Math.floor(entry.aoeTier ?? 0))
}

export function offsetWithinAoE(o: PatternOffset, def: SkillDefinition, entry: SkillLoadoutEntry): boolean {
  if (def.selfTarget) return o.dx === 0 && o.dy === 0
  const R = effectiveAoERadius(def, entry)
  return Math.max(Math.abs(o.dx), Math.abs(o.dy)) <= R
}

export function patternRespectsAoE(pattern: PatternOffset[], def: SkillDefinition, entry: SkillLoadoutEntry): boolean {
  return pattern.every((o) => offsetWithinAoE(o, def, entry))
}

/** Drop offsets outside current AoE; if empty, return a single origin cell. */
export function trimPatternToAoE(pattern: PatternOffset[], def: SkillDefinition, entry: SkillLoadoutEntry): PatternOffset[] {
  const R = effectiveAoERadius(def, entry)
  const next = pattern.filter((o) => Math.max(Math.abs(o.dx), Math.abs(o.dy)) <= R)
  if (next.length > 0) return next
  return [{ dx: 0, dy: 0 }]
}

/** Pattern + stacks (what sets base mana before discount). */
export function basePowerCost(entry: SkillLoadoutEntry): number {
  return entry.pattern.length + entry.statusStacks
}

/** Loadout points: power + mana-efficiency points + range tier cost + AoE tier cost. */
export function entryPointCost(entry: SkillLoadoutEntry): number {
  return (
    basePowerCost(entry) +
    entry.manaDiscount +
    tierPointCost(entry.rangeTier ?? 0) +
    tierPointCost(entry.aoeTier ?? 0)
  )
}

/**
 * Mana spent when casting; min 1.
 * Base: pattern cells + status stacks, minus mana discount (loadout points).
 * Each Manhattan tile from you to the cast anchor adds +1 mana (farther = costlier).
 */
export function manaCostForCast(entry: SkillLoadoutEntry, manhattanFromCasterToAnchor = 0): number {
  const raw = basePowerCost(entry) - entry.manaDiscount + manhattanFromCasterToAnchor
  return Math.max(1, raw)
}

/** Smallest / largest mana this entry can cost in battle for the given max cast range (distance 0 … maxRange). */
export function manaCostCastRange(entry: SkillLoadoutEntry, maxRange: number): { min: number; max: number } {
  const min = manaCostForCast(entry, 0)
  const max = manaCostForCast(entry, Math.max(0, maxRange))
  return { min, max }
}

export function cellsForPattern(target: Coord, pattern: PatternOffset[]): Coord[] {
  return pattern.map((o) => ({ x: target.x + o.dx, y: target.y + o.dy }))
}

/** Count how many pattern cells overlap the enemy (multi-hit on same cell counts). */
export function countHitsOnEnemy(enemy: Coord, target: Coord, pattern: PatternOffset[]): number {
  const kEnemy = `${enemy.x},${enemy.y}`
  let n = 0
  for (const o of pattern) {
    const c = { x: target.x + o.dx, y: target.y + o.dy }
    if (`${c.x},${c.y}` === kEnemy) n += 1
  }
  return n
}

/** Damage scales with hits on the enemy (each hit applies base damage). */
export function damageForCast(def: SkillDefinition, hitsOnEnemy: number): number {
  return def.baseDamage * Math.max(0, hitsOnEnemy)
}

/** Heal from Mend: scales with stacks and caster status potency. */
export function mendHealAmount(statusStacks: number, statusPotency: number): number {
  const p = Math.max(1, statusStacks)
  const pot = Math.max(0, statusPotency)
  return 6 + p * 2 + Math.floor(pot / 2)
}

/** Absorb from Ward. */
export function wardShieldAmount(statusStacks: number, statusPotency: number): number {
  const p = Math.max(1, statusStacks)
  const pot = Math.max(0, statusPotency)
  return 8 + p * 3 + pot
}

/** How many debuff instances Purge removes. */
export function purgeCleanseCount(statusStacks: number): number {
  return Math.max(1, statusStacks)
}

export function buildStatusForSkill(
  skillId: SkillId,
  statusStacks: number,
  statusPotency = 0,
): StatusTag {
  const p = Math.max(1, statusStacks)
  const pot = Math.max(0, statusPotency)
  const pd = Math.floor(pot / 2)

  switch (skillId) {
    case 'ember':
      return { t: 'burning', duration: 2 + Math.floor(statusStacks / 3) + Math.floor(pot / 4), dot: 2 + p + pd }
    case 'frost_bolt':
      return statusStacks >= 2
        ? { t: 'frozen', turns: 1 }
        : { t: 'chilled', duration: 2 + p + Math.floor(pot / 3) }
    case 'tide_touch':
      return { t: 'soaked', duration: 3 + p + pd }
    case 'spark':
      return { t: 'shocked', duration: 2 + p + Math.floor(pot / 3), vuln: 1 + p + Math.min(3, pd) }
    case 'venom_dart':
      if (statusStacks >= 5) {
        return { t: 'regenBlocked', duration: 2 + Math.floor(pot / 3) }
      }
      return { t: 'poisoned', duration: 4 + p + pd, dot: 1 + p + Math.floor(pot / 3) }
    case 'zephyr_cut':
      return { t: 'chilled', duration: 2 + p + Math.floor(pot / 4) }
    case 'tremor':
      if (statusStacks >= 4) {
        return { t: 'rooted', duration: 1 + Math.floor(pot / 3) }
      }
      return statusStacks >= 2
        ? { t: 'frozen', turns: 1 }
        : { t: 'chilled', duration: 2 + Math.floor(p / 2) + Math.floor(pot / 4) }
    case 'arcane_pulse':
      if (statusStacks >= 5) {
        return { t: 'silenced', duration: 1 + Math.floor(pot / 3) }
      }
      return { t: 'shocked', duration: 2 + Math.floor(p / 2) + Math.floor(pot / 4), vuln: p + pd }
    case 'void_lance':
      return { t: 'poisoned', duration: 3 + p + pd, dot: 2 + p + Math.floor(pot / 3) }
    case 'mend':
      throw new Error('Mend has no offensive status — handled in engine.')
    case 'ward':
      return { t: 'shield', amount: wardShieldAmount(p, pot) }
    case 'purge':
      throw new Error('Purge has no status — handled in engine.')
    case 'splinter':
      return { t: 'bleeding', duration: 2 + pd, dot: 1 + Math.floor(p / 2) + pd }
    case 'caustic_cloud':
      return statusStacks >= 3
        ? { t: 'marked', duration: 2 + Math.floor(p / 2), extra: 2 + Math.min(4, pd) }
        : {
            t: 'poisoned',
            duration: 3 + p + pd,
            dot: 2 + p + Math.floor(pot / 2),
          }
  }
}

export function offsetInPatternGrid(o: PatternOffset): boolean {
  return Math.abs(o.dx) <= PATTERN_GRID_RADIUS && Math.abs(o.dy) <= PATTERN_GRID_RADIUS
}

/**
 * Half-size of the pattern count grid in the loadout editor (Chebyshev radius from anchor).
 * Pattern placement is limited by {@link effectiveAoERadius}, not by cast range.
 */
export function loadoutPatternEditRadius(def: SkillDefinition, entry: SkillLoadoutEntry): number {
  return Math.max(0, effectiveAoERadius(def, entry))
}

/** Count grid for pattern editing; `radius` defaults to legacy 7×7. */
export function patternOffsetsToCountGrid(pattern: PatternOffset[], radius: number = PATTERN_GRID_RADIUS): number[][] {
  const size = radius * 2 + 1
  const g: number[][] = Array.from({ length: size }, () => Array(size).fill(0))
  for (const o of pattern) {
    const xi = o.dx + radius
    const yi = o.dy + radius
    if (xi >= 0 && xi < size && yi >= 0 && yi < size) {
      g[yi]![xi] += 1
    }
  }
  return g
}

export function countGridToPatternOffsets(grid: number[][]): PatternOffset[] {
  const size = grid.length
  if (size === 0) return []
  const radius = (size - 1) / 2
  if (!Number.isInteger(radius)) {
    throw new Error('countGridToPatternOffsets: grid side length must be odd')
  }
  const out: PatternOffset[] = []
  for (let yi = 0; yi < size; yi++) {
    for (let xi = 0; xi < size; xi++) {
      const n = grid[yi]![xi]!
      const dx = xi - radius
      const dy = yi - radius
      for (let i = 0; i < n; i++) {
        out.push({ dx, dy })
      }
    }
  }
  return out
}

export function totalLoadoutPoints(entries: SkillLoadoutEntry[], traits: TraitPoints): number {
  const skillPts = entries.reduce((s, e) => s + entryPointCost(e), 0)
  return skillPts + totalTraitPoints(traits)
}

/** Points this skill may spend (pattern + stacks + mana discount) given level, traits, and other skills. */
export function maxSkillPointsBudget(
  level: number,
  traits: TraitPoints,
  entries: SkillLoadoutEntry[],
  skillId: SkillId,
): number {
  const traitPts = totalTraitPoints(traits)
  const others = entries
    .filter((e) => e.skillId !== skillId)
    .reduce((s, e) => s + entryPointCost(e), 0)
  return Math.max(0, level - traitPts - others)
}

/**
 * Reduces mana discount, then stacks, then pattern until within maxPoints (or at minimum legal).
 * Self-target skills stay a single (0,0) cell.
 */
export function clampSkillLoadoutEntry(
  entry: SkillLoadoutEntry,
  def: SkillDefinition,
  maxPoints: number,
): SkillLoadoutEntry {
  const e: SkillLoadoutEntry = {
    skillId: entry.skillId,
    pattern: [...entry.pattern],
    statusStacks: Math.max(1, Math.floor(entry.statusStacks)),
    manaDiscount: Math.max(0, Math.floor(entry.manaDiscount ?? 0)),
    rangeTier: def.selfTarget ? 0 : Math.max(0, Math.floor(entry.rangeTier ?? 0)),
    aoeTier: def.selfTarget ? 0 : Math.max(0, Math.floor(entry.aoeTier ?? 0)),
  }
  if (def.selfTarget) {
    e.pattern = [{ dx: 0, dy: 0 }]
  }
  function normalizeDiscount() {
    const base = basePowerCost(e)
    e.manaDiscount = Math.min(e.manaDiscount, Math.max(0, base - 1))
  }
  normalizeDiscount()
  if (!def.selfTarget) {
    e.pattern = trimPatternToAoE(e.pattern, def, e)
  }
  while (entryPointCost(e) > maxPoints) {
    if (e.manaDiscount > 0) {
      e.manaDiscount--
      normalizeDiscount()
      continue
    }
    if (e.statusStacks > 1) {
      e.statusStacks--
      normalizeDiscount()
      continue
    }
    if (!def.selfTarget && (e.rangeTier ?? 0) > 0) {
      e.rangeTier = (e.rangeTier ?? 0) - 1
      normalizeDiscount()
      continue
    }
    if (!def.selfTarget && (e.aoeTier ?? 0) > 0) {
      e.aoeTier = (e.aoeTier ?? 0) - 1
      e.pattern = trimPatternToAoE(e.pattern, def, e)
      normalizeDiscount()
      continue
    }
    if (!def.selfTarget && e.pattern.length > 1) {
      e.pattern = e.pattern.slice(0, -1)
      normalizeDiscount()
      continue
    }
    if (def.selfTarget) {
      e.pattern = [{ dx: 0, dy: 0 }]
      normalizeDiscount()
      break
    }
    if (e.pattern.length > 1) {
      e.pattern = e.pattern.slice(0, -1)
      normalizeDiscount()
      continue
    }
    break
  }
  if (e.pattern.length === 0) e.pattern = [{ dx: 0, dy: 0 }]
  if (e.statusStacks < 1) e.statusStacks = 1
  if (def.selfTarget) {
    e.pattern = [{ dx: 0, dy: 0 }]
    e.rangeTier = 0
    e.aoeTier = 0
  }
  normalizeDiscount()
  if (!def.selfTarget) {
    e.pattern = trimPatternToAoE(e.pattern, def, e)
  }
  return e
}

/**
 * When level drops below current spend, trim traits first, then shrink skills until under budget.
 * May leave spend above level if the loadout cannot shrink further (e.g. multiple skills at minimum cost).
 */
export function fitPlayerBudgetToLevel(
  level: number,
  traits: TraitPoints,
  entries: SkillLoadoutEntry[],
): { traits: TraitPoints; entries: SkillLoadoutEntry[] } {
  let t = { ...traits }
  let ent: SkillLoadoutEntry[] = entries.map((e) => ({
    ...e,
    pattern: [...e.pattern],
    statusStacks: e.statusStacks,
    manaDiscount: e.manaDiscount ?? 0,
    rangeTier: e.rangeTier ?? 0,
    aoeTier: e.aoeTier ?? 0,
  }))
  let guard = 0
  while (totalLoadoutPoints(ent, t) > level && guard++ < 500) {
    if (totalTraitPoints(t) > 0) {
      t = shrinkOnePointFromTraits(t)
      continue
    }
    let bestIdx = -1
    let bestCost = -1
    for (let i = 0; i < ent.length; i++) {
      const c = entryPointCost(ent[i]!)
      if (c > bestCost) {
        bestCost = c
        bestIdx = i
      }
    }
    if (bestIdx < 0 || bestCost <= 0) break
    const e = ent[bestIdx]!
    const def = getSkillDef(e.skillId)
    const prevCost = entryPointCost(e)
    const clamped = clampSkillLoadoutEntry(e, def, Math.max(0, prevCost - 1))
    if (entryPointCost(clamped) >= prevCost) break
    ent[bestIdx] = clamped
  }
  return { traits: t, entries: ent }
}

function traitFieldNonNegative(t: TraitPoints): string | null {
  const template = defaultTraitPoints()
  for (const k of Object.keys(template) as (keyof TraitPoints)[]) {
    const v = t[k]
    if (v === undefined || !Number.isInteger(v) || v < 0) {
      return `Trait "${String(k)}" must be a non-negative integer.`
    }
  }
  return null
}

function isSingleCellOriginPattern(pattern: PatternOffset[]): boolean {
  return pattern.length === 1 && pattern[0]!.dx === 0 && pattern[0]!.dy === 0
}

export function validateLoadout(
  level: number,
  entries: SkillLoadoutEntry[],
  maxSkills: number,
  traits: TraitPoints,
): string | null {
  if (entries.length === 0) return 'Select at least one skill.'
  if (entries.length > maxSkills) return `At most ${maxSkills} skills.`
  const ids = new Set<string>()
  for (const e of entries) {
    if (ids.has(e.skillId)) return 'Duplicate skill in loadout.'
    ids.add(e.skillId)
    const def = SKILL_ROSTER.find((s) => s.id === e.skillId)
    if (!def) return 'Unknown skill.'
    if (e.pattern.length === 0) return 'Each skill needs at least one pattern cell.'
    if (e.statusStacks < 1) return 'Status stacks must be at least 1.'
    if (def.selfTarget && !isSingleCellOriginPattern(e.pattern)) {
      return 'Self skills must use a single pattern cell at (0,0).'
    }
    const discount = e.manaDiscount ?? 0
    if (discount < 0 || !Number.isInteger(discount)) return 'Mana discount must be a non-negative integer.'
    const rt = e.rangeTier ?? 0
    if (!Number.isInteger(rt) || rt < 0) return 'Range tier must be a non-negative integer.'
    if (rt > 24) return 'Range tier is too high.'
    if (def.selfTarget && rt !== 0) return 'Self skills cannot use range tiers.'
    const at = e.aoeTier ?? 0
    if (!Number.isInteger(at) || at < 0) return 'AoE tier must be a non-negative integer.'
    if (at > 24) return 'AoE tier is too high.'
    if (def.selfTarget && at !== 0) return 'Self skills cannot use AoE tiers.'
    const base = basePowerCost(e)
    if (discount > base - 1) {
      return 'Mana discount is too high (mana cost must stay at least 1).'
    }
    if (!def.selfTarget) {
      for (const o of e.pattern) {
        if (!offsetWithinAoE(o, def, e)) {
          return 'Pattern cells must stay within your AoE range from the anchor.'
        }
      }
    }
  }
  const traitErr = traitFieldNonNegative(traits)
  if (traitErr) return traitErr
  const total = totalLoadoutPoints(entries, traits)
  if (total > level) {
    return `Total spend is ${total} points (skills + traits) but level is ${level}.`
  }
  return null
}

/** @deprecated Use {@link maxSkillsForLevel} for the cap at a given level. */
export const MAX_SKILLS_IN_LOADOUT = ABSOLUTE_MAX_SKILLS
