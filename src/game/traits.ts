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
    meleeLifesteal: 0,
    strikeKnockback: 0,
    strikeSlow: 0,
    meleeDuelReduction: 0,
    strikeTempo: 0,
    strikeRhythm: 0,
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
    physicalArmor: 0,
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

/**
 * Physical skill damage (Splinter): adjacent duel, fortitude, physical armor. Not vs elemental defense.
 */
export function physicalSkillDamageDealt(
  raw: number,
  defender: TraitPoints,
  attackerAdjacent: boolean,
): number {
  let n = raw
  if (attackerAdjacent) {
    n = Math.max(1, n - defender.meleeDuelReduction)
  }
  n = Math.max(1, n - defender.fortitude - defender.physicalArmor)
  return n
}

/** Base skill range + bonus from Arcane reach trait. */
export function effectiveSkillRange(baseRange: number, traits: TraitPoints): number {
  return baseRange + Math.floor(traits.arcaneReach / 2)
}

/** Strike is always adjacent: duel reduction then fortitude then physical armor. */
export function physicalStrikeDamageDealt(raw: number, defenderTraits: TraitPoints): number {
  let n = raw
  n = Math.max(1, n - defenderTraits.meleeDuelReduction)
  n = Math.max(1, n - defenderTraits.fortitude - defenderTraits.physicalArmor)
  return n
}

/** Max HP before vitality bonus. */
export const BASE_MAX_HP = 80

/** Each vitality point adds this much max HP. */
export const HP_PER_VITALITY = 4

/** Max mana = level + wisdom * this. */
export const MANA_PER_WISDOM = 1

export const STRIKE_BASE_DAMAGE = 2
export const DAMAGE_PER_STRENGTH = 2

export function strikeDamage(strength: number): number {
  return Math.max(1, STRIKE_BASE_DAMAGE + strength * DAMAGE_PER_STRENGTH)
}

/**
 * Total physical Strike damage before adjacent duel reduction and fortitude.
 * `physicalStreakBefore` is the attacker's streak before this Strike lands.
 */
export function totalStrikeDamage(
  traits: TraitPoints,
  tilesMovedThisTurn: number,
  physicalStreakBefore: number,
): number {
  const base = strikeDamage(traits.strength)
  let bonus = 0
  if (tilesMovedThisTurn <= 1) bonus += traits.strikeTempo
  const nextStreak = physicalStreakBefore + 1
  if (nextStreak >= 2 && nextStreak % 2 === 0) bonus += traits.strikeRhythm
  return Math.max(1, base + bonus)
}

/** Physical bleed from melee; scales with bleedBonus trait and attacker status potency. */
export function buildBleedingTag(bleedBonus: number, statusPotency = 0): StatusTag {
  const b = Math.max(0, bleedBonus)
  const p = Math.max(0, statusPotency)
  return {
    t: 'bleeding',
    duration: 2 + Math.floor(b / 2) + Math.floor(p / 3),
    dot: 1 + b + Math.floor(p / 2),
  }
}

/** Slow from Strike; only meaningful if strikeSlow ≥ 1. */
export function buildSlowTag(strikeSlow: number): StatusTag {
  const s = Math.max(1, strikeSlow)
  return { t: 'slowed', duration: 1 + s }
}
