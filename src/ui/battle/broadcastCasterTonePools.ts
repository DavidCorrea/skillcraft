import type { CasterToneId } from '../../game/types'

/** Non-classic caster lines; classic uses the base pool in broadcastLog. */
const g = {
  grim: 'grim_war_report',
  snark: 'snarky_desk',
  arcane: 'arcane_showman',
  cold: 'cold_analyst',
} as const

function T(
  grim: readonly string[],
  snark: readonly string[],
  arcane: readonly string[],
  cold: readonly string[],
): Partial<Record<CasterToneId, readonly string[]>> {
  return {
    [g.grim]: grim,
    [g.snark]: snark,
    [g.arcane]: arcane,
    [g.cold]: cold,
  }
}

export const BATTLE_START_BY_TONE = T(
  ['Commence — corners, blades, tally sheets.', 'Opening movement; count the wounded soon.'],
  ['We are so back — grid’s hot, egos hotter.', 'Showtime — try not to whiff the intro.'],
  ['Curtain rises — fighters, your arena awaits.', 'The board lights; let the duel begin.'],
  ['Match start — observe spacing and resource curves.', 'Clock live; data collection begins.'],
)

export const TURN_YOU_BY_TONE = T(
  ['Your beat — spend it or bleed it.', 'Tempo is yours; the field watches.'],
  ['Your clock — don’t waste the headline.', 'Board’s listening — make noise.'],
  ['Spotlight swing — you’re on.', 'Your chapter — write it on the tiles.'],
  ['Decision window — human input required.', 'Your allocation phase — execute.'],
)

export const TURN_CPU_BY_TONE = T(
  ['{name} claims the clock — next wound incoming.', '{name} rotates in — pressure resumes.'],
  ['{name}’s turn — someone’s getting invoiced.', 'Handoff to {name} — drama pending.'],
  ['{name} steps center stage.', '{name} — tempo passes to them.'],
  ['{name} assumes active turn.', 'Clock transfers to {name}.'],
)

export const MOVE_BY_TONE = T(
  ['{name} slides — spacing is survival.', '{name} repositions; lines shift.'],
  ['{name} relocates — rent’s due elsewhere.', '{name} scoots — new angle, new excuses.'],
  ['{name} dances the grid.', '{name} finds a new mark on the floor.'],
  ['{name} moves — positional delta logged.', '{name} adjusts coordinates.'],
)

export const SKIP_BY_TONE = T(
  ['{name} holds — silence buys nothing.', '{name} skips; the clock punishes patience.'],
  ['{name} passes — bold or broke?', '{name} sits — suspense or stall?'],
  ['{name} bows out of the beat.', '{name} leaves the tempo blank.'],
  ['{name} takes no action this phase.', '{name} — null action registered.'],
)

export const LIFESTEAL_BY_TONE = T(
  ['{name} leeches {n} — blood pays debts.', 'Life stolen: {n} to {name}.'],
  ['{name} cashes {n} HP off the swing.', 'Leech tab: +{n} for {name}.'],
  ['{name} drinks {n} back from the hit.', 'The drain sings — {n} to {name}.'],
  ['{name} recovers {n} HP via lifesteal.', 'Sustain transfer: {n} to {name}.'],
)

export const TURN_DOT_BY_TONE = T(
  ['DoT gnaws {name} for {dot}.', 'Bleed and burn — {name} pays {dot}.'],
  ['{name} bleeds tempo — {dot} on the tick.', 'Attrition invoice: {dot} from {name}.'],
  ['Status eats {name} for {dot}.', '{name} feeds the ticks — {dot}.'],
  ['Damage-over-time: {name} −{dot}.', 'Periodic damage applied to {name}: {dot}.'],
)

export const TURN_REGEN_BY_TONE = T(
  ['{name} knits {regen} — stubborn life.', 'Regen: {name} claws back {regen}.'],
  ['{name} regenerates {regen} — rude health bar.', '+{regen} sneaks to {name}.'],
  ['{name} blooms back {regen}.', 'Small mend — {regen} to {name}.'],
  ['Regeneration tick: +{regen} for {name}.', '{name} gains {regen} from regen.'],
)

export const TURN_TICK_DOT_REGEN_BY_TONE = T(
  ['{name} bleeds {dot} and mends {regen} — net suffering.', 'DoT and regen trade on {name}: −{dot}, +{regen}.'],
  ['{name} pays {dot} to ticks, pockets {regen} heal — messy math.', 'Burn then bandage: {dot} down, {regen} up for {name}.'],
  ['{name} burns {dot}, heals {regen} — push and pull.', 'Attrition vs sustain on {name}: {dot}/{regen}.'],
  ['{name}: DoT damage {dot}, regeneration {regen}.', 'Combined tick on {name}: damage {dot}, heal {regen}.'],
)

