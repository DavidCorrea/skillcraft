import { actorLabelForLog } from '../../game/actor-label'
import type {
  ActorId,
  BattleLogDetail,
  BattleLogEntry,
  CasterToneId,
  CombatVoicePersonality,
  GameState,
  HitRelation,
} from '../../game/types'
import {
  CAST_VIC_ALLY_PERSONALITY,
  CAST_VIC_ENEMY_PERSONALITY,
  CAST_VIC_SELF_PERSONALITY,
  DENY_BANTER_PERSONALITY,
  DOT_BANTER_PERSONALITY,
  FOCUS_BANTER_PERSONALITY,
  FROZEN_BANTER_PERSONALITY,
  HEAL_BANTER_PERSONALITY,
  IMMUNIZE_BANTER_PERSONALITY,
  KNOCKBACK_ATK_PERSONALITY,
  KNOCKBACK_FAIL_ATK_PERSONALITY,
  KNOCKBACK_FAIL_VIC_PERSONALITY,
  KNOCKBACK_VIC_PERSONALITY,
  LIFESTEAL_ATK_PERSONALITY,
  LINGER_BANTER_PERSONALITY,
  MOVE_BANTER_PERSONALITY,
  OVERCLOCK_BANTER_PERSONALITY,
  PURGE_BANTER_PERSONALITY,
  RELIEF_ALLY_PERSONALITY,
  RELIEF_ENEMY_PERSONALITY,
  RELIEF_SPELL_ALLY_PERSONALITY,
  RELIEF_SPELL_ENEMY_PERSONALITY,
  RESIDUAL_VIC_PERSONALITY,
  SKIP_BANTER_PERSONALITY,
  STATUS_EXPIRED_PERSONALITY,
  STRIKE_VIC_ALLY_PERSONALITY,
  STRIKE_VIC_ENEMY_PERSONALITY,
  STRIKE_VIC_SELF_PERSONALITY,
  TURN_BANTER_PERSONALITY,
  WARDBREAK_BANTER_PERSONALITY,
  WARD_BANTER_PERSONALITY,
} from './broadcastActorPersonalityPools'
import * as TonePools from './broadcastCasterTonePools'
import {
  casterLinesForReactionWithTone,
  cpuLinesForReactionWithPersonality,
} from './broadcastReactionPhrases'

export type BroadcastVoice = 'caster' | 'actor'

export interface BroadcastRow {
  text: string
  subject?: ActorId
  voice: BroadcastVoice
  /** Extra class in addition to team tint when voice is actor */
  banter?: boolean
}

function hashSeed(parts: (string | number)[]): number {
  let h = 0
  for (const p of parts) {
    const s = String(p)
    for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i)
  }
  return Math.abs(h)
}

function pickPhrase(seed: number, pool: readonly string[]): string {
  if (pool.length === 0) return ''
  return pool[seed % pool.length]!
}

function sameTeam(game: GameState, a: ActorId, b: ActorId): boolean {
  return game.teamByActor[a] === game.teamByActor[b]
}

function displayName(game: GameState, id: ActorId): string {
  return actorLabelForLog(game, id)
}

function effectiveTone(game: GameState): CasterToneId {
  return game.casterTone
}

function inferHitRelation(game: GameState, attackerId: ActorId, targetId: ActorId): HitRelation {
  if (targetId === attackerId) return 'self'
  if (game.matchMode === 'ffa') return 'enemy'
  return sameTeam(game, attackerId, targetId) ? 'ally' : 'enemy'
}

function snapshotRelation(
  game: GameState,
  attackerId: ActorId,
  snap: { targetId: ActorId; relation?: HitRelation },
): HitRelation {
  return snap.relation ?? inferHitRelation(game, attackerId, snap.targetId)
}

function pickStrikeCasterPool(tone: CasterToneId): readonly string[] {
  return STRIKE_CASTER_BY_TONE[tone] ?? CASTER_STRIKE
}

function pickStrikeKillCasterPool(tone: CasterToneId): readonly string[] {
  return STRIKE_KILL_CASTER_BY_TONE[tone] ?? CASTER_STRIKE_KILL
}

function pickStrikeLowCasterPool(tone: CasterToneId): readonly string[] {
  return STRIKE_LOW_CASTER_BY_TONE[tone] ?? CASTER_STRIKE_LOW
}

function pickTonePool(
  tone: CasterToneId,
  classic: readonly string[],
  byTone: Partial<Record<CasterToneId, readonly string[]>>,
): readonly string[] {
  return byTone[tone] ?? classic
}

const CASTER_BATTLE_START = [
  'We are live — fighters to the corners.',
  'Match is underway; eyes on the grid.',
  'Clock starts now. Here we go.',
] as const

const CASTER_TURN_YOU = ['Your tempo — make it count.', 'The crowd holds its breath — your move.', 'Board is yours.'] as const

const CASTER_TURN_CPU = [
  '{name} takes the clock.',
  '{name} lines up the next play.',
  'Over to {name}.',
] as const

const CASTER_MOVE = [
  '{name} repositions — spacing matters.',
  '{name} slides across the tiles.',
  'Footwork from {name}.',
] as const

const CASTER_SKIP = ['{name} passes the tempo.', '{name} holds — no action.', '{name} skips.'] as const

const CASTER_STRIKE = [
  '{atk} connects on {def} for {dmg} — big swing.',
  'Melee! {atk} hits {def} for {dmg}.',
  '{atk} drives {dmg} physical into {def}.',
  '{atk} finds {def} for {dmg} — clean tempo.',
  'Body blow: {atk} clocks {def} for {dmg}.',
  'In the pocket — {atk} lands {dmg} on {def}.',
  '{def} eats {dmg} from {atk}\'s Strike.',
] as const

const CASTER_STRIKE_KILL = [
  '{atk} EXECUTES {def} for {dmg} — lights out!',
  'That is the finisher — {atk} drops {def} for {dmg}.',
  '{def} goes down — {atk} ends it for {dmg}.',
  'Match point melee — {atk} deletes {def} ({dmg}).',
  '{atk} closes the book on {def} with {dmg}.',
] as const

const CASTER_STRIKE_LOW = [
  '{def} is on life support — {atk} rips {dmg} and they are bleeding out.',
  '{dmg} from {atk} — {def} is one breath from zero.',
  '{atk} nearly finishes {def} — {dmg} leaves them staggered.',
  'Clutch damage — {atk} hammers {def} for {dmg}; bar is almost empty.',
] as const

const STRIKE_CASTER_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: [
    '{atk} drives steel into {def} — {dmg} on the tally.',
    'Another wound: {atk} on {def} for {dmg}.',
    '{def} takes {dmg} from {atk}; the line holds barely.',
  ],
  snarky_desk: [
    '{atk} cashes a swing on {def} — {dmg}, tidy.',
    'Melee tax: {def} pays {dmg} to {atk}.',
    '{atk} collects {dmg} from {def}.',
  ],
  arcane_showman: [
    'Blade work — {atk} paints {dmg} on {def}.',
    '{atk} and {def} trade distance; {dmg} lands.',
  ],
  cold_analyst: [
    '{atk} lands {dmg} physical on {def} — clean exchange.',
    '{def} absorbs {dmg} from {atk}; spacing tightens.',
  ],
}

const STRIKE_KILL_CASTER_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['{def} folds — {atk} ends it for {dmg}.', '{atk} shuts {def} down ({dmg}).'],
  snarky_desk: ['{def} is done — {atk} cashes out ({dmg}).', 'Lights for {def} — {atk} with {dmg}.'],
  arcane_showman: ['Finale — {atk} drops {def} for {dmg}.'],
  cold_analyst: ['Elimination: {atk} removes {def} ({dmg}).'],
}

const STRIKE_LOW_CASTER_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['{def} barely stands after {dmg} from {atk}.'],
  snarky_desk: ['{def} is paper — {atk} rips {dmg}.'],
}

/** CPU actor banter: first-person voice, no leading “I …” (fragments, gerunds, mine/my). */
const CPU_STRIKE_ATK = [
  'There — tagged.',
  'Connected.',
  'Swing through — clean.',
  'Mine — landed.',
  'Through the guard.',
] as const

