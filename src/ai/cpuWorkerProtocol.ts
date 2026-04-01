import type { GameAction } from '../game/engine'
import type { ActorId, GameState } from '../game/types'

export type CpuWorkerInbound = { state: GameState; actorId: ActorId }

export type CpuWorkerOutbound =
  | { ok: true; action: GameAction }
  | { ok: false; message: string }
