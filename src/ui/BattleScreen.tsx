import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type {
  ActorId,
  BattleConfig,
  BattleLogEntry,
  Coord,
  GameState,
  SkillId,
  TeamColorSlot,
} from '../game/types'
import { coordKey } from '../game/board'
import {
  applyAction,
  castReachableAnchors,
  createInitialState,
  hasDisarmed,
  hasFrozen,
  hasSilenced,
  legalCasts,
  legalMoves,
  normalizeBattleConfig,
} from '../game/engine'
import { isOvertimeLethal, isOvertimeStormPulseRound } from '../game/overtime'
import type { GameAction } from '../game/engine'
import { CPU_THINK_TIMEOUT_MS } from '../ai/cpuThinkBudget'
import { createCpuWorker, requestCpuPick } from '../ai/requestCpuPick'
import {
  castResourceCostRange,
  effectiveCastRangeForLoadout,
  entryPointCost,
  formatSkillBattleHelp,
  getSkillDef,
  minCastManhattanForLoadout,
} from '../game/skills'
import { HolographicBattleBoard, type BattleSpeechBubble, type BoardPiece } from './board'
import { bubbleCandidatesAtIndices } from './battle/bubbleCandidates'
import {
  castResolveStaggerMap,
  patternCellsForCast,
  statusPieceClasses,
  type BoardFxState,
} from './board/fx'
import { ActorInspectModal } from './battle/ActorInspectModal'
import { expandBroadcastRows, type BroadcastRow } from './battle/broadcastLog'
import { formatClassicRow } from './battle/classicLog'
import { CpuThinkRing } from './battle/cpuThinkRing'
import { pickCpuThinkingPhrase } from './battle/cpu-thinking'
import { battleActorLabel, battlePanelLabel, describeBattleCellTooltip } from './battle/cell-tooltip'
import { GameGuide } from './help/GameGuide'
import { resolveTeamColorSlotForTeamId } from '../game/match-roster'
import './battle/battle-surface.css'

type Mode = 'idle' | 'move' | 'cast'

const MS = {
  move: 300,
  castOff: 420,
  castSelf: 300,
  reject: 200,
  cpuDelay: 400,
  speechBubble: 2500,
} as const

const LOG_MODE_KEY = 'skillcraft-battle-log-mode'
const BUBBLES_KEY = 'skillcraft-battle-board-bubbles'
type LogMode = 'classic' | 'broadcast'

/** Matches combatant panel / board token hues (`bs-actor--t*`). */
const BATTLE_TEAM_HEX: readonly string[] = [
  '#6eb8c8',
  '#c97a72',
  '#7ab894',
  '#d4b060',
  '#b8a0e8',
  '#e8a868',
  '#e890b8',
  '#b8e860',
]

function teamPaletteHex(slot: number): string {
  const s = Math.min(7, Math.max(0, Math.floor(slot)))
  return BATTLE_TEAM_HEX[s] ?? '#6eb8c8'
}

function logRowClassBroadcast(
  row: BroadcastRow,
  game: GameState,
  teamSlot: (teamId: number) => number,
): string {
  if (row.voice === 'caster') return 'battle-log__row battle-log__row--caster'
  if (row.subject !== undefined) {
    const slot = teamSlot(game.teamByActor[row.subject] ?? 0)
    return `battle-log__row battle-log__row--t${slot}${row.banter ? ' battle-log__row--banter' : ''}`
  }
  return 'battle-log__row battle-log__row--neutral'
}

function resourcePct(current: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(100, Math.max(0, (current / max) * 100))
}

function BsMeter({
  kind,
  current,
  max,
}: {
  kind: 'hp' | 'mana' | 'stamina'
  current: number
  max: number
}) {
  const pct = resourcePct(current, max)
  const short = kind === 'hp' ? 'HP' : kind === 'mana' ? 'MP' : 'SP'
  return (
    <div
      className={`bs-meter bs-meter--${kind === 'mana' ? 'mp' : kind}`}
      role="img"
      aria-label={`${short} ${current} of ${max}`}
    >
      <span className="bs-meter__k">{short}</span>
      <div className="bs-meter__track">
        <div className="bs-meter__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="bs-meter__v">
        {current}/{max}
      </span>
    </div>
  )
}

/** Shown beside the phase title when overtime rules apply (see `GameState.overtimeEnabled`). */
function suddenDeathRailLabel(game: GameState): string | null {
  if (!game.overtimeEnabled || game.winner || game.tie) return null
  if (game.overtime) return 'Sudden death'
  const r = Math.max(0, game.roundsUntilOvertime - game.fullRoundsCompleted)
  if (r === 0) return 'Sudden death next round'
  if (r === 1) return 'Sudden death in 1 round'
  return `Sudden death in ${r} rounds`
}

