import { useEffect, useMemo, useRef, useState } from 'react'
import type { PatternOffset, SkillId, SkillLoadoutEntry, TraitPoints } from '../game/types'
import type { MatchDraft } from './MatchSetupScreen'
import {
  basePowerCost,
  clampSkillLoadoutEntry,
  effectiveAoERadius,
  effectiveCastRangeForLoadout,
  entryPointCost,
  fitPlayerBudgetToLevel,
  getSkillDef,
  maxPurchasableAoeTier,
  maxPurchasableRangeTier,
  maxSkillPointsBudget,
  tierPointCost,
  maxSkillsForLevel,
  SKILL_ROSTER,
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
import './loadout/loadout-surface.css'

const STORAGE_KEY = 'skillcraft-loadout-v6'
const LEGACY_STORAGE_KEY = 'skillcraft-loadout-v4'

const MAX_LEVEL = 99

/** Default skills for a fresh loadout (before localStorage); order matches roster priority for editor focus. */
function starterSkillIdsForLevel(level: number): string[] {
  const cap = maxSkillsForLevel(level)
  return ['ember', 'frost_bolt', 'tide_touch', 'spark'].slice(0, cap)
}

type SkillConfig = {
  pattern: PatternOffset[]
  statusStacks: number
  manaDiscount: number
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
    manaDiscount: 0,
    rangeTier: 0,
    aoeTier: 0,
  }
}

function loadStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Stored
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
  level,
  onChange,
  title,
}: {
  traitKey: TraitKey
  value: number
  /** Slider track uses a fixed scale (0…level) so other rails do not jump when one trait changes. */
  level: number
  onChange: (n: number) => void
  title: string
}) {
  const { label, short } = traitDisplayByKey[traitKey]
  const line = `${label} (${short})`
  return (
    <div className="ls-trait" title={title}>
      <span className="ls-trait__short">{line}</span>
      <input
        type="range"
        className="ls-trait__range"
        min={0}
        max={level}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${line}: ${title}`}
      />
      <span className="ls-trait__num">{value}</span>
    </div>
  )
}

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
      return `+1 step/move (now ${moveMaxSteps})`
    case 'intelligence':
      return `+1 mana/turn at turn start (now +${manaRegenPerTurn})`
    case 'vitality':
      return `+${HP_PER_VITALITY} max HP each (preview ${previewMaxHp} HP)`
    case 'wisdom':
      return `+${MANA_PER_WISDOM} max mana each beyond level (preview ${previewMaxMana} mana)`
    case 'regeneration':
      return 'Heal this much HP at the start of each of your turns'
    case 'tenacity':
      return 'Subtract from each DoT tick you take (burn, poison, bleed)'
    case 'arcaneReach':
      return `+1 skill range per 2 pts (skills use +${Math.floor(traits.arcaneReach / 2)} range)`
    case 'spellFocus':
      return '+Damage to elemental skills after defense (per hit)'
    case 'statusPotency':
      return 'Stronger DoTs, shock vuln, and durations from your skills'
    case 'strength':
      return `Base ${previewStrikeBase} physical before tempo/rhythm; ~${previewStrikeWithTempo} with tempo if ≤1 tile moved`
    case 'bleedBonus':
      return 'Stronger bleeding DoT from strikes'
    case 'meleeLifesteal':
      return 'Heal HP equal to points on each Strike'
    case 'strikeKnockback':
      return 'If ≥1, Strike pushes the enemy one free tile away'
    case 'strikeSlow':
      return 'If ≥1, Strike applies slowed (longer with more pts)'
    case 'meleeDuelReduction':
      return 'Flat less damage from adjacent attackers'
    case 'fortitude':
      return 'Less damage from enemy Strikes (after duel reduction)'
    case 'physicalArmor':
      return 'Extra flat reduction vs Strikes and physical skills (after fortitude)'
    case 'strikeTempo':
      return `+Damage per pt if you moved ≤1 tile this turn (~${previewStrikeWithTempo})`
    case 'strikeRhythm':
      return `Bonus on 2nd, 4th… consecutive Strike (preview 2nd chain: ${previewStrikeRhythm2})`
    case 'defenseFire':
    case 'defenseIce':
    case 'defenseWater':
    case 'defenseElectric':
    case 'defensePoison':
    case 'defenseWind':
    case 'defenseEarth':
    case 'defenseArcane':
      return 'Per-element reduction vs skills (not Strikes)'
    default:
      return `${String(key)} · 0–${maxTraitPool}`
  }
}

export function LoadoutScreen({
  onContinueToMatch,
}: {
  onContinueToMatch: (draft: MatchDraft) => void
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
              manaDiscount: c.manaDiscount ?? 0,
              rangeTier: c.rangeTier ?? 0,
              aoeTier: c.aoeTier ?? 0,
            }
          : defaultSkillConfig()
      }
      return merged
    }
    return Object.fromEntries(SKILL_ROSTER.map((s) => [s.id, defaultSkillConfig()]))
  })
  const [traits, setTraits] = useState<TraitPoints>(() => ({
    ...defaultTraitPoints(),
    ...stored?.traits,
  }))
  const [configureSkillId, setConfigureSkillId] = useState<string | null>(null)
  /** Bumps when applying "Randomize everything" so SkillLoadoutGrid remounts and picks a fresh preview anchor. */
  const [loadoutGridNonce, setLoadoutGridNonce] = useState(0)
  const [presetSelection, setPresetSelection] = useState<'custom' | string>('custom')
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const presetComboRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'traits' | 'skills'>('traits')

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
        manaDiscount: c.manaDiscount ?? 0,
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
        manaDiscount: e.manaDiscount,
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
      manaDiscount: c.manaDiscount ?? 0,
      rangeTier: c.rangeTier ?? 0,
      aoeTier: c.aoeTier ?? 0,
    }
  })

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
  const budgetLeftForSkills = level - traitPts

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
          manaDiscount: activeCfg.manaDiscount ?? 0,
          rangeTier: activeCfg.rangeTier ?? 0,
          aoeTier: activeCfg.aoeTier ?? 0,
        }
      : null
  const activeReachR =
    activeSkill && activeEntry
      ? effectiveCastRangeForLoadout(getSkillDef(activeSkill.id), activeEntry, traits)
      : 0
  const activeAoeR =
    activeSkill && activeEntry ? effectiveAoERadius(getSkillDef(activeSkill.id), activeEntry) : 0
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
            activeSkillBudget - activeCfg.pattern.length - (activeCfg.manaDiscount ?? 0),
          ),
        )
      : 1
  const activeMaxRangeTier =
    activeSkill && activeCfg && !getSkillDef(activeSkill.id).selfTarget
      ? maxPurchasableRangeTier(
          activeSkillBudget -
            activeCfg.pattern.length -
            activeCfg.statusStacks -
            (activeCfg.manaDiscount ?? 0) -
            tierPointCost(activeCfg.aoeTier ?? 0),
        )
      : 0

  const activeMaxAoeTier =
    activeSkill && activeCfg && !getSkillDef(activeSkill.id).selfTarget
      ? maxPurchasableAoeTier(
          activeSkillBudget -
            activeCfg.pattern.length -
            activeCfg.statusStacks -
            (activeCfg.manaDiscount ?? 0) -
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

  function setTraitFromSlider<K extends keyof TraitPoints>(key: K, raw: number): void {
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
              manaDiscount: c.manaDiscount ?? 0,
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
            manaDiscount: 0,
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
            manaDiscount: starter.manaDiscount,
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
            manaDiscount: c.manaDiscount ?? 0,
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
        manaDiscount: cur.manaDiscount ?? 0,
        rangeTier: cur.rangeTier ?? 0,
        aoeTier: cur.aoeTier ?? 0,
      }
      const clamped = clampSkillLoadoutEntry(draft, def, maxPts)
      return {
        ...cfg,
        [id]: {
          pattern: clamped.pattern,
          statusStacks: clamped.statusStacks,
          manaDiscount: clamped.manaDiscount,
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
              manaDiscount: e.manaDiscount ?? 0,
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
              manaDiscount: e.manaDiscount ?? 0,
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

  const footerHintTraits = traitsStepErr
    ? traitsStepErr
    : `${budgetLeftForSkills} pts remain for skills.`

  const footerHintSkills = err ? err : remaining >= 0 ? `${remaining} unspent` : ''

  return (
    <div className="loadout-surface">
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
        </div>

        <div className="ls-budget" aria-label="Level and budget">
          <label className="ls-level">
            <span>LV</span>
            <input
              type="number"
              min={1}
              max={MAX_LEVEL}
              value={level}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isNaN(n)) return
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
              {total}/{level} · tr{traitPts} · sk{skillPts}
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

        <GameGuide
          contextContent={
            <ol className="ls-modal__guide-list">
              <li>
                <strong>Traits, then skills.</strong> Work in two steps. Skills stays locked until traits + skills
                spend is at most your level. Continue only works within budget; Fight runs full validation (at least
                one skill, valid patterns, etc.).
              </li>
              <li>
                <strong>One budget.</strong> Level is your total point pool. The meter shows total/level and tr
                (traits) vs sk (skills).
              </li>
              <li>
                <strong>Trait sliders.</strong> Each step costs 1 point. Sliders cannot exceed what your budget allows.
                Hover a trait for live previews (movement, regen, Strike numbers, and more).
              </li>
              <li>
                <strong>Skill slots.</strong> You can equip up to {maxSkillSlots} skills at this level. Adding a skill
                needs enough remaining budget for a minimal configuration.
              </li>
              <li>
                <strong>Per-skill tuning.</strong> For each equipped skill: pattern (shape and multi-hit), status
                stacks, mana discount, and extra range (when the skill is not self-target). The editor shows element,
                loadout cost, and effective cast range.
              </li>
              <li>
                <strong>Casting in battle.</strong> Skill shapes anchor on the cell you click; cast range is measured
                from your position to that anchor.
              </li>
              <li>
                <strong>Randomize.</strong> The dice button spends your full level budget on traits, skills, and
                configs at random.
              </li>
              <li>
                <strong>Reset.</strong> The undo button clears traits, unequips all skills, and resets every skill config
                to base values. Your level (LV) stays the same.
              </li>
            </ol>
          }
        />
      </header>

      <div className="ls-body">
        {phase === 'traits' ? (
          <div className="ls-traits">
            {traitReferenceZones.map((zone) => (
              <section key={zone.title} className="ls-zone" aria-label={zone.title}>
                <h3 className="ls-zone__title">{zone.title}</h3>
                {zone.title === 'Core' ? (
                  <p className="ls-zone__preview">
                    Move {moveMaxSteps} · MP/turn +{manaRegenPerTurn} · HP {previewMaxHp} · Mana {previewMaxMana}
                  </p>
                ) : null}
                {zone.title === 'Melee' ? (
                  <p className="ls-zone__preview">
                    Strike base {previewStrikeBase} · tempo ~{previewStrikeWithTempo} · rhythm-2 {previewStrikeRhythm2}
                  </p>
                ) : null}
                <div className="ls-zone__grid">
                  {zone.traits.map((t) => (
                    <TraitRail
                      key={t.key}
                      traitKey={t.key}
                      value={traits[t.key]}
                      level={level}
                      onChange={(n) => setTraitFromSlider(t.key, n)}
                      title={traitHint(t.key, hintCtx)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="ls-skills">
            <aside className="ls-roster" aria-label="Skills">
              <p className="ls-roster__label">Loadout</p>
              <ul className="ls-roster__list">
                {SKILL_ROSTER.map((s) => {
                  const on = selected.has(s.id)
                  const isActive = resolvedSkillId === s.id
                  const addBudget = maxSkillPointsBudget(level, traits, entries, s.id as SkillId)
                  const canAddNew = selected.size < maxSkillSlots && addBudget >= 2
                  return (
                    <li key={s.id}>
                      <div className="ls-roster__row">
                        <button
                          type="button"
                          className={`ls-roster__toggle${on ? ' is-on' : ''}`}
                          aria-label={on ? `Remove ${s.name}` : `Add ${s.name}`}
                          aria-pressed={on}
                          disabled={!on && !canAddNew}
                          title={!on && !canAddNew ? 'Not enough level budget for another skill' : undefined}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!on && !canAddNew) return
                            toggleSkill(s.id)
                          }}
                        />
                        <button
                          type="button"
                          className={`ls-roster__name${isActive ? ' is-active' : ''}`}
                          onClick={() => setConfigureSkillId(s.id)}
                        >
                          {s.name}
                        </button>
                      </div>
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
                    <h2>{activeSkill.name}</h2>
                    <span className="ls-stage__meta">Not in loadout</span>
                  </div>
                  <button
                    type="button"
                    className="ls-btn-primary"
                    disabled={
                      selected.size >= maxSkillSlots ||
                      maxSkillPointsBudget(level, traits, entries, activeSkill.id as SkillId) < 2
                    }
                    title={
                      maxSkillPointsBudget(level, traits, entries, activeSkill.id as SkillId) < 2
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
                    <h2>{activeSkill.name}</h2>
                    <span className="ls-stage__meta">
                      {activeSkill.element} · {activeEntry ? entryPointCost(activeEntry) : 0} pts · cast r
                      {activeReachR} · AoE {activeAoeR}
                    </span>
                  </div>
                  <div className="ls-stage__grid">
                    <SkillLoadoutGrid
                      key={`skill-grid-${loadoutGridNonce}-${activeSkill.id}-${boardSizeForLevel(level)}-${activeReachR}-${activeCfg.rangeTier ?? 0}-${activeCfg.aoeTier ?? 0}-${getSkillDef(activeSkill.id).selfTarget ? '1' : '0'}`}
                      skillId={activeSkill.id}
                      pattern={activeCfg.pattern}
                      onPatternChange={(pattern) => setSkillConfig(activeSkill.id, { pattern })}
                      range={activeSkill.range}
                      effectiveRange={activeReachR}
                      statusStacks={activeCfg.statusStacks}
                      manaDiscount={activeCfg.manaDiscount ?? 0}
                      rangeTier={activeCfg.rangeTier ?? 0}
                      aoeTier={activeCfg.aoeTier ?? 0}
                      selfTarget={!!getSkillDef(activeSkill.id).selfTarget}
                      boardSize={boardSizeForLevel(level)}
                      loadoutShuffleNonce={loadoutGridNonce}
                    />
                  </div>
                </>
              ) : null}
            </main>

            <aside className="ls-rail" aria-label="Skill parameters">
              {activeSkill && activeCfg && selected.has(activeSkill.id) ? (
                <>
                  <p className="ls-rail__title">Tune</p>
                  <div className="ls-inline">
                    <div className="ls-inline__row">
                      <span>Stacks</span>
                      <input
                        type="number"
                        min={1}
                        max={activeMaxStacks}
                        value={activeCfg.statusStacks}
                        onChange={(e) =>
                          setSkillConfig(activeSkill.id, {
                            statusStacks: Math.max(1, Math.floor(Number(e.target.value))),
                          })
                        }
                        aria-label="Status intensity"
                      />
                    </div>
                    <div className="ls-inline__row">
                      <span>Mana disc.</span>
                      <input
                        type="number"
                        min={0}
                        max={activeMaxDiscount}
                        value={activeCfg.manaDiscount ?? 0}
                        onChange={(e) =>
                          setSkillConfig(activeSkill.id, {
                            manaDiscount: Math.max(
                              0,
                              Math.min(activeMaxDiscount, Math.floor(Number(e.target.value))),
                            ),
                          })
                        }
                        aria-label="Mana discount (loadout points to lower battle mana)"
                      />
                    </div>
                    {!getSkillDef(activeSkill.id).selfTarget ? (
                      <>
                        <div className="ls-inline__row">
                          <span>Cast rng</span>
                          <input
                            type="number"
                            min={0}
                            max={activeMaxRangeTier}
                            value={activeCfg.rangeTier ?? 0}
                            onChange={(e) =>
                              setSkillConfig(activeSkill.id, {
                                rangeTier: Math.max(
                                  0,
                                  Math.min(activeMaxRangeTier, Math.floor(Number(e.target.value))),
                                ),
                              })
                            }
                            aria-label="Cast range tiers"
                          />
                        </div>
                        <div className="ls-inline__row">
                          <span>AoE rng</span>
                          <input
                            type="number"
                            min={0}
                            max={activeMaxAoeTier}
                            value={activeCfg.aoeTier ?? 0}
                            onChange={(e) =>
                              setSkillConfig(activeSkill.id, {
                                aoeTier: Math.max(
                                  0,
                                  Math.min(activeMaxAoeTier, Math.floor(Number(e.target.value))),
                                ),
                              })
                            }
                            aria-label="AoE range tiers"
                          />
                        </div>
                      </>
                    ) : null}
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

      <footer className="ls-foot">
        <p className={`ls-foot__hint${phase === 'traits' && traitsStepErr ? ' is-err' : ''}${phase === 'skills' && !!err ? ' is-err' : ''}`}>
          {phase === 'traits' ? footerHintTraits : footerHintSkills}
        </p>
        <div className="ls-foot__actions">
          {phase === 'skills' ? (
            <button type="button" className="ls-btn-ghost" onClick={() => setPhase('traits')}>
              Back
            </button>
          ) : null}
          {phase === 'traits' ? (
            <button type="button" className="ls-btn-primary" disabled={!!traitsStepErr} onClick={() => setPhase('skills')}>
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="ls-btn-primary"
              disabled={!!err}
              onClick={() => {
                onContinueToMatch({
                  level,
                  playerLoadout: entries,
                  playerTraits: { ...traits },
                })
              }}
            >
              Fight
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
