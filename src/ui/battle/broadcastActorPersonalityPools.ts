import type { CombatVoicePersonality } from '../../game/types'

/** First-person fragments; merged or used when actor has this personality. */
const stoic = {
  turn: ['Clock claimed.', 'Turn active.', 'Proceeding.'],
  move: ['Repositioned.', 'Better tile.', 'Angles adjusted.'],
  skip: ['Holding.', 'Pass.', 'No spend.'],
  ls: ['Drain logged.', 'Life back — noted.', 'Leech landed.'],
  heal: ['Patched.', 'Stabilized.', 'Mend applied.'],
  ward: ['Barrier up.', 'Shield layered.', 'Wards set.'],
  purge: ['Cleansed.', 'Tags cleared.', 'Scrubbed.'],
  focus: ['Next hit primed.', 'Focus locked.', 'Follow-up ready.'],
  wardbreak: ['Shields down.', 'Barriers stripped.', 'Ward answered.'],
  immunize: ['Debuff guard up.', 'Immunity layered.', 'Stacks bounce.'],
  overclock: ['Borrowed spike.', 'Surge taken.', 'Debt accepted.'],
  linger: ['Tiles marked.', 'Residual placed.', 'Floor seeded.'],
  frozen: ['Ice lock.', 'Frozen out.', 'Skip beat.'],
  dot: ['Tick damage — holding.', 'DoT chewing.', 'Bleed noted.'],
  resVic: ['Residual — ouch.', 'Stepped wrong.', 'Tile bit back.'],
  kbAtk: ['Shove sent.', 'Spacing forced.', 'Push committed.'],
  kbVic: ['Airborne.', 'Shoved.', 'Spacing lost.'],
  statEx: ['Tags cleared.', 'Buffs wore.', 'Sheet clean.'],
  kbFailAtk: ['No lane.', 'Push stuffed.', 'Blocked shove.'],
  kbFailVic: ['Held ground.', 'Not budging.', 'Stuck firm.'],
  deny: ['Denied.', 'Can’t.', 'Blocked.'],
  reliefEn: ['Pressure off — good.', 'Not the mark.', 'Breathing room.'],
  reliefAl: ['They lived — fine.', 'Ally spared swing.', 'We’re good.'],
  reliefSpEn: ['Spell ate {focus} — good.', 'Focus elsewhere — fine.', 'Not my ticket — {focus}.'],
  reliefSpAl: ['We’re clear — {focus} ate it.', 'Focus on {focus} — ok.', '{focus} drew fire.'],
} as const

const snarky = {
  turn: ['My spotlight — obviously.', 'Clock’s mine — queue tears.'],
  move: ['Better real estate.', 'Sliding out of blame’s way.'],
  skip: ['Skipping — budget cuts.', 'This beat’s a pass.'],
  ls: ['Borrowed HP — thanks.', 'Snack bar open.'],
  heal: ['Cute bandage.', 'HP refund — lovely.'],
  ward: ['Bubble era.', 'Shield fashion show.'],
  purge: ['Detox montage.', 'Debuff eviction notice.'],
  focus: ['Next hit’s rude.', 'Spike loading — smile.'],
  wardbreak: ['Shields are suggestions.', 'Ward repo time.'],
  immunize: ['Stacks can bounce.', 'Debuffs denied — cry about it.'],
  overclock: ['Maxed the card.', 'Debt is future me’s problem.'],
  linger: ['Floor’s haunted — enjoy.', 'Residual rude notes left.'],
  frozen: ['Popsicle shift.', 'Ice timeout.'],
  dot: ['Ticks taxing me.', 'DoT subscription active.'],
  resVic: ['Tile taxed me.', 'Residual invoice.'],
  kbAtk: ['Fly, please.', 'Personal space enforcement.'],
  kbVic: ['Rude shove.', 'Air miles — unwanted.'],
  statEx: ['Tags ghosted.', 'Buffs clocked out.'],
  kbFailAtk: ['Push denied — rude.', 'No eviction today.'],
  kbFailVic: ['Rooted — smug.', 'Didn’t move — skill issue theirs.'],
  deny: ['Nope.', 'Rules win.', 'Denied — cope.'],
  reliefEn: ['Not starring this swing.', 'Wrong name on marquee.'],
  reliefAl: ['Friendly fire avoided — wow.', 'We’re fine — shock.'],
  reliefSpEn: ['{focus} ate the cast — perfect.', 'Splash aimed at {focus} — thanks.'],
  reliefSpAl: ['{focus} volunteered as tribute.', 'Blast went to {focus} — we’re cute.'],
} as const