const STRIKE_ATK_PERSONALITY: Partial<Record<CombatVoicePersonality, readonly string[]>> = {
  stoic: ['On target.', 'Clean connection.', 'Landed.'],
  snarky: ['There — tagged.', 'Yours.', 'Invoice paid.'],
  hot_headed: ['Eat that!', 'Mine!', 'Through!'],
  tactical: ['Angles paid off.', 'Committed swing.', 'Contact confirmed.'],
  unhinged: ['Ha — marked!', 'Sweet contact.'],
  grim: ['Another hit logged.', 'Steel finds flesh.'],
  cocky: ['Too easy.', 'Called it.', 'Gift-wrapped.'],
}

const HUMAN_STRIKE_ATK = [
  'Connected.',
  'Clean hit.',
  'Through them.',
  'Tagged.',
] as const

const CPU_STRIKE_VIC = [
  'Felt that.',
  'Eating the hit.',
  'Still up.',
  'Tanking it.',
  'Noted.',
] as const

const HUMAN_STRIKE_VIC = [
  'Took it.',
  'Still standing.',
  'Felt that.',
  'Absorbing it.',
] as const

const CPU_STRIKE_VIC_ALLY = ['From you?', 'Wrong target.', 'Watch the swing.'] as const

const HUMAN_STRIKE_VIC_ALLY = ['Friendly blade?', 'Our side — really?', 'Watch the swing.'] as const

const CPU_STRIKE_VIC_SELF = ['Hit myself on the swing.', 'Too close.', 'Own swing caught me.'] as const

const HUMAN_STRIKE_VIC_SELF = ['Clipped myself.', 'Too tight.', 'Own miss — ouch.'] as const

const CASTER_LIFESTEAL = ['{name} steals {n} back off the hit.', 'Lifesteal — {name} pockets {n} HP.'] as const

const CPU_LIFESTEAL_ATK = [
  'Draining off that swing.',
  'Life back from the hit — needed.',
  'Leeching — yes.',
  'Taste the heal.',
] as const

const CASTER_TURN_DOT = [
  'DoT tick — {name} bleeds tempo.',
  'Status eats {name} for {dot} — burns and poisons add up.',
  '{name} pays {dot} on the tick — attrition is real.',
] as const

const CASTER_TURN_REGEN = [
  '{name} regenerates for {regen} — small sustain.',
  'Regen tick — {name} claws back {regen}.',
] as const

const CASTER_RESOURCE_TICK = [
  'Clock refresh — {name} gains {m} mana and {s} stamina.',
  'Resources tick in for {name}: +{m} mana, +{s} stamina.',
] as const

const CASTER_KNOCKBACK = [
  '{atk} shoves {def} — spacing opens up.',
  'Knockback! {def} flies off {atk}\'s hit.',
  '{atk} clears {def} off the line.',
] as const

const CPU_KNOCKBACK_ATK = [
  'Clear the angle.',
  'Shove — spacing opens.',
  'Off the line — good.',
]
const CPU_KNOCKBACK_VIC = [
  'Sliding from the shove.',
  'Eating the push.',
  'Air time — fine.',
]

const CASTER_FIRST_BLOOD = [
  'FIRST BLOOD — {vic} is out of the fight!',
  'Opening kill — {vic} hits the deck!',
  'Blood on the board — {vic} goes down first!',
] as const

const CASTER_KILL_STEAL = [
  '{killer} tags the elimination on {vic} — {credited} did the setup damage.',
  'Cleanup frame: {killer} ends {vic}; {credited} earned that health bar.',
  'Scoreboard says {killer} — {credited} remembers the earlier hits on {vic}.',
] as const

const CASTER_STRIKE_SHIELD = [
  '{def}\'s barrier eats {n} before HP moves.',
  'Ward soaks {n} on {def} — steel still finds purchase.',
] as const

const CASTER_STRIKE_FLANKED = ['{atk} trades while flanked — nowhere to hide the swing.'] as const

const CASTER_STRIKE_SURROUNDED = ['{atk} swings boxed in — heat on three sides.'] as const

const CASTER_RESIDUAL_SHIELD = [
  '{vic}\'s shield catches {n} of the lingering {skill} hit.',
  'Barrier drinks {n} — {vic} still eats residual {skill}.',
] as const

const CASTER_CAST_SHIELD_SNAP = [
  '{name} shrugs {n} through a ward before HP chips.',
  'Shield work — {n} absorbed on {name}.',
] as const

const CASTER_WIN_CLUTCH = [
  '{name} wins on fumes — {hp}/{maxHp} HP left!',
  'Clutch finish — {name} takes it at death\'s door ({hp}/{maxHp}).',
  '{name} limps across the line — {hp}/{maxHp} and still champion!',
] as const

const CASTER_RESIDUAL_KILL = [
  '{vic} trips the tile — {skill} finishes them for {dmg}!',
  'Residual lethal — {vic} dies to lingering {skill} ({dmg}).',
] as const

const CASTER_RESIDUAL_LOW = [
  '{vic} barely survives the linger — {skill} for {dmg}; one more step and they are gone.',
  'Hazard nearly ends it — {vic} eats {dmg} from {skill}.',
] as const

const CPU_CAST_VIC = [
  'Eating that spell.',
  'Soaking the cast — ouch.',
  'That hit — felt it.',
  'Magic landed — noted.',
  'Still standing.',
] as const

const HUMAN_CAST_VIC = [
  'Soaking that cast.',
  'Felt that spell.',
  'Still up.',
  'Magic noted.',
] as const

const CPU_WARD = [
  'Shielding up.',
  'Barricading — wards on.',
  'Layering wards.',
]
const CPU_PURGE = [
  'Cleansing — breathe again.',
  'Peeling debuffs — better.',
  'Purging — clean slate.',
]
const CPU_LINGER = [
  'Leaving energy on the tiles.',
  'Painting the floor — watch it.',
  'Seeding the board — step carefully.',
]

const CASTER_CAST_DMG = [
  '{name} channels {skill} — {dmg} total across the line.',
  'Spellfire: {skill} from {name} for {dmg}.',
  '{name} paints the AoE — {skill} cashes {dmg}.',
  'Big cast — {name} lands {skill} for {dmg} combined.',
  '{skill} detonates from {name} — {dmg} on the sheet.',
  'Arcane pressure: {name} spends mana and deals {dmg} with {skill}.',
] as const

const CASTER_CAST_DMG_KILL = [
  '{name} wipes a carry with {skill} — {dmg} and someone is gone.',
  'Elimination cast — {skill} from {name} for {dmg}; a name leaves the board.',
  '{name} closes with {skill} — {dmg} total and a fighter drops.',
] as const

const CASTER_CAST_DMG_LOW = [
  '{name} shreds HP bars — {skill} for {dmg}; someone is one tap from dead.',
  'Critical window — {skill} from {name} hits {dmg}; finish hunt is on.',
] as const

const CASTER_CAST_FF = [
  'That blast lands, but the collateral is ugly.',
  'Strong cast — own side pays the spacing tax.',
  'Friendly fire on the clock — messy cone.',
  'Good pressure, brutal placement.',
  'The AoE does not care whose badge you wear.',
] as const

const CASTER_CAST_FF_KILL = [
  'The cast takes a teammate — elimination on the wrong name.',
  'Collateral finishes one of their own.',
  'Friendly fire closes the book on an ally.',
] as const

const CASTER_CAST_FF_LOW = [
  'Cluster punish — someone on their side is one tap from gone.',
  'The splash almost ends one of their own.',
] as const

const CASTER_OFFENSIVE_WHIFF = [
  'A costly miss — tempo spent, nothing cashed.',
  'Whiff — the angle was there, the contact was not.',
  'Empty swing; the board exhales.',
  'Resources down, sheet clean.',
] as const

const CASTER_ACTION_DENIED = [
  'They reach for it — the body says no.',
  'Denied — gas tank or rules win that beat.',
  'Clock ticks; that play is not on the menu.',
] as const

const CAST_DMG_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: [
    '{name} spends {skill} — {dmg} on the tally.',
    'Another burn: {skill} from {name}, {dmg} total.',
  ],
  snarky_desk: [
    '{name} invoices the room — {skill} for {dmg}.',
    'AoE tab: {skill}, {dmg}, courtesy of {name}.',
  ],
  arcane_showman: [
    '{name} paints the burst — {skill} for {dmg}.',
    'The cast blooms: {skill} from {name}, {dmg} combined.',
  ],
  cold_analyst: [
    '{name} resolves {skill} — {dmg} aggregate damage.',
    'Area effect: {skill} from {name}; {dmg} recorded.',
  ],
}

