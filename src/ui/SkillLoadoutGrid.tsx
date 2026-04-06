import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BOARD_SIZE, coordKey, inBounds, manhattan } from '../game/board'
import {
  cellsForPattern,
  countGridToPatternOffsets,
  getSkillDef,
  loadoutPatternEditRadius,
  manaCostForCast,
  patternOffsetsToCountGrid,
} from '../game/skills'
import type { Coord, PatternOffset, SkillId, SkillLoadoutEntry } from '../game/types'

/** Hold this long (ms) to set the cast anchor (non-self skills). */
const LONG_PRESS_MS = 450

/** Fixed loadout frame: 15×15 cells; inner 11×11 is the interactive “usable” ring (game board centered here). */
const LOADOUT_OUTER = 15
const LOADOUT_INNER = 11
const LOADOUT_MARGIN = (LOADOUT_OUTER - LOADOUT_INNER) / 2

/** Player stands at board center in the loadout editor (middle of the inner 11×11 once the board is centered). */
function loadoutYou(boardSize: number): Coord {
  return { x: Math.floor(boardSize / 2), y: Math.floor(boardSize / 2) }
}

/** Map a cell in the 15×15 frame to game coords, or null for padding. */
function displayToBoardCoord(dx: number, dy: number, boardSize: number): Coord | null {
  const ix = dx - LOADOUT_MARGIN
  const iy = dy - LOADOUT_MARGIN
  if (ix < 0 || ix >= LOADOUT_INNER || iy < 0 || iy >= LOADOUT_INNER) return null
  const inset = Math.floor((LOADOUT_INNER - boardSize) / 2)
  const gx = ix - inset
  const gy = iy - inset
  if (gx >= 0 && gx < boardSize && gy >= 0 && gy < boardSize) return { x: gx, y: gy }
  return null
}

function defaultPreviewAnchor(you: Coord, maxRange: number, selfTarget: boolean): Coord {
  if (selfTarget) return you
  const north: Coord = { x: you.x, y: you.y - 1 }
  if (north.y >= 0 && manhattan(you, north) <= maxRange) return north
  return you
}

/** Uniform random cast anchor within Manhattan range (loadout preview). */
function randomPreviewAnchorInRange(you: Coord, maxRange: number, selfTarget: boolean, boardSize: number): Coord {
  if (selfTarget) return you
  const candidates: Coord[] = []
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const c = { x, y }
      if (manhattan(you, c) <= maxRange) candidates.push(c)
    }
  }
  if (candidates.length === 0) return defaultPreviewAnchor(you, maxRange, selfTarget)
  return candidates[Math.floor(Math.random() * candidates.length)]!
}

/**
 * Loadout-only: 15×15 frame with an 11×11 usable inner ring; game board is centered there with you at its center.
 * Hold press on an in-range tile → anchor. Click → cycle pattern weight at offsets the planner allows.
 */