function P(
  sto: readonly string[],
  sn: readonly string[],
  hot: readonly string[],
  tac: readonly string[],
  unh: readonly string[],
  gr: readonly string[],
  ck: readonly string[],
): Partial<Record<CombatVoicePersonality, readonly string[]>> {
  return {
    stoic: sto,
    snarky: sn,
    hot_headed: hot,
    tactical: tac,
    unhinged: unh,
    grim: gr,
    cocky: ck,
  }
}

export const TURN_BANTER_PERSONALITY = P(
  stoic.turn,
  snarky.turn,
  ['My turn — burn it down!', 'Clock’s mine — move!'],
  ['Turn acquired — execute.', 'Phase start — plan live.'],
  ['Clock’s mine — chaos time!', 'My beat — dance!'],
  ['Turn — another beat closer.', 'Clock claimed — tally waits.'],
  ['Easy tempo — mine.', 'Turn — watch this.'],
)

export const MOVE_BANTER_PERSONALITY = P(
  stoic.move,
  snarky.move,
  ['New tile — faster!', 'Moving — out the way!'],
  ['Reposition — better angle.', 'Tile shift — calculated.'],
  ['Scuttle scuttle!', 'New square — surprise!'],
  ['Sliding — shadows like it.', 'Footwork — quiet.'],
  ['Better square — obvious.', 'Move — too clean.'],
)

export const SKIP_BANTER_PERSONALITY = P(
  stoic.skip,
  snarky.skip,
  ['Skipping — save the rage.', 'Hold — bait them.'],
  ['Skip — tempo bait.', 'Pass — reposition mentally.'],
  ['Skip! Plot twist!', 'Nothing! Mind games!'],
  ['Pass — let them burn.', 'Hold — ice in veins.'],
  ['Skip — they’re scared anyway.', 'Pass — magnanimous.'],
)

export const LIFESTEAL_ATK_PERSONALITY = P(
  stoic.ls,
  snarky.ls,
  ['Give me that life!', 'Leech — yes!'],
  ['Sustain secured.', 'Drain calculated.'],
  ['Tasty drain!', 'Blood snack!'],
  ['Life back — needed.', 'Leech logged.'],
  ['Mine — HP tax.', 'Borrowed life — deserved.'],
)

export const HEAL_BANTER_PERSONALITY = P(
  stoic.heal,
  snarky.heal,
  ['Stitched — not done!', 'Heal — more fight!'],
  ['HP restored — resume.', 'Mend — back to work.'],
  ['Patch and party!', 'Stitches sparkle!'],
  ['Closed wound — still grim.', 'Mend — standing.'],
  ['Easy heal — I’m built different.', 'Patch job — luxury.'],
)

export const WARD_BANTER_PERSONALITY = P(
  stoic.ward,
  snarky.ward,
  ['Shields — try me!', 'Ward wall — come!'],
  ['Barrier online.', 'Defense layered.'],
  ['Sparkle shields!', 'Bubble time!'],
  ['Wards — thin hope.', 'Barriers — delay end.'],
  ['Wards — obviously.', 'Shield flex.'],
)