const CAST_DMG_KILL_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['{name} ends one with {skill} — {dmg} and a body down.'],
  snarky_desk: ['Someone cashes out — {skill} from {name}, {dmg}.'],
  arcane_showman: ['Curtain call on a name — {skill} from {name} for {dmg}.'],
  cold_analyst: ['Elimination event: {skill} from {name}; {dmg} total.'],
}

const CAST_DMG_LOW_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['{name} nearly finishes one — {skill} for {dmg}.'],
  snarky_desk: ['Finish-line math — {skill} from {name}, {dmg}.'],
}

const CAST_FF_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['The blast does not pick sides — own ranks bleed.'],
  snarky_desk: ['Cone diplomacy: allies pay too.'],
  arcane_showman: ['The spectacle bites both benches.'],
  cold_analyst: ['Collateral includes allied cells — spacing failure.'],
}

const CAST_FF_KILL_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['Friendly line breaks — the cast kills one of their own.'],
  snarky_desk: ['Wrong jersey eliminated — messy cast.'],
  cold_analyst: ['Friendly elimination — attribution: {name}\'s {skill}.'],
}

const CAST_FF_LOW_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['Allies stagger — someone is one hit from gone.'],
  snarky_desk: ['Almost deleted a teammate — awkward.'],
}

const RESIDUAL_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['{vic} steps wrong — {skill} lingers for {dmg}.'],
  snarky_desk: ['Tile tax: {vic} pays {dmg} on {skill}.'],
  cold_analyst: ['Residual {skill}: {vic} takes {dmg}.'],
}

const RESIDUAL_KILL_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['{vic} dies on the linger — {skill} ({dmg}).'],
  snarky_desk: ['{vic} trips the hazard — {skill} finishes ({dmg}).'],
}

const RESIDUAL_LOW_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['{vic} barely survives {skill} — {dmg}.'],
  snarky_desk: ['{vic} is paper after {skill} ({dmg}).'],
}

const FIRST_BLOOD_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['First tally — {vic} is down.'],
  snarky_desk: ['Opening invoice paid — {vic} out.'],
  arcane_showman: ['First exit — {vic} leaves the stage.'],
  cold_analyst: ['First elimination: {vic}.'],
}

const WIN_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['{name} survives the field.'],
  snarky_desk: ['{name} keeps the receipts — win.'],
  arcane_showman: ['{name} bows to the crowd — victory.'],
  cold_analyst: ['Match outcome: {name} wins.'],
}

const WIN_CLUTCH_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['{name} wins on fumes ({hp}/{maxHp}).'],
  snarky_desk: ['Clutch tab — {name} at {hp}/{maxHp}.'],
  cold_analyst: ['Narrow margin: {name} wins at {hp}/{maxHp}.'],
}

const OFFENSIVE_WHIFF_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['Swing finds air — tempo lost.'],
  snarky_desk: ['Whiff on the ledger.'],
  cold_analyst: ['Miss — resources spent, no contact.'],
}

const ACTION_DENIED_BY_TONE: Partial<Record<CasterToneId, readonly string[]>> = {
  grim_war_report: ['The body refuses — no play.'],
  snarky_desk: ['Rules say no — cute try.'],
  cold_analyst: ['Action blocked by state or resources.'],
}

const CASTER_CAST_HEAL = ['{name} mends for {n} — sustain online.', 'Big heal: +{n} to {name}.'] as const

const CASTER_CAST_WARD = ['{name} throws up wards — barrier game.', '{name} reinforces — shields up.'] as const

const CASTER_PURGE = ['{name} cleanses {n} — debuffs peeled.', 'Purge lands — {n} cleared.'] as const

const CASTER_FOCUS = ['{name} sharpens the next hit — focus online.', '{name} lines up the follow-up cast.'] as const

const CASTER_WARDBREAK = ['{name} tears down barriers — wardbreak.', 'Shields buckle under {name}.'] as const

const CASTER_IMMUNIZE = ['{name} layers debuff insurance.', '{name} immunizes the team.'] as const

const CASTER_OVERCLOCK = [
  '{name} spikes mana — overclock tax incoming.',
  '{name} surges resources; legs get heavy after.',
] as const

const CPU_FOCUS = ['Next cast hits harder.', 'Locked in.', 'Saving the spike.'] as const

const CPU_WARDBREAK = ['Barriers down.', 'Shred the ward.', 'Shield game answered.'] as const

const CPU_IMMUNIZE = ['Clean window.', 'Debuffs bounce.', 'Stacking immunity.'] as const

const CPU_OVERCLOCK = ['Borrowed mana.', 'Pay the slow later.', 'Surge now, drag next.'] as const

const CASTER_LINGER = [
  '{name} leaves energy on the tiles — residual pressure.',
  'Residual field from {name} — watch your steps.',
] as const

const CASTER_RESIDUAL = [
  '{vic} trips residual {skill} for {dmg} — tile still hot.',
  'Lingering {skill} bites {vic} for {dmg}.',
] as const

const CASTER_FROZEN = ['{name} is locked in ice — turn skipped.', 'Freeze holds {name} out of the rotation.'] as const

const CASTER_WIN = ['{name} takes the W!', 'That is the game — {name} wins it!', '{name} stands alone.'] as const

const CASTER_CPU_THINKING = [
  'Booth: CPU is thinking — we hear them on comms.',
  'Casters: quiet moment while they decide.',
] as const

const CASTER_RELIEF = [
  'Threat shifts — {name} catches a break.',
  'Pressure moves elsewhere — {name} exhales.',
  'Crosshair slides off {name} — not their problem this swing.',
  'Focus pivots — {name} dodges the spotlight.',
] as const

const CASTER_RELIEF_SPELL = [
  '{atk} commits damage on {focus} — other fighters peel pressure.',
  'The cast converges on {focus}; crosshairs slide off the rest.',
  'Spell budget goes into {focus} — not everyone eats this rotation.',
  'Focus fire on {focus}; the room breathes elsewhere.',
] as const

const CPU_RELIEF_SPELL_ENEMY = [
  'Not the star of that cast — good.',
  'Watching it hit {focus} — still breathing.',
  'Wrong name on the ticket — exhale.',
  'Slipping that burst — aimed at {focus}.',
] as const

const CPU_RELIEF_SPELL_ALLY = [
  'Spared — they focused {focus}.',
  'Taking the reset — shot went to {focus}.',
  'Regrouping — {focus} ate the burst.',
] as const

const CPU_RELIEF_ENEMY = [
  'Wrong guy — opening stays.',
  'Not me this time.',
  'Pressure elsewhere — good.',
] as const

const CPU_RELIEF_ALLY = [
  'Still breathing.',
  'Eyes on the opening.',
  'Needed that breather.',
] as const

const HUMAN_RELIEF_ENEMY = ['Pressure elsewhere — good.', 'Not me this beat.', 'Crosshair slid off.'] as const

const HUMAN_RELIEF_ALLY = ['Still here.', 'Breathing room.', 'Dodged the worst.'] as const

const HUMAN_RELIEF_SPELL_ENEMY = [
  'Cast hit {focus} — fine.',
  '{focus} ate that — good.',
  'Not my problem — {focus}.',
] as const

const HUMAN_RELIEF_SPELL_ALLY = [
  '{focus} took the burst — ok.',
  'We’re clear — {focus}.',
  'Blast went to {focus}.',
] as const

function fill(tpl: string, vars: Record<string, string | number>): string {
  let s = tpl
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v))
  }
  return s
}

/** First-person CPU banter (speaker = row `subject`); no leading “I …”. */
function fpBanter(pool: readonly string[], seedParts: (string | number)[]): string {
  return pickPhrase(hashSeed(seedParts), pool)
}

function actorBanter(
  game: GameState,
  actorId: ActorId,
  seedParts: (string | number)[],
  humanPool: readonly string[],
  cpuPool: readonly string[],
): string {
  if (actorId === game.humanActorId) {
    return pickPhrase(hashSeed([...seedParts, 'human']), humanPool)
  }
  return fpBanter(cpuPool, seedParts)
}

