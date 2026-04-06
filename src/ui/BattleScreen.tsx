import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { ActorId, BattleConfig, Coord, GameState, SkillId } from '../game/types'
import { coordKey, parseKey } from '../game/board'
import {
  applyAction,
  canStrike,
  castReachableAnchors,
  createInitialState,
  hasFrozen,
  legalCasts,
  legalMoves,
  legalStrikeTargets,
  normalizeBattleConfig,
} from '../game/engine'
import { isOvertimeLethal, isOvertimeStormPulseRound } from '../game/overtime'
import type { GameAction } from '../game/engine'
import { createCpuWorker, requestCpuPick } from '../ai/requestCpuPick'
import { effectiveCastRangeForLoadout, entryPointCost, getSkillDef, manaCostCastRange } from '../game/skills'
import { STAMINA_REGEN_PER_TURN } from '../game/traits'
import { HolographicBattleBoard, type BoardPiece } from './board'
import {
  castResolveStaggerMap,
  knockbackMoveFx,
  patternCellsForCast,
  statusPieceClasses,
  type BoardFxState,
} from './board/fx'
import { ActorInspectModal } from './battle/ActorInspectModal'
import { expandBroadcastRows, type BroadcastRow } from './battle/broadcastLog'
import { formatClassicRow } from './battle/classicLog'
import { pickCpuThinkingPhrase } from './battle/cpu-thinking'
import { battleActorLabel, battlePanelLabel, describeBattleCellTooltip } from './battle/cell-tooltip'
import { GameGuide } from './help/GameGuide'
import { resolveTeamColorSlotForTeamId } from '../game/match-roster'
import './battle/battle-surface.css'

type Mode = 'idle' | 'move' | 'cast' | 'strikePick'

const MS = {
  move: 300,
  strike: 240,
  castOff: 420,
  castSelf: 300,
  reject: 200,
  cpuDelay: 400,
} as const

