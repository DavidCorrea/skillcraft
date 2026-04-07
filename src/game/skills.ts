import type { Coord } from './types'
import type { Element } from './elements'
import type { PatternOffset, SkillId, SkillLoadoutEntry, StatusTag, TraitPoints } from './types'
import { defaultTraitPoints, shrinkOnePointFromTraits, totalTraitPoints } from './traits'
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

/** Loadout roster grouping in Skill craft: mana spells, stamina melee/ranged physical damage, utilities. */
export type SkillLoadoutSection = 'magic' | 'physical' | 'utility'

/** Mana vs stamina; also gates silenced / disarmed. */
export type SkillSchool = 'magic' | 'physical'

export interface SkillDefinition {
  id: SkillId
  name: string
  element: Element
  range: number
  baseDamage: number
  describePattern: string
  school: SkillSchool
  /** Short fantasy blurb in Skill craft */
  flavor: string
  /** Statuses and special outcomes; stack thresholds when the skill gates forms */
  effectsLine: string
  /** elemental = normal defenses; physical = fortitude path; none = mend/ward/purge (anchored like offense; min cast distance 0). */
  damageKind?: 'elemental' | 'physical' | 'none'
  /**
   * Extra Chebyshev radius before AoE tiers (max(|dx|,|dy|) from anchor).
   * Defaults to 0 — at `aoeTier` 0 the pattern is anchor-only unless this is set.
   */
  aoeBase?: number
}

/** Physical offense: anchor must be exactly 1 Manhattan tile away (orthogonal). */
export function isAdjacentPhysicalOffense(def: SkillDefinition): boolean {
  return def.school === 'physical' && def.damageKind === 'physical'
}