function banterWithPersonality(
  game: GameState,
  actorId: ActorId,
  seedParts: (string | number)[],
  humanDefault: readonly string[],
  cpuDefault: readonly string[],
  byPersonality: Partial<Record<CombatVoicePersonality, readonly string[]>>,
): string {
  const p = game.actors[actorId]?.personality
  if (actorId === game.humanActorId) {
    if (p !== undefined && byPersonality[p]?.length) {
      return fpBanter(byPersonality[p]!, [...seedParts, 'hpers'])
    }
    return pickPhrase(hashSeed([...seedParts, 'human']), humanDefault)
  }
  if (p !== undefined && byPersonality[p]?.length) {
    return fpBanter(byPersonality[p]!, seedParts)
  }
  return fpBanter(cpuDefault, seedParts)
}

function denyBanter(game: GameState, actorId: ActorId, seedParts: (string | number)[]): string {
  return banterWithPersonality(
    game,
    actorId,
    seedParts,
    ['Can’t.', 'Denied.', 'Not this beat.', 'Blocked.'],
    ['Denied.', 'Can’t.', 'Not this beat.', 'Blocked.'],
    DENY_BANTER_PERSONALITY,
  )
}

function strikeVictimBanter(
  game: GameState,
  targetId: ActorId,
  rel: HitRelation,
  seedParts: (string | number)[],
): string {
  const hPool =
    rel === 'ally' ? HUMAN_STRIKE_VIC_ALLY : rel === 'self' ? HUMAN_STRIKE_VIC_SELF : HUMAN_STRIKE_VIC
  const cPool =
    rel === 'ally' ? CPU_STRIKE_VIC_ALLY : rel === 'self' ? CPU_STRIKE_VIC_SELF : CPU_STRIKE_VIC
  const pers =
    rel === 'ally'
      ? STRIKE_VIC_ALLY_PERSONALITY
      : rel === 'self'
        ? STRIKE_VIC_SELF_PERSONALITY
        : STRIKE_VIC_ENEMY_PERSONALITY
  return banterWithPersonality(game, targetId, seedParts, hPool, cPool, pers)
}

function castVictimBanter(
  game: GameState,
  targetId: ActorId,
  rel: HitRelation,
  seedParts: (string | number)[],
): string {
  const hPool =
    rel === 'ally' ? HUMAN_CAST_VIC_ALLY : rel === 'self' ? HUMAN_CAST_VIC_SELF : HUMAN_CAST_VIC
  const cPool =
    rel === 'ally' ? CPU_CAST_VIC_ALLY : rel === 'self' ? CPU_CAST_VIC_SELF : CPU_CAST_VIC
  const pers =
    rel === 'ally'
      ? CAST_VIC_ALLY_PERSONALITY
      : rel === 'self'
        ? CAST_VIC_SELF_PERSONALITY
        : CAST_VIC_ENEMY_PERSONALITY
  return banterWithPersonality(game, targetId, seedParts, hPool, cPool, pers)
}

function strikeAtkBanter(game: GameState, actorId: ActorId, seedParts: (string | number)[]): string {
  const p = game.actors[actorId]?.personality
  if (actorId === game.humanActorId) {
    if (p !== undefined && STRIKE_ATK_PERSONALITY[p] !== undefined) {
      return fpBanter(STRIKE_ATK_PERSONALITY[p]!, [...seedParts, 'hpers'])
    }
    return pickPhrase(hashSeed([...seedParts, 'human']), HUMAN_STRIKE_ATK)
  }
  const pool =
    p !== undefined && STRIKE_ATK_PERSONALITY[p] !== undefined
      ? STRIKE_ATK_PERSONALITY[p]!
      : CPU_STRIKE_ATK
  return fpBanter(pool, seedParts)
}

const CPU_TURN_BANTER = [
  'My turn — ready.',
  "Clock's mine.",
  'Up.',
] as const

const HUMAN_TURN_BANTER = [
  'My turn — make it count.',
  'Clock is mine.',
  'Up — own the board.',
] as const

const CPU_MOVE_BANTER = [
  'Better tile.',
  'New angle.',
  'Sliding into position.',
] as const

const HUMAN_MOVE_BANTER = [
  'New square.',
  'Repositioning.',
  'Better footing.',
  'Sliding into place.',
] as const

const CPU_SKIP_BANTER = [
  'Passing.',
  'Holding.',
  'Skipping this beat.',
] as const

const HUMAN_SKIP_BANTER = [
  'Passing the beat.',
  'Holding position.',
  'Skipping this one.',
  'No spend this turn.',
] as const

const CPU_HEAL_BANTER = [
  'Stitching up.',
  'Needed that.',
  'Still in it.',
] as const

const CPU_CAST_ATK_BANTER = [
  'Unloading this spell.',
  'Eat this.',
  'Big cast — echoing out.',
] as const

const CPU_CAST_ATK_COLLATERAL = [
  'Wide net — everyone felt that.',
  'Risky spread paid out.',
  'Cone caught more than one jersey.',
] as const

const HUMAN_CAST_ATK = ['Spell out.', 'Unloading the cast.', 'AoE live.', 'There it goes.'] as const

const HUMAN_CAST_ATK_COLLATERAL = [
  'Wide net cast.',
  'Splash hits everyone.',
  'Risky spread — sending it.',
] as const

const CAST_ATK_PERSONALITY: Partial<Record<CombatVoicePersonality, readonly string[]>> = {
  stoic: ['Cast committed.', 'Spell deployed.', 'Area online.'],
  snarky: ['Invoice in the mail — spell edition.', 'Group discount cast.'],
  hot_headed: ['Eat the whole burst!', 'Wide and hot!'],
  tactical: ['Pattern set.', 'Splash accounted for.'],
  unhinged: ['Paint the room!', 'Everyone dances!'],
  grim: ['Another burn loosed.', 'Fire finds flesh.'],
  cocky: ['Too easy to spread.', 'Caught them all.'],
}

const CAST_ATK_COLLATERAL_PERSONALITY: Partial<Record<CombatVoicePersonality, readonly string[]>> = {
  stoic: ['Collateral accepted.', 'Wide pattern locked.'],
  snarky: ['Oops — whole squad’s invited.', 'Cone’s generous today.'],
  hot_headed: ['Everyone eats it!', 'Splash party!'],
  tactical: ['Area threat — allies noted.', 'Wide angle committed.'],
  unhinged: ['Scatter shot!', 'No one’s safe!'],
  grim: ['The blast does not care.', 'Wide ruin.'],
  cocky: ['Blast radius — mine.', 'Tagged the room.'],
}

const CPU_CAST_VIC_ALLY = [
  'Wrong team on that hit.',
  'Friendly fire — noted.',
  'From our side? Really?',
] as const

const HUMAN_CAST_VIC_ALLY = [
  'Watch the blast.',
  'Allied fire — move.',
  'That was ours.',
] as const

const CPU_CAST_VIC_SELF = [
  'Caught my own blast.',
  'Too close to center.',
  'Edge ate me too.',
] as const

const HUMAN_CAST_VIC_SELF = [
  'Clipped myself.',
  'Own splash — ouch.',
  'Too tight on that cast.',
] as const

const CPU_RESIDUAL_VIC_BANTER = [
  'Stepped in it — residual burns.',
  'Still feel that tile.',
  'Tripped the linger — ouch.',
] as const

const CPU_FROZEN_BANTER = [
  'Frozen solid — skipping.',
  "Can't break the ice this beat.",
  'Locked out — passing.',
] as const

const CPU_DOT_BANTER = [
  'Every tick — ouch.',
  'DoTs chewing — not dead yet.',
  'Still bleeding — holding.',
] as const

const CPU_WIN_BANTER = [
  'Closed it out.',
  'Taking the match.',
  'Still standing — won.',
] as const

const HUMAN_WIN_BANTER = ['Won it.', 'Mine.', 'Still standing.', 'Closed.'] as const

const WIN_BANTER_PERSONALITY: Partial<Record<CombatVoicePersonality, readonly string[]>> = {
  stoic: ['Outcome secured.', 'Match complete.'],
  snarky: ['Receipt stamped — win.', 'Called it.'],
  hot_headed: ['Buried them!', 'Still here!'],
  tactical: ['Plan held.', 'Position won.'],
  unhinged: ['Still breathing — haha!', 'Chaos favors me!'],
  grim: ['Survivor’s tally.', 'Still above dirt.'],
  cocky: ['Easy dub.', 'Expected.'],
}

