import type { StatusInstance, StatusTag } from './types'
import { MARK_EXTRA_CAP, reactionMessages, type StatusReactionMessage, VULN_CAP } from './status-reference'

const OVERLOAD_DAMAGE_CAP = 15
const COAGULATE_DAMAGE_CAP = 12
const MELT_WARD_FLAT = 4

function isBurning(s: StatusInstance): boolean {
  return s.tag.t === 'burning'
}

function isIce(s: StatusInstance): boolean {
  return s.tag.t === 'chilled' || s.tag.t === 'frozen'
}

function isSoaked(s: StatusInstance): boolean {
  return s.tag.t === 'soaked'
}

function isShocked(s: StatusInstance): boolean {
  return s.tag.t === 'shocked'
}

function isPoisoned(s: StatusInstance): boolean {
  return s.tag.t === 'poisoned'
}

function isSlowed(s: StatusInstance): boolean {
  return s.tag.t === 'slowed'
}

function isBleeding(s: StatusInstance): boolean {
  return s.tag.t === 'bleeding'
}

function isRooted(s: StatusInstance): boolean {
  return s.tag.t === 'rooted'
}

function isMuddy(s: StatusInstance): boolean {
  return s.tag.t === 'muddy'
}

function mapStatuses(
  list: StatusInstance[],
  fn: (s: StatusInstance) => StatusInstance | null,
): StatusInstance[] {
  return list.map(fn).filter((s): s is StatusInstance => s !== null)
}

function bumpShockVuln(list: StatusInstance[], idx: number): StatusInstance[] | null {
  const s = list[idx]
  if (!s || s.tag.t !== 'shocked') return null
  const vuln = Math.min(VULN_CAP, s.tag.vuln + 1)
  if (vuln === s.tag.vuln) return null
  const next = [...list]
  next[idx] = { ...s, tag: { ...s.tag, vuln } }
  return next
}

/** Fire + ice: remove ice, shorten burn. */
function applyMelt(list: StatusInstance[]): StatusInstance[] | null {
  const hasBurn = list.some(isBurning)
  const hasIce = list.some(isIce)
  if (!hasBurn || !hasIce) return null

  let next = list.filter((s) => !isIce(s))
  next = mapStatuses(next, (s) => {
    if (!isBurning(s)) return s
    const tag = s.tag
    if (tag.t !== 'burning') return s
    const duration = Math.max(0, tag.duration - 1)
    if (duration <= 0) return null
    return { ...s, tag: { ...tag, duration } }
  })
  return next
}

/** Soaked + burning: remove soaked (evaporate). */
function applyEvaporate(list: StatusInstance[]): StatusInstance[] | null {
  const hasSoak = list.some(isSoaked)
  const hasBurn = list.some(isBurning)
  if (!hasSoak || !hasBurn) return null
  return list.filter((s) => !isSoaked(s))
}

/** Poison + burning: burst damage; remove both. */
function applyDetonate(list: StatusInstance[]): {
  list: StatusInstance[]
  damage: number
  message?: string
} {
  const burn = list.find(isBurning)
  const pois = list.find(isPoisoned)
  if (!burn || !pois || burn.tag.t !== 'burning' || pois.tag.t !== 'poisoned') {
    return { list, damage: 0 }
  }
  const dmg = burn.tag.dot + pois.tag.dot
  const next = list.filter((s) => !isBurning(s) && !isPoisoned(s))
  return {
    list: next,
    damage: dmg,
    message: reactionMessages.detonate,
  }
}

/** Burning + shocked: immediate damage; remove shock; shorten burn. */
function applyOverload(list: StatusInstance[]): {
  list: StatusInstance[]
  damage: number
  message?: string
} {
  const burn = list.find(isBurning)
  const shock = list.find(isShocked)
  if (!burn || !shock || burn.tag.t !== 'burning' || shock.tag.t !== 'shocked') {
    return { list, damage: 0 }
  }
  const raw = burn.tag.dot + shock.tag.vuln
  const damage = Math.min(OVERLOAD_DAMAGE_CAP, Math.max(1, raw))
  let next = list.filter((s) => !isShocked(s))
  next = mapStatuses(next, (s) => {
    if (!isBurning(s)) return s
    const tag = s.tag
    if (tag.t !== 'burning') return s
    const duration = Math.max(0, tag.duration - 1)
    if (duration <= 0) return null
    return { ...s, tag: { ...tag, duration } }
  })
  return { list: next, damage, message: reactionMessages.overload }
}

