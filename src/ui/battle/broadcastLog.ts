import { actorLabelForLog } from '../../game/actor-label'
import type { ActorId, BattleLogDetail, BattleLogEntry, GameState } from '../../game/types'
import { casterLinesForReaction, cpuLinesForReaction } from './broadcastReactionPhrases'

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
  '{def} eats {dmg} from {atk}\'s strike.',
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

/** CPU actor banter: first-person voice, no leading “I …” (fragments, gerunds, mine/my). */
const CPU_STRIKE_ATK = [
  'There — tagged.',
  'Connected.',
  'Swing through — clean.',
  'Mine — landed.',
  'Through the guard.',
] as const

const CPU_STRIKE_VIC = [
  'Felt that.',
  'Eating the hit.',
  'Still up.',
  'Tanking it.',
  'Noted.',
] as const

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
  'Knockback! {def} flies off {atk}\'s strike.',
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

const CPU_TURN_BANTER = [
  'My turn — ready.',
  "Clock's mine.",
  'Up.',
] as const

const CPU_MOVE_BANTER = [
  'Better tile.',
  'New angle.',
  'Sliding into position.',
] as const

const CPU_SKIP_BANTER = [
  'Passing.',
  'Holding.',
  'Skipping this beat.',
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

function expandDetail(d: BattleLogDetail, entry: BattleLogEntry, game: GameState, index: number): BroadcastRow[] {
  const rows: BroadcastRow[] = []
  const seed = hashSeed([index, d.kind])

  switch (d.kind) {
    case 'battle_start':
      rows.push({ text: pickPhrase(seed, CASTER_BATTLE_START), voice: 'caster' })
      break
    case 'turn': {
      const name = displayName(game, d.actorId)
      if (d.actorId === game.humanActorId) {
        rows.push({ text: pickPhrase(seed, CASTER_TURN_YOU), voice: 'caster' })
      } else {
        rows.push({
          text: fill(pickPhrase(seed, CASTER_TURN_CPU), { name }),
          voice: 'caster',
        })
      }
      rows.push({
        text: fpBanter(CPU_TURN_BANTER, [seed, 'turn', d.actorId]),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'move': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, CASTER_MOVE), { name }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_MOVE_BANTER, [seed, d.actorId]),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'skip': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, CASTER_SKIP), { name }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_SKIP_BANTER, [seed, 'skip', d.actorId]),
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
      let strikePool = CASTER_STRIKE
      if (d.killed) strikePool = CASTER_STRIKE_KILL
      else if (!d.killed && ratio <= 0.25) strikePool = CASTER_STRIKE_LOW
      rows.push({
        text: fill(pickPhrase(seed, strikePool), { atk, def, dmg: d.damage }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_STRIKE_ATK, [seed, 'atk', d.actorId]),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      rows.push({
        text: fpBanter(CPU_STRIKE_VIC, [seed, 'vic', d.targetId]),
        subject: d.targetId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'lifesteal': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, CASTER_LIFESTEAL), { name, n: d.amount }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_LIFESTEAL_ATK, [seed, 'ls', d.actorId]),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_area_heal': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, CASTER_CAST_HEAL), { name, n: d.totalHeal }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_HEAL_BANTER, [seed, 'heal', d.actorId]),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_area_ward': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, CASTER_CAST_WARD), { name }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_WARD, [seed, 'ward', d.actorId]),
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
        text: fill(pickPhrase(seed, CASTER_PURGE), { name, n }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_PURGE, [seed, 'purge', d.actorId]),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_area_focus': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, CASTER_FOCUS), { name }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_FOCUS, [seed, 'focus', d.actorId]),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_area_wardbreak': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, CASTER_WARDBREAK), { name }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_WARDBREAK, [seed, 'wardbreak', d.actorId]),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_area_immunize': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, CASTER_IMMUNIZE), { name }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_IMMUNIZE, [seed, 'immunize', d.actorId]),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_area_overclock': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, CASTER_OVERCLOCK), { name }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_OVERCLOCK, [seed, 'overclock', d.actorId]),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cast_linger': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, CASTER_LINGER), { name }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_LINGER, [seed, 'linger', d.actorId]),
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
      let castPool = CASTER_CAST_DMG
      if (snaps?.some((s) => s.maxHp > 0 && s.hpAfter <= 0)) castPool = CASTER_CAST_DMG_KILL
      else if (snaps?.some((s) => s.maxHp > 0 && s.hpAfter / s.maxHp <= 0.25)) castPool = CASTER_CAST_DMG_LOW
      rows.push({
        text: fill(pickPhrase(seed, castPool), { name, skill, dmg: d.totalDamage }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_CAST_ATK_BANTER, [seed, 'cast', d.actorId]),
        subject: d.actorId,
        voice: 'actor',
        banter: true,
      })
      if (d.hitSnapshots) {
        for (let i = 0; i < d.hitSnapshots.length; i++) {
          const snap = d.hitSnapshots[i]!
          if (snap.targetId === d.actorId) continue
          rows.push({
            text: fpBanter(CPU_CAST_VIC, [seed, 'spv', i, snap.targetId]),
            subject: snap.targetId,
            voice: 'actor',
            banter: true,
          })
        }
      }
      break
    }
    case 'residual_trigger': {
      const vic = displayName(game, d.victimId)
      const skill = d.skillId.replace(/_/g, ' ')
      const ratio =
        d.victimMaxHp && d.victimHpAfter !== undefined && d.victimMaxHp > 0
          ? d.victimHpAfter / d.victimMaxHp
          : 1
      let resPool = CASTER_RESIDUAL
      if (d.killed) resPool = CASTER_RESIDUAL_KILL
      else if (!d.killed && ratio <= 0.25) resPool = CASTER_RESIDUAL_LOW
      rows.push({
        text: fill(pickPhrase(seed, resPool), { vic, skill, dmg: d.damage }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_RESIDUAL_VIC_BANTER, [seed, 'res', d.victimId]),
        subject: d.victimId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'status_reaction': {
      const name = displayName(game, d.targetId)
      const rk = d.reactionKey
      const casterPool = casterLinesForReaction(rk)
      rows.push({
        text: fill(pickPhrase(hashSeed([index, rk, 'c']), casterPool), { name }),
        voice: 'caster',
      })
      rows.push({ text: entry.text, subject: d.targetId, voice: 'actor' })
      rows.push({
        text: fpBanter(cpuLinesForReaction(rk), [index, rk, d.targetId, 'b']),
        subject: d.targetId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'frozen_skip': {
      const name = displayName(game, d.actorId)
      rows.push({
        text: fill(pickPhrase(seed, CASTER_FROZEN), { name }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_FROZEN_BANTER, [seed, 'frz', d.actorId]),
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
          text: `${name} takes ${d.dotDamage} from DoTs and heals ${d.regen} from regeneration.`,
          voice: 'caster',
        })
      } else if (d.dotDamage && d.dotDamage > 0) {
        rows.push({
          text: fill(pickPhrase(hashSeed([index, 'dot']), CASTER_TURN_DOT), { name, dot: d.dotDamage }),
          voice: 'caster',
        })
      } else if (d.regen && d.regen > 0) {
        rows.push({
          text: fill(pickPhrase(hashSeed([index, 'rg']), CASTER_TURN_REGEN), { name, regen: d.regen }),
          voice: 'caster',
        })
      }
      if (d.dotDamage && d.dotDamage > 0) {
        rows.push({
          text: fpBanter(CPU_DOT_BANTER, [seed, 'tdot', d.actorId]),
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
        text: fill(pickPhrase(seed, CASTER_RESOURCE_TICK), {
          name,
          m: d.manaGained,
          s: d.staminaGained,
        }),
        voice: 'caster',
      })
      break
    }
    case 'knockback': {
      const atk = displayName(game, d.attackerId)
      const def = displayName(game, d.targetId)
      rows.push({
        text: fill(pickPhrase(seed, CASTER_KNOCKBACK), { atk, def }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_KNOCKBACK_ATK, [seed, 'kb', d.attackerId]),
        subject: d.attackerId,
        voice: 'actor',
        banter: true,
      })
      rows.push({
        text: fpBanter(CPU_KNOCKBACK_VIC, [seed, 'kbv', d.targetId]),
        subject: d.targetId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'battle_milestone': {
      if (d.milestone === 'first_blood') {
        const vic = displayName(game, d.victimId)
        rows.push({
          text: fill(pickPhrase(hashSeed([index, 'fb']), CASTER_FIRST_BLOOD), { vic }),
          voice: 'caster',
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
      const winPool = clutch ? CASTER_WIN_CLUTCH : CASTER_WIN
      rows.push({
        text: clutch
          ? fill(pickPhrase(seed, winPool), {
              name,
              hp: d.winnerHpAfter ?? 0,
              max: d.winnerMaxHp ?? 1,
            })
          : fill(pickPhrase(seed, winPool), { name }),
        voice: 'caster',
      })
      rows.push({
        text: fpBanter(CPU_WIN_BANTER, [seed, 'win', d.winnerId]),
        subject: d.winnerId,
        voice: 'actor',
        banter: true,
      })
      break
    }
    case 'cpu_thinking': {
      rows.push({
        text: pickPhrase(seed, CASTER_CPU_THINKING),
        voice: 'caster',
      })
      rows.push({ text: entry.text, subject: d.actorId, voice: 'actor', banter: true })
      break
    }
    case 'cpu_situational': {
      if (d.flavor === 'relief_not_melee_chosen') {
        const reliefName = displayName(game, d.relievedIds[0] ?? d.focusTargetId)
        rows.push({
          text: fill(pickPhrase(hashSeed([seed, 'relief']), CASTER_RELIEF), { name: reliefName }),
          voice: 'caster',
        })
        for (let i = 0; i < d.relievedIds.length; i++) {
          const rid = d.relievedIds[i]!
          const pool =
            sameTeam(game, rid, d.attackerId) ? CPU_RELIEF_ALLY : CPU_RELIEF_ENEMY
          rows.push({
            text: fpBanter(pool, [seed, rid, i]),
            subject: rid,
            voice: 'actor',
            banter: true,
          })
        }
      } else if (d.flavor === 'relief_not_spell_focus') {
        rows.push({
          text: fill(pickPhrase(hashSeed([seed, 'rel-sp']), CASTER_RELIEF_SPELL), {
            atk: displayName(game, d.attackerId),
            focus: displayName(game, d.focusTargetId),
          }),
          voice: 'caster',
        })
        for (let i = 0; i < d.relievedIds.length; i++) {
          const rid = d.relievedIds[i]!
          const pool =
            sameTeam(game, rid, d.attackerId) ? CPU_RELIEF_SPELL_ALLY : CPU_RELIEF_SPELL_ENEMY
          rows.push({
            text: fill(pickPhrase(hashSeed([seed, rid, i, 'spf']), pool), {
              focus: displayName(game, d.focusTargetId),
            }),
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
        text: 'Sudden death — pulsing tiles will not take storm damage this round; solid danger hits on alternate full rounds.',
        voice: 'caster',
      })
      break
    }
    case 'overtime_storm': {
      const name = displayName(game, d.victimId)
      rows.push({
        text: fill('The storm tears at {name} for {dmg} — shields soak first.', {
          name,
          dmg: d.damage,
        }),
        voice: 'caster',
      })
      break
    }
    case 'overtime_shrink': {
      rows.push({
        text: fill('The safe zone tightens — only {r} tiles from the eye remain.', { r: d.safeRadiusAfter }),
        voice: 'caster',
      })
      break
    }
    case 'tie': {
      rows.push({ text: 'Nobody walks away — simultaneous elimination.', voice: 'caster' })
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
