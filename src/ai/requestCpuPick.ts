import CpuWorker from './cpu.worker?worker'
import { pickCpuAction } from './cpu'
import type { CpuWorkerInbound, CpuWorkerOutbound } from './cpuWorkerProtocol'
import type { GameAction } from '../game/engine'
import type { ActorId, GameState } from '../game/types'

/**
 * Runs CPU move search off the main thread so the UI stays responsive during deep lookahead.
 * Falls back to synchronous search when Workers are unavailable (e.g. some test environments).
 */
export function requestCpuPick(state: GameState, actorId: ActorId, worker: Worker | null): Promise<GameAction> {
  if (typeof Worker === 'undefined' || !worker) {
    return Promise.resolve(pickCpuAction(state, actorId))
  }

  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<CpuWorkerOutbound>) => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      const data = e.data
      if (data.ok) resolve(data.action)
      else reject(new Error(data.message))
    }
    const onError = () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      reject(new Error('CPU worker failed'))
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    const payload: CpuWorkerInbound = { state, actorId }
    worker.postMessage(payload)
  })
}

export function createCpuWorker(): Worker {
  return new CpuWorker()
}