export const SKILL_ROSTER: SkillDefinition[] = [
  {
    id: 'strike',
    name: 'Strike',
    element: 'physical',
    range: 1,
    baseDamage: 2,
    describePattern: 'Adjacent single cell',
    school: 'physical',
    flavor: 'Steel, fist, or spur—whatever you bring, it bites at arm’s length.',
    effectsLine:
      'Bleeding on hit (scales with Bleed bonus). Strike Slow, knockback, and lifesteal apply when you invest traits.',
    damageKind: 'physical',
  },
  {
    id: 'ember',
    name: 'Ember',
    element: 'fire',
    range: 4,
    baseDamage: 4,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'A mote of forge-heart heat that clings and chars long after the spark is gone.',
    effectsLine: 'Burning (fire DoT).',
    damageKind: 'elemental',
  },
  {
    id: 'frost_bolt',
    name: 'Frost Bolt',
    element: 'ice',
    range: 4,
    baseDamage: 3,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'Needle-ice that steals warmth and patience alike.',
    effectsLine: 'Chilled; at 2+ stacks, Frozen for one turn instead.',
    damageKind: 'elemental',
  },
  {
    id: 'tide_touch',
    name: 'Tide Touch',
    element: 'water',
    range: 3,
    baseDamage: 3,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'Salt-spray and rising tide—the field grows slick and listening.',
    effectsLine: 'Soaked.',
    damageKind: 'elemental',
  },
  {
    id: 'spark',
    name: 'Spark',
    element: 'electric',
    range: 4,
    baseDamage: 4,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'A snapped ley-line—loud, bright, and impossible to ignore.',
    effectsLine: 'Shocked (extra flat damage taken from hits, capped).',
    damageKind: 'elemental',
  },
  {
    id: 'venom_dart',
    name: 'Venom Dart',
    element: 'poison',
    range: 4,
    baseDamage: 3,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'A barbed sting that works inward, not outward.',
    effectsLine: 'Poisoned (DoT); at 5+ stacks, Regen blocked instead.',
    damageKind: 'elemental',
  },
  {
    id: 'zephyr_cut',
    name: 'Zephyr Cut',
    element: 'wind',
    range: 4,
    baseDamage: 3,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'Wind forged into a razor’s sigh across open air.',
    effectsLine: 'Chilled.',
    damageKind: 'elemental',
  },
  {
    id: 'tremor',
    name: 'Tremor',
    element: 'earth',
    range: 3,
    baseDamage: 4,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'The ground remembers every footfall—and answers in kind.',
    effectsLine: 'Chilled; at 2+ stacks, Frozen for one turn; at 4+ stacks, Rooted instead.',
    damageKind: 'elemental',
  },
  {
    id: 'arcane_pulse',
    name: 'Arcane Pulse',
    element: 'arcane',
    range: 5,
    baseDamage: 3,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'Raw syllables without a thesis—still, they find a nerve.',
    effectsLine: 'Shocked; at 5+ stacks, Silenced instead.',
    damageKind: 'elemental',
  },
  {
    id: 'void_lance',
    name: 'Void Lance',
    element: 'arcane',
    range: 4,
    baseDamage: 4,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'Entropy threaded like a needle—what it sews does not close.',
    effectsLine: 'Poisoned (stronger DoT than Venom Dart).',
    damageKind: 'elemental',
  },
  {
    id: 'mend',
    name: 'Mend',
    element: 'water',
    range: 0,
    baseDamage: 0,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'Tides of vitality poured back into torn flesh and frayed nerve.',
    effectsLine: 'Heals HP per pattern hit (no debuff).',
    damageKind: 'none',
  },
  {
    id: 'ward',
    name: 'Ward',
    element: 'arcane',
    range: 0,
    baseDamage: 0,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'A lattice of will made briefly solid against the next cruel thing.',
    effectsLine: 'Shield (absorbs damage; stacks add to existing shield on the target).',
    damageKind: 'none',
  },
  {
    id: 'purge',
    name: 'Purge',
    element: 'wind',
    range: 0,
    baseDamage: 0,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'A gale that scours curse and taint as if they were dust.',
    effectsLine: 'Removes debuff instances per pattern hit (cleanse).',
    damageKind: 'none',
  },
  {
    id: 'focus',
    name: 'Focus',
    element: 'arcane',
    range: 0,
    baseDamage: 0,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'One breath held—then the next strike remembers your name.',
    effectsLine: 'Skill focus: next offensive skill gains bonus flat damage per damage roll (consumed when you cast it).',
    damageKind: 'none',
  },
  {
    id: 'wardbreak',
    name: 'Wardbreak',
    element: 'fire',
    range: 0,
    baseDamage: 0,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'Heat that unknits barriers instead of bone—precision arsony.',
    effectsLine: 'Strips shield HP per pattern hit (no status).',
    damageKind: 'none',
  },
  {
    id: 'immunize',
    name: 'Immunize',
    element: 'earth',
    range: 0,
    baseDamage: 0,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'Salt and circle; one ill omen turned aside at the threshold.',
    effectsLine: 'Immunized charges (each charge blocks one harmful status application).',
    damageKind: 'none',
  },
  {
    id: 'overclock',
    name: 'Overclock',
    element: 'electric',
    range: 0,
    baseDamage: 0,
    describePattern: 'Custom relative to target',
    school: 'physical',
    flavor: 'Borrow tomorrow’s spark—pay for it in limbs that won’t quite obey.',
    effectsLine: 'Restores mana per pattern hit; applies Slowed for a short duration (same on every target hit).',
    damageKind: 'none',
  },
  {
    id: 'splinter',
    name: 'Splinter',
    element: 'physical',
    range: 1,
    baseDamage: 3,
    describePattern: 'Adjacent chip; bleed emphasis from stacks',
    school: 'physical',
    flavor: 'A cruel nick that keeps weeping when the blade is already gone.',
    effectsLine: 'Bleeding (physical DoT).',
    damageKind: 'physical',
  },
  {
    id: 'cleave',
    name: 'Cleave',
    element: 'physical',
    range: 1,
    baseDamage: 3,
    describePattern: 'Adjacent line of two cells from anchor',
    school: 'physical',
    flavor: 'Iron drawn through two bodies as if they were one cut of meat.',
    effectsLine: 'Chilled (shorter duration than ice magic).',
    damageKind: 'physical',
  },
  {
    id: 'shove',
    name: 'Shove',
    element: 'physical',
    range: 1,
    baseDamage: 2,
    describePattern: 'Adjacent hit; always pushes target one tile',
    school: 'physical',
    flavor: 'Shoulder, shield, or spell—all say the same word: move.',
    effectsLine: 'Damage; knocks the target back one tile; Slowed.',
    damageKind: 'physical',
  },
  {
    id: 'hamstring',
    name: 'Hamstring',
    element: 'physical',
    range: 1,
    baseDamage: 3,
    describePattern: 'Adjacent; applies slowed from stacks',
    school: 'physical',
    flavor: 'Cut the chase short—let them limp through what’s left of the fight.',
    effectsLine: 'Slowed (duration scales with stacks).',
    damageKind: 'physical',
  },
  {
    id: 'rend',
    name: 'Rend',
    element: 'physical',
    range: 1,
    baseDamage: 3,
    describePattern: 'Adjacent; strong bleeding from stacks',
    school: 'physical',
    flavor: 'Teeth and steel agree: open the vein and mean it.',
    effectsLine: 'Bleeding (strong physical DoT).',
    damageKind: 'physical',
  },
  {
    id: 'caustic_cloud',
    name: 'Caustic Cloud',
    element: 'poison',
    range: 3,
    baseDamage: 3,
    describePattern: 'Custom relative to target',
    school: 'magic',
    flavor: 'A cough of green vapor that clings to mail like guilt.',
    effectsLine: 'Poisoned (DoT); at 3+ stacks, Marked instead.',
    damageKind: 'elemental',
  },
]

