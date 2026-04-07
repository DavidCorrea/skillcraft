import type { TraitPoints } from '../../game/types'
import { getSkillDef } from '../../game/skills'
import {
  BASE_MAX_HP,
  buildBleedingTag,
  buildSlowTag,
  DAMAGE_PER_STRENGTH,
  HP_PER_VITALITY,
  MANA_PER_WISDOM,
  maxStaminaForTraits,
  physicalOffenseDamagePerHit,
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
const ELEM_RESIST_LEGEND = '+1/pt vs matching skills; min 1'

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
  const physicalTempoPreview = totalStrikeDamage(traits, 0, 0)
  const physicalRhythmSecondHit = totalStrikeDamage(traits, 0, 1)
  const splinterPerHit = physicalOffenseDamagePerHit(getSkillDef('splinter').baseDamage, traits, 0, 0)
  const reachBonus = Math.floor(traits.arcaneReach / 2)
  const bleedTag = buildBleedingTag(traits.bleedBonus, traits.statusPotency)
  const bleedLine =
    bleedTag.t === 'bleeding' ? `${bleedTag.dot} / ${bleedTag.duration}t` : '—'
  const slowTag = traits.physicalSlow >= 1 ? buildSlowTag(traits.physicalSlow) : null
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
      title: 'Physical damage skills (before their mitigations)',
      rows: [
        {
          label: 'Strike base (2 + Strength)',
          value: String(strikeBase),
          perPoint: `+${DAMAGE_PER_STRENGTH}/Strength on each physical hit (skill base + STR)`,
        },
        {
          label: 'Splinter / hit (example)',
          value: String(splinterPerHit),
          perPoint: 'Same Strength, tempo, rhythm as Strike; skill base differs',
        },
        {
          label: 'Physical tempo (≤1 tile moved)',
          value: String(physicalTempoPreview),
          perPoint: '+1/Physical tempo when ≤1 tile moved (all physical damage skills)',
        },
        {
          label: '2nd-chain hit (rhythm)',
          value: String(physicalRhythmSecondHit),
          perPoint: '+1/Physical rhythm on 2nd, 4th… physical offense',
        },
      ],
    },
    {
      title: 'Physical damage on-hit',
      rows: [
        {
          label: 'Bleed DoT / duration',
          value: bleedLine,
          perPoint: 'Bleed bonus + Status potency (every physical hit)',
        },
        {
          label: 'Slowed duration',
          value: slowLine,
          perPoint:
            traits.physicalSlow >= 1 ? '+1 turn duration per Physical slow' : '≥1 Physical slow to apply',
        },
        {
          label: 'Knockback',
          value: traits.physicalKnockback >= 1 ? 'On' : 'Off',
          perPoint: '≥1 Physical knockback (not Shove)',
        },
        {
          label: 'Lifesteal / cast',
          value: String(traits.physicalLifesteal),
          perPoint: '+1 HP per physical damage cast that hits',
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
          label: 'Fortitude',
          value: String(traits.fortitude),
          perPoint: '+1 vs physical damage per point',
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
