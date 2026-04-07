import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BattleConfig, PatternOffset, SkillId, SkillLoadoutEntry, TraitPoints } from '../game/types'
import { MatchSetupForm, type MatchSetupFormHandle } from './MatchSetupScreen'
import type { SkillDefinition } from '../game/skills'
import {
  BASELINE_SKILL_LOADOUT_POINT_COST,
  basePowerCost,
  castResourceCostRange,
  chargeableEntryPointCost,
  clampSkillLoadoutEntry,
  effectiveCastRangeForLoadout,
  entryPointCost,
  fitPlayerBudgetToLevel,
  getSkillDef,
  maxPurchasableAoeTier,
  maxPurchasableRangeTier,
  maxSkillPointsBudget,
  minCastManhattanForLoadout,
  tierPointCost,
  maxSkillsForLevel,
  SKILL_ROSTER,
  skillLoadoutSection,
  totalLoadoutPoints,
  validateLoadout,
} from '../game/skills'
import { boardSizeForLevel } from '../game/board'
import {
  BASE_MAX_HP,
  defaultTraitPoints,
  HP_PER_VITALITY,
  MANA_PER_WISDOM,
  strikeDamage,
  totalStrikeDamage,
  totalTraitPoints,
} from '../game/traits'
import { randomFullPlayerLoadout } from '../game/randomCpuBuild'
import { formatPresetLabel, PRESET_PLAYER_BUILDS, type PresetPlayerBuild } from '../game/preset-builds'
import { traitDisplayByKey, traitReferenceZones } from '../game/trait-reference'
import { GameGuide } from './help/GameGuide'
import { SkillLoadoutGrid } from './SkillLoadoutGrid'
import { NumberStepper } from './numeric-stepper.tsx'
import { TraitDerivedStatsPanel } from './loadout/TraitDerivedStatsPanel'
import './loadout/loadout-surface.css'

const STORAGE_KEY = 'skillcraft-loadout-v6'
const LEGACY_STORAGE_KEY = 'skillcraft-loadout-v4'

const MAX_LEVEL = 99

const LOADOUT_ROSTER_SECTIONS = [
  { id: 'magic' as const, label: 'Magic' },
  { id: 'physical' as const, label: 'Physical' },
  { id: 'utility' as const, label: 'Utility' },
]

/** Default skills for a fresh loadout (before localStorage); order matches roster priority for editor focus. */
function starterSkillIdsForLevel(level: number): string[] {
  const cap = maxSkillsForLevel(level)
  return ['ember', 'frost_bolt', 'tide_touch', 'spark'].slice(0, cap)
}

function capitalizeLabel(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function LoadoutSkillRailDetails({
  def,
  entry,
  reachR,
}: {
  def: SkillDefinition
  entry: SkillLoadoutEntry
  reachR: number
}) {
  const minCastR = minCastManhattanForLoadout(def, entry)
  const { min: costMin, max: costMax } = castResourceCostRange(entry, def, reachR, minCastR)
  const resShort = def.school === 'physical' ? 'SP' : 'MP'
  const costLine =
    costMin === costMax ? `${costMin} ${resShort}` : `${costMin}–${costMax} ${resShort}`
  const patternN = entry.pattern.length
  const loadoutPts = entryPointCost(entry)
  const vsLevel = chargeableEntryPointCost(entry)
  const loadoutLine =
    vsLevel > 0 ? `${loadoutPts} pts (${vsLevel} vs level)` : `${loadoutPts} pts`
  const discount = entry.costDiscount ?? 0
  const powerLine =
    def.baseDamage > 0
      ? `${def.baseDamage} per hit on enemy (× pattern weight per cell)`
      : def.damageKind === 'none'
        ? 'Utility — no direct hit damage'
        : null

  return (
    <section className="ls-rail__section" aria-labelledby="ls-rail-details-heading">
      <p id="ls-rail-details-heading" className="ls-rail__title" role="heading" aria-level={3}>
        Details
      </p>
      <dl className="ls-rail__details">
        <dt>Loadout cost</dt>
        <dd>{loadoutLine}</dd>
        <dt>Cast cost</dt>
        <dd>
          {costLine}
          <span className="ls-rail__details-note"> (by anchor distance)</span>
        </dd>
        {powerLine ? (
          <>
            <dt>Power</dt>
            <dd>{powerLine}</dd>
          </>
        ) : null}
        <dt>Pattern</dt>
        <dd>
          {patternN} cell{patternN === 1 ? '' : 's'} · {def.describePattern}
        </dd>
        <dt>Status stacks</dt>
        <dd>{entry.statusStacks}</dd>
        {discount > 0 ? (
          <>
            <dt>Cast discount</dt>
            <dd>
              −{discount} {resShort} from loadout spend
            </dd>
          </>
        ) : null}
      </dl>
    </section>
  )
}

type SkillConfig = {
  pattern: PatternOffset[]
  statusStacks: number
  costDiscount: number
  rangeTier?: number
  aoeTier?: number
}

type Stored = {
  level: number
  selectedIds: string[]
  configs: Record<string, SkillConfig>
  traits: TraitPoints
}

type StoredV4 = {
  level: number
  selectedIds: string[]
  configs: Record<string, SkillConfig>
  moveBonusPoints: number
  manaRegenBonusPoints: number
}

function defaultSkillConfig(): SkillConfig {
  return {
    pattern: [{ dx: 0, dy: 0 }],
    statusStacks: 1,
    costDiscount: 0,
    rangeTier: 0,
    aoeTier: 0,
  }
}

/** Merge saved traits with current schema; map legacy trait keys from older saves. */
function migrateTraitPoints(input: unknown): TraitPoints {
  const t = defaultTraitPoints()
  if (!input || typeof input !== 'object') return t
  const o = input as Record<string, unknown>
  for (const key of Object.keys(t) as (keyof TraitPoints)[]) {
    const v = o[key as string]
    if (typeof v === 'number' && Number.isFinite(v)) {
      ;(t as unknown as Record<string, number>)[key] = Math.max(0, Math.floor(v))
    }
  }
  if (!('physicalTempo' in o) && typeof o.strikeTempo === 'number' && Number.isFinite(o.strikeTempo)) {
    t.physicalTempo = Math.max(0, Math.floor(o.strikeTempo))
  }
  if (!('physicalRhythm' in o) && typeof o.strikeRhythm === 'number' && Number.isFinite(o.strikeRhythm)) {
    t.physicalRhythm = Math.max(0, Math.floor(o.strikeRhythm))
  }
  if (!('physicalKnockback' in o) && typeof o.strikeKnockback === 'number' && Number.isFinite(o.strikeKnockback)) {
    t.physicalKnockback = Math.max(0, Math.floor(o.strikeKnockback))
  }
  if (!('physicalSlow' in o) && typeof o.strikeSlow === 'number' && Number.isFinite(o.strikeSlow)) {
    t.physicalSlow = Math.max(0, Math.floor(o.strikeSlow))
  }
  if (!('physicalLifesteal' in o) && typeof o.meleeLifesteal === 'number' && Number.isFinite(o.meleeLifesteal)) {
    t.physicalLifesteal = Math.max(0, Math.floor(o.meleeLifesteal))
  }
  if (typeof o.meleeDuelReduction === 'number' && Number.isFinite(o.meleeDuelReduction)) {
    t.fortitude += Math.max(0, Math.floor(o.meleeDuelReduction))
  }
  if (typeof o.physicalArmor === 'number' && Number.isFinite(o.physicalArmor)) {
    t.fortitude += Math.max(0, Math.floor(o.physicalArmor))
  }
  return t
}

function loadStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Stored
      return { ...p, traits: migrateTraitPoints(p.traits) }
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) {
      const p = JSON.parse(legacy) as StoredV4
      return {
        level: p.level,
        selectedIds: p.selectedIds,
        configs: p.configs,
        traits: {
          ...defaultTraitPoints(),
          agility: p.moveBonusPoints ?? 0,
          intelligence: p.manaRegenBonusPoints ?? 0,
        },
      }
    }
    return null
  } catch {
    return null
  }
}

