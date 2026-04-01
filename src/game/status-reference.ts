import type { StatusTag } from './types'

/** Kept in sync with reactions.ts vuln bumps. */
export const VULN_CAP = 5

/** Called shot: max extra flat damage from mark. */
export const MARK_EXTRA_CAP = 8

export type StatusRefId = StatusTag['t']

export const statusReference: { id: StatusRefId; label: string; description: string }[] = [
  {
    id: 'burning',
    label: 'Burning',
    description:
      'Fire DoT each turn (after tenacity). Duration ticks down each of your turns. Reacts with ice, water, poison, bleed, shock, mud, slow, shield, and root.',
  },
  {
    id: 'chilled',
    label: 'Chilled',
    description: 'Ice debuff with duration; slows tempo. With soaked, can flash-freeze into frozen.',
  },
  {
    id: 'frozen',
    label: 'Frozen',
    description: 'Skips your entire turn while active; consumes one frozen stack per skipped turn.',
  },
  {
    id: 'soaked',
    label: 'Soaked',
    description: 'Water debuff with duration. Amplifies lightning (Conductive) and enables mud, flash freeze, and root combos.',
  },
  {
    id: 'shocked',
    label: 'Shocked',
    description:
      'Lightning debuff: extra flat damage taken from hits based on vuln value (capped). Duration ticks down each turn.',
  },
  {
    id: 'poisoned',
    label: 'Poisoned',
    description: 'Poison DoT each turn (after tenacity). Many elemental and control reactions.',
  },
  {
    id: 'bleeding',
    label: 'Bleeding',
    description: 'Physical DoT each turn (after tenacity). Coagulates with poison; cauterized by fire.',
  },
  {
    id: 'slowed',
    label: 'Slowed',
    description: 'Increases move cost by 1 step (stacks with muddy). Tar and Stagger reactions with fire and shock.',
  },
  {
    id: 'marked',
    label: 'Marked',
    description: 'Flat bonus damage taken from hits (`extra`). Called shot can raise that bonus when paired with burn, poison, or shock.',
  },
  {
    id: 'rooted',
    label: 'Rooted',
    description: 'Cannot move until duration expires. Combines with soak, poison, shock, and fire (Wildfire clears root).',
  },
  {
    id: 'silenced',
    label: 'Silenced',
    description: 'Cannot cast skills. Disrupt reaction clears silence when shocked.',
  },
  {
    id: 'regenBlocked',
    label: 'Regen blocked',
    description: 'Cuts natural regeneration roughly in half while active. Necrosis pairs with poison.',
  },
  {
    id: 'muddy',
    label: 'Muddy',
    description: 'Like slowed, adds move penalty and +1 flat damage taken. Parch removes it when burning is present.',
  },
  {
    id: 'shield',
    label: 'Shield',
    description: 'Absorbs damage before HP. Melt ward erodes shield when burning is also present.',
  },
]

/** Order matches resolution pipeline in reactions.ts (for docs + UI). */
export const reactionReference: { name: string; when: string; outcome: string }[] = [
  { name: 'Melt', when: 'Burning + chilled or frozen', outcome: 'Removes ice; shortens burn duration.' },
  { name: 'Evaporate', when: 'Burning + soaked', outcome: 'Removes soaked.' },
  { name: 'Detonate', when: 'Burning + poisoned', outcome: 'Immediate damage (burn dot + poison dot); removes both.' },
  { name: 'Overload', when: 'Burning + shocked', outcome: 'Immediate damage; removes shock; shortens burn.' },
  { name: 'Cauterize', when: 'Bleeding + burning', outcome: 'Removes bleed; shortens burn.' },
  { name: 'Coagulate', when: 'Bleeding + poisoned', outcome: 'Immediate damage; removes bleed; keeps poison.' },
  { name: 'Wildfire', when: 'Rooted + burning', outcome: 'Removes rooted; keeps burn.' },
  { name: 'Parch', when: 'Muddy + burning', outcome: 'Removes muddy.' },
  { name: 'Melt ward', when: 'Shield + burning', outcome: 'Reduces shield amount; may remove shield.' },
  {
    name: 'Flash freeze',
    when: 'Soaked + chilled or frozen',
    outcome: 'Removes soaked; chilled becomes frozen; frozen + soaked refreshes frozen.',
  },
  { name: 'Mud', when: 'Soaked + slowed', outcome: 'Removes soaked and slow; applies muddy.' },
  { name: 'Waterlogged', when: 'Rooted + soaked', outcome: 'Extends rooted duration.' },
  { name: 'Stranglehold', when: 'Rooted + poisoned', outcome: 'Extends poison duration.' },
  { name: 'Grounded', when: 'Rooted + shocked', outcome: 'Increases shock vuln (capped).' },
  { name: 'Crystallize', when: 'Poisoned + chilled or frozen', outcome: 'Removes ice; extends poison duration.' },
  { name: 'Brittle', when: 'Shocked + chilled or frozen', outcome: 'Increases shock vuln (capped).' },
  { name: 'Caustic', when: 'Shocked + poisoned', outcome: 'Increases shock vuln (capped).' },
  { name: 'Conductive', when: 'Soaked + shocked', outcome: 'Increases shock vuln (capped).' },
  { name: 'Disrupt', when: 'Silenced + shocked', outcome: 'Removes silenced.' },
  { name: 'Called shot', when: 'Marked + burning, poisoned, or shocked', outcome: 'Increases mark extra (capped).' },
  { name: 'Necrosis', when: 'Regen blocked + poisoned', outcome: 'Extends poison duration.' },
  { name: 'Tar', when: 'Slowed + burning', outcome: 'Extends burn duration.' },
  { name: 'Stagger', when: 'Slowed + shocked', outcome: 'Extends slow duration.' },
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
  calledShot: 'Called shot: the mark deepens.',
  necrosis: 'Necrosis: rot sets deeper.',
  tar: 'Tar: fire clings to slowed steps.',
  stagger: 'Stagger: shock locks up weary legs.',
} as const