export const PURGE_BANTER_PERSONALITY = P(
  stoic.purge,
  snarky.purge,
  ['Scrubbed — clean rage!', 'Debuffs — gone!'],
  ['Cleanse executed.', 'Tags stripped — clear.'],
  ['Purged — sparkly!', 'Clean freak win!'],
  ['Tags purged — still hollow.', 'Cleansed — brief mercy.'],
  ['Purged — too easy.', 'Debuffs bounced — skill issue.'],
)

export const FOCUS_BANTER_PERSONALITY = P(
  stoic.focus,
  snarky.focus,
  ['Next hit hurts more!', 'Focus — boom incoming!'],
  ['Focus acquired.', 'Next cast optimized.'],
  ['Laser eyes on!', 'Focus — dramatic!'],
  ['Focus — narrow life.', 'Next hit primed — grim.'],
  ['Focused — obviously.', 'Spike loading — watch.'],
)

export const WARDBREAK_BANTER_PERSONALITY = P(
  stoic.wardbreak,
  snarky.wardbreak,
  ['Shred those wards!', 'Shields — trash!'],
  ['Wards stripped.', 'Barrier breach.'],
  ['Pop the bubbles!', 'Ward confetti!'],
  ['Shields fail.', 'Barriers fall — good.'],
  ['Wards deleted.', 'Shields — paper.'],
)

export const IMMUNIZE_BANTER_PERSONALITY = P(
  stoic.immunize,
  snarky.immunize,
  ['Stacks bounce — cry!', 'Immune era!'],
  ['Immunize layered.', 'Debuff window closed.'],
  ['Bounce house debuffs!', 'Immunity — circus!'],
  ['Immune — rot delayed.', 'Stacks slip — for now.'],
  ['Immune — easy.', 'Debuffs denied.'],
)

export const OVERCLOCK_BANTER_PERSONALITY = P(
  stoic.overclock,
  snarky.overclock,
  ['Surge now — pay later!', 'Borrow everything!'],
  ['Overclock — debt noted.', 'Mana spike — planned tax.'],
  ['Overclock — wheee debt!', 'Borrowed thunder!'],
  ['Surge — future pain.', 'Borrowed spark — grim.'],
  ['Maxed meters — skill.', 'Surge — I’ll handle tax.'],
)

export const LINGER_BANTER_PERSONALITY = P(
  stoic.linger,
  snarky.linger,
  ['Floor’s on fire — figuratively.', 'Linger — step wrong!'],
  ['Residual placed.', 'Hazard seeded — area denial.'],
  ['Haunted tiles!', 'Linger party!'],
  ['Tiles tainted.', 'Residual — slow death.'],
  ['Floor trap — genius.', 'Linger — they’ll learn.'],
)

export const FROZEN_BANTER_PERSONALITY = P(
  stoic.frozen,
  snarky.frozen,
  ['Frozen — furious!', 'Ice out — unfair!'],
  ['Frozen — plan stalled.', 'Lockout — reassess.'],
  ['Ice cube cosplay!', 'Frozen — brr rant!'],
  ['Ice lock — silent.', 'Frozen beat — count it.'],
  ['Frozen — rare L.', 'Ice timeout — annoying.'],
)

export const DOT_BANTER_PERSONALITY = P(
  stoic.dot,
  snarky.dot,
  ['Ticks hurt — rude!', 'DoT — still swinging!'],
  ['DoT damage — track it.', 'Periodic loss — adjust.'],
  ['DoT disco!', 'Bleed bassline!'],
  ['Ticks dig.', 'Attrition — familiar.'],
  ['DoT — barely a scratch.', 'Ticks — annoying gnats.'],
)

export const RESIDUAL_VIC_PERSONALITY = P(
  stoic.resVic,
  snarky.resVic,
  ['Residual — that burned!', 'Tile trap — mad!'],
  ['Residual hit — note tile.', 'Linger damage — adjust path.'],
  ['Haunted step!', 'Tile bit me — rude!'],
  ['Linger wound.', 'Residual — another cut.'],
  ['Tile tried me — failed.', 'Residual — cute attempt.'],
)