function saveStored(data: Stored): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

type TraitKey = keyof TraitPoints

function TraitRail({
  traitKey,
  value,
  max,
  onChange,
  subtitle,
  onDerivedPreviewEnter,
  onDerivedPreviewLeave,
}: {
  traitKey: TraitKey
  value: number
  /** Remaining trait pool allows at most this value for this stat (same rule as `setTraitValue`). */
  max: number
  onChange: (n: number) => void
  /** Visible description under the stat name (same copy as the former hover tooltip). */
  subtitle: string
  onDerivedPreviewEnter?: () => void
  onDerivedPreviewLeave?: () => void
}) {
  const { label, short } = traitDisplayByKey[traitKey]
  const line = `${label} (${short})`
  const hintId = `ls-trait-hint-${traitKey}`
  return (
    <div
      className="ls-trait"
      onMouseEnter={onDerivedPreviewEnter}
      onMouseLeave={onDerivedPreviewLeave}
      onFocusCapture={onDerivedPreviewEnter}
      onBlurCapture={onDerivedPreviewLeave}
    >
      <div className="ls-trait__label">
        <span className="ls-trait__short">{line}</span>
        <span className="ls-trait__hint" id={hintId}>
          {subtitle}
        </span>
      </div>
      <NumberStepper
        className="ls-trait__stepper"
        variant="rail"
        min={0}
        max={max}
        value={value}
        onValueChange={onChange}
        aria-label={line}
        aria-describedby={hintId}
      />
    </div>
  )
}

/** Visible subtitle under each trait (former tooltip copy). */
function traitHint(
  key: TraitKey,
  ctx: {
    traits: TraitPoints
    level: number
    /** Max sum of all traits given current skill loadout spend. */
    maxTraitPool: number
    moveMaxSteps: number
    manaRegenPerTurn: number
    previewMaxHp: number
    previewMaxMana: number
    previewStrikeBase: number
    previewStrikeWithTempo: number
    previewStrikeRhythm2: number
  },
): string {
  const {
    traits,
    moveMaxSteps,
    manaRegenPerTurn,
    previewMaxHp,
    previewMaxMana,
    previewStrikeBase,
    previewStrikeWithTempo,
    previewStrikeRhythm2,
    maxTraitPool,
  } = ctx
  switch (key) {
    case 'agility':
      return `+1 step/Move · now ${moveMaxSteps}`
    case 'intelligence':
      return `+1 mana/turn start · now +${manaRegenPerTurn}`
    case 'vitality':
      return `+${HP_PER_VITALITY} max HP/pt · now ${previewMaxHp}`
    case 'wisdom':
      return `+${MANA_PER_WISDOM} max mana/pt · now ${previewMaxMana}`
    case 'regeneration':
      return 'HP healed at the start of each of your turns'
    case 'tenacity':
      return 'Reduces each burn / poison / bleed tick'
    case 'arcaneReach':
      return `+1 range per 2 pts · skills +${Math.floor(traits.arcaneReach / 2)}`
    case 'spellFocus':
      return '+skill damage vs elemental after their resist (per hit)'
    case 'statusPotency':
      return 'Stronger skill DoTs, shock, and durations'
    case 'strength':
      return `Strike base ${previewStrikeBase} · ~${previewStrikeWithTempo} w/ physical tempo (≤1 tile)`
    case 'bleedBonus':
      return 'Stronger bleed on physical damage hits'
    case 'physicalLifesteal':
      return 'Heal HP after a physical hit cast (1:1)'
    case 'physicalKnockback':
      return '≥1: physical hits push 1 tile if clear (not Shove)'
    case 'physicalSlow':
      return '≥1: physical hits apply slow (longer w/ pts)'
    case 'fortitude':
      return 'Less physical damage (toughness + armor)'
    case 'physicalTempo':
      return `≤1 tile moved · ~${previewStrikeWithTempo} per physical hit`
    case 'physicalRhythm':
      return `2nd physical hit ${previewStrikeRhythm2} · also 4th, 6th…`
    case 'defenseFire':
    case 'defenseIce':
    case 'defenseWater':
    case 'defenseElectric':
    case 'defensePoison':
    case 'defenseWind':
    case 'defenseEarth':
    case 'defenseArcane':
      return 'Less matching elemental skill damage (min 1)'
    default:
      return `${String(key)} · 0–${maxTraitPool}`
  }
}

