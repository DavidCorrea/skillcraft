import { actorLabelForLog } from '../../game/actor-label'
import { getSkillDef } from '../../game/skills'
import type { ActorId, BattleLogEntry, GameState } from '../../game/types'

export interface ClassicRow {
  text: string
  subject?: ActorId
}

function label(game: GameState, actorId: ActorId): string {
  return actorLabelForLog(game, actorId)
}

/** True when this actor is the human-controlled fighter (classic CPU lines stay first person). */
function isHuman(game: GameState, actorId: ActorId): boolean {
  return actorId === game.humanActorId
}

function hashSeed(parts: (string | number)[]): number {
  let h = 0
  for (const p of parts) {
    const s = String(p)
    for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i)
  }
  return Math.abs(h)
}

function pickCpuLine(logIndex: number, actorId: ActorId, kind: string, lines: readonly string[]): string {
  if (lines.length === 0) return ''
  const h = hashSeed([logIndex, actorId, kind])
  return lines[h % lines.length]!
}

/**
 * Classic log: whose turn it is and each action — third person with callsign for the human; varied CPU phrasing.
 * Hides battle start, status synergies, CPU thinking, and broadcast-only situational rows.
 *
 * @param logIndex — index in `game.log` so CPU lines can rotate phrasing deterministically.
 */
