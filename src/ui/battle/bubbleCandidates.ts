import type { ActorId, BattleLogEntry, GameState } from '../../game/types'
import { expandBroadcastRows } from './broadcastLog'
import { formatClassicRow } from './classicLog'

export interface BubbleSpeechLine {
  actorId: ActorId
  text: string
}

/** Lines that should appear as board speech bubbles for the given log indices (order preserved). */
export function bubbleCandidatesAtIndices(
  log: BattleLogEntry[],
  indices: readonly number[],
  game: GameState,
  logMode: 'classic' | 'broadcast',
): BubbleSpeechLine[] {
  const out: BubbleSpeechLine[] = []
  const seen = new Set<number>()
  for (const i of indices) {
    if (seen.has(i)) continue
    seen.add(i)
    if (i < 0 || i >= log.length) continue
    const entry = log[i]!
    if (logMode === 'broadcast' && entry.detail) {
      for (const row of expandBroadcastRows(entry, game, i)) {
        if (row.voice === 'actor' && row.subject !== undefined) {
          out.push({ actorId: row.subject, text: row.text })
        }
      }
    } else if (logMode === 'classic') {
      const row = formatClassicRow(entry, game, i)
      if (row?.subject !== undefined) {
        out.push({ actorId: row.subject, text: row.text })
      }
    }
  }
  return out
}

/** Lines that should appear as board speech bubbles for log entries appended since `prevLogLength`. */
export function bubbleCandidatesForNewLogEntries(
  prevLogLength: number,
  log: BattleLogEntry[],
  game: GameState,
  logMode: 'classic' | 'broadcast',
): BubbleSpeechLine[] {
  if (prevLogLength >= log.length) return []
  const indices: number[] = []
  for (let i = prevLogLength; i < log.length; i++) indices.push(i)
  return bubbleCandidatesAtIndices(log, indices, game, logMode)
}