/** Skill craft sidebar: Magic (elemental), Physical (stamina offense), Utility (no direct cast damage). */
export function skillLoadoutSection(def: SkillDefinition): SkillLoadoutSection {
  if (def.damageKind === 'none') return 'utility'
  if (def.school === 'physical') return 'physical'
  return 'magic'
}

const byId = Object.fromEntries(SKILL_ROSTER.map((s) => [s.id, s])) as Record<
  SkillId,
  SkillDefinition
>

/** Hard ceiling for skill slots (also caps {@link maxSkillsForLevel}). */
export const ABSOLUTE_MAX_SKILLS = 7

/**
 * More skills unlock every few levels; capped at {@link ABSOLUTE_MAX_SKILLS} and roster size.
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

/**
 * Minimum Manhattan distance from caster to anchor.
 * Physical melee offense: exactly adjacent (1). Magic offense: tier 0 ⇒ 1 else 0. Utilities: 0 (self/squad).
 */
export function minCastManhattanForLoadout(def: SkillDefinition, entry: SkillLoadoutEntry): number {
  if (def.damageKind === 'none') return 0
  if (isAdjacentPhysicalOffense(def)) return 1
  const tier = Math.max(0, Math.floor(entry.rangeTier ?? 0))
  return tier === 0 ? 1 : 0
}

/**
 * Max Manhattan distance from caster to anchor. Physical melee offense: 1 only (ignores range tier).
 * Magic: tier + 1 + arcane reach for utilities; tier + 1 for ranged offense.
 * Physical utility (e.g. Overclock): tier + 1 only (no arcane reach).
 */
export function effectiveCastRangeForLoadout(
  def: SkillDefinition,
  entry: SkillLoadoutEntry,
  traits: TraitPoints,
): number {
  if (isAdjacentPhysicalOffense(def)) return 1
  const tier = Math.max(0, Math.floor(entry.rangeTier ?? 0))
  if (def.damageKind === 'none') {
    const arcane = def.school === 'magic' ? Math.floor(traits.arcaneReach / 2) : 0
    return tier + 1 + arcane
  }
  return tier + 1
}

/** Chebyshev radius: each pattern offset must satisfy max(|dx|,|dy|) ≤ this value. Tier 0 = anchor cell only. */
export function effectiveAoERadius(def: SkillDefinition, entry: SkillLoadoutEntry): number {
  const base = def.aoeBase ?? 0
  return base + Math.max(0, Math.floor(entry.aoeTier ?? 0))
}

