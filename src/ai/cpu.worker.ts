import { pickCpuAction } from './cpu'
import type { CpuWorkerInbound, CpuWorkerOutbound } from './cpuWorkerProtocol'

self.onmessage = (e: MessageEvent<CpuWorkerInbound>) => {
  const { state, actorId } = e.data
  try {
    const action = pickCpuAction(state, actorId)
    const out: CpuWorkerOutbound = { ok: true, action }
    self.postMessage(out)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const out: CpuWorkerOutbound = { ok: false, message }
    self.postMessage(out)
  }
}