export function formatClassicRow(
  entry: BattleLogEntry,
  game: GameState,
  logIndex = 0,
): ClassicRow | null {
  if (entry.classicVisible === false) return null
  const d = entry.detail
  if (!d) return null

  switch (d.kind) {
    case 'battle_start':
    case 'status_reaction':
    case 'cpu_thinking':
    case 'cpu_situational':
    case 'resource_tick':
    case 'battle_milestone':
      return null

    case 'turn':
      if (isHuman(game, d.actorId)) {
        return { text: `${label(game, d.actorId)}'s turn.`, subject: d.actorId }
      }
      return {
        text: pickCpuLine(logIndex, d.actorId, 'turn', [
          'My turn.',
          'Up to me.',
          "It's my turn.",
          'Clock is mine.',
        ]),
        subject: d.actorId,
      }

    case 'move': {
      if (isHuman(game, d.actorId)) {
        return { text: `${label(game, d.actorId)} moves.`, subject: d.actorId }
      }
      return {
        text: pickCpuLine(logIndex, d.actorId, 'move', [
          'I move.',
          'I shift position.',
          'Repositioning.',
          'Sliding to a better tile.',
        ]),
        subject: d.actorId,
      }
    }

    case 'skip': {
      if (isHuman(game, d.actorId)) {
        return { text: `${label(game, d.actorId)} skips their turn.`, subject: d.actorId }
      }
      return {
        text: pickCpuLine(logIndex, d.actorId, 'skip', [
          'I skip my turn.',
          'Passing.',
          'Holding—no action.',
          'Skipping.',
        ]),
        subject: d.actorId,
      }
    }

    case 'strike': {
      const dmg = d.damage
      if (isHuman(game, d.actorId)) {
        return { text: `${label(game, d.actorId)} strikes for ${dmg} damage.`, subject: d.actorId }
      }
      return {
        text: pickCpuLine(logIndex, d.actorId, 'strike', [
          `I strike for ${dmg} damage.`,
          `My swing lands for ${dmg}.`,
          `Connecting for ${dmg} damage.`,
          `Hit for ${dmg} damage.`,
        ]),
        subject: d.actorId,
      }
    }

    case 'lifesteal': {
      const a = d.amount
      if (isHuman(game, d.actorId)) {
        return { text: `${label(game, d.actorId)} heals ${a} from lifesteal.`, subject: d.actorId }
      }
      return {
        text: pickCpuLine(logIndex, d.actorId, 'lifesteal', [
          `I heal ${a} from lifesteal.`,
          `Draining ${a} HP back.`,
          `Leech returns ${a} HP.`,
          `Off the hit: +${a} HP.`,
        ]),
        subject: d.actorId,
      }
    }

    case 'cast_self_heal': {
      const name = getSkillDef(d.skillId).name
      const heal = d.heal
      const cost = d.manaCost
      if (isHuman(game, d.actorId)) {
        return { text: `${label(game, d.actorId)} casts ${name} for +${heal} HP (${cost} mana).`, subject: d.actorId }
      }
      return {
        text: pickCpuLine(logIndex, d.actorId, 'cast_self_heal', [
          `I cast ${name} for +${heal} HP (${cost} mana).`,
          `${name}: +${heal} HP (${cost} mana).`,
          `Self-heal with ${name}—+${heal} (${cost} mana).`,
        ]),
        subject: d.actorId,
      }
    }

    case 'cast_self_ward': {
      const name = getSkillDef(d.skillId).name
      const cost = d.manaCost
      if (isHuman(game, d.actorId)) {
        return { text: `${label(game, d.actorId)} casts ${name} (${cost} mana).`, subject: d.actorId }
      }
      return {
        text: pickCpuLine(logIndex, d.actorId, 'cast_self_ward', [
          `I cast ${name} (${cost} mana).`,
          `Warding up—${name} (${cost} mana).`,
          `${name} (${cost} mana).`,
        ]),
        subject: d.actorId,
      }
    }

    case 'cast_self_purge': {
      const name = getSkillDef(d.skillId).name
      const n = d.cleanseCount
      const cost = d.manaCost
      if (isHuman(game, d.actorId)) {
        return { text: `${label(game, d.actorId)} casts ${name}, cleanse ${n} (${cost} mana).`, subject: d.actorId }
      }
      return {
        text: pickCpuLine(logIndex, d.actorId, 'cast_self_purge', [
          `I cast ${name}, cleanse ${n} (${cost} mana).`,
          `Purging—${name}, ${n} cleared (${cost} mana).`,
          `${name}: cleanse ${n} (${cost} mana).`,
        ]),
        subject: d.actorId,
      }
    }

    case 'cast_linger': {
      const name = getSkillDef(d.skillId).name
      const cost = d.manaCost
      if (isHuman(game, d.actorId)) {
        return {
          text: `${label(game, d.actorId)} casts ${name} — residual energy lingers on the tiles (${cost} mana).`,
          subject: d.actorId,
        }
      }
      return {
        text: pickCpuLine(logIndex, d.actorId, 'cast_linger', [
          `I cast ${name} — residual energy lingers on the tiles (${cost} mana).`,
          `${name}—tiles hold residual energy (${cost} mana).`,
          `Lingering field from ${name} (${cost} mana).`,
        ]),
        subject: d.actorId,
      }
    }

    case 'cast_damage': {
      const name = getSkillDef(d.skillId).name
      const td = d.totalDamage
      const cost = d.manaCost
      if (isHuman(game, d.actorId)) {
        return { text: `${label(game, d.actorId)} casts ${name} for ${td} damage (${cost} mana).`, subject: d.actorId }
      }
      return {
        text: pickCpuLine(logIndex, d.actorId, 'cast_damage', [
          `I cast ${name} for ${td} damage (${cost} mana).`,
          `${name} goes out for ${td} total (${cost} mana).`,
          `Spellfire: ${name}, ${td} damage (${cost} mana).`,
        ]),
        subject: d.actorId,
      }
    }

    case 'residual_trigger': {
      const name = getSkillDef(d.skillId).name
      const dmg = d.damage
      if (isHuman(game, d.victimId)) {
        return { text: `${label(game, d.victimId)} triggers residual ${name} for ${dmg} damage.`, subject: d.victimId }
      }
      return {
        text: pickCpuLine(logIndex, d.victimId, 'residual_trigger', [
          `I trigger residual ${name} for ${dmg} damage.`,
          `Step on it—${name} hits for ${dmg}.`,
          `Residual ${name}: ${dmg} damage.`,
        ]),
        subject: d.victimId,
      }
    }

    case 'frozen_skip': {
      if (isHuman(game, d.actorId)) {
        return { text: `${label(game, d.actorId)} is frozen and skips a turn.`, subject: d.actorId }
      }
      return {
        text: pickCpuLine(logIndex, d.actorId, 'frozen_skip', [
          'I am frozen and skip a turn.',
          'Frozen solid—turn burns.',
          "Can't act—ice holds me this turn.",
        ]),
        subject: d.actorId,
      }
    }

    case 'win': {
      const ratio =
        d.winnerMaxHp && d.winnerHpAfter !== undefined && d.winnerMaxHp > 0
          ? d.winnerHpAfter / d.winnerMaxHp
          : 1
      const L = label(game, d.winnerId)
      if (isHuman(game, d.winnerId)) {
        const clutch = ratio <= 0.25 && (d.winnerHpAfter ?? 0) > 0
        if (clutch) return { text: `${L} wins — barely standing!`, subject: d.winnerId }
        return { text: `${L} wins!`, subject: d.winnerId }
      }
      return {
        text: pickCpuLine(logIndex, d.winnerId, 'win', [
          'I win!',
          'Victory.',
          'That is mine.',
          'Match over—I stand.',
        ]),
        subject: d.winnerId,
      }
    }

    case 'turn_tick': {
      if (d.dotDamage && d.regen) {
        if (isHuman(game, d.actorId)) {
          return {
            text: `${label(game, d.actorId)} takes ${d.dotDamage} from DoTs and heals ${d.regen}.`,
            subject: d.actorId,
          }
        }
        return {
          text: pickCpuLine(logIndex, d.actorId, 'turn_tick_both', [
            `I take ${d.dotDamage} from DoTs and heal ${d.regen}.`,
            `DoTs: ${d.dotDamage}; regen: +${d.regen}.`,
            `Burning and bleeding for ${d.dotDamage}—regen patches ${d.regen}.`,
          ]),
          subject: d.actorId,
        }
      }
      if (d.dotDamage) {
        if (isHuman(game, d.actorId)) {
          return { text: `${label(game, d.actorId)} takes ${d.dotDamage} from DoTs.`, subject: d.actorId }
        }
        return {
          text: pickCpuLine(logIndex, d.actorId, 'turn_tick_dot', [
            `I take ${d.dotDamage} from DoTs.`,
            `DoTs tick for ${d.dotDamage}.`,
            `Ouch—${d.dotDamage} from status damage.`,
          ]),
          subject: d.actorId,
        }
      }
      if (d.regen) {
        if (isHuman(game, d.actorId)) {
          return { text: `${label(game, d.actorId)} heals ${d.regen} from regeneration.`, subject: d.actorId }
        }
        return {
          text: pickCpuLine(logIndex, d.actorId, 'turn_tick_regen', [
            `I heal ${d.regen} from regeneration.`,
            `Regen: +${d.regen}.`,
            `Natural recovery: +${d.regen}.`,
          ]),
          subject: d.actorId,
        }
      }
      return null
    }

    case 'knockback': {
      if (d.attackerId === game.humanActorId) {
        return { text: `${label(game, d.attackerId)} knocks the enemy back.`, subject: d.attackerId }
      }
      if (d.targetId === game.humanActorId) {
        return { text: `${label(game, d.targetId)} gets knocked back.`, subject: d.targetId }
      }
      return {
        text: pickCpuLine(logIndex, d.attackerId, 'knockback', [
          'I knock them back.',
          'Shove—they give ground.',
          'They fly back from my hit.',
        ]),
        subject: d.attackerId,
      }
    }

    case 'overtime_begin':
      return { text: 'Sudden death — the kill zone is marked; the storm strikes on alternate full rounds.' }

    case 'overtime_storm': {
      const who = label(game, d.victimId)
      return { text: `${who} takes ${d.damage} storm damage.`, subject: d.victimId }
    }

    case 'overtime_shrink':
      return { text: `The safe zone shrinks (${d.safeRadiusAfter} tiles from storm center).` }

    case 'tie':
      return { text: 'Everyone is down — tie game.' }

    default:
      return null
  }
}
