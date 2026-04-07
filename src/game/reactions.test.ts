import { describe, expect, it } from 'vitest'
import { resolveStatusesAfterAdd } from './reactions'
import {
  COAGULATE_DAMAGE_CAP,
  MELT_WARD_FLAT,
  OVERLOAD_DAMAGE_CAP,
} from './status-reference'
import type { StatusInstance } from './types'

function st(tag: StatusInstance['tag']): StatusInstance {
  return { id: Math.random().toString(36).slice(2), tag }
}

const nid = (() => {
  let i = 0
  return () => `t${++i}`
})()

describe('resolveStatusesAfterAdd', () => {
  it('melts fire and ice together', () => {
    const before: StatusInstance[] = [st({ t: 'burning', duration: 3, dot: 2 })]
    const incoming = st({ t: 'chilled', duration: 2 })
    const { statuses, messages } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(messages.some((m) => m.text.includes('Melt'))).toBe(true)
    expect(statuses.some((s) => s.tag.t === 'chilled')).toBe(false)
  })

  it('evaporates soaked when burning is present', () => {
    const before: StatusInstance[] = [st({ t: 'burning', duration: 2, dot: 2 })]
    const incoming = st({ t: 'soaked', duration: 3 })
    const { statuses, messages } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(messages.some((m) => m.text.includes('Evaporate'))).toBe(true)
    expect(statuses.some((s) => s.tag.t === 'soaked')).toBe(false)
  })

  it('boosts shock when soaked is present', () => {
    const before: StatusInstance[] = [st({ t: 'soaked', duration: 3 })]
    const incoming = st({ t: 'shocked', duration: 2, vuln: 1 })
    const { statuses, messages } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(messages.some((m) => m.text.includes('Conductive'))).toBe(true)
    const shock = statuses.find((s) => s.tag.t === 'shocked')
    expect(shock?.tag.t === 'shocked' && shock.tag.vuln).toBeGreaterThan(1)
  })

  it('detonates poison and burning together', () => {
    const before: StatusInstance[] = [st({ t: 'burning', duration: 2, dot: 3 })]
    const incoming = st({ t: 'poisoned', duration: 4, dot: 2 })
    const { statuses, messages, immediateDamage } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(messages.some((m) => m.text.includes('Detonate'))).toBe(true)
    expect(immediateDamage).toBe(5)
    expect(statuses.some((s) => s.tag.t === 'burning')).toBe(false)
    expect(statuses.some((s) => s.tag.t === 'poisoned')).toBe(false)
  })

  it('flash-freezes soaked + frozen without chilled', () => {
    const before: StatusInstance[] = [st({ t: 'frozen', turns: 2 })]
    const incoming = st({ t: 'soaked', duration: 3 })
    const { statuses, messages } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(messages.some((m) => m.text.includes('Flash freeze'))).toBe(true)
    expect(statuses.some((s) => s.tag.t === 'soaked')).toBe(false)
    const fr = statuses.find((s) => s.tag.t === 'frozen')
    expect(fr?.tag.t === 'frozen' && fr.tag.turns).toBe(1)
  })

  it('overloads burning and shocked', () => {
    const before: StatusInstance[] = [st({ t: 'burning', duration: 3, dot: 4 })]
    const incoming = st({ t: 'shocked', duration: 2, vuln: 2 })
    const { statuses, messages, immediateDamage } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(messages.some((m) => m.text.includes('Overload'))).toBe(true)
    expect(immediateDamage).toBeGreaterThan(0)
    expect(statuses.some((s) => s.tag.t === 'shocked')).toBe(false)
  })

  it('caps overload immediate damage at OVERLOAD_DAMAGE_CAP', () => {
    const before: StatusInstance[] = [st({ t: 'burning', duration: 3, dot: 20 })]
    const incoming = st({ t: 'shocked', duration: 2, vuln: 20 })
    const { immediateDamage } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(immediateDamage).toBe(OVERLOAD_DAMAGE_CAP)
  })

  it('cauterizes bleed with burn', () => {
    const before: StatusInstance[] = [st({ t: 'bleeding', duration: 3, dot: 2 })]
    const incoming = st({ t: 'burning', duration: 3, dot: 2 })
    const { statuses, messages } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(messages.some((m) => m.text.includes('Cauterize'))).toBe(true)
    expect(statuses.some((s) => s.tag.t === 'bleeding')).toBe(false)
  })

  it('coagulates bleed and poison', () => {
    const before: StatusInstance[] = [st({ t: 'bleeding', duration: 3, dot: 4 })]
    const incoming = st({ t: 'poisoned', duration: 4, dot: 4 })
    const { statuses, messages, immediateDamage } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(messages.some((m) => m.text.includes('Coagulate'))).toBe(true)
    expect(immediateDamage).toBeGreaterThan(0)
    expect(statuses.some((s) => s.tag.t === 'bleeding')).toBe(false)
    expect(statuses.some((s) => s.tag.t === 'poisoned')).toBe(true)
  })

  it('coagulate damage matches floor average and COAGULATE_DAMAGE_CAP', () => {
    const before: StatusInstance[] = [st({ t: 'bleeding', duration: 3, dot: 6 })]
    const incoming = st({ t: 'poisoned', duration: 4, dot: 6 })
    const { immediateDamage } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(immediateDamage).toBe(Math.min(COAGULATE_DAMAGE_CAP, Math.max(1, Math.floor((6 + 6) / 2))))

    const beforeHi: StatusInstance[] = [st({ t: 'bleeding', duration: 3, dot: 20 })]
    const incomingHi = st({ t: 'poisoned', duration: 4, dot: 20 })
    const { immediateDamage: hi } = resolveStatusesAfterAdd(beforeHi, incomingHi, nid)
    expect(hi).toBe(COAGULATE_DAMAGE_CAP)
  })

  it('wildfire clears root when burning is applied', () => {
    const before: StatusInstance[] = [st({ t: 'rooted', duration: 2 })]
    const incoming = st({ t: 'burning', duration: 2, dot: 2 })
    const { statuses, messages } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(messages.some((m) => m.text.includes('Wildfire'))).toBe(true)
    expect(statuses.some((s) => s.tag.t === 'rooted')).toBe(false)
  })

  it('parch removes muddy when burning is present', () => {
    const before: StatusInstance[] = [st({ t: 'muddy', duration: 3 })]
    const incoming = st({ t: 'burning', duration: 2, dot: 2 })
    const { statuses, messages } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(messages.some((m) => m.text.includes('Parch'))).toBe(true)
    expect(statuses.some((s) => s.tag.t === 'muddy')).toBe(false)
  })

  it('melt ward reduces shield by min(shield, burn dot + MELT_WARD_FLAT)', () => {
    const before: StatusInstance[] = [st({ t: 'shield', amount: 30 })]
    const incoming = st({ t: 'burning', duration: 2, dot: 5 })
    const { statuses, messages } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(messages.some((m) => m.text.includes('Melt ward'))).toBe(true)
    const sh = statuses.find((s) => s.tag.t === 'shield')
    expect(sh?.tag.t).toBe('shield')
    if (sh?.tag.t === 'shield') {
      const drain = Math.min(30, 5 + MELT_WARD_FLAT)
      expect(sh.tag.amount).toBe(30 - drain)
    }
  })

  it('disrupt clears silence when shocked', () => {
    const before: StatusInstance[] = [st({ t: 'silenced', duration: 2 })]
    const incoming = st({ t: 'shocked', duration: 2, vuln: 1 })
    const { statuses, messages } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(messages.some((m) => m.text.includes('Disrupt'))).toBe(true)
    expect(statuses.some((s) => s.tag.t === 'silenced')).toBe(false)
  })

  it('soaked + chilled + shocked: flash freeze then brittle, not conductive', () => {
    const before: StatusInstance[] = [
      st({ t: 'soaked', duration: 3 }),
      st({ t: 'chilled', duration: 2 }),
    ]
    const incoming = st({ t: 'shocked', duration: 2, vuln: 1 })
    const { statuses, messages } = resolveStatusesAfterAdd(before, incoming, nid)
    expect(messages.some((m) => m.text.includes('Flash freeze'))).toBe(true)
    expect(messages.some((m) => m.text.includes('Brittle'))).toBe(true)
    expect(messages.some((m) => m.text.includes('Conductive'))).toBe(false)
    expect(statuses.some((s) => s.tag.t === 'soaked')).toBe(false)
    expect(statuses.some((s) => s.tag.t === 'frozen')).toBe(true)
    const shock = statuses.find((s) => s.tag.t === 'shocked')
    expect(shock?.tag.t === 'shocked' && shock.tag.vuln).toBeGreaterThanOrEqual(2)
  })
})