export const RESOURCE_TICK_BY_TONE = T(
  ['Pulse — {name} gains {m} mana, {s} stamina.', 'Resources creep to {name}: +{m}/{s}.'],
  ['{name} tops off — +{m} mana, +{s} gas.', 'Meter candy for {name}: {m}/{s}.'],
  ['{name} draws {m} mana and {s} stamina from the clock.', 'Refresh line — {name} +{m}/+{s}.'],
  ['Resource tick: {name} +{m} mana, +{s} stamina.', '{name} resource gain: mana {m}, stamina {s}.'],
)

export const KNOCKBACK_BY_TONE = T(
  ['{atk} shoves {def} — space opens in blood.', '{def} flies off {atk}’s line.'],
  ['{atk} clears {def} — personal space enforced.', 'Knockback sale: {def} moved by {atk}.'],
  ['{atk} launches {def} across the boards.', 'Spacing pop — {def} off {atk}.'],
  ['Knockback: {atk} displaces {def}.', '{def} pushed by {atk} — repositioning.'],
)

export const FROZEN_BY_TONE = T(
  ['{name} locked in ice — turn void.', 'Freeze holds {name} out of the count.'],
  ['{name} is a popsicle — skip.', 'Cold storage: {name} sits.'],
  ['{name} encased — no beat.', 'Ice encores on {name}.'],
  ['{name} frozen — action denied this turn.', '{name} cannot act: frozen.'],
)

export const CAST_HEAL_BY_TONE = T(
  ['{name} stitches the line for {n}.', 'Mend: +{n} to {name}.'],
  ['{name} heals {n} — generous or desperate?', 'HP refund: {n} to {name}.'],
  ['{name} radiates {n} recovery.', 'Light mend — +{n} {name}.'],
  ['{name} restores {n} HP.', 'Heal event: +{n} for {name}.'],
)

export const WARD_BY_TONE = T(
  ['{name} raises barriers — hold the line.', 'Wards up on {name}.'],
  ['{name} buys insurance — shields on.', 'Bubble wrap for {name}.'],
  ['{name} throws glitter barriers.', 'Shields flare from {name}.'],
  ['{name} applies ward protection.', 'Defensive wards: {name}.'],
)

export const PURGE_BY_TONE = T(
  ['{name} scrubs {n} stacks — clean slate.', 'Purge clears {n} from {name}.'],
  ['{name} power-washes debuffs — {n} gone.', 'Detox: {n} peeled off {name}.'],
  ['{name} banishes {n} nasty tags.', 'Cleanse chorus — {n} from {name}.'],
  ['{name} purges {n} effect(s).', 'Purge count {n} on {name}.'],
)

export const FOCUS_BY_TONE = T(
  ['{name} sharpens the next hit.', 'Focus stacks on {name}.'],
  ['{name} lines up the spike — rude follow-up.', 'Next cast tax prep: {name}.'],
  ['{name} locks eyes on the finish.', 'Focus spotlight — {name}.'],
  ['{name} gains focus buff.', 'Offensive focus: {name}.'],
)

export const WARDBREAK_BY_TONE = T(
  ['{name} shreds shields.', 'Barriers buckle under {name}.'],
  ['{name} tears the bubble — rude.', 'Ward repo: {name} collects.'],
  ['{name} pops wards for the crowd.', 'Shields shatter — {name}.'],
  ['{name} breaks opposing wards.', 'Wardbreak executed by {name}.'],
)

export const IMMUNIZE_BY_TONE = T(
  ['{name} layers debuff armor.', '{name} immunizes the line.'],
  ['{name} slaps “do not stack” on the team.', 'Debuff bounce house — {name}.'],
  ['{name} weaves immunity glitter.', 'Insurance cast — {name}.'],
  ['{name} applies immunize.', 'Debuff immunity layered by {name}.'],
)

export const OVERCLOCK_BY_TONE = T(
  ['{name} borrows mana — legs will pay.', '{name} surges; debt follows.'],
  ['{name} maxes the card — interest incoming.', 'Overclock now, regret later — {name}.'],
  ['{name} spikes the meters — showy tax.', 'Borrowed brilliance from {name}.'],
  ['{name} overclocks resources.', 'Surge: {name} — future stamina penalty.'],
)

export const LINGER_BY_TONE = T(
  ['{name} stains the tiles — watch your boots.', 'Residual field from {name}.'],
  ['{name} leaves rude floor decor.', 'Lingering hazard courtesy of {name}.'],
  ['{name} paints delayed drama.', 'Echo tiles seeded by {name}.'],
  ['{name} places lingering zone.', 'Residual magic from {name}.'],
)

export const CPU_THINKING_BY_TONE = T(
  ['Booth: CPU comms — thinking.', 'Silent beat while they choose.'],
  ['CPU tabbing out mentally — we wait.', 'Thinking tax — CPU on pause.'],
  ['Dramatic pause — CPU deliberates.', 'Villain monologue loading…'],
  ['CPU decision pending.', 'Computation delay — CPU turn.'],
)

export const RELIEF_BY_TONE = T(
  ['Pressure lifts off {name} — for now.', '{name} slips the crosshair.'],
  ['{name} dodges the headline swing.', 'Not {name}’s problem this beat.'],
  ['{name} exits the spotlight.', 'Breather for {name}.'],
  ['Threat focus shifts away from {name}.', '{name} — reduced pressure.'],
)

