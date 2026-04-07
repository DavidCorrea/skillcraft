import type { SkillId, SkillLoadoutEntry, TraitPoints } from './types'
import { defaultTraitPoints } from './traits'
import {
  fitPlayerBudgetToLevel,
  getSkillDef,
  maxSkillsForLevel,
  totalLoadoutPoints,
  validateLoadout,
} from './skills'

export type PresetPlayerBuild = {
  id: string
  name: string
  level: number
  traits: TraitPoints
  entries: SkillLoadoutEntry[]
}

/** Dropdown / list label — level always visible. */
export function formatPresetLabel(p: Pick<PresetPlayerBuild, 'level' | 'name'>): string {
  return `LV ${p.level} · ${p.name}`
}

const ALL_TRAIT_KEYS = Object.keys(defaultTraitPoints()) as (keyof TraitPoints)[]

type MinEntryOpts = { rangeTier?: number; aoeTier?: number }

/**
 * Minimum-cost skill row. Most presets pass {@link MinEntryOpts} so offensive skills can open at range.
 * Default single-cell patterns keep presets compact; larger AoE can clip allies.
 */
function minEntry(skillId: SkillId, opts?: MinEntryOpts): SkillLoadoutEntry {
  const def = getSkillDef(skillId)
  const rt = Math.max(0, Math.floor(opts?.rangeTier ?? 0))
  const at = Math.max(0, Math.floor(opts?.aoeTier ?? 0))
  return {
    skillId,
    pattern: [{ dx: 0, dy: 0 }],
    statusStacks: 1,
    costDiscount: 0,
    rangeTier: rt,
    aoeTier: at,
  }
}

/** Spread exactly `n` trait points across keys in repeating priority order. */
function distributeTraitPoints(n: number, priority: (keyof TraitPoints)[]): TraitPoints {
  const t = defaultTraitPoints()
  for (let i = 0; i < n; i++) {
    const k = priority[i % priority.length]!
    t[k]++
  }
  return t
}

function mergeExtraTraits(base: TraitPoints, extraCount: number): TraitPoints {
  const t = { ...base }
  for (let i = 0; i < extraCount; i++) {
    const k = ALL_TRAIT_KEYS[i % ALL_TRAIT_KEYS.length]!
    t[k]++
  }
  return t
}

const PRI_MELEE: (keyof TraitPoints)[] = [
  'strength',
  'vitality',
  'physicalTempo',
  'fortitude',
  'agility',
  'bleedBonus',
  'physicalRhythm',
  'physicalLifesteal',
  'physicalKnockback',
  'physicalSlow',
  'regeneration',
  'tenacity',
]

const PRI_CASTER: (keyof TraitPoints)[] = [
  'spellFocus',
  'arcaneReach',
  'intelligence',
  'wisdom',
  'statusPotency',
  'vitality',
  'tenacity',
  'defenseFire',
  'defenseIce',
  'defenseWater',
  'defenseElectric',
  'defensePoison',
  'defenseArcane',
]

const PRI_DOT: (keyof TraitPoints)[] = [
  'statusPotency',
  'spellFocus',
  'intelligence',
  'tenacity',
  'vitality',
  'wisdom',
  'arcaneReach',
  'defensePoison',
  'defenseFire',
  'regeneration',
]

const PRI_TANK: (keyof TraitPoints)[] = [
  'vitality',
  'fortitude',
  'tenacity',
  'regeneration',
  'wisdom',
  'defenseFire',
  'defenseIce',
  'defenseWater',
  'defenseElectric',
  'defenseArcane',
  'strength',
]

const PRI_SKIRMISH: (keyof TraitPoints)[] = [
  'agility',
  'intelligence',
  'spellFocus',
  'physicalTempo',
  'strength',
  'vitality',
  'arcaneReach',
  'statusPotency',
  'tenacity',
  'wisdom',
]

const PRI_BALANCED: (keyof TraitPoints)[] = [
  'vitality',
  'spellFocus',
  'strength',
  'intelligence',
  'wisdom',
  'agility',
  'tenacity',
  'arcaneReach',
  'statusPotency',
  'fortitude',
  'regeneration',
  'physicalTempo',
]

