import type { TraitPoints } from './types'
import { HP_PER_VITALITY, MANA_PER_WISDOM } from './traits'

export type TraitKey = keyof TraitPoints

export type TraitRefEntry = {
  key: TraitKey
  short: string
  label: string
  description: string
}

/** One line for elemental resist traits (label names the element). */
function resistVsSkills(element: string): string {
  return `Less ${element} skill damage per point (min 1). Not vs Strikes.`
}

/** Static guide copy for loadout traits — mirrors `TraitPoints` / loadout UI. */
export const traitReferenceZones: { title: string; traits: TraitRefEntry[] }[] = [
  {
    title: 'Offense',
    traits: [
      {
        key: 'arcaneReach',
        short: 'ARC',
        label: 'Arcane reach',
        description: '+1 skill cast range per 2 points.',
      },
      {
        key: 'spellFocus',
        short: 'FOC',
        label: 'Spell focus',
        description: 'Bonus elemental skill damage after the target’s resist (per hit).',
      },
      {
        key: 'statusPotency',
        short: 'STA',
        label: 'Status potency',
        description: 'Stronger DoTs, shock, and status durations from your skills.',
      },
      {
        key: 'strength',
        short: 'STR',
        label: 'Strength',
        description: 'Strike base damage (before tempo, rhythm, and defender mitigations).',
      },
      {
        key: 'bleedBonus',
        short: 'BLD',
        label: 'Bleed bonus',
        description: 'Stronger bleed DoT and duration on Strike.',
      },
      {
        key: 'meleeLifesteal',
        short: 'LS',
        label: 'Melee lifesteal',
        description: 'Heal this much HP per Strike (1 point = 1 HP).',
      },
      {
        key: 'strikeKnockback',
        short: 'KB',
        label: 'Strike knockback',
        description: 'At ≥1: Strike pushes one tile if that cell is free.',
      },
      {
        key: 'strikeSlow',
        short: 'SLW',
        label: 'Strike slow',
        description: 'At ≥1: Strike applies slow; duration scales with points.',
      },
      {
        key: 'strikeTempo',
        short: 'TMP',
        label: 'Strike tempo',
        description: 'Bonus Strike damage per point if you moved ≤1 tile this turn.',
      },
      {
        key: 'strikeRhythm',
        short: 'RHY',
        label: 'Strike rhythm',
        description: 'Bonus on every 2nd consecutive Strike; move or magic breaks the chain.',
      },
    ],
  },
  {
    title: 'Defense',
    traits: [
      {
        key: 'vitality',
        short: 'VIT',
        label: 'Vitality',
        description: `+${HP_PER_VITALITY} max HP per point.`,
      },
      {
        key: 'regeneration',
        short: 'REG',
        label: 'Regeneration',
        description: 'Heal this much HP at the start of each of your turns.',
      },
      {
        key: 'tenacity',
        short: 'TEN',
        label: 'Tenacity',
        description: 'Subtract from each burn, poison, and bleed tick.',
      },
      {
        key: 'meleeDuelReduction',
        short: 'DRL',
        label: 'Melee duel reduction',
        description: 'Less damage from adjacent attackers (before fortitude and armor).',
      },
      {
        key: 'fortitude',
        short: 'FOR',
        label: 'Fortitude',
        description: 'Less from Strikes and physical skills, after duel reduction.',
      },
      {
        key: 'physicalArmor',
        short: 'ARM',
        label: 'Physical armor',
        description: 'Less after fortitude (Strikes and physical skills).',
      },
      {
        key: 'defenseFire',
        short: 'Fi',
        label: 'Fire',
        description: resistVsSkills('Fire'),
      },
      {
        key: 'defenseIce',
        short: 'Ic',
        label: 'Ice',
        description: resistVsSkills('Ice'),
      },
      {
        key: 'defenseWater',
        short: 'Wa',
        label: 'Water',
        description: resistVsSkills('Water'),
      },
      {
        key: 'defenseElectric',
        short: 'El',
        label: 'Electric',
        description: resistVsSkills('Electric'),
      },
      {
        key: 'defensePoison',
        short: 'Po',
        label: 'Poison',
        description: resistVsSkills('Poison'),
      },
      {
        key: 'defenseWind',
        short: 'Wi',
        label: 'Wind',
        description: resistVsSkills('Wind'),
      },
      {
        key: 'defenseEarth',
        short: 'Ea',
        label: 'Earth',
        description: resistVsSkills('Earth'),
      },
      {
        key: 'defenseArcane',
        short: 'Ar',
        label: 'Arcane',
        description: resistVsSkills('Arcane'),
      },
    ],
  },
  {
    title: 'Utility',
    traits: [
      {
        key: 'agility',
        short: 'AGI',
        label: 'Agility',
        description: '+1 move step per Move action; more max stamina.',
      },
      {
        key: 'intelligence',
        short: 'INT',
        label: 'Intelligence',
        description: '+1 mana at turn start per point (on top of +1/turn base).',
      },
      {
        key: 'wisdom',
        short: 'WIS',
        label: 'Wisdom',
        description: `+${MANA_PER_WISDOM} max mana per point beyond your level.`,
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