/** Bleeding + burning: remove bleed; shorten burn. */
function applyCauterize(list: StatusInstance[]): StatusInstance[] | null {
  if (!list.some(isBleeding) || !list.some(isBurning)) return null
  let next = list.filter((s) => !isBleeding(s))
  next = mapStatuses(next, (s) => {
    if (!isBurning(s)) return s
    const tag = s.tag
    if (tag.t !== 'burning') return s
    const duration = Math.max(0, tag.duration - 1)
    if (duration <= 0) return null
    return { ...s, tag: { ...tag, duration } }
  })
  return next
}

/** Bleeding + poisoned: immediate damage; remove bleed. */
function applyCoagulate(list: StatusInstance[]): {
  list: StatusInstance[]
  damage: number
  message?: string
} {
  const bleed = list.find(isBleeding)
  const pois = list.find(isPoisoned)
  if (!bleed || !pois || bleed.tag.t !== 'bleeding' || pois.tag.t !== 'poisoned') {
    return { list, damage: 0 }
  }
  const damage = Math.min(
    COAGULATE_DAMAGE_CAP,
    Math.max(1, Math.floor((bleed.tag.dot + pois.tag.dot) / 2)),
  )
  const next = list.filter((s) => !isBleeding(s))
  return { list: next, damage, message: reactionMessages.coagulate }
}

/** Rooted + burning: remove rooted. */
function applyWildfire(list: StatusInstance[]): StatusInstance[] | null {
  if (!list.some(isRooted) || !list.some(isBurning)) return null
  return list.filter((s) => s.tag.t !== 'rooted')
}

/** Muddy + burning: remove muddy. */
function applyParch(list: StatusInstance[]): StatusInstance[] | null {
  if (!list.some(isMuddy) || !list.some(isBurning)) return null
  return list.filter((s) => !isMuddy(s))
}

/** Shield + burning: erode shield. */
function applyMeltWard(list: StatusInstance[]): StatusInstance[] | null {
  const burn = list.find(isBurning)
  const shIdx = list.findIndex((s) => s.tag.t === 'shield')
  if (!burn || shIdx === -1 || burn.tag.t !== 'burning') return null
  const sh = list[shIdx]!
  if (sh.tag.t !== 'shield') return null
  const drain = Math.min(sh.tag.amount, burn.tag.dot + MELT_WARD_FLAT)
  const left = sh.tag.amount - drain
  const next = [...list]
  if (left <= 0) next.splice(shIdx, 1)
  else next[shIdx] = { ...sh, tag: { t: 'shield', amount: left } }
  return next
}

/** Soaked + chilled → frozen; soaked + frozen → refresh frozen, strip soak. */
function applyFlashFreeze(list: StatusInstance[]): StatusInstance[] | null {
  if (!list.some(isSoaked)) return null
  const hasChilled = list.some((s) => s.tag.t === 'chilled')
  const hasFrozen = list.some((s) => s.tag.t === 'frozen')
  if (!hasChilled && !hasFrozen) return null

  let next = list.filter((s) => !isSoaked(s))
  if (hasChilled) {
    next = next.filter((s) => s.tag.t !== 'chilled')
    next = next.filter((s) => s.tag.t !== 'frozen')
    next.push({ id: '', tag: { t: 'frozen', turns: 1 } })
  } else {
    next = mapStatuses(next, (s) => {
      if (s.tag.t !== 'frozen') return s
      return { ...s, tag: { t: 'frozen', turns: 1 } }
    })
  }
  return next
}

/** Soaked + slowed → muddy. */
function applyMud(list: StatusInstance[]): StatusInstance[] | null {
  if (!list.some(isSoaked) || !list.some(isSlowed)) return null
  const next = list.filter((s) => !isSoaked(s) && !isSlowed(s))
  next.push({ id: '', tag: { t: 'muddy', duration: 3 } })
  return next
}

