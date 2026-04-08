import type { StatusReactionKey, StatusTag } from './types'

/** Kept in sync with reactions.ts vuln bumps. */
export const VULN_CAP = 5

/** Called shot: max extra flat damage from mark. */
export const MARK_EXTRA_CAP = 8

/** Reaction damage / shield erosion — used by reactions.ts and reference copy. */
export const OVERLOAD_DAMAGE_CAP = 15
export const COAGULATE_DAMAGE_CAP = 12
export const MELT_WARD_FLAT = 4

export type StatusRefId = StatusTag['t']

export const statusReference: { id: StatusRefId; label: string; description: string }[] = [
  {
    id: 'burning',
    label: 'Burning',
    description:
      'Fire DoT each of your turns (tenacity reduces ticks). Duration counts down on your turn. Pairings: see Reactions.',
  },
  {
    id: 'chilled',
    label: 'Chilled',
    description: 'Timed ice debuff; fewer tiles moved per turn. With soaked → flash freeze to frozen.',
  },
  {
    id: 'frozen',
    label: 'Frozen',
    description: 'Skip your whole turn while active; one frozen instance is consumed each skipped turn.',
  },
  {
    id: 'soaked',
    label: 'Soaked',
    description: 'Timed water debuff. Enables flash freeze, mud, waterlogged; Conductive after other reactions if shock remains.',
  },
  {
    id: 'shocked',
    label: 'Shocked',
    description: `Timed lightning debuff. Hits deal +vuln flat (capped at ${VULN_CAP}). Duration ticks on your turns.`,
  },
  {
    id: 'poisoned',
    label: 'Poisoned',
    description: 'Poison DoT each of your turns (tenacity reduces ticks). Pairings: see Reactions.',
  },
  {
    id: 'bleeding',
    label: 'Bleeding',
    description: 'Physical DoT each of your turns (tenacity reduces ticks). Pairings: see Reactions.',
  },
  {
    id: 'slowed',
    label: 'Slowed',
    description: 'Move range costs +1 step per tile (stacks with muddy). Tar / Stagger extend duration with burn / shock.',
  },
  {
    id: 'marked',
    label: 'Marked',
    description: `Extra flat damage from hits (mark value). Called shot can raise it (max ${MARK_EXTRA_CAP}) with burn, poison, or shock.`,
  },
  {
    id: 'rooted',
    label: 'Rooted',
    description: 'Cannot move until duration ends. Pairings: see Reactions (e.g. Wildfire clears root if burn applies).',
  },
  {
    id: 'silenced',
    label: 'Silenced',
    description: 'Cannot cast elemental magic skills. Disrupt removes silence when shocked.',
  },
  {
    id: 'disarmed',
    label: 'Disarmed',
    description: 'Cannot cast physical skills. Ground grip removes disarmed when shocked.',
  },
  {
    id: 'regenBlocked',
    label: 'Regen blocked',
    description: 'Natural regeneration is halved (rounded down). Necrosis extends poison while both are up.',
  },
  {
    id: 'muddy',
    label: 'Muddy',
    description: 'Move costs +1 step (stacks with slowed) and +1 flat damage taken per hit. Parch removes it if burning is present.',
  },
  {
    id: 'shield',
    label: 'Shield',
    description: 'Absorbs damage before HP. Melt ward shrinks shield when burning is also present.',
  },
]

const vulnBumpOutcome = `Shock vuln +1 (max ${VULN_CAP}).`

