import type { Element } from './elements'
import type { StatusTag, TraitPoints } from './types'

/** Max stamina pool scales with agility (movement and physical skills draw from this pool). */
export const STAMINA_BASE_MAX = 8
export const STAMINA_MAX_PER_AGILITY = 2
export const STAMINA_MOVE_COST_PER_TILE = 1
export const STAMINA_REGEN_PER_TURN = 3

export function maxStaminaForTraits(t: TraitPoints): number {
  return STAMINA_BASE_MAX + t.agility * STAMINA_MAX_PER_AGILITY
}

/** Extra max mana from high loadout tiers (decoupled curve on top of `level + wisdom`). */
export function bonusMaxManaFromBattleLevel(level: number): number {
  const L = Math.max(1, Math.floor(level))
  if (L >= 50) return 5
  if (L >= 25) return 2
  return 0
}

/** Extra max stamina pool at the same bands as {@link bonusMaxManaFromBattleLevel}. */
export function bonusMaxStaminaFromBattleLevel(level: number): number {
  const L = Math.max(1, Math.floor(level))
  if (L >= 50) return 2
  if (L >= 25) return 1
  return 0
}

/** Extra stamina regen per turn start at the same bands (parallel to mana fantasy). */
export function bonusStaminaRegenFromBattleLevel(level: number): number {
  const L = Math.max(1, Math.floor(level))
  if (L >= 25) return 1
  return 0
}

/** CPU PvE scaling: fixed 7-point skill budget; rest into mobility/survival. */
export function cpuTraitsForLevel(level: number): TraitPoints {
  const t = defaultTraitPoints()
  let budget = Math.max(0, level - 7)
  const ag = Math.min(4, Math.floor(budget / 3))
  t.agility = ag
  budget -= ag
  const iq = Math.min(4, Math.floor(budget / 2))
  t.intelligence = iq
  budget -= iq
  t.vitality = Math.min(6, budget)
  return t
}

export function defaultTraitPoints(): TraitPoints {
  return {
    agility: 0,
    intelligence: 0,
    strength: 0,
    bleedBonus: 0,
    physicalLifesteal: 0,
    physicalKnockback: 0,
    physicalSlow: 0,
    physicalTempo: 0,
    physicalRhythm: 0,
    vitality: 0,
    wisdom: 0,
    regeneration: 0,
    tenacity: 0,
    arcaneReach: 0,
    fortitude: 0,
    defenseFire: 0,
    defenseIce: 0,
    defenseWater: 0,
    defenseElectric: 0,
    defensePoison: 0,
    defenseWind: 0,
    defenseEarth: 0,
    defenseArcane: 0,
    spellFocus: 0,
    statusPotency: 0,
  }
}

export function totalTraitPoints(t: TraitPoints): number {
  let s = 0
  for (const v of Object.values(t)) {
    s += v
  }
  return s
}

/** Subtract one point from the first trait that has points (stable key order). */
export function shrinkOnePointFromTraits(traits: TraitPoints): TraitPoints {
  const t = { ...traits }
  for (const k of Object.keys(defaultTraitPoints()) as (keyof TraitPoints)[]) {
    if (t[k] > 0) {
      t[k]--
      return t
    }
  }
  return t
}

export function defenseForElement(traits: TraitPoints, el: Element): number {
  switch (el) {
    case 'fire':
      return traits.defenseFire
    case 'ice':
      return traits.defenseIce
    case 'water':
      return traits.defenseWater
    case 'electric':
      return traits.defenseElectric
    case 'poison':
      return traits.defensePoison
    case 'wind':
      return traits.defenseWind
    case 'earth':
      return traits.defenseEarth
    case 'arcane':
      return traits.defenseArcane
    case 'physical':
      return 0
  }
}

/** Reduces elemental skill damage; minimum 1 after mitigation. */
export function damageAfterElementalDefense(raw: number, defender: TraitPoints, element: Element): number {
  return Math.max(1, raw - defenseForElement(defender, element))
}

/** Elemental skill damage after defense and attacker spell focus. */
export function elementalSkillDamageDealt(
  raw: number,
  defender: TraitPoints,
  element: Element,
  attackerSpellFocus: number,
): number {
  const f = Math.max(0, attackerSpellFocus)
  return Math.max(1, raw - defenseForElement(defender, element) + f)
}

/** Physical damage after fortitude (minimum 1). */
export function physicalDamageDealt(raw: number, defender: TraitPoints): number {
  return Math.max(1, raw - defender.fortitude)
}

