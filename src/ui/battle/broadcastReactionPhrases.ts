import type { StatusReactionKey } from '../../game/types'

/** Caster play-by-play lines; use `{name}` for target label. */
export const REACTION_CASTER_LINES: Record<StatusReactionKey, readonly string[]> = {
  melt: [
    'Fire meets ice on {name} — melt resolves, elements trade.',
    '{name}: melt procs; chill strips, burn shortens.',
    'Classic melt — {name} loses the chill stack first.',
  ],
  evaporate: [
    'Soak burns off {name} — evaporate clears the water tag.',
    '{name} dries out as flame hits soaked.',
    'Evaporate: {name} loses soaked to the burn.',
  ],
  detonate: [
    'DETONATE on {name} — poison and flame pop together.',
    '{name} eats a detonation; both DoTs cash out.',
    'Huge pop — detonate erases burn and poison on {name}.',
  ],
  overload: [
    'Overload rips through {name} — shock and flame burst.',
    '{name} conducts overload; lightning and ember detonate.',
    'Overload window — {name} loses shock, burn shortens.',
  ],
  cauterize: [
    'Cauterize — {name} loses bleed to the flames.',
    '{name}: fire seals the bleed, burn ticks down.',
    'Bleed ends on {name}; cauterize from the burn.',
  ],
  coagulate: [
    'Coagulate — {name} takes a clot burst, bleed clears.',
    '{name}: blood and venom clot; nasty spike damage.',
    'Coagulate procs on {name}; bleed is gone, poison stays.',
  ],
  wildfire: [
    'Wildfire — {name} sheds root as flames chew through.',
    '{name}: roots burn away; wildfire clears the pin.',
    'Flames climb the vines on {name} — root breaks.',
  ],
  parch: [
    'Parch — mud cracks off {name} in the heat.',
    '{name} dries; parch removes muddy under burn.',
    'Mud bakes away on {name}.',
  ],
  meltWard: [
    'Melt ward — {name}\'s shield chars under sustained burn.',
    'Flames eat the barrier on {name}.',
    '{name}: ward melts under fire pressure.',
  ],
  flashFreeze: [
    'Flash freeze — {name} snaps solid as water meets ice.',
    '{name} flash-freezes; soak strips, ice locks in.',
    'Soaked target on {name} crystallizes — flash freeze.',
  ],
  mud: [
    'Mud — earth and water tangle {name}; slow and exposure.',
    '{name} is muddied; soak and slow collapse into mud.',
    'Mud reaction on {name} — messy control.',
  ],
  waterlogged: [
    'Waterlogged — {name}\'s roots drink deep; pin extends.',
    '{name}: soak meets root — waterlogged extends the hold.',
    'Roots hold {name} harder — waterlogged.',
  ],
  stranglehold: [
    'Stranglehold — poison duration stretches on rooted {name}.',
    '{name}: root and venom sync — stranglehold.',
    'Poison lingers on pinned {name}.',
  ],
  grounded: [
    'Grounded — {name} is pinned; shock vuln spikes.',
    '{name}: shock climbs while rooted — grounded.',
    'Pinned body on {name} conducts worse — grounded.',
  ],
  groundGrip: [
    'Ground grip — shock wrenches {name}\'s grip; weapon tempo breaks.',
    '{name} loses the swing — ground grip from shock on the pin.',
    'Lightning locks {name}\'s hands — ground grip, strike denied.',
  ],
  crystallize: [
    'Crystallize — venom locks in the cold on {name}.',
    '{name}: ice strips, poison extends — crystallize.',
    'Cold and venom dance on {name}.',
  ],
  brittle: [
    'Brittle — frost and lightning shatter {name}\'s guard.',
    '{name}: shock vuln jumps with ice in play — brittle.',
    'Brittle window on {name}.',
  ],
  caustic: [
    'Caustic — shock and venom amplify on {name}.',
    '{name}: poison meets shock — caustic spike.',
    'Caustic synergy on {name}.',
  ],
  conductive: [
    'Conductive — soaked {name} takes a harder shock.',
    '{name}: water lines the shock — conductive.',
    'Soak amps lightning on {name}.',
  ],
  disrupt: [
    'Disrupt — shock breaks silence on {name}.',
    '{name}: silence shatters to the bolt — disrupt.',
    'Shock clears the mute on {name}.',
  ],
  calledShot: [
    'Called shot — the mark on {name} deepens.',
    '{name}: mark bonus climbs — called shot.',
    'Precision stacks on {name}.',
  ],
  necrosis: [
    'Necrosis — rot digs deeper on {name}.',
    '{name}: poison extends with regen block — necrosis.',
    'Necrosis tick on {name}.',
  ],
  tar: [
    'Tar — fire clings to {name}\'s slowed steps.',
    '{name}: slow meets burn — tar extends flame.',
    'Tar on {name}; burn duration stretches.',
  ],
  stagger: [
    'Stagger — shock locks {name}\'s weary legs; slow extends.',
    '{name}: shock and slow chain — stagger.',
    'Stagger on {name}.',
  ],
}