const CPU_WHIFF_BANTER = ['Empty swing.', 'No purchase.', 'Whiff — costly.', 'Tempo burned.'] as const

const HUMAN_WHIFF_BANTER = ['Whiffed.', 'Burned the angle.', 'Nothing landed.', 'Tempo down the drain.'] as const

const WHIFF_PERSONALITY: Partial<Record<CombatVoicePersonality, readonly string[]>> = {
  stoic: ['Miss — costly.', 'Swing empty.'],
  snarky: ['Swing and a bill.', 'Audition flopped.'],
  hot_headed: ['Wasted it!', 'Nothing!'],
  tactical: ['Bad angle — reset.', 'Commit whiffed.'],
  unhinged: ['Air ball!', 'Ha — whiff!'],
  grim: ['Steel meets nothing.', 'Another empty cut.'],
  cocky: ['Rare miss.', 'Slipped.'],
}

function castAtkBanter(
  game: GameState,
  actorId: ActorId,
  seedParts: (string | number)[],
  collateral: boolean,
): string {
  const p = game.actors[actorId]?.personality
  const humanDefault = collateral ? HUMAN_CAST_ATK_COLLATERAL : HUMAN_CAST_ATK
  const map = collateral ? CAST_ATK_COLLATERAL_PERSONALITY : CAST_ATK_PERSONALITY
  const cpuDefault = collateral ? CPU_CAST_ATK_COLLATERAL : CPU_CAST_ATK_BANTER

  if (actorId === game.humanActorId) {
    if (p !== undefined && map[p] !== undefined) {
      return fpBanter(map[p]!, [...seedParts, 'hpers'])
    }
    return pickPhrase(hashSeed([...seedParts, 'human']), humanDefault)
  }
  const pool = p !== undefined && map[p] !== undefined ? map[p]! : cpuDefault
  return fpBanter(pool, seedParts)
}

function whiffBanter(game: GameState, actorId: ActorId, seedParts: (string | number)[]): string {
  const p = game.actors[actorId]?.personality
  if (actorId === game.humanActorId) {
    if (p !== undefined && WHIFF_PERSONALITY[p] !== undefined) {
      return fpBanter(WHIFF_PERSONALITY[p]!, [...seedParts, 'hpers'])
    }
    return pickPhrase(hashSeed([...seedParts, 'human']), HUMAN_WHIFF_BANTER)
  }
  const pool =
    p !== undefined && WHIFF_PERSONALITY[p] !== undefined ? WHIFF_PERSONALITY[p]! : CPU_WHIFF_BANTER
  return fpBanter(pool, seedParts)
}

function winBanter(game: GameState, winnerId: ActorId, seedParts: (string | number)[]): string {
  const p = game.actors[winnerId]?.personality
  if (winnerId === game.humanActorId) {
    if (p !== undefined && WIN_BANTER_PERSONALITY[p] !== undefined) {
      return fpBanter(WIN_BANTER_PERSONALITY[p]!, [...seedParts, 'hpers'])
    }
    return pickPhrase(hashSeed([...seedParts, 'human']), HUMAN_WIN_BANTER)
  }
  const pool =
    p !== undefined && WIN_BANTER_PERSONALITY[p] !== undefined
      ? WIN_BANTER_PERSONALITY[p]!
      : CPU_WIN_BANTER
  return fpBanter(pool, seedParts)
}

const CASTER_STATUS_EXPIRED = [
  '{name} shakes off {tags} — clock ran out on those stacks.',
  'Status dump: {tags} clear from {name}.',
  '{name} cleans the sheet — {tags} gone.',
] as const

const CPU_STATUS_EXPIRED_BANTER = [
  'Finally off.',
  'Buff wore off — good.',
  'Clean window again.',
  'Debts paid — tags gone.',
] as const

const HUMAN_STATUS_EXPIRED_BANTER = [
  'Off your back.',
  'Finally clear.',
  'That wore off.',
  'Clean again.',
] as const

const CASTER_KNOCKBACK_FAIL_EDGE = [
  '{atk} drives {def} but the wall says no — no tile to take.',
  'Push denied at the rope — {def} stays put against {atk}.',
  '{atk} tries to clear {def}; arena edge blocks the shove.',
] as const

const CASTER_KNOCKBACK_FAIL_BLOCKED = [
  '{atk} hits the shove — someone else owns that tile; {def} holds.',
  'Crowded square — {atk} cannot thread {def} through.',
  'Body in the way — {def} does not budge for {atk}.',
] as const

const CPU_KNOCKBACK_FAIL_ATK = [
  'Push stuffed.',
  'No lane — blocked.',
  'Couldn\'t clear them.',
] as const

const HUMAN_KNOCKBACK_FAIL_ATK = [
  'No room to shove.',
  'Didn\'t budge them.',
  'Blocked push.',
] as const

const CPU_KNOCKBACK_FAIL_VIC = [
  'Held the line.',
  'Not moving.',
  'Stuck firm.',
] as const

const HUMAN_KNOCKBACK_FAIL_VIC = [
  'Not moving.',
  'Held ground.',
  'Stuck in place.',
] as const

const CASTER_LINGERING_EXPIRED_SINGLE = [
  'Residual patch on the board winks out — hazard spent.',
  'One lingering zone collapses — the tile goes quiet.',
  'Echo magic fades from a single cell.',
] as const

const CASTER_LINGERING_EXPIRED_MULTI = [
  'Several residual fields collapse together — cleaner floor.',
  'Multiple hazard patches expire — breathing room.',
  'Lingering energy dissipates in chunks across the grid.',
] as const

const CASTER_ROUND_COMPLETE = [
  'End of round {n} — reset tempo, same hunger.',
  'Round {n} in the books; corners tighten mentally.',
  'That closes round {n} — coaches scribble notes.',
] as const

function pickCastDamagePool(
  tone: CasterToneId,
  collateral: boolean,
  kill: boolean,
  low: boolean,
): readonly string[] {
  if (collateral) {
    if (kill) return pickTonePool(tone, CASTER_CAST_FF_KILL, CAST_FF_KILL_BY_TONE)
    if (low) return pickTonePool(tone, CASTER_CAST_FF_LOW, CAST_FF_LOW_BY_TONE)
    return pickTonePool(tone, CASTER_CAST_FF, CAST_FF_BY_TONE)
  }
  if (kill) return pickTonePool(tone, CASTER_CAST_DMG_KILL, CAST_DMG_KILL_BY_TONE)
  if (low) return pickTonePool(tone, CASTER_CAST_DMG_LOW, CAST_DMG_LOW_BY_TONE)
  return pickTonePool(tone, CASTER_CAST_DMG, CAST_DMG_BY_TONE)
}

