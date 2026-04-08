import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { ActorId, Coord, GameState, SkillId, TeamColorSlot } from '../../game/types'
import { coordKey, parseKey } from '../../game/board'
import {
  cellCenterNormalized,
  HOLO_GRID_GAP_FRACTION,
  measureHoloBoardGapFraction,
  pathLinesD,
  pieceAnchorNormalized,
  speechBubbleTopNormalized,
} from './geometry'
import { patternCellsForCast, type BoardFxState } from './fx'
import './holographic-board.css'

export type BoardPiece = {
  id: ActorId
  pos: Coord
  /** Shared by everyone on the same team. */
  teamSlot: TeamColorSlot
  extraClass: string
  /** Renders `.holo-piece-you-dot` when human and an ally shares the same team color. */
  youMarker?: boolean
}

export type BattleSpeechBubble = {
  id: string
  actorId: ActorId
  text: string
  teamSlot: TeamColorSlot
}

export interface HolographicBattleBoardProps {
  /** Grid dimension (7–19). */
  size: number
  cells: Coord[]
  getCellClassSuffix: (c: Coord) => string
  onCellClick: (c: Coord) => void
  pulseKey: string | null
  pathFrom: Coord | null
  pathTos: Coord[]
  pieces: BoardPiece[]
  /** Hide in-cell token while overlay animates this actor's move. */
  hiddenPieceActor: ActorId | null
  boardFx: BoardFxState | null
  /** Cast preview: anchored skill (null = no preview layer). */
  castPreviewSkillId: SkillId | null
  /** Reachable anchor keys for `castPreviewSkillId` (from parent). */
  highlightCastReach: ReadonlySet<string>
  game: GameState
  humanActorId: ActorId
  /** `data-cast-element` on scene during offensive cast resolve. */
  sceneCastElement: string | null
  /** Hover/focus tooltip when cell has actors and/or a lingering hazard. */
  getCellTooltip: (c: Coord) => string | null
  /** Hex color (e.g. `#6eb8c8`) for move/cast range hints — matches human team token. */
  playerHintColor?: string
  /** Optional speech bubbles over fighters (anchored by actor position on the board). */
  speechBubbles?: BattleSpeechBubble[] | null
}

function lungeDelta(attacker: Coord, defender: Coord): { lx: number; ly: number } {
  const dx = Math.sign(defender.x - attacker.x)
  const dy = Math.sign(defender.y - attacker.y)
  return { lx: dx || 0, ly: dy || 0 }
}

function clampTeamSlot(n: number): TeamColorSlot {
  const t = Math.min(7, Math.max(0, Math.floor(n)))
  return t as TeamColorSlot
}

function pieceBaseClass(teamSlot: TeamColorSlot): string {
  return `holo-piece holo-piece--t${teamSlot}`
}

function MoveOverlayPiece({
  teamSlot,
  from,
  to,
  extraClass,
  youMarker,
  size,
  gapFraction,
}: {
  teamSlot: TeamColorSlot
  from: Coord
  to: Coord
  extraClass: string
  youMarker?: boolean
  size: number
  gapFraction: number
}) {
  const [pos, setPos] = useState(from)
  useEffect(() => {
    const id = requestAnimationFrame(() => setPos(to))
    return () => cancelAnimationFrame(id)
  }, [from, to])

  const p = cellCenterNormalized(pos, size, gapFraction)
  const base = pieceBaseClass(teamSlot)
  return (
    <span
      className={`${base} holo-piece--overlay ${extraClass}`}
      style={{
        position: 'absolute',
        left: `${p.nx * 100}%`,
        top: `${p.ny * 100}%`,
        transform: 'translate(-50%, -50%)',
        transition:
          'left 0.28s cubic-bezier(0.22, 1, 0.36, 1), top 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        zIndex: 8,
        ['--holo-grid-size' as string]: size,
      }}
    >
      <span className="holo-piece-ring" />
      {youMarker ? <span className="holo-piece-you-dot" aria-hidden /> : null}
    </span>
  )
}

