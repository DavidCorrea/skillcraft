import type { TraitPoints } from './types'
import { HP_PER_VITALITY, MANA_PER_WISDOM } from './traits'

export type TraitKey = keyof TraitPoints

export type TraitRefEntry = {
  key: TraitKey
  short: string
  label: string
  description: string
}

/** Static guide copy for loadout traits — mirrors `TraitPoints` / loadout UI. */
export const traitReferenceZones: { title: string; traits: TraitRefEntry[] }[] = [
  {
    title: 'Core',
    traits: [
      {
        key: 'agility',
        short: 'AGI',
        label: 'Agility',
        description:
          '+1 orthogonal move step per point per Move action (base is 1 step). Also increases max stamina.',
      },
      {
        key: 'intelligence',
        short: 'INT',
        label: 'Intelligence',
        description:
          '+1 mana recovered at the start of each of your turns per point (on top of the base +1/turn).',
      },
      {
        key: 'vitality',
        short: 'VIT',
        label: 'Vitality',
        description: `+${HP_PER_VITALITY} max HP per point.`,
      },
      {
        key: 'wisdom',
        short: 'WIS',
        label: 'Wisdom',
        description: `+${MANA_PER_WISDOM} max mana per point beyond your level.`,
      },
      {
        key: 'regeneration',
        short: 'REG',
        label: 'Regeneration',
        description: 'Heal this many HP at the start of each of your turns.',
      },
      {
        key: 'tenacity',
        short: 'TEN',
        label: 'Tenacity',
        description: 'Subtract this from each DoT tick you take (burn, poison, bleed).',
      },
      {
        key: 'arcaneReach',
        short: 'ARC',
        label: 'Arcane reach',
        description: '+1 base skill cast range per 2 points (see effective range on skills).',
      },
      {
        key: 'spellFocus',
        short: 'FOC',
        label: 'Spell focus',
        description:
          'Bonus damage on your elemental skills after the target’s matching elemental defense (per hit).',
      },
      {
        key: 'statusPotency',
        short: 'STA',
        label: 'Status potency',
        description: 'Stronger DoTs, shock vulnerability, and status durations from skills you apply.',
      },
    ],
  },
  {
    title: 'Melee',
    traits: [
      {
        key: 'strength',
        short: 'STR',
        label: 'Strength',
        description: 'Scales melee Strike base damage (before tempo, rhythm, and defender mitigations).',
      },
      {
        key: 'bleedBonus',
        short: 'BLD',
        label: 'Bleed bonus',
        description: 'Stronger bleeding DoT and duration from Strikes that apply bleed.',
      },
      {
        key: 'meleeLifesteal',
        short: 'LS',
        label: 'Melee lifesteal',
        description: 'Heal this much HP on each successful Strike (1 point = 1 HP).',
      },
      {
        key: 'strikeKnockback',
        short: 'KB',
        label: 'Strike knockback',
        description: 'If at least 1, Strike pushes the enemy one orthogonal tile when that cell is free.',
      },
      {
        key: 'strikeSlow',
        short: 'SLW',
        label: 'Strike slow',
        description: 'If at least 1, Strike applies slowed; duration scales with points.',
      },
      {
        key: 'meleeDuelReduction',
        short: 'DRL',
        label: 'Melee duel reduction',
        description:
          'Flat damage reduction when an attacker in an adjacent cell hits you (before fortitude/armor).',
      },
      {
        key: 'fortitude',
        short: 'FOR',
        label: 'Fortitude',
        description: 'Flat reduction to damage from enemy Strikes, after duel reduction.',
      },
      {
        key: 'physicalArmor',
        short: 'ARM',
        label: 'Physical armor',
        description: 'Extra flat reduction vs Strikes and physical skills, after fortitude.',
      },
      {
        key: 'strikeTempo',
        short: 'TMP',
        label: 'Strike tempo',
        description: 'Bonus Strike damage per point if you moved at most 1 tile this turn.',
      },
      {
        key: 'strikeRhythm',
        short: 'RHY',
        label: 'Strike rhythm',
        description:
          'Bonus damage on every 2nd consecutive Strike in a chain (moving or casting breaks the chain).',
      },
    ],
  },
  {
    title: 'Defenses',
    traits: [
      {
        key: 'defenseFire',
        short: 'Fi',
        label: 'Fire',
        description:
          'Per point: reduce damage from Fire-element skills (not Strikes). Damage is still at least 1 after mitigation.',
      },
      {
        key: 'defenseIce',
        short: 'Ic',
        label: 'Ice',
        description:
          'Per point: reduce damage from Ice-element skills (not Strikes). Damage is still at least 1 after mitigation.',
      },
      {
        key: 'defenseWater',
        short: 'Wa',
        label: 'Water',
        description:
          'Per point: reduce damage from Water-element skills (not Strikes). Damage is still at least 1 after mitigation.',
      },
      {
        key: 'defenseElectric',
        short: 'El',
        label: 'Electric',
        description:
          'Per point: reduce damage from Electric-element skills (not Strikes). Damage is still at least 1 after mitigation.',
      },
      {
        key: 'defensePoison',
        short: 'Po',
        label: 'Poison',
        description:
          'Per point: reduce damage from Poison-element skills (not Strikes). Damage is still at least 1 after mitigation.',
      },
      {
        key: 'defenseWind',
        short: 'Wi',
        label: 'Wind',
        description:
          'Per point: reduce damage from Wind-element skills (not Strikes). Damage is still at least 1 after mitigation.',
      },
      {
        key: 'defenseEarth',
        short: 'Ea',
        label: 'Earth',
        description:
          'Per point: reduce damage from Earth-element skills (not Strikes). Damage is still at least 1 after mitigation.',
      },
      {
        key: 'defenseArcane',
        short: 'Ar',
        label: 'Arcane',
        description:
          'Per point: reduce damage from Arcane-element skills (not Strikes). Damage is still at least 1 after mitigation.',
      },
    ],
  },
]

const _display: Partial<Record<TraitKey, { label: string; short: string }>> = {}
for (const z of traitReferenceZones) {
  for (const t of z.traits) {
    _display[t.key] = { label: t.label, short: t.short }
  }
}

/** Loadout rail labels: full name (abbreviation). */
export const traitDisplayByKey = _display as Record<TraitKey, { label: string; short: string }>