const PRI_CONTROL: (keyof TraitPoints)[] = [
  'statusPotency',
  'arcaneReach',
  'spellFocus',
  'intelligence',
  'wisdom',
  'tenacity',
  'vitality',
  'agility',
  'defenseIce',
  'defenseWater',
  'defenseElectric',
]

const PRI_SUPPORT: (keyof TraitPoints)[] = [
  'wisdom',
  'intelligence',
  'vitality',
  'regeneration',
  'tenacity',
  'spellFocus',
  'fortitude',
  'defenseArcane',
  'defenseWater',
  'defenseWind',
]

const PRI_ELEMENT_RAINBOW: (keyof TraitPoints)[] = [
  'spellFocus',
  'defenseFire',
  'defenseIce',
  'defenseWater',
  'defenseElectric',
  'defensePoison',
  'defenseWind',
  'defenseEarth',
  'defenseArcane',
  'arcaneReach',
  'vitality',
  'intelligence',
]

function finalize(
  id: string,
  name: string,
  level: number,
  entries: SkillLoadoutEntry[],
  priority: (keyof TraitPoints)[],
): PresetPlayerBuild {
  let ent = entries.map((e) => ({ ...e, pattern: [...e.pattern] }))
  let traits = defaultTraitPoints()

  const skillBudgetUsed = (e: SkillLoadoutEntry[]) => totalLoadoutPoints(e, defaultTraitPoints())

  if (skillBudgetUsed(ent) > level) {
    const fitted = fitPlayerBudgetToLevel(level, traits, ent)
    traits = fitted.traits
    ent = fitted.entries
  }

  let traitBudget = level - skillBudgetUsed(ent)
  traits = distributeTraitPoints(Math.max(0, traitBudget), priority)

  if (totalLoadoutPoints(ent, traits) > level) {
    const fitted = fitPlayerBudgetToLevel(level, traits, ent)
    traits = fitted.traits
    ent = fitted.entries
    traitBudget = level - skillBudgetUsed(ent)
    traits = distributeTraitPoints(Math.max(0, traitBudget), priority)
  }

  let total = totalLoadoutPoints(ent, traits)
  if (total < level) {
    traits = mergeExtraTraits(traits, level - total)
    total = totalLoadoutPoints(ent, traits)
  }
  if (total > level) {
    const fitted = fitPlayerBudgetToLevel(level, traits, ent)
    traits = fitted.traits
    ent = fitted.entries
    traitBudget = level - skillBudgetUsed(ent)
    traits = distributeTraitPoints(Math.max(0, traitBudget), priority)
    total = totalLoadoutPoints(ent, traits)
    if (total < level) traits = mergeExtraTraits(traits, level - total)
  }

  const err = validateLoadout(level, ent, maxSkillsForLevel(level), traits)
  if (err) {
    throw new Error(`preset ${id}: ${err}`)
  }
  return { id, name, level, traits, entries: ent }
}