/** Rooted + soaked: extend root duration. */
function applyWaterlogged(list: StatusInstance[]): StatusInstance[] | null {
  const rIdx = list.findIndex((s) => s.tag.t === 'rooted')
  if (rIdx === -1 || !list.some(isSoaked)) return null
  const s = list[rIdx]!
  if (s.tag.t !== 'rooted') return null
  const next = [...list]
  next[rIdx] = { ...s, tag: { t: 'rooted', duration: s.tag.duration + 1 } }
  return next
}

/** Rooted + poisoned: extend poison duration. */
function applyStranglehold(list: StatusInstance[]): StatusInstance[] | null {
  if (!list.some(isRooted) || !list.some(isPoisoned)) return null
  const pIdx = list.findIndex((s) => s.tag.t === 'poisoned')
  if (pIdx === -1) return null
  const s = list[pIdx]!
  if (s.tag.t !== 'poisoned') return null
  const next = [...list]
  next[pIdx] = { ...s, tag: { ...s.tag, duration: s.tag.duration + 1 } }
  return next
}

/** Rooted + shocked: bump shock vuln. */
function applyGrounded(list: StatusInstance[]): { list: StatusInstance[]; message?: string } {
  if (!list.some(isRooted) || !list.some(isShocked)) return { list }
  const idx = list.findIndex(isShocked)
  if (idx === -1) return { list }
  const bumped = bumpShockVuln(list, idx)
  if (!bumped) return { list }
  return { list: bumped, message: reactionMessages.grounded }
}

/** Poisoned + ice: remove ice; extend first poison duration. */
function applyCrystallize(list: StatusInstance[]): StatusInstance[] | null {
  if (!list.some(isPoisoned) || !list.some(isIce)) return null
  let extended = false
  return list.filter((s) => !isIce(s)).map((inst) => {
    if (inst.tag.t !== 'poisoned' || extended) return inst
    extended = true
    return { ...inst, tag: { ...inst.tag, duration: inst.tag.duration + 2 } }
  })
}

/** Shocked + ice: bump vuln. */
function applyBrittle(list: StatusInstance[]): { list: StatusInstance[]; message?: string } {
  if (!list.some(isShocked) || !list.some(isIce)) return { list }
  const idx = list.findIndex(isShocked)
  if (idx === -1) return { list }
  const bumped = bumpShockVuln(list, idx)
  if (!bumped) return { list }
  return { list: bumped, message: reactionMessages.brittle }
}

/** Shocked + poisoned: bump shock vuln (cap 5). */
function applyCaustic(list: StatusInstance[]): { list: StatusInstance[]; message?: string } {
  if (!list.some(isShocked) || !list.some(isPoisoned)) return { list }
  const idx = list.findIndex(isShocked)
  if (idx === -1) return { list }
  const bumped = bumpShockVuln(list, idx)
  if (!bumped) return { list }
  return { list: bumped, message: reactionMessages.caustic }
}

/** Soaked + shocked: one-time vuln bump when both are present after other reactions. */
function applyConductiveOnce(list: StatusInstance[]): { list: StatusInstance[]; message?: string } {
  if (!list.some(isSoaked) || !list.some(isShocked)) return { list }
  const idx = list.findIndex(isShocked)
  if (idx === -1) return { list }
  const bumped = bumpShockVuln(list, idx)
  if (!bumped) return { list }
  return { list: bumped, message: reactionMessages.conductive }
}

/** Silenced + shocked: remove silenced. */
function applyDisrupt(list: StatusInstance[]): StatusInstance[] | null {
  if (!list.some((s) => s.tag.t === 'silenced') || !list.some(isShocked)) return null
  return list.filter((s) => s.tag.t !== 'silenced')
}

/** Disarmed + shocked: remove disarmed (parity with Disrupt). */
function applyGroundGrip(list: StatusInstance[]): StatusInstance[] | null {
  if (!list.some((s) => s.tag.t === 'disarmed') || !list.some(isShocked)) return null
  return list.filter((s) => s.tag.t !== 'disarmed')
}

/** Marked + (burn|poison|shock): bump mark extra. */
function applyCalledShot(list: StatusInstance[]): StatusInstance[] | null {
  const mIdx = list.findIndex((s) => s.tag.t === 'marked')
  if (mIdx === -1) return null
  const hasElement =
    list.some(isBurning) || list.some(isPoisoned) || list.some(isShocked)
  if (!hasElement) return null
  const s = list[mIdx]!
  if (s.tag.t !== 'marked') return null
  const extra = Math.min(MARK_EXTRA_CAP, s.tag.extra + 1)
  if (extra === s.tag.extra) return null
  const next = [...list]
  next[mIdx] = { ...s, tag: { ...s.tag, extra } }
  return next
}