/** One stack per actor+cell: flex column so multiple lines get real vertical gap (no fixed em overlap). */
function SpeechBubbleStack({
  bubbles,
  size,
  anchorPos,
  moveFrom,
  moveTo,
  pieceIndex,
  piecesInCell,
  gapFraction,
}: {
  bubbles: BattleSpeechBubble[]
  size: number
  anchorPos: Coord
  moveFrom: Coord | null
  moveTo: Coord | null
  pieceIndex: number
  piecesInCell: number
  gapFraction: number
}) {
  const isMoving = moveFrom !== null && moveTo !== null
  const [pos, setPos] = useState<Coord>(anchorPos)

  useEffect(() => {
    if (moveFrom && moveTo) {
      queueMicrotask(() => setPos(moveFrom))
      const id = requestAnimationFrame(() => setPos(moveTo))
      return () => cancelAnimationFrame(id)
    }
    queueMicrotask(() => setPos(anchorPos))
  }, [moveFrom?.x, moveFrom?.y, moveTo?.x, moveTo?.y, anchorPos.x, anchorPos.y])

  const center = isMoving
    ? cellCenterNormalized(pos, size, gapFraction)
    : pieceAnchorNormalized(pos, size, gapFraction, pieceIndex, piecesInCell)
  const topFrac = speechBubbleTopNormalized(center.ny, size, gapFraction)
  return (
    <div
      className="holo-speech-stack"
      style={{
        left: `${center.nx * 100}%`,
        top: `${topFrac * 100}%`,
        transform: 'translateX(-50%) translateY(-100%)',
        zIndex: 11 + bubbles.length,
        ...(isMoving
          ? {
              transition:
                'left 0.28s cubic-bezier(0.22, 1, 0.36, 1), top 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
            }
          : {}),
      }}
    >
      {bubbles.map((b) => (
        <div key={b.id} className={`holo-speech-bubble holo-speech-bubble--t${b.teamSlot}`}>
          {b.text}
        </div>
      ))}
    </div>
  )
}

