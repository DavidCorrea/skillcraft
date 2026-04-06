/** Rotating lines while a CPU picks an action — first-person voice without leading “I …”. */

const PHRASES = [
  'Figuring the next move…',
  'Weighing options…',
  'Studying the board…',
  'Lining up a plan…',
  'Thinking it through…',
  'Sizing up the fight…',
  'Plotting the next step…',
  'Need a beat to decide…',
  'Scanning for an opening…',
  'Considering the play…',
] as const

/** @param _actorDisplayName reserved for future use (e.g. quoted self-name); line is implicit first person. */
export function pickCpuThinkingPhrase(_actorDisplayName: string): string {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)]!
}