/** Regen blocked + poisoned: extend first poison. */
function applyNecrosis(list: StatusInstance[]): StatusInstance[] | null {
  if (!list.some((s) => s.tag.t === 'regenBlocked') || !list.some(isPoisoned)) return null
  let extended = false
  return list.map((inst) => {
    if (inst.tag.t !== 'poisoned' || extended) return inst
    extended = true
    return { ...inst, tag: { ...inst.tag, duration: inst.tag.duration + 1 } }
  })
}

/** Slowed + burning: extend burn. */
function applyTar(list: StatusInstance[]): StatusInstance[] | null {
  if (!list.some(isSlowed) || !list.some(isBurning)) return null
  const bIdx = list.findIndex(isBurning)
  if (bIdx === -1) return null
  const s = list[bIdx]!
  if (s.tag.t !== 'burning') return null
  const next = [...list]
  next[bIdx] = { ...s, tag: { ...s.tag, duration: s.tag.duration + 1 } }
  return next
}

/** Slowed + shocked: extend slow. */
function applyStagger(list: StatusInstance[]): StatusInstance[] | null {
  if (!list.some(isSlowed) || !list.some(isShocked)) return null
  const slIdx = list.findIndex(isSlowed)
  if (slIdx === -1) return null
  const s = list[slIdx]!
  if (s.tag.t !== 'slowed') return null
  const next = [...list]
  next[slIdx] = { ...s, tag: { ...s.tag, duration: s.tag.duration + 1 } }
  return next
}

/**
 * After adding a new status, resolve pairwise reactions until stable.
 * Order: melt → evaporate (repeat) → detonate → overload → cauterize → coagulate → wildfire →
 * parch → melt ward → flash freeze → mud → rooted combos → crystallize → brittle →
 * caustic → conductive → disrupt → ground grip → called shot → necrosis → tar → stagger.
 */