export const PRESET_PLAYER_BUILDS: PresetPlayerBuild[] = [
  finalize('lv2-spark-seed', 'Spark seed', 2, [minEntry('spark')], PRI_CASTER),

  finalize('lv5-cinder-twin', 'Cinder twin', 5, [minEntry('ember', { rangeTier: 1 }), minEntry('frost_bolt')], PRI_CASTER),
  finalize('lv5-frost-flint', 'Frost flint', 5, [minEntry('frost_bolt', { rangeTier: 1 }), minEntry('splinter')], PRI_MELEE),

  finalize('lv8-tide-trial', 'Tide trial', 8, [minEntry('tide_touch', { rangeTier: 1 }), minEntry('spark', { rangeTier: 1 })], PRI_CASTER),
  finalize('lv8-bruiser-pair', 'Bruiser pair', 8, [minEntry('splinter'), minEntry('tremor')], PRI_MELEE),

  finalize('lv9-triad-core', 'Triad core', 9, [
    minEntry('ember', { rangeTier: 1 }),
    minEntry('frost_bolt', { rangeTier: 1 }),
    minEntry('tide_touch', { rangeTier: 1 }),
  ], PRI_BALANCED),
  finalize('lv9-ember-wedge', 'Ember wedge', 9, [
    minEntry('ember', { rangeTier: 1 }),
    minEntry('spark', { rangeTier: 1 }),
    minEntry('arcane_pulse', { rangeTier: 1 }),
  ], PRI_CASTER),

  finalize('lv12-quarter-arc', 'Quarter arc', 12, [
    minEntry('ember', { rangeTier: 1 }),
    minEntry('frost_bolt', { rangeTier: 1 }),
    minEntry('zephyr_cut', { rangeTier: 1 }),
  ], PRI_SKIRMISH),

  finalize(
    'lv13-quad-weave',
    'Quad weave',
    13,
    [
      minEntry('ember', { rangeTier: 1 }),
      minEntry('frost_bolt', { rangeTier: 1 }),
      minEntry('tide_touch', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
    ],
    PRI_BALANCED,
  ),
  finalize(
    'lv13-status-stitch',
    'Status stitch',
    13,
    [
      minEntry('venom_dart', { rangeTier: 1 }),
      minEntry('caustic_cloud', { rangeTier: 1 }),
      minEntry('immunize'),
      minEntry('ember', { rangeTier: 1 }),
    ],
    PRI_DOT,
  ),

  finalize(
    'lv16-fourfold',
    'Fourfold',
    16,
    [
      minEntry('void_lance', { rangeTier: 2 }),
      minEntry('arcane_pulse', { rangeTier: 2 }),
      minEntry('focus'),
      minEntry('zephyr_cut', { rangeTier: 1 }),
    ],
    PRI_CASTER,
  ),

  finalize(
    'lv17-pent-open',
    'Pent open',
    17,
    [
      minEntry('ember', { rangeTier: 1 }),
      minEntry('frost_bolt', { rangeTier: 1 }),
      minEntry('tide_touch', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('venom_dart', { rangeTier: 1 }),
    ],
    PRI_BALANCED,
  ),
  finalize(
    'lv18-iron-band',
    'Iron band',
    18,
    [minEntry('wardbreak'), minEntry('tremor'), minEntry('ward'), minEntry('mend'), minEntry('purge')],
    PRI_TANK,
  ),
  finalize(
    'lv19-glass-edge',
    'Glass edge',
    19,
    [
      minEntry('void_lance', { rangeTier: 2 }),
      minEntry('arcane_pulse', { rangeTier: 2 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('focus'),
      minEntry('ember', { rangeTier: 1 }),
    ],
    PRI_CASTER,
  ),
  finalize(
    'lv20-crown-small',
    'Crown small',
    20,
    [
      minEntry('ember', { rangeTier: 1 }),
      minEntry('frost_bolt', { rangeTier: 1 }),
      minEntry('tide_touch', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('caustic_cloud', { rangeTier: 1 }),
    ],
    PRI_BALANCED,
  ),
  finalize(
    'lv20-last-square',
    'Last square',
    20,
    [
      minEntry('venom_dart', { rangeTier: 1 }),
      minEntry('splinter'),
      minEntry('tremor'),
      minEntry('arcane_pulse', { rangeTier: 1 }),
      minEntry('void_lance', { rangeTier: 1 }),
    ],
    PRI_DOT,
  ),

  finalize(
    'lv21-grid-step',
    'Grid step',
    21,
    [
      minEntry('ember', { rangeTier: 1 }),
      minEntry('frost_bolt', { rangeTier: 1 }),
      minEntry('tide_touch', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('venom_dart', { rangeTier: 1 }),
    ],
    PRI_BALANCED,
  ),
  finalize(
    'lv21-wide-open',
    'Wide open',
    21,
    [
      minEntry('zephyr_cut', { rangeTier: 1 }),
      minEntry('splinter'),
      minEntry('arcane_pulse', { rangeTier: 1 }),
      minEntry('overclock'),
      minEntry('tide_touch', { rangeTier: 1 }),
    ],
    PRI_SKIRMISH,
  ),

  finalize(
    'lv24-reach-nine',
    'Reach nine',
    24,
    [
      minEntry('arcane_pulse', { rangeTier: 2 }),
      minEntry('void_lance', { rangeTier: 3 }),
      minEntry('ember', { rangeTier: 1 }),
      minEntry('focus'),
      minEntry('spark', { rangeTier: 1 }),
    ],
    PRI_CASTER,
  ),
  finalize(
    'lv24-tide-break',
    'Tide break',
    24,
    [
      minEntry('tide_touch', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('immunize'),
      minEntry('mend'),
      minEntry('purge'),
    ],
    PRI_SUPPORT,
  ),

  finalize(
    'lv27-mid-stretch',
    'Mid stretch',
    27,
    [
      minEntry('tremor'),
      minEntry('caustic_cloud', { rangeTier: 1 }),
      minEntry('venom_dart', { rangeTier: 1 }),
      minEntry('ember', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
    ],
    PRI_DOT,
  ),

  finalize(
    'lv30-storm-plate',
    'Storm plate',
    30,
    [
      minEntry('overclock'),
      minEntry('zephyr_cut', { rangeTier: 1 }),
      minEntry('void_lance', { rangeTier: 2 }),
      minEntry('ward'),
      minEntry('mend'),
    ],
    PRI_CASTER,
  ),
  finalize(
    'lv30-momentum',
    'Momentum',
    30,
    [
      minEntry('splinter'),
      minEntry('tremor'),
      minEntry('ember'),
      minEntry('venom_dart'),
      minEntry('zephyr_cut'),
    ],
    PRI_MELEE,
  ),

  finalize(
    'lv33-rot-weave',
    'Rot weave',
    33,
    [
      minEntry('venom_dart', { rangeTier: 1 }),
      minEntry('caustic_cloud', { rangeTier: 1 }),
      minEntry('ember', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('frost_bolt', { rangeTier: 1 }),
    ],
    PRI_DOT,
  ),

  finalize(
    'lv36-hex-pace',
    'Hex pace',
    36,
    [
      minEntry('arcane_pulse', { rangeTier: 2 }),
      minEntry('void_lance', { rangeTier: 2 }),
      minEntry('focus'),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('zephyr_cut', { rangeTier: 1 }),
    ],
    PRI_CASTER,
  ),
  finalize(
    'lv36-arc-press',
    'Arc press',
    36,
    [
      minEntry('immunize'),
      minEntry('arcane_pulse', { rangeTier: 2 }),
      minEntry('ward'),
      minEntry('purge'),
      minEntry('mend'),
    ],
    PRI_SUPPORT,
  ),

  finalize(
    'lv39-late-nine',
    'Late nine',
    39,
    [
      minEntry('ember', { rangeTier: 1 }),
      minEntry('frost_bolt', { rangeTier: 1 }),
      minEntry('tide_touch', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('tremor'),
    ],
    PRI_BALANCED,
  ),

  finalize(
    'lv42-edge-forty',
    'Edge forty',
    42,
    [
      minEntry('splinter'),
      minEntry('tremor'),
      minEntry('caustic_cloud', { rangeTier: 1 }),
      minEntry('venom_dart', { rangeTier: 1 }),
      minEntry('zephyr_cut', { rangeTier: 1 }),
    ],
    PRI_DOT,
  ),

  finalize(
    'lv45-final-nine',
    'Final nine',
    45,
    [
      minEntry('ember', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('void_lance', { rangeTier: 3 }),
      minEntry('arcane_pulse', { rangeTier: 3 }),
      minEntry('focus'),
    ],
    PRI_CASTER,
  ),
  finalize(
    'lv45-nine-apex',
    'Nine apex',
    45,
    [minEntry('tide_touch', { rangeTier: 1 }), minEntry('tremor'), minEntry('wardbreak'), minEntry('ward'), minEntry('mend')],
    PRI_TANK,
  ),

  finalize(
    'lv46-big-step',
    'Big step',
    46,
    [
      minEntry('ember', { rangeTier: 1 }),
      minEntry('frost_bolt', { rangeTier: 1 }),
      minEntry('tide_touch', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('venom_dart', { rangeTier: 1 }),
    ],
    PRI_BALANCED,
  ),
  finalize(
    'lv46-corner-fear',
    'Corner fear',
    46,
    [
      minEntry('zephyr_cut', { rangeTier: 1 }),
      minEntry('void_lance', { rangeTier: 2 }),
      minEntry('caustic_cloud', { rangeTier: 1 }),
      minEntry('frost_bolt', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
    ],
    PRI_CONTROL,
  ),

  finalize(
    'lv50-field-fifty',
    'Field fifty',
    50,
    [
      minEntry('arcane_pulse', { rangeTier: 2 }),
      minEntry('void_lance', { rangeTier: 3 }),
      minEntry('ember', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('focus'),
    ],
    PRI_CASTER,
  ),

  finalize(
    'lv54-wide-mid',
    'Wide mid',
    54,
    [
      minEntry('spark', { rangeTier: 1 }),
      minEntry('zephyr_cut', { rangeTier: 1 }),
      minEntry('splinter'),
      minEntry('tremor'),
      minEntry('overclock'),
    ],
    PRI_SKIRMISH,
  ),

  finalize(
    'lv60-sixty-line',
    'Sixty line',
    60,
    [
      minEntry('venom_dart', { rangeTier: 1 }),
      minEntry('caustic_cloud', { rangeTier: 1 }),
      minEntry('ember', { rangeTier: 1 }),
      minEntry('frost_bolt', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
    ],
    PRI_DOT,
  ),

  finalize(
    'lv65-six-five',
    'Six-five',
    65,
    [minEntry('wardbreak'), minEntry('tremor'), minEntry('ward'), minEntry('purge'), minEntry('mend')],
    PRI_TANK,
  ),

  finalize(
    'lv70-long-game',
    'Long game',
    70,
    [
      minEntry('void_lance', { rangeTier: 3 }),
      minEntry('arcane_pulse', { rangeTier: 3 }),
      minEntry('ember', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('focus'),
    ],
    PRI_CASTER,
  ),

  finalize(
    'lv72-deep-board',
    'Deep board',
    72,
    [
      minEntry('tremor'),
      minEntry('caustic_cloud', { rangeTier: 1 }),
      minEntry('venom_dart', { rangeTier: 1 }),
      minEntry('zephyr_cut', { rangeTier: 1 }),
      minEntry('ember', { rangeTier: 1 }),
    ],
    PRI_DOT,
  ),

  finalize(
    'lv80-eighty-pace',
    'Eighty pace',
    80,
    [
      minEntry('zephyr_cut', { rangeTier: 1 }),
      minEntry('splinter'),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('void_lance', { rangeTier: 3 }),
      minEntry('frost_bolt', { rangeTier: 1 }),
    ],
    PRI_SKIRMISH,
  ),

  finalize(
    'lv88-late-field',
    'Late field',
    88,
    [
      minEntry('ember', { rangeTier: 1 }),
      minEntry('frost_bolt', { rangeTier: 1 }),
      minEntry('tide_touch', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('arcane_pulse', { rangeTier: 2 }),
    ],
    PRI_ELEMENT_RAINBOW,
  ),

  finalize(
    'lv90-almost-max',
    'Almost max',
    90,
    [
      minEntry('venom_dart', { rangeTier: 1 }),
      minEntry('caustic_cloud', { rangeTier: 1 }),
      minEntry('splinter'),
      minEntry('tremor'),
      minEntry('void_lance', { rangeTier: 3 }),
    ],
    PRI_DOT,
  ),

  finalize(
    'lv95-pre-apex',
    'Pre-apex',
    95,
    [
      minEntry('arcane_pulse', { rangeTier: 3 }),
      minEntry('immunize'),
      minEntry('ward'),
      minEntry('mend'),
      minEntry('purge'),
    ],
    PRI_SUPPORT,
  ),

  finalize(
    'lv99-arcane-apex',
    'Arcane apex',
    99,
    [
      minEntry('void_lance', { rangeTier: 3 }),
      minEntry('arcane_pulse', { rangeTier: 3 }),
      minEntry('zephyr_cut', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('focus'),
    ],
    PRI_CASTER,
  ),
  finalize(
    'lv99-titan-brawl',
    'Titan brawl',
    99,
    [
      minEntry('splinter'),
      minEntry('tremor'),
      minEntry('ember'),
      minEntry('venom_dart'),
      minEntry('zephyr_cut'),
    ],
    PRI_MELEE,
  ),
  finalize(
    'lv99-rainbow',
    'Rainbow',
    99,
    [
      minEntry('ember', { rangeTier: 1 }),
      minEntry('frost_bolt', { rangeTier: 1 }),
      minEntry('tide_touch', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('caustic_cloud', { rangeTier: 1 }),
    ],
    PRI_ELEMENT_RAINBOW,
  ),
  finalize(
    'lv99-battle-medic',
    'Battle medic',
    99,
    [
      minEntry('mend'),
      minEntry('ward'),
      minEntry('purge'),
      minEntry('tide_touch', { rangeTier: 1 }),
      minEntry('immunize'),
    ],
    PRI_SUPPORT,
  ),
  finalize(
    'lv99-dot-king',
    'DoT king',
    99,
    [
      minEntry('venom_dart', { rangeTier: 1 }),
      minEntry('caustic_cloud', { rangeTier: 1 }),
      minEntry('ember', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('immunize'),
    ],
    PRI_DOT,
  ),
  finalize(
    'lv99-glass-cannon',
    'Glass cannon',
    99,
    [
      minEntry('void_lance', { rangeTier: 3 }),
      minEntry('arcane_pulse', { rangeTier: 3 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('ember', { rangeTier: 1 }),
      minEntry('focus'),
    ],
    PRI_CASTER,
  ),
  finalize(
    'lv99-fortress',
    'Fortress',
    99,
    [minEntry('wardbreak'), minEntry('tremor'), minEntry('ward'), minEntry('mend'), minEntry('purge')],
    PRI_TANK,
  ),
  finalize(
    'lv99-skirmish-lord',
    'Skirmish lord',
    99,
    [
      minEntry('zephyr_cut', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('splinter'),
      minEntry('void_lance', { rangeTier: 3 }),
      minEntry('ember', { rangeTier: 1 }),
    ],
    PRI_SKIRMISH,
  ),
  finalize(
    'lv99-elemental-parity',
    'Elemental parity',
    99,
    [
      minEntry('ember', { rangeTier: 1 }),
      minEntry('frost_bolt', { rangeTier: 1 }),
      minEntry('tide_touch', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('tremor'),
    ],
    PRI_ELEMENT_RAINBOW,
  ),
  finalize(
    'lv99-onslaught',
    'Onslaught',
    99,
    [
      minEntry('splinter'),
      minEntry('tremor'),
      minEntry('ember'),
      minEntry('arcane_pulse', { rangeTier: 1 }),
      minEntry('venom_dart', { rangeTier: 1 }),
    ],
    PRI_MELEE,
  ),
  finalize(
    'lv99-controller',
    'Controller',
    99,
    [
      minEntry('frost_bolt', { rangeTier: 1 }),
      minEntry('immunize'),
      minEntry('venom_dart', { rangeTier: 1 }),
      minEntry('spark', { rangeTier: 1 }),
      minEntry('zephyr_cut', { rangeTier: 1 }),
    ],
    PRI_CONTROL,
  ),
  finalize(
    'lv99-endgame',
    'Endgame',
    99,
    [
      minEntry('arcane_pulse', { rangeTier: 3 }),
      minEntry('void_lance', { rangeTier: 3 }),
      minEntry('ember', { rangeTier: 1 }),
      minEntry('focus'),
      minEntry('spark', { rangeTier: 1 }),
    ],
    PRI_BALANCED,
  ),
]
