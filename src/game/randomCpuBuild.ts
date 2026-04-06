import type { CpuDifficulty, PatternOffset, SkillId, SkillLoadoutEntry, TraitPoints } from './types'
import {
  type SkillDefinition,
  effectiveAoERadius,
  fitPlayerBudgetToLevel,
  getSkillDef,
  maxSkillsForLevel,
  SKILL_ROSTER,
  totalLoadoutPoints,
  validateLoadout,
} from './skills'
import { cpuTraitsForLevel, defaultTraitPoints } from './traits'

const TRAIT_KEYS = Object.keys(defaultTraitPoints()) as (keyof TraitPoints)[]

/** Core combat/caster traits — weighted on Hard+ CPU builds. */
const CORE_TRAIT_KEYS = new Set<keyof TraitPoints>([
  'agility',
  'vitality',
  'intelligence',
  'wisdom',
  'spellFocus',
  'tenacity',
  'statusPotency',
])

/** Fill order for Nightmare-style priority spread (after cpuTraitsForLevel-style caps). */
const PRIORITY_TRAIT_ORDER: (keyof TraitPoints)[] = [
  'agility',
  'intelligence',
  'vitality',
  'wisdom',
  'spellFocus',
  'tenacity',
  'statusPotency',
  'regeneration',
]

/** Add one point at a time to random traits until spend reaches `level` (only when under budget). */
function fillRemainingTraitPoints(traits: TraitPoints, entries: SkillLoadoutEntry[], level: number): TraitPoints {
  const t = { ...traits }
  let total = totalLoadoutPoints(entries, t)
  while (total < level) {
    const k = TRAIT_KEYS[Math.floor(Math.random() * TRAIT_KEYS.length)]!
    t[k]++
    total++
  }
  return t
}

/**
 * Random valid traits + skills for the loadout screen: same rules as battle, and spends the full level budget on traits+skills when possible.
 * Falls back to {@link randomCpuBuild} + trim if random rolls fail (rare).
 */
export function randomFullPlayerLoadout(level: number): { traits: TraitPoints; entries: SkillLoadoutEntry[] } {
  const L = Math.max(1, Math.floor(level))
  const maxS = maxSkillsForLevel(L)

  for (let attempt = 0; attempt < 500; attempt++) {
    const traitTotal = randInt(0, Math.max(0, L - 2))
    const traits = randomTraitsDistributed(traitTotal)
    const skillCount = randInt(1, maxS)
    const skillIds = pickDistinctSkillIdsForDifficulty(skillCount, 'normal')
    const entries = skillIds.map((id) => randomEntryForSkill(id, L, 'normal'))
    const err = validateLoadout(L, entries, maxS, traits)
    if (!err) {
      return {
        traits: fillRemainingTraitPoints(traits, entries, L),
        entries,
      }
    }
  }

  const { cpuLoadout, cpuTraits } = randomCpuBuild(L)
  const fitted = fitPlayerBudgetToLevel(L, cpuTraits, cpuLoadout)
  return {
    traits: fillRemainingTraitPoints(fitted.traits, fitted.entries, L),
    entries: fitted.entries,
  }
}

/**
 * Builds a legal random CPU loadout + traits for the given level.
 * Uses rejection sampling so every field can vary while respecting the same budget rules as the player.
 *
 * At level 1 the smallest legal skill costs 2 points, so the roll uses a budget of at least 2 so the
 * opponent always gets a valid build (the battle `level` in config stays yours; only CPU spend uses this).
 */
export function randomCpuBuild(
  level: number,
  difficulty: CpuDifficulty = 'normal',
): { cpuLoadout: SkillLoadoutEntry[]; cpuTraits: TraitPoints } {
  const budget = Math.max(2, level)

  for (let attempt = 0; attempt < 500; attempt++) {
    const traitTotal = randInt(0, Math.max(0, budget - 2))
    const traits = traitsForCpuDifficulty(traitTotal, difficulty)
    const maxS = maxSkillsForLevel(budget)
    const skillCount = randInt(1, maxS)
    const skillIds = pickDistinctSkillIdsForDifficulty(skillCount, difficulty)
    const entries = skillIds.map((id) => randomEntryForSkill(id, budget, difficulty))
    const err = validateLoadout(budget, entries, maxS, traits)
    if (!err) {
      return { cpuLoadout: entries, cpuTraits: traits }
    }
  }

  return {
    cpuTraits: cpuTraitsForLevel(budget),
    cpuLoadout: [
      {
        skillId: 'ember',
        pattern: [{ dx: 0, dy: 0 }],
        statusStacks: 1,
        manaDiscount: 0,
        rangeTier: 0,
        aoeTier: 0,
      },
    ],
  }
}