export function SkillLoadoutGrid({
  pattern,
  onPatternChange,
  range,
  effectiveRange,
  statusStacks,
  manaDiscount,
  rangeTier = 0,
  aoeTier = 0,
  selfTarget,
  skillId,
  boardSize = BOARD_SIZE,
  /** When &gt; 0 (e.g. after "Randomize everything"), pick a random legal preview anchor on mount. */
  loadoutShuffleNonce = 0,
}: {
  pattern: PatternOffset[]
  onPatternChange: (next: PatternOffset[]) => void
  range: number
  effectiveRange?: number
  statusStacks: number
  manaDiscount: number
  rangeTier?: number
  aoeTier?: number
  selfTarget: boolean
  skillId: SkillId
  boardSize?: number
  loadoutShuffleNonce?: number
}) {
  const r = effectiveRange ?? range
  const you = loadoutYou(boardSize)
  /** Framed 15×15 / inner 11×11 only fits boards up to 11×11; larger boards use a plain grid. */
  const useFramedLayout = boardSize <= LOADOUT_INNER
  const gridN = useFramedLayout ? LOADOUT_OUTER : boardSize

  const [anchor, setAnchor] = useState<Coord>(() =>
    loadoutShuffleNonce > 0
      ? randomPreviewAnchorInRange(you, r, selfTarget, boardSize)
      : defaultPreviewAnchor(you, r, selfTarget),
  )
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** After a hold sets the anchor, swallow the following click so we don’t also cycle pattern. */
  const suppressNextClickRef = useRef(false)
  const boardClipRef = useRef<HTMLDivElement>(null)
  const [boardSidePx, setBoardSidePx] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = boardClipRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = (): void => {
      const w = el.clientWidth
      const h = el.clientHeight
      const s = Math.min(w, h)
      setBoardSidePx(s >= 48 ? Math.floor(s) : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function clearLongPressTimer(): void {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearLongPressTimer()
    }
  }, [])

  const resolvedAnchor = selfTarget ? you : anchor

  const entry: SkillLoadoutEntry = useMemo(
    () => ({
      skillId,
      pattern,
      statusStacks,
      manaDiscount,
      rangeTier,
      aoeTier,
    }),
    [skillId, pattern, statusStacks, manaDiscount, rangeTier, aoeTier],
  )

  const editRadius = useMemo(
    () => loadoutPatternEditRadius(getSkillDef(skillId), entry),
    [skillId, entry],
  )

  const dist = manhattan(you, resolvedAnchor)
  const manaAtAnchor = manaCostForCast(entry, dist)
  const manaAtFeet = manaCostForCast(entry, 0)
  const manaAtMaxDist = manaCostForCast(entry, r)

  const hitCells = useMemo(() => {
    const set = new Set<string>()
    for (const c of cellsForPattern(resolvedAnchor, pattern)) {
      if (inBounds(c, boardSize)) {
        set.add(coordKey(c))
      }
    }
    return set
  }, [resolvedAnchor, pattern, boardSize])

  const countGrid = useMemo(() => patternOffsetsToCountGrid(pattern, editRadius), [pattern, editRadius])

  function patternCountAtBoard(board: Coord): number {
    const odx = board.x - resolvedAnchor.x
    const ody = board.y - resolvedAnchor.y
    if (Math.abs(odx) > editRadius || Math.abs(ody) > editRadius) return 0
    const xi = odx + editRadius
    const yi = ody + editRadius
    return countGrid[yi]![xi]!
  }

  function cyclePatternAtBoard(board: Coord): void {
    const odx = board.x - resolvedAnchor.x
    const ody = board.y - resolvedAnchor.y
    if (Math.abs(odx) > editRadius || Math.abs(ody) > editRadius) return
    const xi = odx + editRadius
    const yi = ody + editRadius
    const g = countGrid.map((row) => [...row])
    const cur = g[yi]![xi]!
    g[yi]![xi] = cur >= 9 ? 0 : cur + 1
    onPatternChange(countGridToPatternOffsets(g))
  }

  function trySetAnchor(board: Coord): boolean {
    if (selfTarget) return false
    if (!inBounds(board, boardSize)) return false
    if (manhattan(you, board) > r) return false
    setAnchor(board)
    return true
  }

  function handleRangedPointerDown(bc: Coord, e: React.PointerEvent<HTMLButtonElement>): void {
    if (e.button !== 0) return
    clearLongPressTimer()
    e.currentTarget.setPointerCapture(e.pointerId)
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      if (trySetAnchor(bc)) {
        suppressNextClickRef.current = true
      }
    }, LONG_PRESS_MS)
  }

  function handleRangedPointerEnd(e: React.PointerEvent<HTMLButtonElement>): void {
    if (e.button !== 0) return
    clearLongPressTimer()
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* not captured */
    }
  }

  function handleRangedClick(bc: Coord): void {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
    cyclePatternAtBoard(bc)
  }

  const boardGridStyle = {
    gridTemplateColumns: `repeat(${gridN}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${gridN}, minmax(0, 1fr))`,
  } as const

  const wrapClass = 'skill-cast-planner skill-cast-planner--compact skill-loadout-grid skill-loadout-grid--compact'

  function renderBoardButton(bc: Coord, keySuffix: string): JSX.Element {
    const k = keySuffix
    const isYou = bc.x === you.x && bc.y === you.y
    const inRange = manhattan(you, bc) <= r
    const isAnchor = bc.x === resolvedAnchor.x && bc.y === resolvedAnchor.y
    const inPattern = hitCells.has(coordKey(bc))
    const n = patternCountAtBoard(bc)
    const chebFromAnchor = Math.max(
      Math.abs(bc.x - resolvedAnchor.x),
      Math.abs(bc.y - resolvedAnchor.y),
    )
    const inAoe = chebFromAnchor <= editRadius

    let cls = 'board-reference-cell skill-cast-planner__cell pattern-cell skill-loadout-grid__cell'
    if (isYou) cls += ' ref-you'
    if (!selfTarget && inRange) cls += ' cast-in-range'
    if (!selfTarget && isAnchor) cls += ' skill-cast-planner__anchor'
    if (inAoe) cls += ' skill-loadout-grid__aoe-cell'
    if (inPattern) cls += ' cast-pattern-cell'
    if (n > 0) cls += ' on'

    if (selfTarget) {
      return (
        <button
          key={k}
          type="button"
          className={cls}
          aria-label={
            isYou
              ? `You · pattern weight ${n}`
              : `offset ${bc.x - resolvedAnchor.x},${bc.y - resolvedAnchor.y} · weight ${n}`
          }
          onClick={() => cyclePatternAtBoard(bc)}
        >
          {n > 0 ? n : isYou ? 'You' : ''}
        </button>
      )
    }

    return (
      <button
        key={k}
        type="button"
        className={cls}
        aria-label={
          isAnchor
            ? `Anchor · ${dist} from you · ${manaAtAnchor} mana`
            : isYou
              ? 'You'
              : inRange
                ? `Hold to set anchor · click to edit pattern · ${manhattan(you, bc)} tiles from you`
                : 'Out of cast range · click still edits pattern if this offset is in the shape'
        }
        onPointerDown={(e) => handleRangedPointerDown(bc, e)}
        onPointerUp={(e) => handleRangedPointerEnd(e)}
        onPointerCancel={(e) => handleRangedPointerEnd(e)}
        onClick={() => handleRangedClick(bc)}
      >
        {n > 0 ? n : isAnchor ? '★' : isYou ? 'You' : ''}
      </button>
    )
  }

  const gridInner = useFramedLayout
    ? (() => {
        const frameCells: { dx: number; dy: number }[] = []
        for (let dy = 0; dy < LOADOUT_OUTER; dy++) {
          for (let dx = 0; dx < LOADOUT_OUTER; dx++) {
            frameCells.push({ dx, dy })
          }
        }
        return frameCells.map(({ dx, dy }) => {
          const bc = displayToBoardCoord(dx, dy, boardSize)
          if (bc !== null) return renderBoardButton(bc, `d${dx}-${dy}`)

          const inInnerRing =
            dx >= LOADOUT_MARGIN &&
            dx < LOADOUT_MARGIN + LOADOUT_INNER &&
            dy >= LOADOUT_MARGIN &&
            dy < LOADOUT_MARGIN + LOADOUT_INNER
          const padClass = inInnerRing
            ? 'skill-loadout-grid__pad skill-loadout-grid__pad--inner'
            : 'skill-loadout-grid__pad skill-loadout-grid__pad--outer'
          return <div key={`p${dx}-${dy}`} className={padClass} aria-hidden />
        })
      })()
    : (() => {
        const cells: Coord[] = []
        for (let y = 0; y < boardSize; y++) {
          for (let x = 0; x < boardSize; x++) {
            cells.push({ x, y })
          }
        }
        return cells.map((bc) => renderBoardButton(bc, `${bc.x},${bc.y}`))
      })()

  return (
    <div className={wrapClass}>
      <div className="skill-loadout-grid__meta">
        {selfTarget ? (
          <p className="skill-cast-planner__explain hint-mini">
            Self-cast — <strong>{manaAtFeet}</strong> mana. Violet = AoE (radius {editRadius}) · cyan = pattern.
          </p>
        ) : (
          <>
            <p className="skill-cast-planner__explain hint-mini">
              <strong>
                {dist}→{manaAtAnchor}
              </strong>{' '}
              mana · feet {manaAtFeet} · max range {r}: {manaAtMaxDist}. Cyan = pattern · slate ring = cast reach ·
              violet = AoE (Chebyshev {editRadius} from ★).
            </p>
            <p className="skill-loadout-grid__hint hint-mini">
              Hold to place anchor · click to edit shape.
            </p>
          </>
        )}
      </div>
      <div ref={boardClipRef} className="skill-loadout-grid__board-clip">
        <div
          className="board-reference-grid skill-cast-planner__grid skill-loadout-grid__board"
          data-board-measured={boardSidePx != null ? true : undefined}
          style={{
            ...boardGridStyle,
            ...(boardSidePx != null ? { width: boardSidePx, height: boardSidePx } : {}),
          }}
        >
          {gridInner}
        </div>
      </div>
    </div>
  )
}
