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
} from '../game/engine'
import type { GameAction } from '../game/engine'
import { createCpuWorker, requestCpuPick } from '../ai/requestCpuPick'
import { effectiveCastRangeForLoadout, entryPointCost, getSkillDef, manaCostCastRange } from '../game/skills'
import { STAMINA_REGEN_PER_TURN } from '../game/traits'
import { HolographicBattleBoard, type BoardPiece, type TeamColorSlot } from './board'
import {
  castResolveStaggerMap,
  knockbackMoveFx,
  patternCellsForCast,
  statusPieceClasses,
  type BoardFxState,
} from './board/fx'
import { ActorInspectModal } from './battle/ActorInspectModal'
import { pickCpuThinkingPhrase } from './battle/cpu-thinking'
import { battleActorLabel, describeBattleCellTooltip } from './battle/cell-tooltip'
import { GameGuide } from './help/GameGuide'
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

function teamColorSlot(game: GameState, id: ActorId): TeamColorSlot {
  const tid = game.teamByActor[id]
  const n = tid === undefined ? 0 : tid
  const t = Math.min(7, Math.max(0, Math.floor(n)))
  return t as TeamColorSlot
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

  const gameRef = useRef(game)
  const battleLogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    gameRef.current = game
  }, [game])

  useLayoutEffect(() => {
    const el = battleLogRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [game.log.length])

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
    }
    const stateForPick: GameState = { ...g, log: [...g.log, thinkingEntry] }

    flushSync(() => {
      setGame((prev) => ({ ...prev, log: [...prev.log, thinkingEntry] }))
    })

    const runAfterThinkingPaint = () => {
      const finishCpu = () => {
        cpuLockRef.current = false
      }

      void requestCpuPick(stateForPick, actor, cpuWorkerRef.current).then(
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
    if (game.winner || game.turn === game.humanActorId || cpuLockRef.current) return
    const t = window.setTimeout(runCpuWithFx, MS.cpuDelay)
    return () => window.clearTimeout(t)
  }, [game.turn, game.winner, game.log.length, runCpuWithFx])

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

  const boardPieces: BoardPiece[] = useMemo(() => {
    return game.turnOrder
      .filter((id) => game.actors[id]!.hp > 0)
      .map((id) => ({
        id,
        pos: game.actors[id]!.pos,
        teamSlot: teamColorSlot(game, id),
        extraClass: statusPieceClasses(game.actors[id]!.statuses),
      }))
  }, [game])

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
    if (game.winner || game.turn !== game.humanActorId) return

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
    if (game.winner || game.turn !== game.humanActorId) return
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

  const railTitle = game.winner
    ? {
        className: 'battle-surface__title is-end',
        text: game.winner === game.humanActorId ? 'VICTORY' : 'DEFEAT',
      }
    : game.turn === game.humanActorId
      ? { className: 'battle-surface__title is-live', text: 'YOUR ACTION' }
      : { className: 'battle-surface__title is-foe', text: 'HOSTILE TURN' }

  return (
    <div className="battle-surface">
      <header className="battle-surface__rail">
        <button type="button" className="battle-surface__exit" onClick={onExit}>
          Loadout
        </button>
        <h1 className={railTitle.className}>{railTitle.text}</h1>
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
              const label = battleActorLabel(game, id)
              return (
                <div
                  key={id}
                  role="button"
                  tabIndex={0}
                  className={`bs-actor bs-actor--t${teamColorSlot(game, id)}${you ? ' bs-actor--you' : ''}${!game.winner && game.turn === id ? ' is-active' : ''}`}
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
          <div
            ref={battleLogRef}
            className="battle-log"
            aria-live="polite"
            aria-label="Battle log"
          >
            {game.log.map((entry, i) => (
              <p
                key={i}
                className={
                  entry.subject !== undefined
                    ? `battle-log__row battle-log__row--t${teamColorSlot(game, entry.subject)}`
                    : 'battle-log__row battle-log__row--neutral'
                }
              >
                {entry.text}
              </p>
            ))}
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
                disabled={game.turn !== game.humanActorId || !!game.winner}
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
                disabled={game.turn !== game.humanActorId || !!game.winner || !canStrike(game, game.humanActorId)}
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
                    disabled={game.turn !== game.humanActorId || !!game.winner || !canAfford}
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