export const KNOCKBACK_ATK_PERSONALITY = P(
  stoic.kbAtk,
  snarky.kbAtk,
  ['Move!', 'Off the line!'],
  ['Displacement achieved.', 'Spacing forced — good.'],
  ['Fly little pawn!', 'Shove — physics!'],
  ['Cleared them.', 'Shove — space.'],
  ['Boop — gone.', 'Shove — too easy.'],
)

export const KNOCKBACK_VIC_PERSONALITY = P(
  stoic.kbVic,
  snarky.kbVic,
  ['Pushed — rude!', 'Air time — hate it!'],
  ['Knockback — reposition.', 'Forced move — noted.'],
  ['Wheee unwanted!', 'Flying — not fun!'],
  ['Shoved.', 'Spacing lost — grim.'],
  ['Push — whatever.', 'They shoved — rude.'],
)

export const STATUS_EXPIRED_PERSONALITY = P(
  stoic.statEx,
  snarky.statEx,
  ['Tags gone — good!', 'Buffs died — fine!'],
  ['Statuses cleared.', 'Tags expired — window shift.'],
  ['Buffs ghosted — spooky!', 'Tags poof!'],
  ['Tags fell off.', 'Stacks ended — bare again.'],
  ['Expired — refresh era.', 'Tags left — boring.'],
)

export const KNOCKBACK_FAIL_ATK_PERSONALITY = P(
  stoic.kbFailAtk,
  snarky.kbFailAtk,
  ['Couldn’t shove!', 'Push failed — mad!'],
  ['Shove denied.', 'Displacement failed — adjust.'],
  ['Push stuffed — comedy!', 'No flight — lame!'],
  ['Shove blocked.', 'Failed push.'],
  ['They didn’t move — embarrassing for them.', 'Push denied — skill issue.'],
)

export const KNOCKBACK_FAIL_VIC_PERSONALITY = P(
  stoic.kbFailVic,
  snarky.kbFailVic,
  ['Held!', 'Didn’t budge!'],
  ['Position held.', 'Anchor maintained.'],
  ['Stuck — haha!', 'Rooted — try harder!'],
  ['Did not move.', 'Held the tile.'],
  ['Didn’t move — obviously.', 'Plant feet — easy.'],
)

export const DENY_BANTER_PERSONALITY = P(
  stoic.deny,
  snarky.deny,
  ['Can’t — rage!', 'Blocked — unfair!'],
  ['Action denied.', 'State prevents play.'],
  ['Denied — plot twist!', 'Nope nope nope!'],
  ['Body says no.', 'Denied — cold rules.'],
  ['Denied — their fault.', 'Can’t — laughable.'],
)

export const STRIKE_VIC_ENEMY_PERSONALITY = P(
  ['Felt that.', 'Tanking it.', 'Noted.'],
  ['Ouch — invoice received.', 'Tagged — rude.'],
  ['Eat steel!', 'That stings — good!'],
  ['Hit logged — adjust.', 'Contact — noted.'],
  ['Marked — fun!', 'Pain — spicy!'],
  ['Another cut.', 'Steel noted.'],
  ['Light hit — cute.', 'Barely felt — try harder.'],
)

export const STRIKE_VIC_ALLY_PERSONALITY = P(
  ['Wrong target.', 'From you?', 'Watch swing.'],
  ['Friendly fire — really?', 'Our side — hello?'],
  ['Ally blade?!', 'Team damage — why!'],
  ['Friendly hit — track lanes.', 'Ally contact — error.'],
  ['You hit me?!', 'Betrayal — dramatic!'],
  ['Ally steel — noted.', 'Wrong jersey.'],
  ['Aim diff.', 'Friendly fire — embarrassing.'],
)

