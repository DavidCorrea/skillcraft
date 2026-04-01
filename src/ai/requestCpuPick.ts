import CpuWorker from './cpu.worker?worker'
import { CPU_THINK_TIMEOUT_MS } from './cpuThinkBudget'
import { pickCpuAction } from './cpu'
import type { CpuWorkerInbound, CpuWorkerOutbound } from './cpuWorkerProtocol'
import type { GameAction } from '../game/engine'
import type { ActorId, GameState } from '../game/types'

export type RequestCpuPickOptions = {
  /** Called after the worker is terminated due to timeout so the caller can store a replacement. */
  onWorkerReplaced?: (worker: Worker) => void
}

function isVitestTestRun(): boolean {
  return import.meta.env.MODE === 'test'
}

/**
 * Runs CPU move search in a Web Worker so the UI stays responsive during deep lookahead.
 * In Vitest (`MODE === 'test'`), runs {@link pickCpuAction} on the main thread instead (no Workers).
 * Enforces {@link CPU_THINK_TIMEOUT_MS} on worker runs; on timeout the worker is replaced and easy AI picks a move.
 */
export function requestCpuPick(
  state: GameState,
  actorId: ActorId,
  worker: Worker | null,
  options?: RequestCpuPickOptions,
): Promise<GameAction> {
  if (isVitestTestRun()) {
    return Promise.resolve(pickCpuAction(state, actorId))
  }

  if (typeof Worker === 'undefined') {
    throw new Error('CPU lookahead requires Web Workers')
  }
  if (!worker) {
    throw new Error('CPU worker instance is required')
  }

  return new Promise((resolve, reject) => {
    let settled = false

    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      worker.terminate()
      options?.onWorkerReplaced?.(createCpuWorker())
      const fallbackState: GameState = {
        ...state,
        cpuDifficulty: { ...state.cpuDifficulty, [actorId]: 'easy' },
      }
      resolve(pickCpuAction(fallbackState, actorId))
    }, CPU_THINK_TIMEOUT_MS)

    const onMessage = (e: MessageEvent<CpuWorkerOutbound>) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      const data = e.data
      if (data.ok) resolve(data.action)
      else reject(new Error(data.message))
    }
    const onError = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
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