export const RELIEF_SPELL_BY_TONE = T(
  ['Spell converges on {focus}; {atk} spares the rest.', '{focus} eats the cast — others exhale.'],
  ['{atk} aims {focus} — collateral spared.', 'Focus fire on {focus}; room breathes.'],
  ['The burst hunts {focus}; sidelines safe.', '{focus} stars; {atk} clears angles.'],
  ['Damage focus {focus}; {atk} cast.', 'Spell prioritizes {focus} over others.'],
)

export const STATUS_EXPIRED_BY_TONE = T(
  ['{name} sheds {tags} — timers done.', 'Stacks fall off {name}: {tags}.'],
  ['{name} drops {tags} — buff’s over, party’s not.', 'Tag eviction: {tags} leave {name}.'],
  ['{name} shakes {tags} into the void.', 'Curtain on {tags} for {name}.'],
  ['{name}: expired statuses {tags}.', 'Status expiry on {name}: {tags}.'],
)

export const KNOCKBACK_FAIL_EDGE_BY_TONE = T(
  ['{atk} drives {def} — wall says no.', 'Rope stops {def}; {atk} denied.'],
  ['{def} hugs the edge — {atk} can’t finish the shove.', 'Map tax: no tile for {def}.'],
  ['Arena rim blocks {atk}’s push on {def}.', '{def} pinned to the border.'],
  ['Knockback blocked by edge: {atk} vs {def}.', '{def} remains — map boundary.'],
)

export const KNOCKBACK_FAIL_BLOCKED_BY_TONE = T(
  ['Crowded square — {def} won’t budge for {atk}.', 'Someone owns that tile — shove stuffed.'],
  ['{atk} can’t thread {def} through the bodies.', 'Human traffic jam — {def} holds.'],
  ['Bodies block {atk}’s lane to move {def}.', 'Tile occupied — knockback fails.'],
  ['Knockback obstructed: {atk} → {def}.', '{def} blocked — no displacement.'],
)

export const LINGERING_EXPIRED_SINGLE_BY_TONE = T(
  ['One hazard patch dies — tile cools.', 'Linger fades from a single cell.'],
  ['Solo trap retires — floor exhales.', 'One residual winks out.'],
  ['A lone echo field collapses.', 'Single lingering zone expires.'],
  ['One residual tile cleared.', 'Hazard removed from one cell.'],
)

export const LINGERING_EXPIRED_MULTI_BY_TONE = T(
  ['Several hazards collapse — cleaner floor.', 'Residual fields die in bunches.'],
  ['Bulk tile cleanup — hazards out.', 'Multiple lingers expire together.'],
  ['Patches of old magic flake away.', 'Several zones dissipate at once.'],
  ['Multiple residual tiles cleared.', 'Batch hazard expiry.'],
)

export const ROUND_COMPLETE_BY_TONE = T(
  ['Round {n} closed — wounds tallied, pride dented.', 'End of round {n}; blood dries slowly.'],
  ['Round {n} in the books — receipts later.', 'That was round {n}; nobody’s innocent.'],
  ['Round {n} bows — intermission energy.', 'Act break: round {n}.'],
  ['Round {n} complete.', 'End of round {n} — reset tempo.'],
)

export const OVERTIME_BEGIN_BY_TONE = T(
  ['Sudden death — pulse tiles shield this round; storm bites on the off beats.', 'Overtime rules: pulse-safe tiles, storm on rhythm.'],
  ['Storm mode — read the fine print on pulses.', 'Sudden death clause activated.'],
  ['The arena tightens its rules — sudden death.', 'Overtime: pulse protection, storm cadence.'],
  ['Sudden death begins — pulsing tiles immune this round; storm alternates.', 'Overtime protocol active.'],
)

export const OVERTIME_STORM_BY_TONE = T(
  ['Storm flays {name} for {dmg}.', '{name} eats storm {dmg}.'],
  ['Sky invoice: {dmg} to {name}.', '{name} — storm tab {dmg}.'],
    ['The tempest tags {name} for {dmg}.', 'Storm hit: {dmg} on {name}.'],
  ['Storm damage to {name}: {dmg}.', '{name} takes {dmg} from storm.'],
)

export const OVERTIME_SHRINK_BY_TONE = T(
  ['Safe ring shrinks — {r} tiles from the eye.', 'The calm zone is {r} wide now.'],
  ['Circle jerk — only {r} tiles safe.', 'Playroom shrinks to radius {r}.'],
  ['The eye tightens; {r} tiles breathe.', 'Safe radius now {r}.'],
  ['Safe zone radius: {r} tiles.', 'Arena shrink — {r} tiles from center.'],
)

export const TIE_BY_TONE = T(
  ['Mutual elimination — nobody wins the tally.', 'Double KO — draw on the sheet.'],
  ['Everyone lost — poetic.', 'Simultaneous delete — tie.'],
  ['Twin falls — curtain on a tie.', 'Double exit — stalemate.'],
  ['Simultaneous elimination — tie.', 'No victor — mutual elimination.'],
)