/** Order matches resolution pipeline in reactions.ts (for docs + UI). */
export const reactionReference: { name: string; when: string; outcome: string }[] = [
  { name: 'Melt', when: 'Burning + chilled or frozen', outcome: 'Removes ice; shortens burn duration.' },
  { name: 'Evaporate', when: 'Burning + soaked', outcome: 'Removes soaked.' },
  { name: 'Detonate', when: 'Burning + poisoned', outcome: 'Immediate damage (burn dot + poison dot); removes both.' },
  {
    name: 'Overload',
    when: 'Burning + shocked',
    outcome: `Immediate damage (burn dot + shock vuln, at least 1, max ${OVERLOAD_DAMAGE_CAP}); removes shock; shortens burn.`,
  },
  { name: 'Cauterize', when: 'Bleeding + burning', outcome: 'Removes bleed; shortens burn.' },
  {
    name: 'Coagulate',
    when: 'Bleeding + poisoned',
    outcome: `Immediate damage (floor((bleed dot + poison dot) / 2), at least 1, max ${COAGULATE_DAMAGE_CAP}); removes bleed; keeps poison.`,
  },
  { name: 'Wildfire', when: 'Rooted + burning', outcome: 'Removes rooted; keeps burn.' },
  { name: 'Parch', when: 'Muddy + burning', outcome: 'Removes muddy.' },
  {
    name: 'Melt ward',
    when: 'Shield + burning',
    outcome: `Shield −min(current shield, burn dot + ${MELT_WARD_FLAT}); may remove shield.`,
  },
  {
    name: 'Flash freeze',
    when: 'Soaked + chilled or frozen',
    outcome: 'Removes soaked; chilled becomes frozen; frozen + soaked refreshes frozen.',
  },
  { name: 'Mud', when: 'Soaked + slowed', outcome: 'Removes soaked and slow; applies muddy.' },
  { name: 'Waterlogged', when: 'Rooted + soaked', outcome: 'Root duration +1.' },
  { name: 'Stranglehold', when: 'Rooted + poisoned', outcome: 'Poison duration +1.' },
  { name: 'Grounded', when: 'Rooted + shocked', outcome: vulnBumpOutcome },
  { name: 'Crystallize', when: 'Poisoned + chilled or frozen', outcome: 'Removes ice; first poison duration +2.' },
  { name: 'Brittle', when: 'Shocked + chilled or frozen', outcome: vulnBumpOutcome },
  { name: 'Caustic', when: 'Shocked + poisoned', outcome: vulnBumpOutcome },
  {
    name: 'Conductive',
    when: 'Soaked + shocked',
    outcome: `After earlier reactions, if both remain: ${vulnBumpOutcome.toLowerCase()}`,
  },
  { name: 'Disrupt', when: 'Silenced + shocked', outcome: 'Removes silenced.' },
  {
    name: 'Ground grip',
    when: 'Disarmed + shocked',
    outcome: 'Removes disarmed.',
  },
  {
    name: 'Called shot',
    when: 'Marked + burning, poisoned, or shocked',
    outcome: `Mark bonus +1 (max ${MARK_EXTRA_CAP}).`,
  },
  { name: 'Necrosis', when: 'Regen blocked + poisoned', outcome: 'First poison duration +1.' },
  { name: 'Tar', when: 'Slowed + burning', outcome: 'Burn duration +1.' },
  { name: 'Stagger', when: 'Slowed + shocked', outcome: 'Slow duration +1.' },
]

/** Log lines — imported by reactions.ts for a single source of player-facing strings. */
export const reactionMessages = {
  melt: 'Melt: fire and ice clash — chill ends, burn weakens.',
  evaporate: 'Evaporate: water burns off.',
  detonate: 'Detonate: poison and flame erupt.',
  overload: 'Overload: lightning and flame burst outward.',
  cauterize: 'Cauterize: flame seals the wound — bleed ends.',
  coagulate: 'Coagulate: blood and venom clot — a nasty burst.',
  wildfire: 'Wildfire: flames burn through the roots.',
  parch: 'Parch: mud cracks dry in the heat.',
  meltWard: 'Melt ward: flames chew through the barrier.',
  flashFreeze: 'Flash freeze: soaked target flash-freezes solid.',
  mud: 'Mud: earth and water slow and expose the target.',
  waterlogged: 'Waterlogged: soaked roots hold you fast.',
  stranglehold: 'Stranglehold: poison lingers in place.',
  grounded: 'Grounded: pinned body conducts worse.',
  crystallize: 'Crystallize: venom locks in the cold.',
  brittle: 'Brittle: frost and shock shatter resolve.',
  caustic: 'Caustic: shock and venom amplify each other.',
  conductive: 'Conductive: soaked target takes a stronger shock.',
  disrupt: 'Disrupt: the shock breaks the silence.',
  groundGrip: 'Ground grip: the shock wrenches your grip back.',
  calledShot: 'Called shot: the mark deepens.',
  necrosis: 'Necrosis: rot sets deeper.',
  tar: 'Tar: fire clings to slowed steps.',
  stagger: 'Stagger: shock locks up weary legs.',
} as const

export interface StatusReactionMessage {
  text: string
  key: StatusReactionKey
}