export function offsetWithinAoE(o: PatternOffset, def: SkillDefinition, entry: SkillLoadoutEntry): boolean {
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

/** Loadout points: power + cost-efficiency points + range tier cost + AoE tier cost. */
export function entryPointCost(entry: SkillLoadoutEntry): number {
  return (
    basePowerCost(entry) +
    entry.costDiscount +
    tierPointCost(entry.rangeTier ?? 0) +
    tierPointCost(entry.aoeTier ?? 0)
  )
}

/**
 * One pattern cell + one status stack (no discount, no tiers) is the minimum kit and does not count
 * toward the level cap — selecting a skill starts here; tuning spends budget.
 */
export const BASELINE_SKILL_LOADOUT_POINT_COST = 2

/** Points from this entry that count against level (above {@link BASELINE_SKILL_LOADOUT_POINT_COST}). */
export function chargeableEntryPointCost(entry: SkillLoadoutEntry): number {
  return Math.max(0, entryPointCost(entry) - BASELINE_SKILL_LOADOUT_POINT_COST)
}

/**
 * Resource (mana or stamina) spent when casting; min 1.
 * Base: pattern cells + status stacks, minus cost discount.
 * Each Manhattan tile from you to the cast anchor adds +1.
 */
export function castResourceCost(
  entry: SkillLoadoutEntry,
  def: SkillDefinition,
  manhattanFromCasterToAnchor = 0,
): number {
  void def
  const raw = basePowerCost(entry) - entry.costDiscount + manhattanFromCasterToAnchor
  return Math.max(1, raw)
}

/** @deprecated Use {@link castResourceCost} with skill definition. */
export function manaCostForCast(entry: SkillLoadoutEntry, manhattanFromCasterToAnchor = 0): number {
  const raw = basePowerCost(entry) - entry.costDiscount + manhattanFromCasterToAnchor
  return Math.max(1, raw)
}

/**
 * Smallest / largest cast cost for this entry at the given Manhattan distance band.
 */
export function castResourceCostRange(
  entry: SkillLoadoutEntry,
  def: SkillDefinition,
  maxRange: number,
  minRange = 0,
): { min: number; max: number } {
  const min = castResourceCost(entry, def, Math.max(0, minRange))
  const max = castResourceCost(entry, def, Math.max(0, maxRange))
  return { min, max }
}

/** @deprecated Prefer {@link castResourceCostRange} with {@link getSkillDef}(entry.skillId). */
export function manaCostCastRange(
  entry: SkillLoadoutEntry,
  maxRange: number,
  minRange = 0,
): { min: number; max: number } {
  return castResourceCostRange(entry, getSkillDef(entry.skillId), maxRange, minRange)
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

/** Flat damage added by each Focus stack (× pattern hits) to the next offensive cast. */
export function focusBonusDamage(statusStacks: number, statusPotency: number): number {
  const p = Math.max(1, statusStacks)
  const pot = Math.max(0, statusPotency)
  return 2 + p + Math.floor(pot / 3)
}

/** Shield HP stripped per Wardbreak stack (× hits on target). */
export function wardbreakShredAmount(statusStacks: number, statusPotency: number): number {
  const p = Math.max(1, statusStacks)
  const pot = Math.max(0, statusPotency)
  return 5 + p * 2 + Math.floor(pot / 2)
}

/** Debuff blocks granted per Immunize stack (× hits). */
export function immunizeChargesFromStacks(statusStacks: number): number {
  return Math.max(1, statusStacks)
}

/** Mana restored per Overclock stack (× hits). */
export function overclockManaRestore(statusStacks: number, statusPotency: number): number {
  const p = Math.max(1, statusStacks)
  const pot = Math.max(0, statusPotency)
  return 3 + p * 2 + Math.floor(pot / 2)
}

/** Slow duration after Overclock (not multiplied by pattern hits). */
export function overclockSlowDuration(statusStacks: number): number {
  return Math.max(1, Math.floor(statusStacks / 2) + 1)
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
    case 'strike':
      throw new Error('Strike bleed/slow handled in engine.')
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
    case 'focus':
    case 'wardbreak':
    case 'immunize':
    case 'overclock':
      throw new Error(`${skillId} has no tile/offensive status — handled in engine.`)
    case 'splinter':
      return { t: 'bleeding', duration: 2 + p + pd, dot: 2 + Math.floor(p / 2) + pd }
    case 'cleave':
      return { t: 'chilled', duration: 1 + Math.floor(p / 3) }
    case 'shove':
      return { t: 'slowed', duration: 1 }
    case 'hamstring':
      return { t: 'slowed', duration: 2 + p + Math.floor(pot / 4) }
    case 'rend':
      return { t: 'bleeding', duration: 3 + p + pd, dot: 2 + p + Math.floor(pot / 2) }
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
  const skillChargeable = entries.reduce((s, e) => s + chargeableEntryPointCost(e), 0)
  return skillChargeable + totalTraitPoints(traits)
}

/** Max {@link entryPointCost} for this skill given level, traits, and other skills’ chargeable spend. */
export function maxSkillPointsBudget(
  level: number,
  traits: TraitPoints,
  entries: SkillLoadoutEntry[],
  skillId: SkillId,
): number {
  const traitPts = totalTraitPoints(traits)
  const othersChargeable = entries
    .filter((e) => e.skillId !== skillId)
    .reduce((s, e) => s + chargeableEntryPointCost(e), 0)
  const pool = level - traitPts - othersChargeable
  return BASELINE_SKILL_LOADOUT_POINT_COST + Math.max(0, pool)
}

/**
 * Reduces mana discount, then stacks, then pattern until within maxPoints (or at minimum legal).
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
    costDiscount: Math.max(0, Math.floor(entry.costDiscount ?? 0)),
    rangeTier: Math.max(0, Math.floor(entry.rangeTier ?? 0)),
    aoeTier: Math.max(0, Math.floor(entry.aoeTier ?? 0)),
  }
  function normalizeDiscount() {
    const base = basePowerCost(e)
    e.costDiscount = Math.min(e.costDiscount, Math.max(0, base - 1))
  }
  normalizeDiscount()
  e.pattern = trimPatternToAoE(e.pattern, def, e)
  while (entryPointCost(e) > maxPoints) {
    if (e.costDiscount > 0) {
      e.costDiscount--
      normalizeDiscount()
      continue
    }
    if (e.statusStacks > 1) {
      e.statusStacks--
      normalizeDiscount()
      continue
    }
    if ((e.rangeTier ?? 0) > 0) {
      e.rangeTier = (e.rangeTier ?? 0) - 1
      normalizeDiscount()
      continue
    }
    if ((e.aoeTier ?? 0) > 0) {
      e.aoeTier = (e.aoeTier ?? 0) - 1
      e.pattern = trimPatternToAoE(e.pattern, def, e)
      normalizeDiscount()
      continue
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
  normalizeDiscount()
  e.pattern = trimPatternToAoE(e.pattern, def, e)
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
    costDiscount: e.costDiscount ?? 0,
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
    const discount = e.costDiscount ?? 0
    if (discount < 0 || !Number.isInteger(discount)) return 'Cost discount must be a non-negative integer.'
    const rt = e.rangeTier ?? 0
    if (!Number.isInteger(rt) || rt < 0) return 'Range tier must be a non-negative integer.'
    if (rt > 24) return 'Range tier is too high.'
    const at = e.aoeTier ?? 0
    if (!Number.isInteger(at) || at < 0) return 'AoE tier must be a non-negative integer.'
    if (at > 24) return 'AoE tier is too high.'
    const base = basePowerCost(e)
    if (discount > base - 1) {
      return 'Cost discount is too high (cast cost must stay at least 1).'
    }
    if (isAdjacentPhysicalOffense(def) && (e.rangeTier ?? 0) > 0) {
      return 'Adjacent physical skills cannot use cast range tier.'
    }
    for (const o of e.pattern) {
      if (!offsetWithinAoE(o, def, e)) {
        return 'Pattern cells must stay within your AoE range from the anchor.'
      }
    }
  }
  const traitErr = traitFieldNonNegative(traits)
  if (traitErr) return traitErr
  const total = totalLoadoutPoints(entries, traits)
  if (total > level) {
    return `Budget spend is ${total} points (traits + skill tuning above the free baseline) but level is ${level}.`
  }
  return null
}

/** @deprecated Use {@link maxSkillsForLevel} for the cap at a given level. */
export const MAX_SKILLS_IN_LOADOUT = ABSOLUTE_MAX_SKILLS