function expandDetail(d: BattleLogDetail, entry: BattleLogEntry, game: GameState, index: number): BroadcastRow[] {
  const rows: BroadcastRow[] = []
  const seed = hashSeed([index, d.kind, game.turn])
  const tone = effectiveTone(game)

  switch (d.kind) {
    case 'battle_start':
      rows.push({
        text: pickPhrase(seed, pickTonePool(tone, CASTER_BATTLE_START, TonePools.BATTLE_START_BY_TONE)),
        voice: 'caster',
      })
      break
    case 'turn': {
      const name = displayName(game, d.actorId)
      if (d.actorId === game.humanActorId) {
        rows.push({
          text: pickPhrase(seed, pickTonePool(tone, CASTER_TURN_YOU, TonePools.TURN_YOU_BY_TONE)),
          voice: 'caster',
        })
      } else {
        rows.push({
          text: fill(
            pickPhrase(seed, pickTonePool(tone, CASTER_TURN_CPU, TonePools.TURN_CPU_BY_TONE)),
            { name },
          ),
          voice: 'caster',
        })
      }
      rows.push({
        text: banterWithPersonality(
          game,
          d.actorId,
          [seed, 'turn', d.actorId],
          HUMAN_TURN_BANTER,
          CPU_TURN_BANTER,
          TURN_BANTER_PERSONALITY,
        ),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'move': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, pickTonePool(tone, CASTER_MOVE, TonePools.MOVE_BY_TONE)), { name }),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.actorId,
          [seed, d.actorId],
          HUMAN_MOVE_BANTER,
          CPU_MOVE_BANTER,
          MOVE_BANTER_PERSONALITY,
        ),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'skip': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, pickTonePool(tone, CASTER_SKIP, TonePools.SKIP_BY_TONE)), { name }),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.actorId,
          [seed, 'skip', d.actorId],
          HUMAN_SKIP_BANTER,
          CPU_SKIP_BANTER,
          SKIP_BANTER_PERSONALITY,
        ),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'strike': {
      const atk = displayName(game, d.actorId)
      const def = displayName(game, d.targetId)
      const ratio =
        d.targetMaxHp && d.targetHpAfter !== undefined && d.targetMaxHp > 0
          ? d.targetHpAfter / d.targetMaxHp
          : 1
      const strikeSeed = hashSeed([
        index,
        d.kind,
        game.turn,
        d.damage,
        d.killed ? 1 : 0,
        Math.floor(ratio * 100),
      ])
      let strikePool: readonly string[] = pickStrikeCasterPool(tone)
      if (d.killed) strikePool = pickStrikeKillCasterPool(tone)
      else if (!d.killed && ratio <= 0.25) strikePool = pickStrikeLowCasterPool(tone)
      rows.push({
        text: fill(pickPhrase(strikeSeed, strikePool), { atk, def, dmg: d.damage }),
        voice: 'caster',
      })
      rows.push({
        text: strikeAtkBanter(game, d.actorId, [strikeSeed, 'atk', d.actorId]),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      const rel = inferHitRelation(game, d.actorId, d.targetId)
      rows.push({
        text: strikeVictimBanter(game, d.targetId, rel, [strikeSeed, 'vic', d.targetId]),
        subject: d.targetId,
        voice: 'actor',
        banter: true,
      })
      if (d.shieldAbsorbed !== undefined && d.shieldAbsorbed > 0) {
        rows.push({
          text: fill(
            pickPhrase(hashSeed([strikeSeed, 'ssh']), CASTER_STRIKE_SHIELD),
            { def, n: d.shieldAbsorbed },
          ),
          voice: 'caster',
        })
      }
      if (d.positionalContext === 'flanked') {
        rows.push({
          text: fill(pickPhrase(hashSeed([strikeSeed, 'flk']), CASTER_STRIKE_FLANKED), { atk }),
          voice: 'caster',
        })
      } else if (d.positionalContext === 'surrounded') {
        rows.push({
          text: fill(pickPhrase(hashSeed([strikeSeed, 'sur']), CASTER_STRIKE_SURROUNDED), { atk }),
          voice: 'caster',
        })
      }
      break
    }
    case 'lifesteal': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, pickTonePool(tone, CASTER_LIFESTEAL, TonePools.LIFESTEAL_BY_TONE)), {
          name,
          n: d.amount,
        }),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.actorId,
          [seed, 'ls', d.actorId],
          ['Draining off the hit.', 'Life back — needed.', 'Leech landed.'],
          CPU_LIFESTEAL_ATK,
          LIFESTEAL_ATK_PERSONALITY,
        ),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_area_heal': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, pickTonePool(tone, CASTER_CAST_HEAL, TonePools.CAST_HEAL_BY_TONE)), {
          name,
          n: d.totalHeal,
        }),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.actorId,
          [seed, 'heal', d.actorId],
          ['Stitching up.', 'Needed that.', 'Mend landed.'],
          CPU_HEAL_BANTER,
          HEAL_BANTER_PERSONALITY,
        ),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_area_ward': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, pickTonePool(tone, CASTER_CAST_WARD, TonePools.WARD_BY_TONE)), { name }),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.actorId,
          [seed, 'ward', d.actorId],
          ['Shielding up.', 'Wards on.', 'Barrier up.'],
          CPU_WARD,
          WARD_BANTER_PERSONALITY,
        ),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_area_purge': {
      const name = displayName(game, d.actorId)
      const n = d.targets.reduce((s, t) => s + t.cleanseCount, 0)
      rows.push({
        text: fill(pickPhrase(seed, pickTonePool(tone, CASTER_PURGE, TonePools.PURGE_BY_TONE)), { name, n }),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.actorId,
          [seed, 'purge', d.actorId],
          ['Cleansing — breathe again.', 'Purged.', 'Clean slate.'],
          CPU_PURGE,
          PURGE_BANTER_PERSONALITY,
        ),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_area_focus': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, pickTonePool(tone, CASTER_FOCUS, TonePools.FOCUS_BY_TONE)), { name }),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.actorId,
          [seed, 'focus', d.actorId],
          ['Next hit primed.', 'Locked in.', 'Focus up.'],
          CPU_FOCUS,
          FOCUS_BANTER_PERSONALITY,
        ),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_area_wardbreak': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, pickTonePool(tone, CASTER_WARDBREAK, TonePools.WARDBREAK_BY_TONE)), {
          name,
        }),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.actorId,
          [seed, 'wardbreak', d.actorId],
          ['Barriers down.', 'Wardbreak.', 'Shields shredded.'],
          CPU_WARDBREAK,
          WARDBREAK_BANTER_PERSONALITY,
        ),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_area_immunize': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, pickTonePool(tone, CASTER_IMMUNIZE, TonePools.IMMUNIZE_BY_TONE)), { name }),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.actorId,
          [seed, 'immunize', d.actorId],
          ['Clean window.', 'Immunized.', 'Debuffs bounce.'],
          CPU_IMMUNIZE,
          IMMUNIZE_BANTER_PERSONALITY,
        ),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_area_overclock': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, pickTonePool(tone, CASTER_OVERCLOCK, TonePools.OVERCLOCK_BY_TONE)), {
          name,
        }),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.actorId,
          [seed, 'overclock', d.actorId],
          ['Borrowed mana.', 'Surge now.', 'Overclocked.'],
          CPU_OVERCLOCK,
          OVERCLOCK_BANTER_PERSONALITY,
        ),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_linger': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, pickTonePool(tone, CASTER_LINGER, TonePools.LINGER_BY_TONE)), { name }),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.actorId,
          [seed, 'linger', d.actorId],
          ['Leaving energy on the tiles.', 'Residual down.', 'Floor marked.'],
          CPU_LINGER,
          LINGER_BANTER_PERSONALITY,
        ),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_damage': {
      const name = displayName(game, d.actorId)
      const skill = d.skillId.replace(/_/g, ' ')
      const snaps = d.hitSnapshots
      const collateral =
        snaps?.some((s) => snapshotRelation(game, d.actorId, s) !== 'enemy') ?? false
      const kill = snaps?.some((s) => s.maxHp > 0 && s.hpAfter <= 0) ?? false
      const lowHit = snaps?.some((s) => s.maxHp > 0 && s.hpAfter / s.maxHp <= 0.25) ?? false
      const castPool = pickCastDamagePool(tone, collateral, kill, lowHit)
      rows.push({
        text: fill(pickPhrase(seed, castPool), { name, skill, dmg: d.totalDamage }),
        voice: 'caster',
      })
      rows.push({
        text: castAtkBanter(game, d.actorId, [seed, 'cast', d.actorId], collateral),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      if (d.hitSnapshots) {
        for (let i = 0; i < d.hitSnapshots.length; i++) {
          const snap = d.hitSnapshots[i]!
          const rel = snapshotRelation(game, d.actorId, snap)
          rows.push({
            text: castVictimBanter(game, snap.targetId, rel, [seed, 'spv', i, snap.targetId]),
            subject: snap.targetId,
            voice: 'actor',
            banter: true,
          })
          if (snap.shieldAbsorbed !== undefined && snap.shieldAbsorbed > 0) {
            const name = displayName(game, snap.targetId)
            rows.push({
              text: fill(
                pickPhrase(hashSeed([seed, 'css', i, snap.targetId]), CASTER_CAST_SHIELD_SNAP),
                { name, n: snap.shieldAbsorbed },
              ),
              voice: 'caster',
            })
          }
        }
      }
      break
    }
    case 'offensive_whiff': {
      rows.push({
        text: pickPhrase(seed, pickTonePool(tone, CASTER_OFFENSIVE_WHIFF, OFFENSIVE_WHIFF_BY_TONE)),
        voice: 'caster',
      })
      rows.push({
        text: whiffBanter(game, d.actorId, [seed, 'whiff', d.actorId]),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'action_denied': {
      rows.push({
        text: pickPhrase(seed, pickTonePool(tone, CASTER_ACTION_DENIED, ACTION_DENIED_BY_TONE)),
        voice: 'caster',
      })
      rows.push({
        text: denyBanter(game, d.actorId, [seed, 'deny', d.actorId, d.reason]),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'residual_trigger': {
      const vic = displayName(game, d.victimId)
      const skill = d.skillId.replace(/_/g, ' ')
      const ratio =
        d.victimMaxHp && d.victimHpAfter !== undefined && d.victimMaxHp > 0
          ? d.victimHpAfter / d.victimMaxHp
          : 1
      let resPool: readonly string[] = pickTonePool(tone, CASTER_RESIDUAL, RESIDUAL_BY_TONE)
      if (d.killed) resPool = pickTonePool(tone, CASTER_RESIDUAL_KILL, RESIDUAL_KILL_BY_TONE)
      else if (!d.killed && ratio <= 0.25)
        resPool = pickTonePool(tone, CASTER_RESIDUAL_LOW, RESIDUAL_LOW_BY_TONE)
      rows.push({
        text: fill(pickPhrase(seed, resPool), { vic, skill, dmg: d.damage }),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.victimId,
          [seed, 'res', d.victimId],
          ['Stepped in it — ouch.', 'Residual burn.', 'Tile bit back.'],
          CPU_RESIDUAL_VIC_BANTER,
          RESIDUAL_VIC_PERSONALITY,
        ),
        subject: d.victimId,
        voice: 'actor',
        banter: true,
      })
      if (d.shieldAbsorbed !== undefined && d.shieldAbsorbed > 0) {
        rows.push({
          text: fill(
            pickPhrase(hashSeed([seed, 'rsh', d.victimId]), CASTER_RESIDUAL_SHIELD),
            { vic, skill, n: d.shieldAbsorbed },
          ),
          voice: 'caster',
        })
      }
      break
    }
    case 'status_reaction': {
      const name = displayName(game, d.targetId)
      const rk = d.reactionKey
      const casterPool = casterLinesForReactionWithTone(rk, tone)
      rows.push({
        text: fill(pickPhrase(hashSeed([index, rk, 'c']), casterPool), { name }),
        voice: 'caster',
      })
      rows.push({ text: entry.text, subject: d.targetId, voice: 'actor' })
      rows.push({
        text: fpBanter(
          cpuLinesForReactionWithPersonality(rk, game.actors[d.targetId]?.personality),
          [index, rk, d.targetId, 'b'],
        ),
        subject: d.targetId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'frozen_skip': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, pickTonePool(tone, CASTER_FROZEN, TonePools.FROZEN_BY_TONE)), { name }),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.actorId,
          [seed, 'frz', d.actorId],
          ['Frozen solid — skipping.', 'Ice lock.', 'Skipping beat.'],
          CPU_FROZEN_BANTER,
          FROZEN_BANTER_PERSONALITY,
        ),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'turn_tick': {
      const name = displayName(game, d.actorId)
      if (d.dotDamage && d.dotDamage > 0 && d.regen && d.regen > 0) {
        rows.push({
          text: fill(
            pickPhrase(
              hashSeed([index, 'dotrg', d.actorId]),
              pickTonePool(
                tone,
                ['{name} takes {dot} from DoTs and heals {regen} from regeneration.'],
                TonePools.TURN_TICK_DOT_REGEN_BY_TONE,
              ),
            ),
            { name, dot: d.dotDamage, regen: d.regen },
          ),
          voice: 'caster',
        })
      } else if (d.dotDamage && d.dotDamage > 0) {
        rows.push({
          text: fill(
            pickPhrase(
              hashSeed([index, 'dot']),
              pickTonePool(tone, CASTER_TURN_DOT, TonePools.TURN_DOT_BY_TONE),
            ),
            { name, dot: d.dotDamage },
          ),
          voice: 'caster',
        })
      } else if (d.regen && d.regen > 0) {
        rows.push({
          text: fill(
            pickPhrase(
              hashSeed([index, 'rg']),
              pickTonePool(tone, CASTER_TURN_REGEN, TonePools.TURN_REGEN_BY_TONE),
            ),
            { name, regen: d.regen },
          ),
          voice: 'caster',
        })
      }
      if (d.dotDamage && d.dotDamage > 0) {
        rows.push({
          text: banterWithPersonality(
            game,
            d.actorId,
            [seed, 'tdot', d.actorId],
            ['Every tick — ouch.', 'DoTs chewing.', 'Bleed noted.'],
            CPU_DOT_BANTER,
            DOT_BANTER_PERSONALITY,
          ),
          subject: d.actorId,
          voice: 'actor',
          banter: true,
        })
      }
      break
    }
    case 'resource_tick': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(
          pickPhrase(seed, pickTonePool(tone, CASTER_RESOURCE_TICK, TonePools.RESOURCE_TICK_BY_TONE)),
          {
            name,
            m: d.manaGained,
            s: d.staminaGained,
          },
        ),
        voice: 'caster',
      })
      break
    }
    case 'knockback': {
      const atk = displayName(game, d.attackerId)
      const def = displayName(game, d.targetId)
      rows.push({
        text: fill(pickPhrase(seed, pickTonePool(tone, CASTER_KNOCKBACK, TonePools.KNOCKBACK_BY_TONE)), {
          atk,
          def,
        }),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.attackerId,
          [seed, 'kb', d.attackerId],
          ['Clear the angle.', 'Shove sent.', 'Push out.'],
          CPU_KNOCKBACK_ATK,
          KNOCKBACK_ATK_PERSONALITY,
        ),
        subject: d.attackerId,
        voice: 'actor',
        banter: true,
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.targetId,
          [seed, 'kbv', d.targetId],
          ['Sliding from the shove.', 'Pushed.', 'Spacing lost.'],
          CPU_KNOCKBACK_VIC,
          KNOCKBACK_VIC_PERSONALITY,
        ),
        subject: d.targetId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'battle_milestone': {
      if (d.milestone === 'first_blood') {
        const vic = displayName(game, d.victimId)
        const fbPool = pickTonePool(tone, CASTER_FIRST_BLOOD, FIRST_BLOOD_BY_TONE)
        rows.push({
          text: fill(pickPhrase(hashSeed([index, 'fb']), fbPool), { vic }),
          voice: 'caster',
        })
      } else if (d.milestone === 'kill_steal') {
        const killer = displayName(game, d.killerId)
        const credited = displayName(game, d.creditedDamagerId)
        const vic = displayName(game, d.victimId)
        const ksSeed = hashSeed([index, 'ks', d.killerId, d.victimId, d.creditedDamagerId])
        rows.push({
          text: fill(pickPhrase(ksSeed, CASTER_KILL_STEAL), { killer, credited, vic }),
          voice: 'caster',
        })
        rows.push({
          text: actorBanter(
            game,
            d.killerId,
            [index, 'kstk', d.killerId],
            ['I took the elimination tag.', 'Finished it — that one is on my sheet.'],
            ['Stole the tag — still counts.', 'Cleanup kill logged.', 'Booked under my name.'],
          ),
          subject: d.killerId,
          voice: 'actor',
          banter: true,
        })
      }
      break
    }
    case 'win': {
      const name = displayName(game, d.winnerId)
      const ratio =
        d.winnerMaxHp && d.winnerHpAfter !== undefined && d.winnerMaxHp > 0
          ? d.winnerHpAfter / d.winnerMaxHp
          : 1
      const clutch = ratio <= 0.25 && (d.winnerHpAfter ?? 1) > 0
      const winPool = clutch
        ? pickTonePool(tone, CASTER_WIN_CLUTCH, WIN_CLUTCH_BY_TONE)
        : pickTonePool(tone, CASTER_WIN, WIN_BY_TONE)
      rows.push({
        text: clutch
          ? fill(pickPhrase(seed, winPool), {
              name,
              hp: d.winnerHpAfter ?? 0,
              maxHp: d.winnerMaxHp ?? 1,
            })
          : fill(pickPhrase(seed, winPool), { name }),
        voice: 'caster',
      })
      rows.push({
        text: winBanter(game, d.winnerId, [seed, 'win', d.winnerId]),
        subject: d.winnerId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cpu_thinking': {
      rows.push({
        text: pickPhrase(seed, pickTonePool(tone, CASTER_CPU_THINKING, TonePools.CPU_THINKING_BY_TONE)),
        voice: 'caster',
      })
      rows.push({ text: entry.text, subject: d.actorId, voice: 'actor', banter: true })
      break
    }
    case 'cpu_situational': {
      if (d.flavor === 'relief_not_melee_chosen') {
        const reliefName = displayName(game, d.relievedIds[0] ?? d.focusTargetId)
        rows.push({
          text: fill(
            pickPhrase(hashSeed([seed, 'relief']), pickTonePool(tone, CASTER_RELIEF, TonePools.RELIEF_BY_TONE)),
            { name: reliefName },
          ),
          voice: 'caster',
        })
        for (let i = 0; i < d.relievedIds.length; i++) {
          const rid = d.relievedIds[i]!
          const allyRelief = sameTeam(game, rid, d.attackerId)
          rows.push({
            text: banterWithPersonality(
              game,
              rid,
              [seed, rid, i],
              allyRelief ? HUMAN_RELIEF_ALLY : HUMAN_RELIEF_ENEMY,
              allyRelief ? CPU_RELIEF_ALLY : CPU_RELIEF_ENEMY,
              allyRelief ? RELIEF_ALLY_PERSONALITY : RELIEF_ENEMY_PERSONALITY,
            ),
            subject: rid,
            voice: 'actor',
            banter: true,
          })
        }
      } else if (d.flavor === 'relief_not_spell_focus') {
        rows.push({
          text: fill(
            pickPhrase(hashSeed([seed, 'rel-sp']), pickTonePool(tone, CASTER_RELIEF_SPELL, TonePools.RELIEF_SPELL_BY_TONE)),
            {
              atk: displayName(game, d.attackerId),
              focus: displayName(game, d.focusTargetId),
            },
          ),
          voice: 'caster',
        })
        const focusNm = displayName(game, d.focusTargetId)
        for (let i = 0; i < d.relievedIds.length; i++) {
          const rid = d.relievedIds[i]!
          const allyRelief = sameTeam(game, rid, d.attackerId)
          const raw = banterWithPersonality(
            game,
            rid,
            [seed, rid, i, 'spf'],
            allyRelief ? HUMAN_RELIEF_SPELL_ALLY : HUMAN_RELIEF_SPELL_ENEMY,
            allyRelief ? CPU_RELIEF_SPELL_ALLY : CPU_RELIEF_SPELL_ENEMY,
            allyRelief ? RELIEF_SPELL_ALLY_PERSONALITY : RELIEF_SPELL_ENEMY_PERSONALITY,
          )
          rows.push({
            text: fill(raw, { focus: focusNm }),
            subject: rid,
            voice: 'actor',
            banter: true,
          })
        }
      }
      break
    }
    case 'overtime_begin': {
      rows.push({
        text: pickPhrase(
          hashSeed([index, 'otb']),
          pickTonePool(
            tone,
            [
              'Sudden death — pulsing tiles will not take storm damage this round; solid danger hits on alternate full rounds.',
            ],
            TonePools.OVERTIME_BEGIN_BY_TONE,
          ),
        ),
        voice: 'caster',
      })
      break
    }
    case 'overtime_storm': {
      const name = displayName(game, d.victimId)
      rows.push({
        text: fill(
          pickPhrase(
            hashSeed([index, 'ots', d.victimId]),
            pickTonePool(
              tone,
              ['The storm tears at {name} for {dmg} — shields soak first.'],
              TonePools.OVERTIME_STORM_BY_TONE,
            ),
          ),
          {
            name,
            dmg: d.damage,
          },
        ),
        voice: 'caster',
      })
      break
    }
    case 'overtime_shrink': {
      rows.push({
        text: fill(
          pickPhrase(
            hashSeed([index, 'otsh', d.safeRadiusAfter]),
            pickTonePool(
              tone,
              ['The safe zone tightens — only {r} tiles from the eye remain.'],
              TonePools.OVERTIME_SHRINK_BY_TONE,
            ),
          ),
          { r: d.safeRadiusAfter },
        ),
        voice: 'caster',
      })
      break
    }
    case 'lingering_expired': {
      const s = hashSeed([index, d.kind, d.tiles.length, d.tiles[0]?.skillId ?? ''])
      const single = CASTER_LINGERING_EXPIRED_SINGLE
      const multi = CASTER_LINGERING_EXPIRED_MULTI
      rows.push({
        text: pickPhrase(
          s,
          d.tiles.length === 1
            ? pickTonePool(tone, single, TonePools.LINGERING_EXPIRED_SINGLE_BY_TONE)
            : pickTonePool(tone, multi, TonePools.LINGERING_EXPIRED_MULTI_BY_TONE),
        ),
        voice: 'caster',
      })
      break
    }
    case 'status_expired': {
      const name = displayName(game, d.actorId)
      const tagStr = d.tags.join(', ')
      const s = hashSeed([index, d.kind, d.actorId, tagStr])
      rows.push({
        text: fill(
          pickPhrase(s, pickTonePool(tone, CASTER_STATUS_EXPIRED, TonePools.STATUS_EXPIRED_BY_TONE)),
          { name, tags: tagStr },
        ),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.actorId,
          [s, d.actorId],
          HUMAN_STATUS_EXPIRED_BANTER,
          CPU_STATUS_EXPIRED_BANTER,
          STATUS_EXPIRED_PERSONALITY,
        ),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'knockback_failed': {
      const atk = displayName(game, d.attackerId)
      const def = displayName(game, d.targetId)
      const s = hashSeed([index, d.kind, d.reason, d.attackerId])
      rows.push({
        text:
          d.reason === 'map_edge'
            ? fill(
                pickPhrase(s, pickTonePool(tone, CASTER_KNOCKBACK_FAIL_EDGE, TonePools.KNOCKBACK_FAIL_EDGE_BY_TONE)),
                { atk, def },
              )
            : fill(
                pickPhrase(
                  s,
                  pickTonePool(tone, CASTER_KNOCKBACK_FAIL_BLOCKED, TonePools.KNOCKBACK_FAIL_BLOCKED_BY_TONE),
                ),
                { atk, def },
              ),
        voice: 'caster',
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.attackerId,
          [s, 'atk', d.attackerId],
          HUMAN_KNOCKBACK_FAIL_ATK,
          CPU_KNOCKBACK_FAIL_ATK,
          KNOCKBACK_FAIL_ATK_PERSONALITY,
        ),
        subject: d.attackerId,
        voice: 'actor',
        banter: true,
      })
      rows.push({
        text: banterWithPersonality(
          game,
          d.targetId,
          [s, 'vic', d.targetId],
          HUMAN_KNOCKBACK_FAIL_VIC,
          CPU_KNOCKBACK_FAIL_VIC,
          KNOCKBACK_FAIL_VIC_PERSONALITY,
        ),
        subject: d.targetId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'round_complete': {
      rows.push({
        text: fill(
          pickPhrase(
            hashSeed([index, d.round]),
            pickTonePool(tone, CASTER_ROUND_COMPLETE, TonePools.ROUND_COMPLETE_BY_TONE),
          ),
          { n: d.round },
        ),
        voice: 'caster',
      })
      break
    }
    case 'tie': {
      rows.push({
        text: pickPhrase(
          hashSeed([index, 'tie']),
          pickTonePool(tone, ['Nobody walks away — simultaneous elimination.'], TonePools.TIE_BY_TONE),
        ),
        voice: 'caster',
      })
      break
    }
    default:
      rows.push({ text: entry.text, subject: entry.subject, voice: entry.subject ? 'actor' : 'caster' })
  }

  return rows
}

/** Expand one log entry into broadcast rows (Classic mode uses raw `entry.text` instead). */
export function expandBroadcastRows(entry: BattleLogEntry, game: GameState, index: number): BroadcastRow[] {
  if (!entry.detail) {
    return [
      {
        text: entry.text,
        subject: entry.subject,
        voice: entry.subject !== undefined ? 'actor' : 'caster',
      },
    ]
  }
  return expandDetail(entry.detail, entry, game, index)
}