export function LoadoutScreen({
  onStartBattle,
}: {
  onStartBattle: (config: BattleConfig) => void
}) {
  const stored = useMemo(() => loadStored(), [])
  const [level, setLevel] = useState(() =>
    Math.min(MAX_LEVEL, Math.max(1, Math.floor(stored?.level ?? 14))),
  )
  const [selected, setSelected] = useState<Set<string>>(() => {
    const lv = Math.min(MAX_LEVEL, Math.max(1, Math.floor(stored?.level ?? 14)))
    const cap = maxSkillsForLevel(lv)
    const fallback = starterSkillIdsForLevel(lv)
    const ids = stored?.selectedIds ?? fallback
    return new Set(ids.slice(0, cap))
  })
  const [configs, setConfigs] = useState<Record<string, SkillConfig>>(() => {
    if (stored?.configs) {
      const merged: Record<string, SkillConfig> = {}
      for (const s of SKILL_ROSTER) {
        const c = stored.configs[s.id]
            merged[s.id] = c
          ? {
              ...defaultSkillConfig(),
              ...c,
              costDiscount: c.costDiscount ?? 0,
              rangeTier: c.rangeTier ?? 0,
              aoeTier: c.aoeTier ?? 0,
            }
          : defaultSkillConfig()
      }
      return merged
    }
    return Object.fromEntries(SKILL_ROSTER.map((s) => [s.id, defaultSkillConfig()]))
  })
  const [traits, setTraits] = useState<TraitPoints>(() => migrateTraitPoints(stored?.traits))
  const [configureSkillId, setConfigureSkillId] = useState<string | null>(null)
  /** Bumps when applying "Randomize everything" so SkillLoadoutGrid remounts and picks a fresh preview anchor. */
  const [loadoutGridNonce, setLoadoutGridNonce] = useState(0)
  const [presetSelection, setPresetSelection] = useState<'custom' | string>('custom')
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const presetComboRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'traits' | 'skills' | 'match'>('traits')
  const matchFormRef = useRef<MatchSetupFormHandle>(null)
  const [matchValidity, setMatchValidity] = useState<{
    canStart: boolean
    teamError: string | null
  }>({ canStart: false, teamError: null })

  const handleMatchValidityChange = useCallback(
    (v: { canStart: boolean; teamError: string | null }) => {
      setMatchValidity((prev) =>
        prev.canStart === v.canStart && prev.teamError === v.teamError ? prev : v,
      )
    },
    [],
  )
  const [traitDerivedHoverKey, setTraitDerivedHoverKey] = useState<TraitKey | null>(null)
  const traitDerivedHoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onTraitDerivedPreviewEnter = (k: TraitKey) => {
    if (traitDerivedHoverLeaveTimerRef.current !== null) {
      window.clearTimeout(traitDerivedHoverLeaveTimerRef.current)
      traitDerivedHoverLeaveTimerRef.current = null
    }
    setTraitDerivedHoverKey(k)
  }

  const onTraitDerivedPreviewLeave = () => {
    if (traitDerivedHoverLeaveTimerRef.current !== null) {
      window.clearTimeout(traitDerivedHoverLeaveTimerRef.current)
    }
    traitDerivedHoverLeaveTimerRef.current = window.setTimeout(() => {
      setTraitDerivedHoverKey(null)
      traitDerivedHoverLeaveTimerRef.current = null
    }, 50)
  }

  useEffect(() => {
    return () => {
      if (traitDerivedHoverLeaveTimerRef.current !== null) {
        window.clearTimeout(traitDerivedHoverLeaveTimerRef.current)
      }
    }
  }, [])

  const presetTriggerLabel = useMemo(() => {
    if (presetSelection === 'custom') return 'Custom (current)'
    const p = PRESET_PLAYER_BUILDS.find((x) => x.id === presetSelection)
    return p ? formatPresetLabel(p) : 'Custom (current)'
  }, [presetSelection])

  useEffect(() => {
    if (!presetMenuOpen) return
    function handlePointerDown(e: MouseEvent) {
      if (presetComboRef.current?.contains(e.target as Node)) return
      setPresetMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [presetMenuOpen])

  useEffect(() => {
    if (!presetMenuOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPresetMenuOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [presetMenuOpen])

  function markLoadoutCustom(): void {
    setPresetMenuOpen(false)
    setPresetSelection('custom')
  }

  const levelFitRef = useRef({ traits, configs, selected })
  levelFitRef.current = { traits, configs, selected }

  useEffect(() => {
    const cap = maxSkillsForLevel(level)
    setSelected((prev) => {
      if (prev.size <= cap) return prev
      return new Set([...prev].slice(0, cap))
    })
  }, [level])

  useEffect(() => {
    const { traits: tr, configs: cfg, selected: sel } = levelFitRef.current
    const ent: SkillLoadoutEntry[] = SKILL_ROSTER.filter((s) => sel.has(s.id)).map((s) => {
      const c = cfg[s.id] ?? defaultSkillConfig()
      return {
        skillId: s.id,
        pattern: c.pattern,
        statusStacks: c.statusStacks,
        costDiscount: c.costDiscount ?? 0,
        rangeTier: c.rangeTier ?? 0,
        aoeTier: c.aoeTier ?? 0,
      }
    })
    if (totalLoadoutPoints(ent, tr) <= level) return
    const { traits: nt, entries: ne } = fitPlayerBudgetToLevel(level, tr, ent)
    const nc = { ...cfg }
    for (const e of ne) {
      nc[e.skillId] = {
        pattern: e.pattern,
        statusStacks: e.statusStacks,
        costDiscount: e.costDiscount,
        rangeTier: e.rangeTier ?? 0,
        aoeTier: e.aoeTier ?? 0,
      }
    }
    setTraits(nt)
    setConfigs(nc)
  }, [level])

  useEffect(() => {
    saveStored({
      level,
      selectedIds: [...selected],
      configs: { ...configs },
      traits: { ...traits },
    })
  }, [level, selected, configs, traits])

  const entries: SkillLoadoutEntry[] = SKILL_ROSTER.filter((s) => selected.has(s.id)).map((s) => {
    const c = configs[s.id] ?? defaultSkillConfig()
    return {
      skillId: s.id,
      pattern: c.pattern,
      statusStacks: c.statusStacks,
      costDiscount: c.costDiscount ?? 0,
      rangeTier: c.rangeTier ?? 0,
      aoeTier: c.aoeTier ?? 0,
    }
  })

  const matchDraft = {
    level,
    playerLoadout: entries,
    playerTraits: { ...traits },
  }

  const maxSkillSlots = maxSkillsForLevel(level)
  const err = validateLoadout(level, entries, maxSkillSlots, traits)
  const total = totalLoadoutPoints(entries, traits)
  const traitPts = totalTraitPoints(traits)
  const skillPts = total - traitPts
  /** Same budget as validateLoadout: traits + skills must not exceed level. */
  const traitsStepErr = total > level ? 'Spend exceeds your level (traits + skills).' : null
  const moveMaxSteps = 1 + traits.agility
  const manaRegenPerTurn = 1 + traits.intelligence
  const previewMaxHp = BASE_MAX_HP + traits.vitality * HP_PER_VITALITY
  const previewMaxMana = level + traits.wisdom * MANA_PER_WISDOM
  const previewStrikeBase = strikeDamage(traits.strength)
  const previewStrikeWithTempo = totalStrikeDamage(traits, 0, 0)
  const previewStrikeRhythm2 = totalStrikeDamage(traits, 0, 1)
  const pointsPct = level > 0 ? Math.min(100, (total / level) * 100) : 0
  const remaining = level - total

  const resolvedSkillId =
    configureSkillId ??
    (phase === 'skills' && selected.size > 0 ? SKILL_ROSTER.find((s) => selected.has(s.id))?.id ?? null : null)

  const activeSkill = resolvedSkillId ? SKILL_ROSTER.find((s) => s.id === resolvedSkillId) ?? null : null
  const activeCfg = activeSkill ? (configs[activeSkill.id] ?? defaultSkillConfig()) : null
  const activeEntry: SkillLoadoutEntry | null =
    activeSkill && activeCfg
      ? {
          skillId: activeSkill.id,
          pattern: activeCfg.pattern,
          statusStacks: activeCfg.statusStacks,
          costDiscount: activeCfg.costDiscount ?? 0,
          rangeTier: activeCfg.rangeTier ?? 0,
          aoeTier: activeCfg.aoeTier ?? 0,
        }
      : null
  const activeReachR =
    activeSkill && activeEntry
      ? effectiveCastRangeForLoadout(getSkillDef(activeSkill.id), activeEntry, traits)
      : 0
  const activeSkillBudget =
    activeSkill && activeEntry
      ? maxSkillPointsBudget(level, traits, entries, activeSkill.id as SkillId)
      : 0
  const activeMaxDiscount =
    activeEntry && activeSkill && activeCfg
      ? Math.min(
          Math.max(0, basePowerCost(activeEntry) - 1),
          Math.max(
            0,
            activeSkillBudget - activeCfg.pattern.length - activeCfg.statusStacks,
          ),
        )
      : 0
  const activeMaxStacks =
    activeEntry && activeSkill && activeCfg
      ? Math.max(
          1,
          Math.min(
            level,
            activeSkillBudget - activeCfg.pattern.length - (activeCfg.costDiscount ?? 0),
          ),
        )
      : 1
  const activeMaxRangeTier =
    activeSkill && activeCfg
      ? maxPurchasableRangeTier(
          activeSkillBudget -
            activeCfg.pattern.length -
            activeCfg.statusStacks -
            (activeCfg.costDiscount ?? 0) -
            tierPointCost(activeCfg.aoeTier ?? 0),
        )
      : 0

  const activeMaxAoeTier =
    activeSkill && activeCfg
      ? maxPurchasableAoeTier(
          activeSkillBudget -
            activeCfg.pattern.length -
            activeCfg.statusStacks -
            (activeCfg.costDiscount ?? 0) -
            tierPointCost(activeCfg.rangeTier ?? 0),
        )
      : 0

  const hintCtx = useMemo(
    () => ({
      traits,
      level,
      maxTraitPool: Math.max(0, level - skillPts),
      moveMaxSteps,
      manaRegenPerTurn,
      previewMaxHp,
      previewMaxMana,
      previewStrikeBase,
      previewStrikeWithTempo,
      previewStrikeRhythm2,
    }),
    [
      traits,
      level,
      skillPts,
      moveMaxSteps,
      manaRegenPerTurn,
      previewMaxHp,
      previewMaxMana,
      previewStrikeBase,
      previewStrikeWithTempo,
      previewStrikeRhythm2,
    ],
  )

  function setTraitValue<K extends keyof TraitPoints>(key: K, raw: number): void {
    markLoadoutCustom()
    setTraits((t) => {
      const cap = level - skillPts - totalTraitPoints(t) + t[key]
      const v = Math.max(0, Math.min(Math.floor(raw), Math.max(0, cap)))
      return { ...t, [key]: v }
    })
  }

  function toggleSkill(id: string): void {
    markLoadoutCustom()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setConfigureSkillId((c) => (c === id ? null : c))
      } else if (next.size < maxSkillsForLevel(level)) {
        const entriesForBudget: SkillLoadoutEntry[] = SKILL_ROSTER.filter((s) => prev.has(s.id)).map(
          (s) => {
            const c = configs[s.id] ?? defaultSkillConfig()
            return {
              skillId: s.id,
              pattern: c.pattern,
              statusStacks: c.statusStacks,
              costDiscount: c.costDiscount ?? 0,
              rangeTier: c.rangeTier ?? 0,
              aoeTier: c.aoeTier ?? 0,
            }
          },
        )
        const budget = maxSkillPointsBudget(level, traits, entriesForBudget, id as SkillId)
        const def = getSkillDef(id as SkillId)
        const starter = clampSkillLoadoutEntry(
          {
            skillId: id as SkillId,
            pattern: defaultSkillConfig().pattern,
            statusStacks: defaultSkillConfig().statusStacks,
            costDiscount: 0,
            rangeTier: 0,
            aoeTier: 0,
          },
          def,
          budget,
        )
        if (entryPointCost(starter) > budget) return prev
        next.add(id)
        setConfigs((cfg) => ({
          ...cfg,
          [id]: {
            pattern: starter.pattern,
            statusStacks: starter.statusStacks,
            costDiscount: starter.costDiscount,
            rangeTier: starter.rangeTier ?? 0,
            aoeTier: starter.aoeTier ?? 0,
          },
        }))
        setConfigureSkillId(id)
      }
      return next
    })
  }

  function setSkillConfig(id: string, partial: Partial<SkillConfig>): void {
    markLoadoutCustom()
    setConfigs((cfg) => {
      const cur: SkillConfig = { ...(cfg[id] ?? defaultSkillConfig()), ...partial }
      const def = getSkillDef(id as SkillId)
      const allEntries: SkillLoadoutEntry[] = SKILL_ROSTER.filter((s) => selected.has(s.id)).map(
        (s) => {
          const c = s.id === id ? cur : (cfg[s.id] ?? defaultSkillConfig())
          return {
            skillId: s.id,
            pattern: c.pattern,
            statusStacks: c.statusStacks,
            costDiscount: c.costDiscount ?? 0,
            rangeTier: c.rangeTier ?? 0,
            aoeTier: c.aoeTier ?? 0,
          }
        },
      )
      const maxPts = maxSkillPointsBudget(level, traits, allEntries, id as SkillId)
      const draft: SkillLoadoutEntry = {
        skillId: id as SkillId,
        pattern: cur.pattern,
        statusStacks: cur.statusStacks,
        costDiscount: cur.costDiscount ?? 0,
        rangeTier: cur.rangeTier ?? 0,
        aoeTier: cur.aoeTier ?? 0,
      }
      const clamped = clampSkillLoadoutEntry(draft, def, maxPts)
      return {
        ...cfg,
        [id]: {
          pattern: clamped.pattern,
          statusStacks: clamped.statusStacks,
          costDiscount: clamped.costDiscount,
          rangeTier: clamped.rangeTier ?? 0,
          aoeTier: clamped.aoeTier ?? 0,
        },
      }
    })
  }

  function resetSkillToBasic(id: string): void {
    markLoadoutCustom()
    setConfigs((cfg) => ({
      ...cfg,
      [id]: defaultSkillConfig(),
    }))
  }

  function applyRandomFullLoadout(): void {
    markLoadoutCustom()
    const { traits: nt, entries: ne } = randomFullPlayerLoadout(level)
    setLoadoutGridNonce((n) => n + 1)
    setTraits(nt)
    setSelected(new Set(ne.map((e) => e.skillId)))
    setConfigs(() => {
      const next: Record<string, SkillConfig> = {}
      for (const s of SKILL_ROSTER) {
        const e = ne.find((x) => x.skillId === s.id)
        next[s.id] = e
          ? {
              pattern: e.pattern,
              statusStacks: e.statusStacks,
              costDiscount: e.costDiscount ?? 0,
              rangeTier: e.rangeTier ?? 0,
              aoeTier: e.aoeTier ?? 0,
            }
          : defaultSkillConfig()
      }
      return next
    })
    setConfigureSkillId(ne[0]?.skillId ?? null)
  }

  function applyPresetBuild(p: PresetPlayerBuild): void {
    setPresetMenuOpen(false)
    setLevel(p.level)
    setTraits({ ...p.traits })
    setSelected(new Set(p.entries.map((e) => e.skillId)))
    setConfigs(() => {
      const next: Record<string, SkillConfig> = {}
      for (const s of SKILL_ROSTER) {
        const e = p.entries.find((x) => x.skillId === s.id)
        next[s.id] = e
          ? {
              pattern: e.pattern,
              statusStacks: e.statusStacks,
              costDiscount: e.costDiscount ?? 0,
              rangeTier: e.rangeTier ?? 0,
              aoeTier: e.aoeTier ?? 0,
            }
          : defaultSkillConfig()
      }
      return next
    })
    setConfigureSkillId(p.entries[0]?.skillId ?? null)
    setLoadoutGridNonce((n) => n + 1)
    setPresetSelection(p.id)
  }

  /** Traits to zero, no skills equipped, all skill configs base — level unchanged. */
  function resetLoadoutUpgrades(): void {
    markLoadoutCustom()
    setTraits({ ...defaultTraitPoints() })
    setSelected(new Set())
    setConfigs(() => Object.fromEntries(SKILL_ROSTER.map((s) => [s.id, defaultSkillConfig()])))
    setConfigureSkillId(null)
  }

  const pointsSpentPhrase = (n: number, on: string) =>
    `${n} ${n === 1 ? 'point' : 'points'} spent on ${on}`
  const budgetSpendSummary = `${pointsSpentPhrase(traitPts, 'Traits')}, ${pointsSpentPhrase(skillPts, 'Skills')}.`

  const footerHintTraits = traitsStepErr ? `${budgetSpendSummary} ${traitsStepErr}` : budgetSpendSummary

  const footerHintSkills = (() => {
    const extra = err ? err : remaining >= 0 ? `${remaining} unspent` : ''
    return extra ? `${budgetSpendSummary} ${extra}` : budgetSpendSummary
  })()

  const footerHintMatch =
    matchValidity.teamError ??
    'Pick a scenario (or Custom) for roster, CPU tiers, board, and sudden death. CPUs roll random loadouts when the battle starts.'

  const loadoutBlockedForMatch = !!err || !!traitsStepErr
  const matchNavTitle = loadoutBlockedForMatch
    ? 'Fix trait/skill budget and loadout errors first'
    : undefined

  const guideContext =
    phase === 'match' ? (
      <>
        <p className="ls-modal__note">
          Assign each fighter slot to a team letter. Same letter means allies; you need at least two different teams.
          CPUs get random loadouts when the battle starts.
        </p>
        <p className="ls-modal__note">
          Each <strong>scenario</strong> is a fantasy preset: roster, whether CPUs share one difficulty or have their own,
          board size (or auto), and sudden death. Use <strong>Fighters</strong> / <strong>Teams</strong> for a fresh
          balanced split; <strong>Custom</strong> keeps your current sheet so you can tweak anything. Skills, Strikes, and
          tile hazards can hit anyone in range — allies and yourself included.
        </p>
        <p className="ls-modal__note">
          <strong>CPU difficulty</strong> applies per computer fighter: how they roll random loadouts and traits, and how
          strong their lookahead is when it is their turn. Non-Easy levels use deeper search in <strong>1v1</strong> than
          with <strong>three or more fighters</strong> (branching is higher in big matches). Nightmare &gt; Hard &gt;
          Normal; Easy sometimes picks among legal moves at random.
        </p>
        <p className="ls-modal__note">
          <strong>Team colors</strong> sit under the roster in the center column. <strong>More options</strong> (right on
          wide layouts) has board size and sudden death.
        </p>
        <p className="ls-modal__note">
          <strong>Sudden death</strong> (optional): after N full rounds (everyone acts once per round), a storm appears.
          The kill zone is shown right away; the <strong>first</strong> full-round boundary after that is warning-only (no
          storm damage). Afterward, storm damage and &quot;skip&quot; rounds <strong>alternate</strong>.{' '}
          <strong>Pulsing</strong> red storm tiles mean the next boundary will <em>not</em> storm-tick;{' '}
          <strong>solid</strong> red means it will. The safe zone shrinks over time. Storm damage ignores armor and only
          burns shield, then HP.
        </p>
      </>
    ) : (
      <ol className="ls-modal__guide-list">
        <li>
          <strong>Traits, skills, then match.</strong> Use the steps across the top. Match stays locked until your
          loadout is valid. Start battle runs from the Match step.
        </li>
        <li>
          <strong>One budget.</strong> Level is your total point pool. The meter shows total spent vs level; the footer
          breaks down trait vs skill spend.
        </li>
        <li>
          <strong>Trait steppers.</strong> Each point costs 1 level budget. Subtitles under each row and the battle
          numbers panel below the grid show live values and what each trait changes.
        </li>
        <li>
          <strong>Skill slots.</strong> You can equip up to {maxSkillSlots} skills at this level. Adding a skill needs
          enough remaining budget for a minimal configuration.
        </li>
        <li>
          <strong>Per-skill tuning.</strong> For each equipped skill: pattern (shape and multi-hit), status stacks, mana
          discount, and extra range (when the skill is not self-target). The editor shows element, loadout cost, and
          effective cast range.
        </li>
        <li>
          <strong>Casting in battle.</strong> Skill shapes anchor on the cell you click; cast range is measured from your
          position to that anchor.
        </li>
        <li>
          <strong>Randomize.</strong> The dice button spends your full level budget on traits, skills, and configs at
          random.
        </li>
        <li>
          <strong>Reset.</strong> The undo button clears traits, unequips all skills, and resets every skill config to
          base values. Your level (LV) stays the same.
        </li>
      </ol>
    )

  return (
    <div className={`loadout-surface${phase === 'match' ? ' match-setup' : ''}`}>
      <header className="ls-top ls-top-wrap">
        <div className="ls-phase">
          <button
            type="button"
            className={`ls-phase__btn${phase === 'traits' ? ' is-current' : ''}`}
            onClick={() => setPhase('traits')}
            aria-current={phase === 'traits' ? 'step' : undefined}
          >
            Traits
          </button>
          <span className="ls-phase__sep" aria-hidden>
            /
          </span>
          <button
            type="button"
            className={`ls-phase__btn${phase === 'skills' ? ' is-current' : ''}`}
            disabled={phase === 'traits' && !!traitsStepErr}
            onClick={() => {
              if (!traitsStepErr) setPhase('skills')
            }}
            aria-current={phase === 'skills' ? 'step' : undefined}
            title={traitsStepErr ?? undefined}
          >
            Skills
          </button>
          <span className="ls-phase__sep" aria-hidden>
            /
          </span>
          <button
            type="button"
            className={`ls-phase__btn${phase === 'match' ? ' is-current' : ''}`}
            disabled={loadoutBlockedForMatch}
            onClick={() => {
              if (!loadoutBlockedForMatch) setPhase('match')
            }}
            aria-current={phase === 'match' ? 'step' : undefined}
            title={matchNavTitle}
          >
            Match
          </button>
        </div>

        <div className="ls-budget" aria-label="Level and budget">
          <label className="ls-level">
            <span>LV</span>
            <NumberStepper
              variant="level"
              min={1}
              max={MAX_LEVEL}
              value={level}
              onValueChange={(n) => {
                markLoadoutCustom()
                setLevel(Math.min(MAX_LEVEL, Math.max(1, Math.floor(n))))
              }}
              aria-label="Level — total point budget"
            />
          </label>
          <div
            className={`ls-meter${level > 0 && total === level && !err && !traitsStepErr ? ' is-full' : ''}`}
            title={
              level > 0 && total === level && !err && !traitsStepErr ? 'Budget fully allocated' : undefined
            }
          >
            <span className="ls-meter__label">Points</span>
            <div
              className="ls-meter__track"
              role="progressbar"
              aria-valuenow={total}
              aria-valuemin={0}
              aria-valuemax={level}
            >
              <div
                className={`ls-meter__fill${err || traitsStepErr ? ' is-over' : ''}`}
                style={{ width: `${pointsPct}%` }}
              />
            </div>
            <span className={`ls-meter__nums${err || remaining < 0 || traitsStepErr ? ' is-err' : ''}`}>
              {total}/{level}
            </span>
          </div>
          <button
            type="button"
            className="ls-random"
            onClick={applyRandomFullLoadout}
            title="Randomly spend your full level budget on traits and skills"
            aria-label="Randomize full loadout"
          >
            <svg className="ls-random__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <rect
                x="3.5"
                y="3.5"
                width="17"
                height="17"
                rx="2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <circle cx="8" cy="8" r="1.35" fill="currentColor" />
              <circle cx="16" cy="8" r="1.35" fill="currentColor" />
              <circle cx="12" cy="12" r="1.35" fill="currentColor" />
              <circle cx="8" cy="16" r="1.35" fill="currentColor" />
              <circle cx="16" cy="16" r="1.35" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="ls-loadout-reset"
            onClick={resetLoadoutUpgrades}
            title="Reset loadout for this level (clears traits and skills; keeps LV)"
            aria-label="Reset loadout except level"
          >
            <svg className="ls-loadout-reset__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 6 6v0a6 6 0 0 1-6 6H10"
              />
            </svg>
          </button>
          <div className="ls-preset ls-preset--combobox" ref={presetComboRef}>
            <button
              type="button"
              id="preset-template-trigger"
              className="ls-preset-select ls-preset-select--trigger"
              aria-label="Loadout template — level shown in each option"
              aria-haspopup="listbox"
              aria-expanded={presetMenuOpen}
              aria-controls="preset-template-listbox"
              onClick={() => setPresetMenuOpen((o) => !o)}
            >
              {presetTriggerLabel}
            </button>
            {presetMenuOpen ? (
              <div
                className="ls-preset-menu"
                id="preset-template-listbox"
                role="listbox"
                aria-labelledby="preset-template-trigger"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={presetSelection === 'custom'}
                  className="ls-preset-option"
                  onClick={() => markLoadoutCustom()}
                >
                  Custom (current)
                </button>
                {PRESET_PLAYER_BUILDS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={presetSelection === p.id}
                    className="ls-preset-option"
                    onClick={() => applyPresetBuild(p)}
                  >
                    {formatPresetLabel(p)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <GameGuide contextContent={guideContext} />
      </header>

      <div className="ls-body" hidden={phase === 'match'}>
        {phase === 'traits' ? (
          <div className="ls-traits-phase">
            <div className="ls-traits">
              {traitReferenceZones.map((zone) => (
                <section key={zone.title} className="ls-zone" aria-label={zone.title}>
                  <h3 className="ls-zone__title">{zone.title}</h3>
                  <div className="ls-zone__grid">
                    {zone.traits.map((t) => {
                      const traitMax = Math.max(0, level - skillPts - totalTraitPoints(traits) + traits[t.key])
                      return (
                        <TraitRail
                          key={t.key}
                          traitKey={t.key}
                          value={traits[t.key]}
                          max={traitMax}
                          onChange={(n) => setTraitValue(t.key, n)}
                          subtitle={traitHint(t.key, hintCtx)}
                          onDerivedPreviewEnter={() => onTraitDerivedPreviewEnter(t.key)}
                          onDerivedPreviewLeave={onTraitDerivedPreviewLeave}
                        />
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
            <div className="ls-traits-dock" aria-label="Build summary">
              <TraitDerivedStatsPanel
                traits={traits}
                level={level}
                hoverBumpTraitKey={traitDerivedHoverKey}
              />
            </div>
          </div>
        ) : (
          <div className="ls-skills">
            <aside className="ls-roster" aria-label="Skills">
              <p className="ls-roster__label">
                Loadout ({selected.size}/{maxSkillSlots})
              </p>
              <ul className="ls-roster__list">
                {LOADOUT_ROSTER_SECTIONS.map(({ id: sectionId, label: sectionLabel }) => {
                  const skillsInSection = SKILL_ROSTER.filter((s) => skillLoadoutSection(s) === sectionId)
                  if (skillsInSection.length === 0) return null
                  const headingId = `ls-roster-section-${sectionId}`
                  return (
                    <li key={sectionId} className="ls-roster__section">
                      <p className="ls-roster__section-label" id={headingId}>
                        {sectionLabel}
                      </p>
                      <ul className="ls-roster__section-list" aria-labelledby={headingId}>
                        {skillsInSection.map((s) => {
                          const on = selected.has(s.id)
                          const isActive = resolvedSkillId === s.id
                          const addBudget = maxSkillPointsBudget(level, traits, entries, s.id as SkillId)
                          const canAddNew =
                            selected.size < maxSkillSlots && addBudget >= BASELINE_SKILL_LOADOUT_POINT_COST
                          const addBlocked = !on && !canAddNew
                          const addBlockTitle =
                            addBlocked && selected.size >= maxSkillSlots
                              ? `Loadout full (${maxSkillSlots} skills at this level)`
                              : addBlocked
                                ? 'Not enough level budget for another skill'
                                : undefined
                          return (
                            <li key={s.id}>
                              <div className="ls-roster__row">
                                <button
                                  type="button"
                                  className={`ls-roster__toggle${on ? ' is-on' : ''}`}
                                  aria-label={on ? `Remove ${s.name}` : `Add ${s.name}`}
                                  aria-pressed={on}
                                  disabled={addBlocked}
                                  title={addBlockTitle}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (addBlocked) return
                                    toggleSkill(s.id)
                                  }}
                                />
                                <button
                                  type="button"
                                  className={`ls-roster__name${isActive ? ' is-active' : ''}`}
                                  disabled={addBlocked}
                                  title={addBlockTitle}
                                  aria-label={
                                    on
                                      ? `Edit ${s.name}`
                                      : addBlockTitle
                                        ? `${s.name} — ${addBlockTitle}`
                                        : `Add ${s.name} to loadout`
                                  }
                                  onClick={() => {
                                    if (addBlocked) return
                                    if (on) setConfigureSkillId(s.id)
                                    else toggleSkill(s.id)
                                  }}
                                >
                                  {s.name}
                                </button>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </li>
                  )
                })}
              </ul>
            </aside>

            <main className="ls-stage">
              {!activeSkill ? (
                <p className="ls-rail__empty">Select a skill from the list.</p>
              ) : !selected.has(activeSkill.id) ? (
                <>
                  <div className="ls-stage__head">
                    <div className="ls-stage__title-line">
                      <h2>{activeSkill.name}</h2>
                      <span className="ls-stage__meta">Not in loadout</span>
                    </div>
                    <p className="ls-stage__flavor">{activeSkill.flavor}</p>
                    <p className="ls-stage__effects" role="note">
                      <span className="ls-stage__effects-label">Effects — </span>
                      {activeSkill.effectsLine}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ls-btn-primary"
                    disabled={
                      selected.size >= maxSkillSlots ||
                      maxSkillPointsBudget(level, traits, entries, activeSkill.id as SkillId) <
                        BASELINE_SKILL_LOADOUT_POINT_COST
                    }
                    title={
                      maxSkillPointsBudget(level, traits, entries, activeSkill.id as SkillId) <
                      BASELINE_SKILL_LOADOUT_POINT_COST
                        ? 'Not enough level budget for this skill'
                        : undefined
                    }
                    onClick={() => toggleSkill(activeSkill.id)}
                  >
                    Add
                  </button>
                </>
              ) : activeCfg && activeSkill ? (
                <>
                  <div className="ls-stage__head">
                    <div className="ls-stage__title-line">
                      <h2>{activeSkill.name}</h2>
                      <span className="ls-stage__meta">
                        {capitalizeLabel(activeSkill.element)} · {activeEntry ? entryPointCost(activeEntry) : 0} pts
                      </span>
                    </div>
                    <p className="ls-stage__flavor">{activeSkill.flavor}</p>
                    <p className="ls-stage__effects" role="note">
                      <span className="ls-stage__effects-label">Effects — </span>
                      {activeSkill.effectsLine}
                    </p>
                  </div>
                  <div className="ls-stage__grid">
                    {/* Key must not include AoE tier — remount resets SkillLoadoutGrid preview anchor. */}
                    <SkillLoadoutGrid
                      key={`skill-grid-${loadoutGridNonce}-${activeSkill.id}-${boardSizeForLevel(level)}-${activeReachR}-${activeCfg.rangeTier ?? 0}-${activeCfg.aoeTier ?? 0}`}
                      skillId={activeSkill.id}
                      pattern={activeCfg.pattern}
                      onPatternChange={(pattern) => setSkillConfig(activeSkill.id, { pattern })}
                      range={activeSkill.range}
                      effectiveRange={activeReachR}
                      statusStacks={activeCfg.statusStacks}
                      costDiscount={activeCfg.costDiscount ?? 0}
                      rangeTier={activeCfg.rangeTier ?? 0}
                      aoeTier={activeCfg.aoeTier ?? 0}
                      boardSize={boardSizeForLevel(level)}
                      loadoutShuffleNonce={loadoutGridNonce}
                    />
                  </div>
                </>
              ) : null}
            </main>

            <aside className="ls-rail" aria-label="Skill parameters">
              {activeSkill && activeCfg && activeEntry && selected.has(activeSkill.id) ? (
                <>
                  <LoadoutSkillRailDetails def={activeSkill} entry={activeEntry} reachR={activeReachR} />
                  <hr className="ls-rail__sep" aria-hidden="true" />
                  <p className="ls-rail__title">Tune</p>
                  <div className="ls-inline">
                    <div className="ls-inline__row">
                      <span>Stacks</span>
                      <NumberStepper
                        variant="rail"
                        min={1}
                        max={activeMaxStacks}
                        value={activeCfg.statusStacks}
                        onValueChange={(n) =>
                          setSkillConfig(activeSkill.id, {
                            statusStacks: Math.max(1, Math.floor(n)),
                          })
                        }
                        aria-label="Status intensity"
                      />
                    </div>
                    <div className="ls-inline__row">
                      <span>Mana disc.</span>
                      <NumberStepper
                        variant="rail"
                        min={0}
                        max={activeMaxDiscount}
                        value={activeCfg.costDiscount ?? 0}
                        onValueChange={(n) =>
                          setSkillConfig(activeSkill.id, {
                            costDiscount: Math.max(0, Math.min(activeMaxDiscount, Math.floor(n))),
                          })
                        }
                        aria-label="Mana discount (loadout points to lower battle mana)"
                      />
                    </div>
                    <div className="ls-inline__row">
                      <span>Cast rng</span>
                      <NumberStepper
                        variant="rail"
                        min={0}
                        max={activeMaxRangeTier}
                        value={activeCfg.rangeTier ?? 0}
                        onValueChange={(n) =>
                          setSkillConfig(activeSkill.id, {
                            rangeTier: Math.max(0, Math.min(activeMaxRangeTier, Math.floor(n))),
                          })
                        }
                        aria-label="Cast range tiers"
                      />
                    </div>
                    <div className="ls-inline__row">
                      <span>AoE rng</span>
                      <NumberStepper
                        variant="rail"
                        min={0}
                        max={activeMaxAoeTier}
                        value={activeCfg.aoeTier ?? 0}
                        onValueChange={(n) =>
                          setSkillConfig(activeSkill.id, {
                            aoeTier: Math.max(0, Math.min(activeMaxAoeTier, Math.floor(n))),
                          })
                        }
                        aria-label="AoE range tiers"
                      />
                    </div>
                  </div>
                  <button type="button" className="ls-btn-ghost" onClick={() => resetSkillToBasic(activeSkill.id)}>
                    Reset shape
                  </button>
                </>
              ) : (
                <p className="ls-rail__empty">Select a skill to edit stacks and discount.</p>
              )}
            </aside>
          </div>
        )}
      </div>

      <div className="ls-body ls-body--match" hidden={phase !== 'match'}>
        <MatchSetupForm
          ref={matchFormRef}
          draft={matchDraft}
          onValidityChange={handleMatchValidityChange}
        />
      </div>

      <footer className="ls-foot">
        <p
          className={`ls-foot__hint${
            (phase === 'traits' && traitsStepErr) || (phase === 'skills' && !!err) || (phase === 'match' && !!matchValidity.teamError)
              ? ' is-err'
              : ''
          }`}
        >
          {phase === 'traits' ? footerHintTraits : phase === 'skills' ? footerHintSkills : footerHintMatch}
        </p>
        <div className="ls-foot__actions">
          {phase === 'match' ? (
            <>
              <button type="button" className="ls-btn-ghost" onClick={() => setPhase('skills')}>
                Back
              </button>
              <button
                type="button"
                className="ls-btn-primary"
                disabled={!matchValidity.canStart}
                onClick={() => {
                  const cfg = matchFormRef.current?.tryConfirm()
                  if (cfg) onStartBattle(cfg)
                }}
              >
                PLAY
              </button>
            </>
          ) : phase === 'skills' ? (
            <>
              <button type="button" className="ls-btn-ghost" onClick={() => setPhase('traits')}>
                Back
              </button>
              <button
                type="button"
                className="ls-btn-primary"
                disabled={loadoutBlockedForMatch}
                title={matchNavTitle}
                onClick={() => setPhase('match')}
              >
                CONTINUE
              </button>
            </>
          ) : (
            <button type="button" className="ls-btn-primary" disabled={!!traitsStepErr} onClick={() => setPhase('skills')}>
              Continue
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