export function resolveStatusesAfterAdd(
  before: StatusInstance[],
  incoming: StatusInstance,
  nextId: () => string,
): { statuses: StatusInstance[]; messages: StatusReactionMessage[]; immediateDamage?: number } {
  let statuses = [...before, incoming]
  const messages: StatusReactionMessage[] = []
  let immediateDamage = 0

  const assignIds = (list: StatusInstance[]): StatusInstance[] =>
    list.map((s) => (s.id === '' ? { ...s, id: nextId() } : s))

  for (let i = 0; i < 16; i++) {
    const melt = applyMelt(statuses)
    if (melt) {
      statuses = melt
      messages.push({ text: reactionMessages.melt, key: 'melt' })
      continue
    }
    const evap = applyEvaporate(statuses)
    if (evap) {
      statuses = evap
      messages.push({ text: reactionMessages.evaporate, key: 'evaporate' })
      continue
    }
    break
  }

  const det = applyDetonate(statuses)
  if (det.damage > 0) {
    statuses = det.list
    immediateDamage += det.damage
    if (det.message) messages.push({ text: det.message, key: 'detonate' })
  }

  const ov = applyOverload(statuses)
  if (ov.damage > 0) {
    statuses = ov.list
    immediateDamage += ov.damage
    if (ov.message) messages.push({ text: ov.message, key: 'overload' })
  }

  const caut = applyCauterize(statuses)
  if (caut) {
    statuses = caut
    messages.push({ text: reactionMessages.cauterize, key: 'cauterize' })
  }

  const coag = applyCoagulate(statuses)
  if (coag.damage > 0) {
    statuses = coag.list
    immediateDamage += coag.damage
    if (coag.message) messages.push({ text: coag.message, key: 'coagulate' })
  }

  const wf = applyWildfire(statuses)
  if (wf) {
    statuses = wf
    messages.push({ text: reactionMessages.wildfire, key: 'wildfire' })
  }

  const par = applyParch(statuses)
  if (par) {
    statuses = par
    messages.push({ text: reactionMessages.parch, key: 'parch' })
  }

  const mw = applyMeltWard(statuses)
  if (mw) {
    statuses = mw
    messages.push({ text: reactionMessages.meltWard, key: 'meltWard' })
  }

  const ff = applyFlashFreeze(statuses)
  if (ff) {
    statuses = assignIds(ff)
    messages.push({ text: reactionMessages.flashFreeze, key: 'flashFreeze' })
  }

  const mud = applyMud(statuses)
  if (mud) {
    statuses = assignIds(mud)
    messages.push({ text: reactionMessages.mud, key: 'mud' })
  }

  const wl = applyWaterlogged(statuses)
  if (wl) {
    statuses = wl
    messages.push({ text: reactionMessages.waterlogged, key: 'waterlogged' })
  }

  const sh = applyStranglehold(statuses)
  if (sh) {
    statuses = sh
    messages.push({ text: reactionMessages.stranglehold, key: 'stranglehold' })
  }

  const gr = applyGrounded(statuses)
  statuses = gr.list
  if (gr.message) messages.push({ text: gr.message, key: 'grounded' })

  const cry = applyCrystallize(statuses)
  if (cry) {
    statuses = cry
    messages.push({ text: reactionMessages.crystallize, key: 'crystallize' })
  }

  const bri = applyBrittle(statuses)
  statuses = bri.list
  if (bri.message) messages.push({ text: bri.message, key: 'brittle' })

  const caustic = applyCaustic(statuses)
  statuses = caustic.list
  if (caustic.message) messages.push({ text: caustic.message, key: 'caustic' })

  const cond = applyConductiveOnce(statuses)
  statuses = cond.list
  if (cond.message) messages.push({ text: cond.message, key: 'conductive' })

  const dis = applyDisrupt(statuses)
  if (dis) {
    statuses = dis
    messages.push({ text: reactionMessages.disrupt, key: 'disrupt' })
  }

  const gg = applyGroundGrip(statuses)
  if (gg) {
    statuses = gg
    messages.push({ text: reactionMessages.groundGrip, key: 'groundGrip' })
  }

  const cs = applyCalledShot(statuses)
  if (cs) {
    statuses = cs
    messages.push({ text: reactionMessages.calledShot, key: 'calledShot' })
  }

  const nec = applyNecrosis(statuses)
  if (nec) {
    statuses = nec
    messages.push({ text: reactionMessages.necrosis, key: 'necrosis' })
  }

  const tar = applyTar(statuses)
  if (tar) {
    statuses = tar
    messages.push({ text: reactionMessages.tar, key: 'tar' })
  }

  const stg = applyStagger(statuses)
  if (stg) {
    statuses = stg
    messages.push({ text: reactionMessages.stagger, key: 'stagger' })
  }

  return { statuses, messages, immediateDamage: immediateDamage > 0 ? immediateDamage : undefined }
}

export function cloneTag(tag: StatusTag): StatusTag {
  switch (tag.t) {
    case 'burning':
      return { t: 'burning', duration: tag.duration, dot: tag.dot }
    case 'chilled':
      return { t: 'chilled', duration: tag.duration }
    case 'frozen':
      return { t: 'frozen', turns: tag.turns }
    case 'soaked':
      return { t: 'soaked', duration: tag.duration }
    case 'shocked':
      return { t: 'shocked', duration: tag.duration, vuln: tag.vuln }
    case 'poisoned':
      return { t: 'poisoned', duration: tag.duration, dot: tag.dot }
    case 'bleeding':
      return { t: 'bleeding', duration: tag.duration, dot: tag.dot }
    case 'slowed':
      return { t: 'slowed', duration: tag.duration }
    case 'marked':
      return { t: 'marked', duration: tag.duration, extra: tag.extra }
    case 'rooted':
      return { t: 'rooted', duration: tag.duration }
    case 'silenced':
      return { t: 'silenced', duration: tag.duration }
    case 'disarmed':
      return { t: 'disarmed', duration: tag.duration }
    case 'regenBlocked':
      return { t: 'regenBlocked', duration: tag.duration }
    case 'muddy':
      return { t: 'muddy', duration: tag.duration }
    case 'shield':
      return { t: 'shield', amount: tag.amount }
    case 'skillFocus':
      return { t: 'skillFocus', bonus: tag.bonus }
    case 'immunized':
      return { t: 'immunized', charges: tag.charges }
  }
}
