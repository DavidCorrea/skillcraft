import type { SkillId, SkillLoadoutEntry, TraitPoints } from './types'
import {
  fitPlayerBudgetToLevel,
  getSkillDef,
  maxSkillsForLevel,
  SKILL_ROSTER,
  totalLoadoutPoints,
  validateLoadout,
} from './skills'
import { cpuTraitsForLevel, defaultTraitPoints } from './traits'

const TRAIT_KEYS = Object.keys(defaultTraitPoints()) as (keyof TraitPoints)[]

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
    const skillIds = pickDistinctSkillIds(skillCount)
    const entries = skillIds.map((id) => randomEntryForSkill(id))
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
export function randomCpuBuild(level: number): { cpuLoadout: SkillLoadoutEntry[]; cpuTraits: TraitPoints } {
  const budget = Math.max(2, level)

  for (let attempt = 0; attempt < 500; attempt++) {
    const traitTotal = randInt(0, Math.max(0, budget - 2))
    const traits = randomTraitsDistributed(traitTotal)
    const maxS = maxSkillsForLevel(budget)
    const skillCount = randInt(1, maxS)
    const skillIds = pickDistinctSkillIds(skillCount)
    const entries = skillIds.map((id) => randomEntryForSkill(id))
    const err = validateLoadout(budget, entries, maxS, traits)
    if (!err) {
      return { cpuLoadout: entries, cpuTraits: traits }
    }
  }

  return {
    cpuTraits: cpuTraitsForLevel(budget),
    cpuLoadout: [
      { skillId: 'ember', pattern: [{ dx: 0, dy: 0 }], statusStacks: 1, manaDiscount: 0, rangeTier: 0 },
    ],
  }
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function randomTraitsDistributed(total: number): TraitPoints {
  const t = defaultTraitPoints()
  const keys = Object.keys(t) as (keyof TraitPoints)[]
  for (let i = 0; i < total; i++) {
    const k = keys[Math.floor(Math.random() * keys.length)]!
    t[k] += 1
  }
  return t
}

function pickDistinctSkillIds(n: number): SkillId[] {
  const ids = SKILL_ROSTER.map((s) => s.id)
  shuffleInPlace(ids)
  return ids.slice(0, Math.min(n, ids.length))
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
}

function randomOffensivePattern(): { dx: number; dy: number }[] {
  const len = randInt(1, 6)
  const out: { dx: number; dy: number }[] = []
  for (let i = 0; i < len; i++) {
    out.push({ dx: randInt(-3, 3), dy: randInt(-3, 3) })
  }
  return out
}

function randomEntryForSkill(skillId: SkillId): SkillLoadoutEntry {
  const def = getSkillDef(skillId)
  const pattern = def.selfTarget ? [{ dx: 0, dy: 0 }] : randomOffensivePattern()
  const statusStacks = randInt(1, 5)
  const base = pattern.length + statusStacks
  const maxDiscount = Math.max(0, base - 1)
  const manaDiscount = maxDiscount === 0 ? 0 : randInt(0, maxDiscount)
  return { skillId, pattern, statusStacks, manaDiscount, rangeTier: 0 }
}