function traitsForCpuDifficulty(traitTotal: number, difficulty: CpuDifficulty): TraitPoints {
  switch (difficulty) {
    case 'easy':
      return randomTraitsDistributed(traitTotal)
    case 'normal':
      return randomTraitsDistributed(traitTotal)
    case 'hard':
      return weightedTraitsDistributed(traitTotal)
    case 'nightmare':
      return priorityTraitSpread(traitTotal)
  }
}

/** Uniform random distribution across all trait keys (Easy / Normal). */
function randomTraitsDistributed(total: number): TraitPoints {
  const t = defaultTraitPoints()
  const keys = Object.keys(t) as (keyof TraitPoints)[]
  for (let i = 0; i < total; i++) {
    const k = keys[Math.floor(Math.random() * keys.length)]!
    t[k] += 1
  }
  return t
}

/** Favor core combat/caster stats (Hard). */
function weightedTraitsDistributed(total: number): TraitPoints {
  const t = defaultTraitPoints()
  const keys = TRAIT_KEYS
  const weights = keys.map((k) => (CORE_TRAIT_KEYS.has(k) ? 5 : 1))
  for (let i = 0; i < total; i++) {
    const k = weightedPickKey(keys, weights)
    t[k] += 1
  }
  return t
}

/**
 * Same spirit as {@link cpuTraitsForLevel}: agility → int → vitality caps, then other priorities.
 */
function priorityTraitSpread(total: number): TraitPoints {
  const t = defaultTraitPoints()
  const caps: Partial<Record<keyof TraitPoints, number>> = {
    agility: 4,
    intelligence: 4,
    vitality: 6,
  }
  let remaining = total
  while (remaining > 0) {
    let placed = false
    for (const k of PRIORITY_TRAIT_ORDER) {
      const cap = caps[k] ?? 99
      if (t[k] < cap) {
        t[k]++
        remaining--
        placed = true
        break
      }
    }
    if (!placed) {
      t.agility++
      remaining--
    }
  }
  return t
}

function weightedPickKey(keys: (keyof TraitPoints)[], weights: number[]): keyof TraitPoints {
  let sum = 0
  for (const w of weights) sum += w
  let r = Math.random() * sum
  for (let i = 0; i < keys.length; i++) {
    r -= weights[i]!
    if (r <= 0) return keys[i]!
  }
  return keys[keys.length - 1]!
}

function pickDistinctSkillIdsForDifficulty(n: number, difficulty: CpuDifficulty): SkillId[] {
  const ids = SKILL_ROSTER.map((s) => s.id)
  if (difficulty === 'easy' || difficulty === 'normal') {
    shuffleInPlace(ids)
    return ids.slice(0, Math.min(n, ids.length))
  }

  const weights = ids.map((id) => skillPickWeight(id, difficulty))
  const out: SkillId[] = []
  const pool = [...ids]
  const wts = [...weights]
  while (out.length < Math.min(n, pool.length)) {
    const idx = weightedPickIndex(wts)
    out.push(pool[idx]!)
    pool.splice(idx, 1)
    wts.splice(idx, 1)
  }
  return out
}

function skillPickWeight(id: SkillId, difficulty: CpuDifficulty): number {
  const def = getSkillDef(id)
  if (difficulty === 'hard') {
    return 6 + def.baseDamage + (def.selfTarget ? 2 : 4)
  }
  // nightmare
  return 10 + def.baseDamage * 2 + (def.selfTarget ? 1 : 5)
}

function weightedPickIndex(weights: number[]): number {
  let sum = 0
  for (const w of weights) sum += w
  let r = Math.random() * sum
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!
    if (r <= 0) return i
  }
  return weights.length - 1
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
}