const LOG_MODE_KEY = 'skillcraft-battle-log-mode'
type LogMode = 'classic' | 'broadcast'

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
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
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
  /** `null` = show everyone. Otherwise only rows whose `subject` is in the set (subject-less actor lines still pass). */
  const [logActorFilter, setLogActorFilter] = useState<Set<ActorId> | null>(null)
  /** Broadcast only: play-by-play lines (`voice === 'caster'`). */
  const [logShowCaster, setLogShowCaster] = useState(true)

  const normalizedMatch = useMemo(() => normalizeBattleConfig(config).match, [config])
  const teamSlot = useCallback(
    (teamId: number) => resolveTeamColorSlotForTeamId(teamId, normalizedMatch.teamColorSlotByTeamId),
    [normalizedMatch.teamColorSlotByTeamId],
  )

  const classicRows = useMemo(() => {
    const out: { text: string; subject?: ActorId; key: number }[] = []
    game.log.forEach((entry, index) => {
      const row = formatClassicRow(entry, game, index)
      if (row) out.push({ text: row.text, subject: row.subject, key: index })
    })
    return out
  }, [game])

  const broadcastLogRows = useMemo(
    () =>
      game.log.flatMap((entry, index) =>
        expandBroadcastRows(entry, game, index).map((row, j) => ({
          row,
          key: `${index}-${j}`,
        })),
      ),
    [game],
  )

  const logRowMatchesActorFilter = useCallback(
    (subject: ActorId | undefined) => {
      if (logActorFilter === null) return true
      if (subject === undefined) return true
      return logActorFilter.has(subject)
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
        return next.size === 0 ? null : next
      }
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size <= 1) return prev
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

  const gameRef = useRef(game)
  const battleLogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    gameRef.current = game
  }, [game])

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

  const scheduleKnockback = useCallback(
    (
      prev: GameState,
      next: GameState,
      attacker: ActorId,
      defenderId: ActorId,
      onDone?: () => void,
    ) => {
      const kb = knockbackMoveFx(prev, next, attacker, defenderId)
      if (!kb || kb.kind !== 'move') {
        onDone?.()
        return
      }
      setBoardFx(kb)
      setHiddenPieceActor(kb.actor)
      window.setTimeout(() => {
        setBoardFx(null)
        setHiddenPieceActor(null)
        onDone?.()
      }, MS.move)
    },
    [],
  )

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

      void requestCpuPick(stateForPick, actor, cpuWorker, {
        onWorkerReplaced: (w) => {
          cpuWorkerRef.current = w
        },
      }).then(
        (action) => {
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

          if (action.type === 'strike') {
            const tid = action.targetId ?? stateForPick.humanActorId
            setBoardFx({
              kind: 'strike',
              attacker: actor,
              defenderKey: coordKey(stateForPick.actors[tid]!.pos),
              defenderId: tid,
            })
            window.setTimeout(() => {
              const prev = gameRef.current
              const r = applyAction(prev, actor, action)
              if (r.error) {
                setBoardFx(null)
                finishCpu()
                return
              }
              setGame(r.state)
              setBoardFx(null)
              if (r.state.winner) {
                finishCpu()
                return
              }
              scheduleKnockback(prev, r.state, actor, tid, finishCpu)
            }, MS.strike)
            return
          }

          if (action.type === 'cast') {
            const def = getSkillDef(action.skillId)
            const entry = stateForPick.loadouts[actor]?.find((e) => e.skillId === action.skillId)
            if (!entry) {
              finishCpu()
              return
            }

            if (def.selfTarget) {
              setSceneCastElement(def.element)
              setBoardFx({
                kind: 'castSelf',
                casterKey: coordKey(stateForPick.actors[actor]!.pos),
                element: def.element,
              })
              window.setTimeout(() => {
                setGame((prev) => {
                  const r = applyAction(prev, actor, action)
                  return r.error ? prev : r.state
                })
                setBoardFx(null)
                setSceneCastElement(null)
                finishCpu()
              }, MS.castSelf)
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
          finishCpu()
        },
      )
    }

    runAfterThinkingPaint()
  }, [scheduleKnockback])

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

  const highlightMove = useMemo(
    () => new Set(mode === 'move' ? legalMoves(game, game.humanActorId).map(coordKey) : []),
    [game, mode],
  )
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

  const previewPatternKeys = useMemo(() => {
    if (mode !== 'cast' || !castSkillId || !hoveredKey) return null
    if (!highlightCastReach.has(hoveredKey)) return null
    const anchor = parseKey(hoveredKey)
    const cells = patternCellsForCast(game, game.humanActorId, castSkillId, anchor)
    if (!cells) return null
    return new Set(cells.map(coordKey))
  }, [mode, castSkillId, hoveredKey, highlightCastReach, game])

  const strikePickKeys = useMemo(() => {
    if (mode !== 'strikePick') return null
    return new Set(
      legalStrikeTargets(game, game.humanActorId).map((id) => coordKey(game.actors[id]!.pos)),
    )
  }, [mode, game])

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

  function triggerReject(cellKey: string): void {
    setMessage(mode === 'move' ? 'Illegal move.' : 'That target is not legal for this skill.')
    setBoardFx({ kind: 'reject', cellKey })
    window.setTimeout(() => setBoardFx(null), MS.reject)
  }

  function fireStrike(targetId: ActorId): void {
    const g = gameRef.current
    setBoardFx({
      kind: 'strike',
      attacker: game.humanActorId,
      defenderKey: coordKey(g.actors[targetId]!.pos),
      defenderId: targetId,
    })
    window.setTimeout(() => {
      const prev = gameRef.current
      const r = applyAction(prev, game.humanActorId, { type: 'strike', targetId })
      if (r.error) {
        setMessage(r.error)
        setBoardFx(null)
        return
      }
      setGame(r.state)
      setBoardFx(null)
      setMode('idle')
      setCastSkillId(null)
      if (r.state.winner) return
      scheduleKnockback(prev, r.state, game.humanActorId, targetId)
    }, MS.strike)
  }

  function onCellClick(c: Coord): void {
    setPulseKey(coordKey(c))
    setMessage(null)
    if (game.winner || game.tie || game.turn !== game.humanActorId) return

    const k = coordKey(c)

    if (mode === 'strikePick') {
      const targets = legalStrikeTargets(game, game.humanActorId)
      const hit = targets.find((id) => coordKey(game.actors[id]!.pos) === k)
      if (!hit) {
        triggerReject(k)
        return
      }
      fireStrike(hit)
      setMode('idle')
      return
    }

    if (mode === 'move') {
      const ok = legalMoves(game, game.humanActorId).some((m) => coordKey(m) === k)
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
      const ok = legalCasts(game, game.humanActorId).some(
        (x) => x.skillId === castSkillId && coordKey(x.target) === k,
      )
      if (!ok) {
        triggerReject(k)
        return
      }

      const def = getSkillDef(castSkillId)
      const action: GameAction = { type: 'cast', skillId: castSkillId, target: c }

      if (def.selfTarget) {
        setSceneCastElement(def.element)
        setBoardFx({
          kind: 'castSelf',
          casterKey: coordKey(game.actors[game.humanActorId]!.pos),
          element: def.element,
        })
        window.setTimeout(() => {
          setGame((prev) => {
            const r = applyAction(prev, game.humanActorId, action)
            return r.error ? prev : r.state
          })
          setBoardFx(null)
          setSceneCastElement(null)
          setMode('idle')
          setCastSkillId(null)
        }, MS.castSelf)
        return
      }

      const cells = patternCellsForCast(game, game.humanActorId, castSkillId, c)
      if (!cells) return
      const stagger = castResolveStaggerMap(cells)
      setSceneCastElement(def.element)
      setBoardFx({ kind: 'castOffensive', element: def.element, stagger })
      window.setTimeout(() => {
        setGame((prev) => {
          const r = applyAction(prev, game.humanActorId, action)
          return r.error ? prev : r.state
        })
        setBoardFx(null)
        setSceneCastElement(null)
        setMode('idle')
        setCastSkillId(null)
      }, MS.castOff)
    }
  }

  function onStrikePlayer(): void {
    setMessage(null)
    if (game.winner || game.tie || game.turn !== game.humanActorId) return
    const targets = legalStrikeTargets(game, game.humanActorId)
    if (targets.length === 0) return
    if (targets.length === 1) {
      fireStrike(targets[0]!)
      return
    }
    setMode('strikePick')
    setCastSkillId(null)
  }

  function cellClassSuffix(c: Coord): string {
    const k = coordKey(c)
    const parts: string[] = []
    const hazard = game.impactedTiles[k]
    if (hazard) {
      const element = getSkillDef(hazard.skillId).element
      parts.push(`holo-cell--hazard-${element}`)
    }
    if (mode === 'move' && highlightMove.has(k)) parts.push('holo-cell--hint-move')
    if (mode === 'strikePick' && strikePickKeys?.has(k)) parts.push('holo-cell--hint-cast-legal')
    if (mode === 'cast' && castSkillId) {
      if (highlightCastLegal.has(k)) parts.push('holo-cell--hint-cast-legal')
      else if (highlightCastReach.has(k)) parts.push('holo-cell--hint-cast-reach')
    }
    if (isOvertimeLethal(game, c)) {
      parts.push('holo-cell--overtime-lethal')
      if (isOvertimeStormPulseRound(game)) parts.push('holo-cell--overtime-lethal--pulse')
    }
    return parts.join(' ')
  }

  const pathFrom = mode === 'move' && highlightMove.size > 0 ? pPos : null
  const pathTos = mode === 'move' ? legalMoves(game, game.humanActorId) : []

  const cells: Coord[] = []
  for (let y = 0; y < game.size; y++) {
    for (let x = 0; x < game.size; x++) {
      cells.push({ x, y })
    }
  }

  const hint =
    message ??
    (mode === 'move'
      ? `Orthogonal steps · up to ${game.actors[game.humanActorId]!.moveMaxSteps}.`
      : mode === 'strikePick'
        ? 'Click an adjacent hostile to strike.'
        : mode === 'cast' && castSkillId
          ? 'Amber outline = valid anchor. Dim = range only.'
          : 'Select move, strike, or a skill.')

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

  return (
    <div className="battle-surface">
      <header className="battle-surface__rail">
        <button type="button" className="battle-surface__exit" onClick={onExit}>
          Loadout
        </button>
        <div className="battle-surface__phase">
          <h1 className={railTitle.className}>{railTitle.text}</h1>
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
                  Move orthogonally (stamina costs apply). Strike adjacent hostiles. Cast spends mana; the skill
                  pattern anchors on the cell you click, and range is measured from your position to that anchor.
                </p>
                <p className="ls-modal__note">
                  Turns follow the roster order. Reduce all enemies to 0 HP to win.
                </p>
                <p className="ls-modal__note">
                  <strong>Skip</strong> ends your turn immediately without moving, striking, or casting—useful when you
                  want to pass.
                </p>
                {game.overtimeEnabled ? (
                  <p className="ls-modal__note">
                    <strong>Sudden death</strong> is on for this match (N was set in match setup). Outside the safe
                    zone, <em>pulsing</em> red means the storm will <strong>not</strong> deal damage when this full round
                    ends; <em>solid</em> red means it will. The first boundary after sudden death starts is always a
                    warning (no storm damage); then strike and skip alternate. The safe zone shrinks over time; storm
                    hits skip armor and only reduce shield then HP.
                  </p>
                ) : null}
              </>
            }
          />
        </div>
      </header>

      <div className="battle-surface__matrix">
        <aside
          className="battle-surface__edge battle-surface__edge--left"
          aria-label="Combatants and battle log"
        >
          <div className="battle-surface__combatants">
            {game.turnOrder.map((id) => {
              const a = game.actors[id]!
              if (a.hp <= 0) return null
              const you = id === game.humanActorId
              const label = battlePanelLabel(game, id)
              return (
                <div
                  key={id}
                  role="button"
                  tabIndex={0}
                  className={`bs-actor bs-actor--t${resolveTeamColorSlotForTeamId(game.teamByActor[id] ?? 0, normalizedMatch.teamColorSlotByTeamId)}${you ? ' bs-actor--you' : ''}${!game.winner && !game.tie && game.turn === id ? ' is-active' : ''}`}
                  aria-current={!game.winner && !game.tie && game.turn === id ? 'true' : undefined}
                  aria-label={`Inspect ${label}`}
                  onClick={() => setInspectActorId(id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setInspectActorId(id)
                    }
                  }}
                >
                  <span className="bs-actor__label">{label}</span>
                  <BsMeter kind="hp" current={a.hp} max={a.maxHp} />
                  <BsMeter kind="mana" current={a.mana} max={a.maxMana} />
                  <BsMeter kind="stamina" current={a.stamina} max={a.maxStamina} />
                  <p className="bs-actor__meta">
                    +{a.manaRegenPerTurn} MP · +{STAMINA_REGEN_PER_TURN} SP/turn · {a.moveMaxSteps} step
                    {a.moveMaxSteps === 1 ? '' : 's'}
                  </p>
                </div>
              )
            })}
          </div>
          <div className="battle-log__panel">
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
              </div>
              <div className="battle-log__filter" role="group" aria-label="Filter log by fighter">
                <span className="battle-log__toolbar-label battle-log__filter-label">Show</span>
                {game.turnOrder.map((id) => {
                  const checked = logActorFilter === null || logActorFilter.has(id)
                  const onlyVisible =
                    logActorFilter !== null && logActorFilter.size === 1 && logActorFilter.has(id)
                  const slot = teamSlot(game.teamByActor[id] ?? 0)
                  return (
                    <label
                      key={id}
                      className={`battle-log__filter-item battle-log__filter-item--t${slot}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={onlyVisible}
                        onChange={() => toggleLogActorFilter(id)}
                        aria-label={`Show log lines for ${battlePanelLabel(game, id)}`}
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

        <div className="battle-surface__board">
          <HolographicBattleBoard
            size={game.size}
            cells={cells}
            getCellClassSuffix={cellClassSuffix}
            onCellClick={onCellClick}
            hoveredKey={hoveredKey}
            onHoverChange={setHoveredKey}
            pulseKey={pulseKey}
            pathFrom={pathFrom}
            pathTos={pathTos}
            pieces={boardPieces}
            hiddenPieceActor={hiddenPieceActor}
            boardFx={boardFx}
            previewPatternKeys={previewPatternKeys}
            sceneCastElement={sceneCastElement}
            getCellTooltip={(c) => describeBattleCellTooltip(game, c)}
          />
        </div>

        <aside className="battle-surface__edge battle-surface__edge--right" aria-label="Commands">
          <div className="bs-actions">
            <div className="bs-actions__group">
              <span className="bs-actions__label">Phase</span>
              <button
                type="button"
                className={`bs-btn${mode === 'move' ? ' is-on' : ''}`}
                aria-pressed={mode === 'move'}
                disabled={game.turn !== game.humanActorId || !!game.winner || game.tie}
                onClick={() => {
                  setMode('move')
                  setCastSkillId(null)
                }}
              >
                Move
              </button>
              <button
                type="button"
                className={`bs-btn${mode === 'strikePick' ? ' is-on' : ''}`}
                disabled={game.turn !== game.humanActorId || !!game.winner || game.tie || !canStrike(game, game.humanActorId)}
                title={
                  canStrike(game, game.humanActorId) ? 'Physical hit + bleeding (no mana)' : 'Adjacent to hostile required'
                }
                onClick={onStrikePlayer}
              >
                Strike
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
                title="End your turn without moving, striking, or casting"
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
            <div className="bs-actions__group">
              <span className="bs-actions__label">Skills</span>
              {game.loadouts[game.humanActorId]!.map((e) => {
                const def = getSkillDef(e.skillId)
                const maxR = effectiveCastRangeForLoadout(def, e, game.actors[game.humanActorId]!.traits)
                const { min: mMin, max: mMax } = manaCostCastRange(e, def.selfTarget ? 0 : maxR)
                const canAfford = game.actors[game.humanActorId]!.mana >= mMin
                const manaStr = mMin === mMax ? `${mMin}` : `${mMin}–${mMax}`
                return (
                  <button
                    key={e.skillId}
                    type="button"
                    className={`bs-btn${mode === 'cast' && castSkillId === e.skillId ? ' is-armed' : ''}${mode === 'cast' && castSkillId === e.skillId ? ' is-on' : ''}`}
                    aria-pressed={mode === 'cast' && castSkillId === e.skillId}
                    disabled={game.turn !== game.humanActorId || !!game.winner || game.tie || !canAfford}
                    title={
                      !canAfford
                        ? `Need at least ${mMin} mana`
                        : `${manaStr} MP · ${entryPointCost(e)} pts`
                    }
                    onClick={() => {
                      setMode('cast')
                      setCastSkillId(e.skillId)
                    }}
                  >
                    {def.name} · {manaStr}
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
