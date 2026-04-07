import type { TraitPoints } from '../../game/types'
import {
  BASE_MAX_HP,
  buildBleedingTag,
  buildSlowTag,
  DAMAGE_PER_STRENGTH,
  HP_PER_VITALITY,
  MANA_PER_WISDOM,
  maxStaminaForTraits,
  STRIKE_BASE_DAMAGE,
  STAMINA_BASE_MAX,
  STAMINA_MAX_PER_AGILITY,
  STAMINA_REGEN_PER_TURN,
  strikeDamage,
  totalStrikeDamage,
} from '../../game/traits'

export type DerivedBattleStatRow = {
  label: string
  value: string
  /** How spending trait points moves this number (static copy). */
  perPoint: string | null
}

export type DerivedBattleStatGroup = {
  title: string
  rows: DerivedBattleStatRow[]
}

/** Row label names the element. */
const ELEM_RESIST_LEGEND = '+1/pt vs matching skills; min 1; not Strikes'

/**
 * Battle-facing numbers derived from loadout traits, for the traits dock.
 * Each row includes static “per point” guidance tied to trait names.
 */
export function deriveLoadoutBattleStats(traits: TraitPoints, level: number): DerivedBattleStatGroup[] {
  const moveSteps = 1 + traits.agility
  const maxStamina = maxStaminaForTraits(traits)
  const manaRegen = 1 + traits.intelligence
  const maxHp = BASE_MAX_HP + traits.vitality * HP_PER_VITALITY
  const maxMana = level + traits.wisdom * MANA_PER_WISDOM
  const strikeBase = strikeDamage(traits.strength)
  const strikeTempo = totalStrikeDamage(traits, 0, 0)
  const strikeRhythm2 = totalStrikeDamage(traits, 0, 1)
  const reachBonus = Math.floor(traits.arcaneReach / 2)
  const bleedTag = buildBleedingTag(traits.bleedBonus, traits.statusPotency)
  const bleedLine =
    bleedTag.t === 'bleeding' ? `${bleedTag.dot} / ${bleedTag.duration}t` : '—'
  const slowTag = traits.strikeSlow >= 1 ? buildSlowTag(traits.strikeSlow) : null
  const slowLine = slowTag?.t === 'slowed' ? `${slowTag.duration}t` : '—'

  return [
    {
      title: 'Movement & stamina',
      rows: [
        {
          label: 'Steps per Move',
          value: String(moveSteps),
          perPoint: '+1 per Agility',
        },
        {
          label: 'Max stamina',
          value: String(maxStamina),
          perPoint: `+${STAMINA_MAX_PER_AGILITY} per Agility (base ${STAMINA_BASE_MAX})`,
        },
        {
          label: 'Stamina / turn start',
          value: String(STAMINA_REGEN_PER_TURN),
          perPoint: null,
        },
      ],
    },
    {
      title: 'Mana & HP',
      rows: [
        {
          label: 'Mana / turn start',
          value: `+${manaRegen}`,
          perPoint: '+1/turn per Intelligence (+1 base)',
        },
        {
          label: 'Max mana',
          value: String(maxMana),
          perPoint: `+${MANA_PER_WISDOM}/Wisdom (beyond level ${level})`,
        },
        {
          label: 'Max HP',
          value: String(maxHp),
          perPoint: `+${HP_PER_VITALITY}/Vitality (base ${BASE_MAX_HP})`,
        },
      ],
    },
    {
      title: 'Turn sustain',
      rows: [
        {
          label: 'Regen / your turn',
          value: String(traits.regeneration),
          perPoint: '+1 HP/turn per Regeneration',
        },
        {
          label: 'Tenacity (DoT ticks)',
          value: String(traits.tenacity),
          perPoint: '−1 DoT tick damage per Tenacity (burn/poison/bleed)',
        },
      ],
    },
    {
      title: 'Strike damage (before their mitigations)',
      rows: [
        {
          label: 'Base (Strength)',
          value: String(strikeBase),
          perPoint: `+${DAMAGE_PER_STRENGTH}/Strength (base ${STRIKE_BASE_DAMAGE})`,
        },
        {
          label: 'With tempo (≤1 tile moved)',
          value: String(strikeTempo),
          perPoint: '+1/Strike tempo when ≤1 tile moved',
        },
        {
          label: '2nd-chain hit (rhythm)',
          value: String(strikeRhythm2),
          perPoint: '+1/Strike rhythm on 2nd, 4th… physical hit',
        },
      ],
    },
    {
      title: 'Strike on-hit',
      rows: [
        {
          label: 'Bleed DoT / duration',
          value: bleedLine,
          perPoint: 'Bleed bonus + Status potency',
        },
        {
          label: 'Slowed duration',
          value: slowLine,
          perPoint: traits.strikeSlow >= 1 ? '+1 turn duration per Strike slow' : '≥1 Strike slow to apply',
        },
        {
          label: 'Knockback',
          value: traits.strikeKnockback >= 1 ? 'On' : 'Off',
          perPoint: '≥1 Strike knockback',
        },
        {
          label: 'Lifesteal / Strike',
          value: String(traits.meleeLifesteal),
          perPoint: '+1 HP/Strike per Melee lifesteal',
        },
      ],
    },
    {
      title: 'Skills (casters)',
      rows: [
        {
          label: 'Bonus skill range',
          value: reachBonus === 0 ? '0' : `+${reachBonus}`,
          perPoint: '+1 range per 2 Arcane reach',
        },
        {
          label: 'Spell focus',
          value: String(traits.spellFocus),
          perPoint: '+1 skill damage/hit per point (after resist)',
        },
        {
          label: 'Status potency',
          value: String(traits.statusPotency),
          perPoint: 'Stronger skill DoTs, shock, durations',
        },
      ],
    },
    {
      title: 'Physical mitigation',
      rows: [
        {
          label: 'Melee duel reduction',
          value: String(traits.meleeDuelReduction),
          perPoint: '+1 vs adjacent hits per point',
        },
        {
          label: 'Fortitude',
          value: String(traits.fortitude),
          perPoint: '+1 vs Strike & physical skill after duel',
        },
        {
          label: 'Physical armor',
          value: String(traits.physicalArmor),
          perPoint: '+1 after Fortitude per point',
        },
      ],
    },
    {
      title: 'Element resists (skills only)',
      rows: [
        { label: 'Fire', value: String(traits.defenseFire), perPoint: ELEM_RESIST_LEGEND },
        { label: 'Ice', value: String(traits.defenseIce), perPoint: ELEM_RESIST_LEGEND },
        { label: 'Water', value: String(traits.defenseWater), perPoint: ELEM_RESIST_LEGEND },
        { label: 'Electric', value: String(traits.defenseElectric), perPoint: ELEM_RESIST_LEGEND },
        { label: 'Poison', value: String(traits.defensePoison), perPoint: ELEM_RESIST_LEGEND },
        { label: 'Wind', value: String(traits.defenseWind), perPoint: ELEM_RESIST_LEGEND },
        { label: 'Earth', value: String(traits.defenseEarth), perPoint: ELEM_RESIST_LEGEND },
        { label: 'Arcane', value: String(traits.defenseArcane), perPoint: ELEM_RESIST_LEGEND },
      ],
    },
  ]
}

function derivedStatsValueMap(groups: DerivedBattleStatGroup[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const g of groups) {
    for (const r of g.rows) {
      m.set(`${g.title}\0${r.label}`, r.value)
    }
  }
  return m
}

/**
 * Row keys (`groupTitle` + NUL + `label`) whose displayed derived value would change if `traitKey` were +1.
 */
export function derivedStatRowKeysAfterPlusOneOnTrait(
  traits: TraitPoints,
  level: number,
  traitKey: keyof TraitPoints,
): Set<string> {
  const now = deriveLoadoutBattleStats(traits, level)
  const bumped: TraitPoints = { ...traits, [traitKey]: traits[traitKey] + 1 }
  const next = deriveLoadoutBattleStats(bumped, level)
  const m0 = derivedStatsValueMap(now)
  const m1 = derivedStatsValueMap(next)
  const out = new Set<string>()
  for (const [k, v] of m1) {
    if (m0.get(k) !== v) out.add(k)
  }
  return out
}