/** All pattern offsets with Chebyshev radius ≤ R (inclusive). */
function offsetsInChebyshevDisk(R: number): PatternOffset[] {
  const out: PatternOffset[] = []
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      out.push({ dx, dy })
    }
  }
  return out
}

function tierRoll(cap: number, difficulty: CpuDifficulty): number {
  if (cap <= 0) return 0
  switch (difficulty) {
    case 'easy':
      return randInt(0, cap)
    case 'normal':
      return randInt(0, cap)
    case 'hard': {
      const a = randInt(0, cap)
      const b = randInt(0, cap)
      return Math.min(cap, Math.floor((a + b) / 2))
    }
    case 'nightmare':
      return randInt(Math.max(0, cap - 1), cap)
  }
}

function manaDiscountRoll(maxDiscount: number, difficulty: CpuDifficulty): number {
  if (maxDiscount === 0) return 0
  switch (difficulty) {
    case 'easy':
      return randInt(0, maxDiscount)
    case 'normal':
      return randInt(0, maxDiscount)
    case 'hard':
      return randInt(Math.floor(maxDiscount * 0.25), maxDiscount)
    case 'nightmare':
      return randInt(Math.floor(maxDiscount * 0.5), maxDiscount)
  }
}

/**
 * Random pattern inside the skill’s AoE disk for the given tiers.
 * At R=0 only (0,0) is legal — use multi-hit on that cell.
 */
function randomOffensivePattern(
  def: SkillDefinition,
  rangeTier: number,
  aoeTier: number,
  difficulty: CpuDifficulty,
): PatternOffset[] {
  const stub: SkillLoadoutEntry = {
    skillId: def.id,
    pattern: [{ dx: 0, dy: 0 }],
    statusStacks: 1,
    manaDiscount: 0,
    rangeTier,
    aoeTier,
  }
  const R = effectiveAoERadius(def, stub)
  if (R === 0) {
    const maxLen = difficulty === 'easy' ? 8 : 6
    const len = randInt(1, maxLen)
    return Array.from({ length: len }, () => ({ dx: 0, dy: 0 }))
  }
  const cells = offsetsInChebyshevDisk(R)
  const spread = difficulty === 'easy' ? 3 : 2
  const len = randInt(1, Math.min(8 * spread, Math.max(1, cells.length * spread)))
  return Array.from({ length: len }, () => cells[Math.floor(Math.random() * cells.length)]!)
}

function tierCapForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level))
  return Math.min(6, Math.max(0, Math.floor(lv / 2)))
}

function randomEntryForSkill(skillId: SkillId, level: number, difficulty: CpuDifficulty): SkillLoadoutEntry {
  const def = getSkillDef(skillId)
  const cap = tierCapForLevel(level)
  if (def.selfTarget) {
    const pattern = [{ dx: 0, dy: 0 }]
    const statusStacks = randInt(1, 5)
    const base = pattern.length + statusStacks
    const maxDiscount = Math.max(0, base - 1)
    const manaDiscount = maxDiscount === 0 ? 0 : manaDiscountRoll(maxDiscount, difficulty)
    return { skillId, pattern, statusStacks, manaDiscount, rangeTier: 0, aoeTier: 0 }
  }
  const rangeTier = tierRoll(cap, difficulty)
  const aoeTier = tierRoll(cap, difficulty)
  const pattern = randomOffensivePattern(def, rangeTier, aoeTier, difficulty)
  const statusStacks = randInt(1, 5)
  const base = pattern.length + statusStacks
  const maxDiscount = Math.max(0, base - 1)
  const manaDiscount = maxDiscount === 0 ? 0 : manaDiscountRoll(maxDiscount, difficulty)
  const entry: SkillLoadoutEntry = { skillId, pattern, statusStacks, manaDiscount, rangeTier, aoeTier }
  // Hard+ avoid wasteful 0-discount entries when cheaper mana exists (keeps points for traits/skills).
  if (
    (difficulty === 'hard' || difficulty === 'nightmare') &&
    maxDiscount > 0 &&
    manaDiscount === 0 &&
    Math.random() < 0.65
  ) {
    entry.manaDiscount = randInt(1, maxDiscount)
  }
  return entry
}