/** Base skill range + bonus from Arcane reach trait. */
export function effectiveSkillRange(baseRange: number, traits: TraitPoints): number {
  return baseRange + Math.floor(traits.arcaneReach / 2)
}

/** Same as {@link physicalDamageDealt}; name kept where the attack is explicitly Strike. */
export function physicalStrikeDamageDealt(raw: number, defenderTraits: TraitPoints): number {
  return physicalDamageDealt(raw, defenderTraits)
}

/** Max HP before vitality bonus. */
export const BASE_MAX_HP = 80

/** Each vitality point adds this much max HP. */
export const HP_PER_VITALITY = 4

/** Max mana = level + wisdom * this. */
export const MANA_PER_WISDOM = 1

export const STRIKE_BASE_DAMAGE = 2
export const DAMAGE_PER_STRENGTH = 2

/** Per-hit damage for the **Strike** skill before tempo/rhythm (STRIKE_BASE_DAMAGE + Strength scaling). */
export function strikeDamage(strength: number): number {
  return Math.max(1, STRIKE_BASE_DAMAGE + strength * DAMAGE_PER_STRENGTH)
}

/**
 * Raw damage for one pattern hit of a physical damage skill (Strike, Splinter, Cleave, …).
 * Uses the skill’s base damage, Strength, physical tempo (≤1 tile moved this turn), and physical rhythm
 * (2nd / 4th … physical offense hit without a move or magic cast in between).
 */
export function physicalOffenseDamagePerHit(
  skillBaseDamage: number,
  traits: TraitPoints,
  tilesMovedThisTurn: number,
  physicalStreakBefore: number,
): number {
  let n = Math.max(1, skillBaseDamage + traits.strength * DAMAGE_PER_STRENGTH)
  if (tilesMovedThisTurn <= 1) n += traits.physicalTempo
  const nextStreak = physicalStreakBefore + 1
  if (nextStreak >= 2 && nextStreak % 2 === 0) n += traits.physicalRhythm
  return Math.max(1, n)
}

/**
 * Physical offense damage before fortitude: Strength applies once per target per cast; tempo/rhythm still scale per hit.
 */
export function physicalOffenseRawTotalBeforeFortitude(
  skillBaseDamage: number,
  traits: TraitPoints,
  tilesMovedThisTurn: number,
  physicalStreakBefore: number,
  hitsOnTarget: number,
): number {
  const h = Math.max(0, hitsOnTarget)
  let perHitBonus = 0
  if (tilesMovedThisTurn <= 1) perHitBonus += traits.physicalTempo
  const nextStreak = physicalStreakBefore + 1
  if (nextStreak >= 2 && nextStreak % 2 === 0) perHitBonus += traits.physicalRhythm
  const perHit = Math.max(1, skillBaseDamage + perHitBonus)
  const strengthOnce = traits.strength * DAMAGE_PER_STRENGTH
  return perHit * h + strengthOnce
}

/** One hit of residual tile damage from a physical skill — Strength only (no tempo / rhythm). */
export function physicalLingeringHitRaw(skillBaseDamage: number, traits: TraitPoints): number {
  return Math.max(1, skillBaseDamage + traits.strength * DAMAGE_PER_STRENGTH)
}

/**
 * Total damage for one hit of the **Strike** skill (STRIKE_BASE_DAMAGE) before defender fortitude mitigation.
 * `physicalStreakBefore` is the attacker’s streak before this hit lands.
 */
export function totalStrikeDamage(
  traits: TraitPoints,
  tilesMovedThisTurn: number,
  physicalStreakBefore: number,
): number {
  return physicalOffenseDamagePerHit(STRIKE_BASE_DAMAGE, traits, tilesMovedThisTurn, physicalStreakBefore)
}

/** Bleeding from physical damage hits; scales with bleed bonus and attacker status potency. */
export function buildBleedingTag(bleedBonus: number, statusPotency = 0): StatusTag {
  const b = Math.max(0, bleedBonus)
  const p = Math.max(0, statusPotency)
  return {
    t: 'bleeding',
    duration: 2 + Math.floor(b / 2) + Math.floor(p / 3),
    dot: 1 + b + Math.floor(p / 2),
  }
}

/** Slow from physical slow trait; only meaningful if trait points ≥ 1. */
export function buildSlowTag(slowTraitPoints: number): StatusTag {
  const s = Math.max(1, slowTraitPoints)
  return { t: 'slowed', duration: 1 + s }
}