export function BattleScreen({
  config,
  onExit,
}: {
  config: BattleConfig
  onExit: () => void
}) {
  const [game, setGame] = useState(() => createInitialState(config))
  const [mode, setMode] = useState<Mode>('idle')
  const [castSkillId, setCastSkillId] = useState<SkillId | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pulseKey, setPulseKey] = useState<string | null>(null)

  const [boardFx, setBoardFx] = useState<BoardFxState | null>(null)
  const [hiddenPieceActor, setHiddenPieceActor] = useState<ActorId | null>(null)
  const [sceneCastElement, setSceneCastElement] = useState<string | null>(null)
  const [inspectActorId, setInspectActorId] = useState<ActorId | null>(null)
  const [logMode, setLogMode] = useState<LogMode>(() => {
    try {
      const v = localStorage.getItem(LOG_MODE_KEY)
      return v === 'broadcast' ? 'broadcast' : 'classic'
    } catch {
      return 'classic'
    }
  })
  /**
   * `null` = all fighters' lines on. Empty set = no fighter-tagged lines (broadcast: caster / neutral only).
   * Non-empty set = only rows whose `subject` is in the set; rows with no `subject` still pass.
   */
  const [logActorFilter, setLogActorFilter] = useState<Set<ActorId> | null>(null)
  /** Broadcast only: play-by-play lines (`voice === 'caster'`). */
  const [logShowCaster, setLogShowCaster] = useState(true)
  const [boardBubblesOn, setBoardBubblesOn] = useState(() => {
    try {
      return localStorage.getItem(BUBBLES_KEY) === '1'
    } catch {
      return false
    }
  })
  const [speechBubbles, setSpeechBubbles] = useState<BattleSpeechBubble[]>([])
  /** Previous `game.log` snapshot for bubble diffing (ring buffer keeps `log.length` at 40). */
  const prevLogSnapshotRef = useRef<BattleLogEntry[] | null>(null)
  const gameRef = useRef(game)
  gameRef.current = game
  const bubbleTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  /** Footer + native tooltip while pointer is over a skill row (your turn). */
  const [hoveredSkillHelpId, setHoveredSkillHelpId] = useState<SkillId | null>(null)

  /** CPU worker search window — ring clears when `requestCpuPick` settles, not when board FX end. */
  const [cpuThink, setCpuThink] = useState<{ actorId: ActorId; deadline: number } | null>(null)

  const normalizedMatch = useMemo(() => normalizeBattleConfig(config).match, [config])
  const teamSlot = useCallback(
    (teamId: number) => resolveTeamColorSlotForTeamId(teamId, normalizedMatch.teamColorSlotByTeamId),
    [normalizedMatch.teamColorSlotByTeamId],
  )

  const logModeRef = useRef(logMode)
  logModeRef.current = logMode
  const logActorFilterRef = useRef(logActorFilter)
  logActorFilterRef.current = logActorFilter
  const teamSlotRef = useRef(teamSlot)
  teamSlotRef.current = teamSlot

  const playerPaletteSlot = useMemo(
    () => teamSlot(game.teamByActor[game.humanActorId] ?? 0),
    [game.teamByActor, game.humanActorId, teamSlot],
  )
  const playerHintColor = teamPaletteHex(playerPaletteSlot)

  useEffect(() => {
    if (game.turn !== game.humanActorId) setHoveredSkillHelpId(null)
  }, [game.turn, game.humanActorId])

  const logRowsLabelSig = game.turnOrder.map((id) => game.actors[id]?.displayName ?? '').join('\x1e')

  // Not `[game]`: skip when unrelated UI state changes. Label text uses `actorLabelForLog` inputs in deps + `logRowsLabelSig`.
  const classicRows = useMemo(() => {
    const out: { text: string; subject?: ActorId; key: number }[] = []
    game.log.forEach((entry, index) => {
      const row = formatClassicRow(entry, game, index)
      if (row) out.push({ text: row.text, subject: row.subject, key: index })
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps narrowed intentionally; see comment above useMemo
  }, [game.log, game.humanActorId, game.matchMode, game.teamByActor, logRowsLabelSig])

  const broadcastLogRows = useMemo(
    () =>
      game.log.flatMap((entry, index) =>
        expandBroadcastRows(entry, game, index).map((row, j) => ({
          row,
          key: `${index}-${j}`,
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same as classicRows
    [game.log, game.turn, game.humanActorId, game.matchMode, game.teamByActor, logRowsLabelSig],
  )

  const logRowMatchesActorFilter = useCallback(
    (subject: ActorId | undefined) => {
      if (logActorFilter === null) return true
      if (subject === undefined) return true
      return logActorFilter.has(subject)
    },
    [logActorFilter],
  )

  const speechBubbleActorMatchesFilter = useCallback(
    (actorId: ActorId) => {
      if (logActorFilter === null) return true
      if (logActorFilter.size === 0) return false
      return logActorFilter.has(actorId)
    },
    [logActorFilter],
  )

  const filteredClassicRows = useMemo(
    () => classicRows.filter((r) => logRowMatchesActorFilter(r.subject)),
    [classicRows, logRowMatchesActorFilter],
  )

  const filteredBroadcastLogRows = useMemo(
    () =>
      broadcastLogRows.filter(({ row }) => {
        if (row.voice === 'caster' && !logShowCaster) return false
        return logRowMatchesActorFilter(row.subject)
      }),
    [broadcastLogRows, logRowMatchesActorFilter, logShowCaster],
  )

  const toggleLogActorFilter = useCallback((id: ActorId) => {
    setLogActorFilter((prev) => {
      const full = new Set(game.turnOrder)
      if (prev === null) {
        const next = new Set(full)
        next.delete(id)
        return next
      }
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        if (next.size === full.size) return null
      }
      return next
    })
  }, [game.turnOrder])

  useEffect(() => {
    try {
      localStorage.setItem(LOG_MODE_KEY, logMode)
    } catch {
      /* ignore */
    }
  }, [logMode])

  useEffect(() => {
    try {
      localStorage.setItem(BUBBLES_KEY, boardBubblesOn ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [boardBubblesOn])

  useEffect(() => {
    if (!boardBubblesOn) {
      for (const t of bubbleTimersRef.current.values()) window.clearTimeout(t)
      bubbleTimersRef.current.clear()
      setSpeechBubbles([])
    }
  }, [boardBubblesOn])

  useEffect(() => {
    return () => {
      for (const t of bubbleTimersRef.current.values()) window.clearTimeout(t)
      bubbleTimersRef.current.clear()
    }
  }, [])

  /** New log lines only. `useLayoutEffect` keeps bubbles in the same frame as the log (before paint). */
  useLayoutEffect(() => {
    const g = gameRef.current
    const log = g.log

    if (!boardBubblesOn) {
      prevLogSnapshotRef.current = log
      return
    }

    const prevSnap = prevLogSnapshotRef.current
    prevLogSnapshotRef.current = log

    if (prevSnap !== null && log.length < prevSnap.length) {
      for (const t of bubbleTimersRef.current.values()) window.clearTimeout(t)
      bubbleTimersRef.current.clear()
      setSpeechBubbles([])
      /** Do not return: e.g. CPU "thinking" line makes log 41 then `applyAction` slices to 40 — still diff new rows. */
    }

    if (prevSnap === null) return

    const prevSet = new Set(prevSnap)
    const newIndices: number[] = []
    for (let i = 0; i < log.length; i++) {
      if (!prevSet.has(log[i]!)) newIndices.push(i)
    }
    if (newIndices.length === 0) return

    const candidates = bubbleCandidatesAtIndices(log, newIndices, g, logModeRef.current)
    if (candidates.length === 0) return

    const filter = logActorFilterRef.current
    const filteredCandidates =
      filter === null
        ? candidates
        : filter.size === 0
          ? []
          : candidates.filter((c) => filter.has(c.actorId))
    if (filteredCandidates.length === 0) return

    const slotFn = teamSlotRef.current
    const newBubbles: BattleSpeechBubble[] = filteredCandidates.map((c, j) => ({
      id: `${Date.now()}-${j}-${Math.random().toString(36).slice(2, 9)}`,
      actorId: c.actorId,
      text: c.text,
      teamSlot: slotFn(g.teamByActor[c.actorId] ?? 0) as TeamColorSlot,
    }))
    setSpeechBubbles((cur) => [...cur, ...newBubbles])
    for (const b of newBubbles) {
      const tid = window.setTimeout(() => {
        bubbleTimersRef.current.delete(b.id)
        setSpeechBubbles((cur) => cur.filter((x) => x.id !== b.id))
      }, MS.speechBubble)
      bubbleTimersRef.current.set(b.id, tid)
    }
  }, [game.log, boardBubblesOn])

  const visibleSpeechBubbles = useMemo(() => {
    if (!boardBubblesOn || speechBubbles.length === 0) return []
    return speechBubbles.filter((b) => speechBubbleActorMatchesFilter(b.actorId))
  }, [boardBubblesOn, speechBubbles, speechBubbleActorMatchesFilter])

  const battleLogRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = battleLogRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [
    game.log.length,
    logMode,
    logActorFilter,
    logShowCaster,
    filteredBroadcastLogRows.length,
    filteredClassicRows.length,
  ])

  const cpuLockRef = useRef(false)
  const cpuWorkerRef = useRef<Worker | null>(null)

  useLayoutEffect(() => {
    if (typeof Worker === 'undefined') return
    cpuWorkerRef.current = createCpuWorker()
    return () => {
      cpuWorkerRef.current?.terminate()
      cpuWorkerRef.current = null
    }
  }, [])

  const commitPlayerCast = useCallback((skillId: SkillId, target: Coord) => {
    const g = gameRef.current
    const actorId = g.humanActorId
    const def = getSkillDef(skillId)
    const action: GameAction = { type: 'cast', skillId, target }
    const cells = patternCellsForCast(g, actorId, skillId, target)
    if (!cells) return
    const stagger = castResolveStaggerMap(cells)
    setSceneCastElement(def.element)
    setBoardFx({ kind: 'castOffensive', element: def.element, stagger })
    window.setTimeout(() => {
      setGame((prev) => {
        const r = applyAction(prev, actorId, action)
        return r.error ? prev : r.state
      })
      setBoardFx(null)
      setSceneCastElement(null)
      setMode('idle')
      setCastSkillId(null)
    }, MS.castOff)
  }, [])

  const runCpuWithFx = useCallback(() => {
    if (cpuLockRef.current) return
    const g = gameRef.current
    const actor = g.turn
    if (g.winner || actor === g.humanActorId) return

    cpuLockRef.current = true

    const thinkingEntry = {
      text: pickCpuThinkingPhrase(battleActorLabel(g, actor)),
      subject: actor,
      detail: { kind: 'cpu_thinking' as const, actorId: actor },
    }
    const stateForPick: GameState = { ...g, log: [...g.log, thinkingEntry] }

    flushSync(() => {
      setGame((prev) => ({ ...prev, log: [...prev.log, thinkingEntry] }))
    })

    const runAfterThinkingPaint = () => {
      const finishCpu = () => {
        cpuLockRef.current = false
      }

      let cpuWorker = cpuWorkerRef.current
      if (!cpuWorker) {
        cpuWorker = createCpuWorker()
        cpuWorkerRef.current = cpuWorker
      }

      setCpuThink({ actorId: actor, deadline: Date.now() + CPU_THINK_TIMEOUT_MS })

      void requestCpuPick(stateForPick, actor, cpuWorker, {
        onWorkerReplaced: (w) => {
          cpuWorkerRef.current = w
        },
      }).then(
        (action) => {
          setCpuThink(null)

          if (action.type === 'move') {
            const from = stateForPick.actors[actor]!.pos
            const to = action.to
            setBoardFx({ kind: 'move', actor, from, to })
            setHiddenPieceActor(actor)
            window.setTimeout(() => {
              setGame((prev) => {
                const r = applyAction(prev, actor, action)
                return r.error ? prev : r.state
              })
              setBoardFx(null)
              setHiddenPieceActor(null)
              finishCpu()
            }, MS.move)
            return
          }

          if (action.type === 'cast') {
            const def = getSkillDef(action.skillId)
            const entry = stateForPick.loadouts[actor]?.find((e) => e.skillId === action.skillId)
            if (!entry) {
              finishCpu()
              return
            }

            const cells = patternCellsForCast(stateForPick, actor, action.skillId, action.target)
            if (!cells) {
              finishCpu()
              return
            }
            const stagger = castResolveStaggerMap(cells)
            setSceneCastElement(def.element)
            setBoardFx({ kind: 'castOffensive', element: def.element, stagger })
            window.setTimeout(() => {
              setGame((prev) => {
                const r = applyAction(prev, actor, action)
                return r.error ? prev : r.state
              })
              setBoardFx(null)
              setSceneCastElement(null)
              finishCpu()
            }, MS.castOff)
            return
          }

          if (action.type === 'skip') {
            setGame((prev) => {
              const r = applyAction(prev, actor, action)
              return r.error ? prev : r.state
            })
            finishCpu()
          }
        },
        () => {
          setCpuThink(null)
          finishCpu()
        },
      )
    }

    runAfterThinkingPaint()
  }, [])

  useEffect(() => {
    if (game.winner || game.tie || game.turn === game.humanActorId || cpuLockRef.current) return
    const t = window.setTimeout(runCpuWithFx, MS.cpuDelay)
    return () => window.clearTimeout(t)
  }, [game.turn, game.winner, game.tie, game.log.length, game.humanActorId, runCpuWithFx])

  useEffect(() => {
    if (!pulseKey) return
    const t = window.setTimeout(() => setPulseKey(null), 700)
    return () => window.clearTimeout(t)
  }, [pulseKey])

  const legalMoveCoords = useMemo(
    () => (mode === 'move' ? legalMoves(game, game.humanActorId) : []),
    [game, mode],
  )
  const highlightMove = useMemo(() => new Set(legalMoveCoords.map(coordKey)), [legalMoveCoords])
  const highlightCastLegal = useMemo(
    () =>
      new Set(
        mode === 'cast' && castSkillId
          ? legalCasts(game, game.humanActorId)
              .filter((x) => x.skillId === castSkillId)
              .map((x) => coordKey(x.target))
          : [],
      ),
    [game, mode, castSkillId],
  )
  const highlightCastReach = useMemo(
    () =>
      mode === 'cast' && castSkillId
        ? new Set(castReachableAnchors(game, game.humanActorId, castSkillId).map(coordKey))
        : new Set<string>(),
    [game, mode, castSkillId],
  )

  const legalStrikeCasts = useMemo(
    () => legalCasts(game, game.humanActorId).filter((c) => c.skillId === 'strike'),
    [game],
  )

  /** Another living fighter shares your team — same board color as an ally; mark your token and row */
  const humanSharesTeamColor = useMemo(() => {
    const t = game.teamByActor[game.humanActorId]
    if (t === undefined) return false
    let n = 0
    for (const id of game.turnOrder) {
      const a = game.actors[id]
      if (!a || a.hp <= 0) continue
      if (game.teamByActor[id] === t) n += 1
    }
    return n >= 2
  }, [game])

  const boardPieces: BoardPiece[] = useMemo(() => {
    const colorMap = normalizedMatch.teamColorSlotByTeamId
    return game.turnOrder
      .filter((id) => game.actors[id]!.hp > 0)
      .map((id) => {
        const tid = game.teamByActor[id]
        const n = tid === undefined ? 0 : tid
        return {
          id,
          pos: game.actors[id]!.pos,
          teamSlot: resolveTeamColorSlotForTeamId(n, colorMap),
          extraClass: statusPieceClasses(game.actors[id]!.statuses),
          youMarker: id === game.humanActorId && humanSharesTeamColor,
        }
      })
  }, [game, humanSharesTeamColor, normalizedMatch.teamColorSlotByTeamId])

  const pPos = game.actors[game.humanActorId]!.pos

  const triggerReject = useCallback(
    (cellKey: string) => {
      setMessage(mode === 'move' ? 'Illegal move.' : 'That target is not legal for this skill.')
      setBoardFx({ kind: 'reject', cellKey })
      window.setTimeout(() => setBoardFx(null), MS.reject)
    },
    [mode],
  )

  const onCellClick = useCallback(
    (c: Coord) => {
      setPulseKey(coordKey(c))
      setMessage(null)
      if (game.winner || game.tie || game.turn !== game.humanActorId) return

      const k = coordKey(c)

      if (mode === 'move') {
        const ok = legalMoveCoords.some((m) => coordKey(m) === k)
        if (!ok) {
          triggerReject(k)
          return
        }
        const from = game.actors[game.humanActorId]!.pos
        const to = c
        setBoardFx({ kind: 'move', actor: game.humanActorId, from, to })
        setHiddenPieceActor(game.humanActorId)
        window.setTimeout(() => {
          setGame((prev) => {
            const r = applyAction(prev, game.humanActorId, { type: 'move', to })
            return r.error ? prev : r.state
          })
          setBoardFx(null)
          setHiddenPieceActor(null)
          setMode('idle')
        }, MS.move)
        return
      }

      if (mode === 'cast' && castSkillId) {
        if (!highlightCastLegal.has(k)) {
          triggerReject(k)
          return
        }
        commitPlayerCast(castSkillId, c)
      }
    },
    [
      game.winner,
      game.tie,
      game.turn,
      game.humanActorId,
      game.actors,
      mode,
      castSkillId,
      legalMoveCoords,
      highlightCastLegal,
      commitPlayerCast,
      triggerReject,
    ],
  )

  function onStrikePlayer(): void {
    setMessage(null)
    if (game.winner || game.tie || game.turn !== game.humanActorId) return
    if (legalStrikeCasts.length === 0) return
    if (legalStrikeCasts.length === 1) {
      commitPlayerCast('strike', legalStrikeCasts[0]!.target)
      return
    }
    setMode('cast')
    setCastSkillId('strike')
  }

  const cellClassSuffix = useCallback(
    (c: Coord): string => {
      const k = coordKey(c)
      const parts: string[] = []
      const hazard = game.impactedTiles[k]
      if (hazard) {
        const element = getSkillDef(hazard.skillId).element
        parts.push(`holo-cell--hazard-${element}`)
      }
      if (mode === 'move' && highlightMove.has(k)) parts.push('holo-cell--hint-move')
      if (mode === 'cast' && castSkillId) {
        if (highlightCastLegal.has(k)) parts.push('holo-cell--hint-cast-legal')
        else if (highlightCastReach.has(k)) parts.push('holo-cell--hint-cast-reach')
      }
      if (isOvertimeLethal(game, c)) {
        parts.push('holo-cell--overtime-lethal')
        if (isOvertimeStormPulseRound(game)) parts.push('holo-cell--overtime-lethal--pulse')
      }
      return parts.join(' ')
    },
    [game, mode, castSkillId, highlightMove, highlightCastLegal, highlightCastReach],
  )

  const pathFrom = mode === 'move' && highlightMove.size > 0 ? pPos : null
  const pathTos = legalMoveCoords

  const cells: Coord[] = useMemo(() => {
    const out: Coord[] = []
    for (let y = 0; y < game.size; y++) {
      for (let x = 0; x < game.size; x++) {
        out.push({ x, y })
      }
    }
    return out
  }, [game.size])

  const getCellTooltip = useCallback((c: Coord) => describeBattleCellTooltip(game, c), [game])

  const contextualHint = useMemo(() => {
    const human = game.humanActorId
    if (game.winner || game.tie) {
      return 'Battle finished — Quit returns to loadout.'
    }
    if (game.turn !== human) {
      return `${battlePanelLabel(game, game.turn)} is acting. Follow the board and log.`
    }
    if (hoveredSkillHelpId) {
      const entry = game.loadouts[human]?.find((x) => x.skillId === hoveredSkillHelpId)
      if (entry) {
        const def = getSkillDef(hoveredSkillHelpId)
        return `${def.name} — ${formatSkillBattleHelp(def)}`
      }
    }
    if (mode === 'move') {
      return `Move: click a highlighted tile. Orthogonal only, up to ${game.actors[human]!.moveMaxSteps} steps; each step costs stamina.`
    }
    if (mode === 'cast' && castSkillId) {
      const def = getSkillDef(castSkillId)
      return `Casting ${def.name}: bright outline = legal anchor; dim tiles = in range only. Click an anchor to cast. ${formatSkillBattleHelp(def)}`
    }
    return 'Your turn: choose Move, Skip, or a skill. Hover a skill to see its full description here.'
  }, [game, hoveredSkillHelpId, mode, castSkillId])

  const hint = message ?? contextualHint

  const railTitle = game.tie
    ? { className: 'battle-surface__title is-end', text: 'TIE' }
    : game.winner
      ? {
          className: 'battle-surface__title is-end',
          text: game.winner === game.humanActorId ? 'VICTORY' : 'DEFEAT',
        }
      : game.turn === game.humanActorId
        ? { className: 'battle-surface__title is-live', text: 'YOUR ACTION' }
        : { className: 'battle-surface__title is-foe', text: 'HOSTILE TURN' }

  const suddenDeathRail = suddenDeathRailLabel(game)

  const matchRuleLabel = useMemo(() => {
    const off = config.cpuBudgetOffset ?? 0
    if (off <= 0) return 'Fair duel'
    return `Challenge · CPU L${config.level + off}`
  }, [config.cpuBudgetOffset, config.level])

  return (
    <div className="battle-surface">
      <header className="battle-surface__rail">
        <button
          type="button"
          className="battle-surface__exit"
          onClick={onExit}
          aria-label="Quit battle and return to loadout"
        >
          Quit
        </button>
        <div className="battle-surface__phase">
          <h1 className={railTitle.className}>{railTitle.text}</h1>
          {!game.winner && !game.tie ? (
            <span className="battle-surface__match-kind">{matchRuleLabel}</span>
          ) : null}
          {suddenDeathRail ? (
            <span className="battle-surface__overtime-countdown" aria-label={suddenDeathRail}>
              {suddenDeathRail}
            </span>
          ) : null}
        </div>
        <div className="battle-surface__help">
          <GameGuide
            contextContent={
              <>
                <p className="ls-modal__note">
                  Move up, down, left, or right (stamina costs apply). Physical skills hit adjacent targets (and other
                  patterns per skill). Elemental casts spend <strong>mana</strong>; physical casts spend{' '}
                  <strong>stamina</strong>. The skill pattern anchors on the cell you click, and range is measured from
                  your position to that anchor.
                </p>
                <p className="ls-modal__note">
                  Turns follow the roster order. Reduce all enemies to 0 HP to win.
                </p>
                <p className="ls-modal__note">
                  <strong>Skip</strong> ends your turn immediately without moving or casting—useful when you want to pass.
                </p>
                {game.overtimeEnabled ? (
                  <p className="ls-modal__note">
                    <strong>Sudden death</strong> is on for this match (N was set in match setup). Outside the safe
                    zone, <em>pulsing</em> red means the storm will <strong>not</strong> deal damage when this full round
                    ends; <em>solid</em> red means it will. The first boundary after sudden death starts is always a
                    warning (no storm damage); then storm damage and skip rounds alternate. The safe zone shrinks over time; storm
                    hits skip armor and only reduce shield then HP.
                  </p>
                ) : null}
              </>
            }
          />
        </div>
      </header>

      <div className="battle-surface__matrix">
        <aside className="battle-surface__edge battle-surface__edge--left" aria-label="Combatants">
          <div className="battle-surface__combatants">
            {game.turnOrder.map((id) => {
              const a = game.actors[id]!
              const dead = a.hp <= 0
              const you = id === game.humanActorId
              const label = battlePanelLabel(game, id)
              const isTurn = !dead && !game.winner && !game.tie && game.turn === id
              return (
                <div
                  key={id}
                  role="button"
                  tabIndex={0}
                  className={`bs-actor bs-actor--t${resolveTeamColorSlotForTeamId(game.teamByActor[id] ?? 0, normalizedMatch.teamColorSlotByTeamId)}${you ? ' bs-actor--you' : ''}${dead ? ' bs-actor--dead' : ''}${isTurn ? ' is-active' : ''}`}
                  aria-current={isTurn ? 'true' : undefined}
                  aria-busy={cpuThink?.actorId === id ? true : undefined}
                  aria-label={dead ? `Inspect ${label} (defeated)` : `Inspect ${label}`}
                  onClick={() => setInspectActorId(id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setInspectActorId(id)
                    }
                  }}
                >
                  <div className="bs-actor__label-row">
                    <span className="bs-actor__label">{label}</span>
                    {cpuThink?.actorId === id ? (
                      <CpuThinkRing deadlineMs={cpuThink.deadline} label={`${label} deciding`} />
                    ) : null}
                  </div>
                  <BsMeter kind="hp" current={a.hp} max={a.maxHp} />
                  <BsMeter kind="mana" current={a.mana} max={a.maxMana} />
                  <BsMeter kind="stamina" current={a.stamina} max={a.maxStamina} />
                </div>
              )
            })}
          </div>
        </aside>

        <div className="battle-surface__board">
          <HolographicBattleBoard
            size={game.size}
            cells={cells}
            getCellClassSuffix={cellClassSuffix}
            onCellClick={onCellClick}
            pulseKey={pulseKey}
            pathFrom={pathFrom}
            pathTos={pathTos}
            pieces={boardPieces}
            hiddenPieceActor={hiddenPieceActor}
            boardFx={boardFx}
            castPreviewSkillId={mode === 'cast' ? castSkillId : null}
            highlightCastReach={highlightCastReach}
            game={game}
            humanActorId={game.humanActorId}
            sceneCastElement={sceneCastElement}
            getCellTooltip={getCellTooltip}
            playerHintColor={playerHintColor}
            speechBubbles={boardBubblesOn ? visibleSpeechBubbles : null}
          />
        </div>

        <aside
          className="battle-surface__edge battle-surface__edge--right"
          aria-label="Commands and battle log"
        >
          <div className="bs-actions">
            <div className="bs-actions__group">
              <span className="bs-actions__label">Move &amp; skip</span>
              <button
                type="button"
                className={`bs-btn${mode === 'move' ? ' is-on' : ''}`}
                aria-pressed={mode === 'move'}
                disabled={game.turn !== game.humanActorId || !!game.winner || game.tie}
                title="Orthogonal steps only; each tile costs stamina. Click a highlighted cell."
                onClick={() => {
                  setMode('move')
                  setCastSkillId(null)
                }}
              >
                Move
              </button>
              <button
                type="button"
                className="bs-btn bs-btn--quiet"
                disabled={
                  game.turn !== game.humanActorId ||
                  !!game.winner ||
                  game.tie ||
                  hasFrozen(game.actors[game.humanActorId]!)
                }
                title="End your turn without moving or using a skill"
                onClick={() => {
                  setMessage(null)
                  setMode('idle')
                  setCastSkillId(null)
                  setGame((prev) => {
                    const r = applyAction(prev, prev.humanActorId, { type: 'skip' })
                    return r.error ? prev : r.state
                  })
                }}
              >
                Skip
              </button>
            </div>
            <div
              className="bs-actions__group bs-actions__group--skills"
              onMouseLeave={() => setHoveredSkillHelpId(null)}
            >
              <span className="bs-actions__label">Skills</span>
              {game.loadouts[game.humanActorId]!.map((e) => {
                const me = game.actors[game.humanActorId]!
                const def = getSkillDef(e.skillId)
                const maxR = effectiveCastRangeForLoadout(def, e, me.traits)
                const minR = minCastManhattanForLoadout(def, e)
                const { min: mMin, max: mMax } = castResourceCostRange(e, def, maxR, minR)
                const resShort = def.school === 'physical' ? 'SP' : 'MP'
                const curRes = def.school === 'physical' ? me.stamina : me.mana
                const silenced = def.school === 'magic' && hasSilenced(me)
                const disarmed = def.school === 'physical' && hasDisarmed(me)
                const blocked = silenced || disarmed
                const canAfford = !blocked && curRes >= mMin
                const costStr = mMin === mMax ? `${mMin}` : `${mMin}–${mMax}`
                const isStrike = e.skillId === 'strike'
                const strikeBlocked = isStrike && legalStrikeCasts.length === 0
                const helpBlurb = formatSkillBattleHelp(def)
                const costTitle = isStrike
                  ? `Strike · ${costStr} ${resShort} · ${entryPointCost(e)} pts`
                  : `${costStr} ${resShort} · ${entryPointCost(e)} pts`
                const titleWhenUsable = `${costTitle} — ${helpBlurb}`
                return (
                  <button
                    key={e.skillId}
                    type="button"
                    className={`bs-btn${mode === 'cast' && castSkillId === e.skillId ? ' is-armed' : ''}${mode === 'cast' && castSkillId === e.skillId ? ' is-on' : ''}`}
                    aria-pressed={mode === 'cast' && castSkillId === e.skillId}
                    disabled={
                      game.turn !== game.humanActorId ||
                      !!game.winner ||
                      game.tie ||
                      !canAfford ||
                      strikeBlocked
                    }
                    title={
                      silenced
                        ? 'Silenced — elemental magic skills unavailable'
                        : disarmed
                          ? 'Disarmed — physical skills unavailable'
                          : strikeBlocked
                            ? 'No legal melee anchor — stand adjacent to a valid target'
                            : !canAfford
                              ? `${costTitle}. ${helpBlurb}`
                              : titleWhenUsable
                    }
                    onMouseEnter={() => setHoveredSkillHelpId(e.skillId)}
                    onClick={() => {
                      if (isStrike) {
                        onStrikePlayer()
                        return
                      }
                      setMode('cast')
                      setCastSkillId(e.skillId)
                    }}
                  >
                    {def.name} · {costStr} {resShort}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className="bs-btn bs-btn--quiet"
              onClick={() => {
                setMode('idle')
                setCastSkillId(null)
              }}
            >
              Clear
            </button>
          </div>
          <div className="battle-log__panel battle-log__panel--right">
            <div className="battle-log__controls">
              <div className="battle-log__toolbar" role="group" aria-label="Battle log style">
                <span className="battle-log__toolbar-label">Log</span>
                <button
                  type="button"
                  className={`battle-log__mode${logMode === 'classic' ? ' is-on' : ''}`}
                  aria-pressed={logMode === 'classic'}
                  onClick={() => setLogMode('classic')}
                >
                  Classic
                </button>
                <button
                  type="button"
                  className={`battle-log__mode${logMode === 'broadcast' ? ' is-on' : ''}`}
                  aria-pressed={logMode === 'broadcast'}
                  onClick={() => setLogMode('broadcast')}
                >
                  Broadcast
                </button>
                <button
                  type="button"
                  className={`battle-log__mode${boardBubblesOn ? ' is-on' : ''}`}
                  aria-pressed={boardBubblesOn}
                  onClick={() => setBoardBubblesOn((v) => !v)}
                  title="Speech bubbles over fighters for new log lines; who shows follows the Show checkboxes"
                >
                  Bubbles
                </button>
              </div>
              <div
                className="battle-log__filter"
                role="group"
                aria-label="Filter battle log and fighter speech bubbles by combatant"
              >
                <span className="battle-log__toolbar-label battle-log__filter-label">Show</span>
                {game.turnOrder.map((id) => {
                  const checked = logActorFilter === null || logActorFilter.has(id)
                  const slot = teamSlot(game.teamByActor[id] ?? 0)
                  return (
                    <label
                      key={id}
                      className={`battle-log__filter-item battle-log__filter-item--t${slot}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLogActorFilter(id)}
                        aria-label={`Show log lines and speech bubbles for ${battlePanelLabel(game, id)}`}
                      />
                      <span>{battlePanelLabel(game, id)}</span>
                    </label>
                  )
                })}
                {logMode === 'broadcast' && (
                  <label className="battle-log__filter-item battle-log__filter-item--caster">
                    <input
                      type="checkbox"
                      checked={logShowCaster}
                      onChange={() => setLogShowCaster((v) => !v)}
                      aria-label="Show caster play-by-play lines"
                    />
                    <span>Caster</span>
                  </label>
                )}
              </div>
            </div>
            <div
              ref={battleLogRef}
              className="battle-log"
              aria-live="polite"
              aria-label="Battle log"
            >
              {logMode === 'classic'
                ? filteredClassicRows.map(({ text, subject, key }) => (
                    <p
                      key={key}
                      className={
                        subject !== undefined
                          ? `battle-log__row battle-log__row--t${teamSlot(game.teamByActor[subject] ?? 0)}`
                          : 'battle-log__row battle-log__row--neutral'
                      }
                    >
                      {text}
                    </p>
                  ))
                : filteredBroadcastLogRows.map(({ row, key }) => (
                    <p key={key} className={logRowClassBroadcast(row, game, teamSlot)}>
                      {row.text}
                    </p>
                  ))}
            </div>
          </div>
        </aside>
      </div>

      <footer className="battle-surface__status">
        <p className={`battle-surface__hint${message ? ' is-error' : ''}`}>{hint}</p>
      </footer>

      <ActorInspectModal
        game={game}
        actorId={inspectActorId}
        onClose={() => setInspectActorId(null)}
      />
    </div>
  )
}
