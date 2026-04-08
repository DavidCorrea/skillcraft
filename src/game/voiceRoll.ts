import type { CombatVoicePersonality, CasterToneId } from './types'

export const CASTER_TONE_OPTIONS: { value: CasterToneId; label: string }[] = [
  { value: 'classic_arena', label: 'Classic arena' },
  { value: 'grim_war_report', label: 'Grim war report' },
  { value: 'snarky_desk', label: 'Snarky desk' },
  { value: 'arcane_showman', label: 'Arcane showman' },
  { value: 'cold_analyst', label: 'Cold analyst' },
]

const PERSONALITIES: CombatVoicePersonality[] = [
  'stoic',
  'snarky',
  'hot_headed',
  'tactical',
  'unhinged',
  'grim',
  'cocky',
]

const PERSONALITY_LABELS: Record<CombatVoicePersonality, string> = {
  stoic: 'Stoic',
  snarky: 'Snarky',
  hot_headed: 'Hot-headed',
  tactical: 'Tactical',
  unhinged: 'Unhinged',
  grim: 'Grim',
  cocky: 'Cocky',
}

/** UI options for the human fighter’s banter voice (CPUs still roll per build). */
export const PERSONALITY_SELECT_OPTIONS: { value: CombatVoicePersonality; label: string }[] = PERSONALITIES.map(
  (p) => ({ value: p, label: PERSONALITY_LABELS[p] }),
)

export function rollVoicePersonality(rng: () => number = Math.random): CombatVoicePersonality {
  return PERSONALITIES[Math.floor(rng() * PERSONALITIES.length)]!
}

export const DEFAULT_CASTER_TONE: CasterToneId = 'classic_arena'
