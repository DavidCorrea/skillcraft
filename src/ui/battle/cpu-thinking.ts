/** Rotating lines shown in the battle log while a CPU picks an action (before heavy search). */

const PHRASES = [
  '{name} is figuring out their next move…',
  '{name} weighs their options…',
  '{name} studies the board…',
  '{name} lines up a plan…',
  '{name} thinks it through…',
  '{name} sizes up the fight…',
  '{name} plots their next step…',
  '{name} takes a moment to decide…',
  '{name} scans for an opening…',
  '{name} considers their play…',
] as const

export function pickCpuThinkingPhrase(actorDisplayName: string): string {
  const t = PHRASES[Math.floor(Math.random() * PHRASES.length)]!
  return t.replaceAll('{name}', actorDisplayName)
}