/** CPU victim banter — first-person voice without leading “I …” (implicit speaker = row subject). */
export const REACTION_CPU_LINES: Record<StatusReactionKey, readonly string[]> = {
  melt: [
    'Chill ripped away — ugh.',
    'Melting down — not like this.',
    'Ice gone — adapting.',
  ],
  evaporate: [
    'Drying out — steam off me.',
    'Soak just vanished.',
    'Lighter without the water.',
  ],
  detonate: [
    'Detonation inside — huge pop.',
    'Ate that burst.',
    'That pop hurt.',
  ],
  overload: [
    'Overloading — nerves scream.',
    'Conducting that burst — too much.',
    'Hot and cold at once.',
  ],
  cauterize: [
    'Sealed up — bleed stops, still hurts.',
    'Cauterize — taste iron.',
    'Bleed ends — still burning.',
  ],
  coagulate: [
    'Clotting hard — nasty spike.',
    'Blood thickening — gross.',
    'Coagulate spike — poison stays.',
  ],
  wildfire: [
    'Roots burning away — scorched.',
    'Shedding the pin in flames.',
    'Root broke — fire cleared it.',
  ],
  parch: [
    'Cracking dry — mud off.',
    'Parched — moving cleaner.',
    'Mud baked off.',
  ],
  meltWard: [
    'Barrier charring.',
    'Shield eating the burn.',
    'Ward melting — exposed.',
  ],
  flashFreeze: [
    'Snapping solid — flash freeze.',
    'Frozen mid-soak — brutal.',
    'Locked in ice.',
  ],
  mud: [
    'Stuck in mud — slow.',
    'Sinking — mud drags.',
    'Tagged — mud.',
  ],
  waterlogged: [
    'Soaking deeper into the root.',
    'Waterlogging — roots drink in.',
    'Heavier — dragged down.',
  ],
  stranglehold: [
    'Choking on longer poison.',
    'Pinned — poison lingers.',
    'Hold tightening.',
  ],
  grounded: [
    'Pinned — lightning hurts more.',
    'Grounding out — shock stacks.',
    'Shock stacks — rooted.',
  ],
  groundGrip: [
    'Weapon slipped — shock ripped my tempo.',
    'Hands locked — ground grip.',
    'Disarmed rhythm — shock on the root.',
  ],
  crystallize: [
    'Crystallizing — venom in the frost.',
    'Poison set in the cold.',
    'Chill and rot together.',
  ],
  brittle: [
    'Shattering inside — brittle.',
    'Frost and shock cracking through.',
    'Brittle — every hit stings.',
  ],
  caustic: [
    'Corroding — shock and venom.',
    'Amplifying — caustic.',
    'Conducting pain.',
  ],
  conductive: [
    'Soaked — conducts worse.',
    'Bigger shock — water lines it.',
    'Lightning rod mode.',
  ],
  disrupt: [
    'Breaking silence with shock.',
    'Mute falling — disrupt.',
    'Throat clears — shock.',
  ],
  calledShot: [
    'Marked deeper.',
    'Mark hurts more — called shot.',
    'Tagged harder.',
  ],
  necrosis: [
    'Rotting deeper — necrosis.',
    'Necrosis digging in.',
    'Regen dying — necrosis.',
  ],
  tar: [
    'Tarred — fire on slow steps.',
    'Burning longer — tar clings.',
    'Slowing and cooking — tar.',
  ],
  stagger: [
    'Staggering — legs locked.',
    'Cannot reset — stagger.',
    'Legs giving — stagger.',
  ],
}

export function casterLinesForReaction(key: StatusReactionKey): readonly string[] {
  return REACTION_CASTER_LINES[key]
}

export function cpuLinesForReaction(key: StatusReactionKey): readonly string[] {
  return REACTION_CPU_LINES[key]
}