export const HolographicBattleBoard = memo(function HolographicBattleBoard({
  size,
  cells,
  getCellClassSuffix,
  onCellClick,
  pulseKey,
  pathFrom,
  pathTos,
  pieces,
  hiddenPieceActor,
  boardFx,
  castPreviewSkillId,
  highlightCastReach,
  game,
  humanActorId,
  sceneCastElement,
  getCellTooltip,
  playerHintColor,
  speechBubbles,
}: HolographicBattleBoardProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const [layoutGapFraction, setLayoutGapFraction] = useState(HOLO_GRID_GAP_FRACTION)

  const previewPatternKeys = useMemo(() => {
    if (!castPreviewSkillId || !hoveredKey) return null
    if (!highlightCastReach.has(hoveredKey)) return null
    const anchor = parseKey(hoveredKey)
    const cellsPattern = patternCellsForCast(game, humanActorId, castPreviewSkillId, anchor)
    if (!cellsPattern) return null
    return new Set(cellsPattern.map(coordKey))
  }, [castPreviewSkillId, highlightCastReach, hoveredKey, game, humanActorId])

  useLayoutEffect(() => {
    const el = boardRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const sync = () => {
      const m = measureHoloBoardGapFraction(el)
      setLayoutGapFraction(m ?? HOLO_GRID_GAP_FRACTION)
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [size])

  const pathD = useMemo(
    () =>
      pathFrom && pathTos.length > 0
        ? pathLinesD(pathFrom, pathTos, size, layoutGapFraction)
        : '',
    [pathFrom, pathTos, size, layoutGapFraction],
  )

  const centerKey = coordKey({ x: Math.floor(size / 2), y: Math.floor(size / 2) })

  const posById = useMemo(() => {
    const m = new Map<ActorId, Coord>()
    for (const p of pieces) m.set(p.id, p.pos)
    return m
  }, [pieces])

  const piecesByCellKey = useMemo(() => {
    const m = new Map<string, BoardPiece[]>()
    for (const p of pieces) {
      if (hiddenPieceActor === p.id) continue
      const k = coordKey(p.pos)
      const cur = m.get(k)
      if (cur) cur.push(p)
      else m.set(k, [p])
    }
    return m
  }, [pieces, hiddenPieceActor])

  const strikeLunge =
    boardFx?.kind === 'strike'
      ? (() => {
          const ap = posById.get(boardFx.attacker)
          const dp = posById.get(boardFx.defenderId)
          if (!ap || !dp) return null
          return {
            attacker: boardFx.attacker,
            defenderKey: boardFx.defenderKey,
            ...lungeDelta(ap, dp),
          }
        })()
      : null

  const speechBubbleGroups = useMemo(() => {
    if (!speechBubbles?.length) return []
    const move = boardFx?.kind === 'move' ? boardFx : null
    const order: string[] = []
    const groups = new Map<
      string,
      {
        bubbles: BattleSpeechBubble[]
        anchorPos: Coord
        moveFrom: Coord | null
        moveTo: Coord | null
        pieceIndex: number
        piecesInCell: number
      }
    >()
    for (const b of speechBubbles) {
      const pos = posById.get(b.actorId)
      if (!pos) continue
      const moving = move !== null && move.actor === b.actorId
      const stackKey = `${coordKey(moving ? move.from : pos)}:${b.actorId}`
      let g = groups.get(stackKey)
      if (!g) {
        const atCell = piecesByCellKey.get(coordKey(pos)) ?? []
        let pieceIndex = atCell.findIndex((p) => p.id === b.actorId)
        if (pieceIndex < 0) pieceIndex = 0
        const piecesInCell = Math.max(1, atCell.length)
        g = {
          bubbles: [],
          anchorPos: pos,
          moveFrom: moving ? move.from : null,
          moveTo: moving ? move.to : null,
          pieceIndex,
          piecesInCell,
        }
        groups.set(stackKey, g)
        order.push(stackKey)
      }
      g.bubbles.push(b)
    }
    return order.map((k) => ({ groupKey: k, ...groups.get(k)! }))
  }, [speechBubbles, posById, boardFx, piecesByCellKey])

  const sceneStyle: CSSProperties | undefined = playerHintColor
    ? { ['--holo-player-hint' as string]: playerHintColor }
    : undefined

  const moveOverlayPiece =
    boardFx?.kind === 'move' ? pieces.find((x) => x.id === boardFx.actor) : undefined

  const sceneRef = useRef<HTMLDivElement>(null)
  const tiltRef = useRef<HTMLDivElement>(null)
  const tiltTargetRef = useRef({ nx: 0, ny: 0 })
  const tiltRafRef = useRef(0)
  const tiltReduceMotionRef = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      tiltReduceMotionRef.current = mq.matches
      if (mq.matches && tiltRef.current) {
        tiltRef.current.style.removeProperty('--holo-tilt-x')
        tiltRef.current.style.removeProperty('--holo-tilt-y')
      }
    }
    sync()
    mq.addEventListener('change', sync)
    return () => {
      mq.removeEventListener('change', sync)
      if (tiltRafRef.current) cancelAnimationFrame(tiltRafRef.current)
    }
  }, [])

  const applyCursorTilt = useCallback(() => {
    if (tiltRafRef.current) return
    tiltRafRef.current = requestAnimationFrame(() => {
      tiltRafRef.current = 0
      const el = tiltRef.current
      if (!el || tiltReduceMotionRef.current) return
      const { nx, ny } = tiltTargetRef.current
      const maxX = 2.2
      const maxY = 2.8
      const rx = -ny * 2 * maxX
      const ry = nx * 2 * maxY
      el.style.setProperty('--holo-tilt-x', `${rx}deg`)
      el.style.setProperty('--holo-tilt-y', `${ry}deg`)
    })
  }, [])

  const onScenePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (tiltReduceMotionRef.current) return
      const root = sceneRef.current
      if (!root) return
      const r = root.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return
      tiltTargetRef.current = {
        nx: (e.clientX - r.left) / r.width - 0.5,
        ny: (e.clientY - r.top) / r.height - 0.5,
      }
      applyCursorTilt()
    },
    [applyCursorTilt],
  )

  const onScenePointerLeave = useCallback(() => {
    tiltTargetRef.current = { nx: 0, ny: 0 }
    applyCursorTilt()
  }, [applyCursorTilt])

  return (
    <div
      ref={sceneRef}
      className="holo-scene"
      data-cast-element={sceneCastElement ?? undefined}
      style={sceneStyle}
      onPointerMove={onScenePointerMove}
      onPointerLeave={onScenePointerLeave}
    >
      <div ref={tiltRef} className="holo-tilt">
        <div className="holo-frame" aria-hidden />

        <div
          ref={boardRef}
          className="holo-board"
          style={{
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gridTemplateRows: `repeat(${size}, 1fr)`,
          }}
          onMouseLeave={() => setHoveredKey(null)}
        >
        <svg className="holo-board__paths" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
          {pathD ? <path d={pathD} pathLength={1} /> : null}
        </svg>

        <div className="holo-board__atmosphere" aria-hidden />

        {boardFx?.kind === 'move' ? (
          <div className="holo-board__overlay" aria-hidden>
            <MoveOverlayPiece
              teamSlot={moveOverlayPiece?.teamSlot ?? clampTeamSlot(0)}
              from={boardFx.from}
              to={boardFx.to}
              size={size}
              gapFraction={layoutGapFraction}
              extraClass={moveOverlayPiece?.extraClass ?? ''}
              youMarker={moveOverlayPiece?.youMarker}
            />
          </div>
        ) : null}

        {cells.map((c) => {
          const k = coordKey(c)
          const suffix = getCellClassSuffix(c)
          const isHovered = hoveredKey === k
          const isPulse = pulseKey === k
          const isCenter = k === centerKey
          const here = piecesByCellKey.get(k) ?? []
          const overlap = here.length > 1

          let cls = 'holo-cell'
          if (suffix) cls += ` ${suffix}`
          if (isHovered) cls += ' holo-cell--hover'
          if (isPulse) cls += ' holo-cell--pulse'
          if (isCenter) cls += ' holo-cell--center'

          if (previewPatternKeys?.has(k)) cls += ' holo-cell--cast-preview'

          if (boardFx?.kind === 'castOffensive' && boardFx.stagger.has(k)) {
            cls += ` holo-cell--cast-resolve holo-cell--cast-elem-${boardFx.element}`
          }
          if (boardFx?.kind === 'castSelf' && boardFx.casterKey === k) {
            cls += ` holo-cell--cast-self-resolve holo-cell--cast-elem-${boardFx.element}`
          }
          if (boardFx?.kind === 'reject' && boardFx.cellKey === k) {
            cls += ' holo-cell--reject'
          }
          if (boardFx?.kind === 'strike' && boardFx.defenderKey === k) {
            cls += ' holo-cell--strike-impact'
          }

          const stagger =
            boardFx?.kind === 'castOffensive' && boardFx.stagger.has(k)
              ? boardFx.stagger.get(k)!
              : undefined

          const tooltip = getCellTooltip(c)
          const ariaLabel =
            tooltip !== null
              ? `Cell ${c.x} ${c.y} — ${tooltip.replace(/\n/g, '. ')}`
              : `Cell ${c.x} ${c.y}`

          return (
            <button
              key={k}
              type="button"
              className={cls}
              style={
                stagger !== undefined
                  ? ({ ['--cast-stagger' as string]: stagger } as CSSProperties)
                  : undefined
              }
              onClick={() => onCellClick(c)}
              onMouseEnter={() => setHoveredKey(k)}
              aria-label={ariaLabel}
            >
              {tooltip !== null ? (
                <span className="holo-cell__tooltip" aria-hidden>
                  {tooltip.split('\n').map((line, i) => (
                    <span key={i} className="holo-cell__tooltip-line">
                      {line}
                    </span>
                  ))}
                </span>
              ) : null}
              {here.map((p) => {
                const isLungeAtt = strikeLunge?.attacker === p.id
                const base = pieceBaseClass(p.teamSlot)
                return (
                  <span
                    key={p.id}
                    className={`${base}${overlap ? ' holo-piece--both' : ''} ${p.extraClass} ${
                      isLungeAtt ? 'holo-piece--strike-lunge' : ''
                    }`}
                    style={
                      isLungeAtt
                        ? ({
                            ['--lunge-lx' as string]: strikeLunge!.lx,
                            ['--lunge-ly' as string]: strikeLunge!.ly,
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    {!overlap || here.indexOf(p) === here.length - 1 ? <span className="holo-piece-ring" /> : null}
                    {p.youMarker ? <span className="holo-piece-you-dot" aria-hidden /> : null}
                  </span>
                )
              })}
            </button>
          )
        })}

        {speechBubbleGroups.length > 0 ? (
          <div className="holo-board__overlay holo-board__speech-overlay" aria-hidden>
            {speechBubbleGroups.map((g) => (
              <SpeechBubbleStack
                key={g.groupKey}
                bubbles={g.bubbles}
                size={size}
                anchorPos={g.anchorPos}
                moveFrom={g.moveFrom}
                moveTo={g.moveTo}
                pieceIndex={g.pieceIndex}
                piecesInCell={g.piecesInCell}
                gapFraction={layoutGapFraction}
              />
            ))}
          </div>
        ) : null}
        </div>
      </div>
    </div>
  )
})