export const STRIKE_VIC_SELF_PERSONALITY = P(
  ['Own swing.', 'Too close.', 'Clipped self.'],
  ['Self-own — legendary.', 'Invoice to myself.'],
  ['Hit myself — furious!', 'Own blade — mad!'],
  ['Self-hit — spacing error.', 'Clipped — adjust arc.'],
  ['Oops all me!', 'Self tag — comedy!'],
  ['Self wound.', 'Own steel.'],
  ['Clipped myself — rare.', 'Self hit — whatever.'],
)

export const CAST_VIC_ENEMY_PERSONALITY = P(
  ['Spell noted.', 'Soaking cast.', 'Still up.'],
  ['Magic bill — paid.', 'Cast tagged me — rude.'],
  ['Spell burn!', 'AoE — spicy!'],
  ['Magic hit — track.', 'Cast damage — noted.'],
  ['Spell party on me!', 'Magic confetti — ouch!'],
  ['Another burn.', 'Arcane cut.'],
  ['Cast — weak.', 'Spell — cute.'],
)

export const CAST_VIC_ALLY_PERSONALITY = P(
  ['Allied blast.', 'Watch cone.', 'Wrong team.'],
  ['Friendly cast — wow.', 'Our mage — really?'],
  ['Team spell?!', 'Ally AoE — why!'],
  ['Ally magic — spacing.', 'Friendly cast — error.'],
  ['We’re on the same squad!', 'Ally boom — drama!'],
  ['Ally arcane.', 'Wrong target.'],
  ['Aim diff — spell edition.', 'Friendly fire — magic.'],
)

export const CAST_VIC_SELF_PERSONALITY = P(
  ['Own splash.', 'Too tight.', 'Self cast.'],
  ['Splash tax — self.', 'Own blast — iconic.'],
  ['Hit myself — spell!', 'Self AoE — mad!'],
  ['Self splash — position.', 'Own cast clip.'],
  ['Kaboom self!', 'Self spell — clown!'],
  ['Own magic.', 'Self burn.'],
  ['Self splash — rare.', 'Own cast — whatever.'],
)

export const RELIEF_ENEMY_PERSONALITY = P(
  [...stoic.reliefEn],
  [...snarky.reliefEn],
  ['Not me — good!', 'Dodged spotlight!'],
  ['Relief — threat elsewhere.', 'Pressure shifted — good.'],
  ['They lived — hilarious!', 'Not the star!'],
  ['Breathing room.', 'Crosshair moved.'],
  ['Not targeted — obvious.', 'Skipped — skill.'],
)

export const RELIEF_ALLY_PERSONALITY = P(
  [...stoic.reliefAl],
  [...snarky.reliefAl],
  ['We good!', 'Ally fine!'],
  ['Ally clear — good.', 'Team safe — focus elsewhere.'],
  ['We lived — plot armor!', 'Ally dodge!'],
  ['Still breathing.', 'Line holds.'],
  ['We’re fine — easy.', 'Ally safe — as expected.'],
)

export const RELIEF_SPELL_ENEMY_PERSONALITY = P(
  [...stoic.reliefSpEn],
  [...snarky.reliefSpEn],
  ['{focus} ate it — perfect!', 'Spell aimed at {focus} — good!'],
  ['Focus on {focus} — optimal.', '{focus} took cast — spacing win.'],
  ['{focus} spotlight — we chill!', 'Blast loves {focus}!'],
  ['{focus} holds the blast.', 'Spell converges {focus}.'],
  ['{focus} tanked — we’re fine.', 'Cast went to {focus} — easy.'],
)

export const RELIEF_SPELL_ALLY_PERSONALITY = P(
  [...stoic.reliefSpAl],
  [...snarky.reliefSpAl],
  ['{focus} volunteered!', 'Blast on {focus} — ok!'],
  ['{focus} carries spell — good.', 'Focus {focus} — team ok.'],
  ['{focus} main character!', '{focus} ate the fireworks!'],
  ['{focus} holds the magic.', 'Spell hugs {focus}.'],
  ['{focus} took one — we’re built different.', '{focus} — team MVP tank.'],
)
