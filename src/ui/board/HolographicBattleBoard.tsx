import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { ActorId, Coord, TeamColorSlot } from '../../game/types'
import { coordKey } from '../../game/board'
import { cellCenterNormalized, HOLO_GRID_GAP_FRACTION, pathLinesD } from './geometry'
import type { BoardFxState } from './fx'
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
  hoveredKey: string | null
  onHoverChange: (key: string | null) => void
  pulseKey: string | null
  pathFrom: Coord | null
  pathTos: Coord[]
  pieces: BoardPiece[]
  /** Hide in-cell token while overlay animates this actor's move. */
  hiddenPieceActor: ActorId | null
  boardFx: BoardFxState | null
  /** Cast mode: pattern preview while hovering a reachable anchor. */
  previewPatternKeys: Set<string> | null
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
}: {
  teamSlot: TeamColorSlot
  from: Coord
  to: Coord
  extraClass: string
  youMarker?: boolean
  size: number
}) {
  const [pos, setPos] = useState(from)
  useEffect(() => {
    const id = requestAnimationFrame(() => setPos(to))
    return () => cancelAnimationFrame(id)
  }, [from, to])

  const p = cellCenterNormalized(pos, size, HOLO_GRID_GAP_FRACTION)
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

export function HolographicBattleBoard({
  size,
  cells,
  getCellClassSuffix,
  onCellClick,
  hoveredKey,
  onHoverChange,
  pulseKey,
  pathFrom,
  pathTos,
  pieces,
  hiddenPieceActor,
  boardFx,
  previewPatternKeys,
  sceneCastElement,
  getCellTooltip,
  playerHintColor,
  speechBubbles,
}: HolographicBattleBoardProps) {
  const pathD = useMemo(
    () =>
      pathFrom && pathTos.length > 0
        ? pathLinesD(pathFrom, pathTos, size, HOLO_GRID_GAP_FRACTION)
        : '',
    [pathFrom, pathTos, size],
  )

  const centerKey = coordKey({ x: Math.floor(size / 2), y: Math.floor(size / 2) })

  const posById = useMemo(() => {
    const m = new Map<ActorId, Coord>()
    for (const p of pieces) m.set(p.id, p.pos)
    return m
  }, [pieces])

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

  const speechBubbleLayout = useMemo(() => {
    if (!speechBubbles?.length) return []
    const stacks = new Map<string, number>()
    const out: {
      id: string
      nx: number
      ny: number
      stack: number
      text: string
      teamSlot: TeamColorSlot
    }[] = []
    for (const b of speechBubbles) {
      const pos = posById.get(b.actorId)
      if (!pos) continue
      const k = coordKey(pos)
      const stack = stacks.get(k) ?? 0
      stacks.set(k, stack + 1)
      const p = cellCenterNormalized(pos, size, HOLO_GRID_GAP_FRACTION)
      out.push({ id: b.id, nx: p.nx, ny: p.ny, stack, text: b.text, teamSlot: b.teamSlot })
    }
    return out
  }, [speechBubbles, posById, size])

  const sceneStyle: CSSProperties | undefined = playerHintColor
    ? { ['--holo-player-hint' as string]: playerHintColor }
    : undefined

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
          className="holo-board"
          style={{
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gridTemplateRows: `repeat(${size}, 1fr)`,
          }}
          onMouseLeave={() => onHoverChange(null)}
        >
        <svg className="holo-board__paths" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
          {pathD ? <path d={pathD} pathLength={1} /> : null}
        </svg>

        <div className="holo-board__atmosphere" aria-hidden />

        {boardFx?.kind === 'move' ? (
          <div className="holo-board__overlay" aria-hidden>
            <MoveOverlayPiece
              teamSlot={
                pieces.find((x) => x.id === boardFx.actor)?.teamSlot ??
                clampTeamSlot(0)
              }
              from={boardFx.from}
              to={boardFx.to}
              size={size}
              extraClass={pieces.find((x) => x.id === boardFx.actor)?.extraClass ?? ''}
              youMarker={pieces.find((x) => x.id === boardFx.actor)?.youMarker}
            />
          </div>
        ) : null}

        {cells.map((c) => {
          const k = coordKey(c)
          const suffix = getCellClassSuffix(c)
          const isHovered = hoveredKey === k
          const isPulse = pulseKey === k
          const isCenter = k === centerKey
          const here = pieces.filter((p) => coordKey(p.pos) === k && hiddenPieceActor !== p.id)
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
              onMouseEnter={() => onHoverChange(k)}
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

        {speechBubbleLayout.length > 0 ? (
          <div className="holo-board__overlay holo-board__speech-overlay" aria-hidden>
            {speechBubbleLayout.map((b) => (
              <div
                key={b.id}
                className={`holo-speech-bubble holo-speech-bubble--t${b.teamSlot}`}
                style={{
                  position: 'absolute',
                  left: `${b.nx * 100}%`,
                  top: `${b.ny * 100}%`,
                  transform: `translate(-50%, calc(-100% - ${6 + b.stack * 12}px))`,
                  zIndex: 9,
                }}
              >
                {b.text}
              </div>
            ))}
          </div>
        ) : null}
        </div>
      </div>
    </div>
  )
}
