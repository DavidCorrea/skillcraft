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
  return `Less ${element} skill damage per point (min 1).`
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
        description: 'Extra damage on each hit of physical damage skills (before tempo, rhythm, mitigations).',
      },
      {
        key: 'bleedBonus',
        short: 'BLD',
        label: 'Bleed bonus',
        description: 'Stronger bleed DoT and duration on each physical damage hit.',
      },
      {
        key: 'physicalLifesteal',
        short: 'LS',
        label: 'Physical lifesteal',
        description: 'Heal this much HP after a physical damage cast that hits (1 point = 1 HP).',
      },
      {
        key: 'physicalKnockback',
        short: 'KB',
        label: 'Physical knockback',
        description: 'At ≥1: physical hits (not Shove) push one tile if that cell is free.',
      },
      {
        key: 'physicalSlow',
        short: 'SLW',
        label: 'Physical slow',
        description: 'At ≥1: physical damage hits apply slow; duration scales with points.',
      },
      {
        key: 'physicalTempo',
        short: 'TMP',
        label: 'Physical tempo',
        description: 'Bonus physical skill damage per point if you moved ≤1 tile this turn.',
      },
      {
        key: 'physicalRhythm',
        short: 'RHY',
        label: 'Physical rhythm',
        description: 'Bonus on every 2nd consecutive physical offense; move or magic breaks the chain.',
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
        key: 'fortitude',
        short: 'FOR',
        label: 'Fortitude',
        description: 'Less physical damage per point (toughness and armor combined).',
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
