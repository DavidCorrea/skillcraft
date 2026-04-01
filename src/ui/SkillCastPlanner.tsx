import { useEffect, useMemo, useState } from 'react'
import { BOARD_SIZE, coordKey, manhattan, spawnNorth, spawnSouth } from '../game/board'
import { cellsForPattern, manaCostForCast } from '../game/skills'
import type { Coord, PatternOffset, SkillId, SkillLoadoutEntry } from '../game/types'

function defaultPreviewAnchor(you: Coord, maxRange: number, selfTarget: boolean): Coord {
  if (selfTarget) return you
  const north: Coord = { x: you.x, y: you.y - 1 }
  if (north.y >= 0 && manhattan(you, north) <= maxRange) return north
  return you
}

/**
 * Full board: you (south) vs CPU (north). Click a tile within range to preview a cast anchor.
 * Shows the skill’s area relative to that anchor and mana including distance from you.
 */
export function SkillCastPlanner({
  pattern,
  range,
  effectiveRange,
  statusStacks,
  manaDiscount,
  selfTarget,
  skillId,
  compact = false,
  boardSize = BOARD_SIZE,
}: {
  pattern: PatternOffset[]
  range: number
  effectiveRange?: number
  statusStacks: number
  manaDiscount: number
  selfTarget: boolean
  skillId: SkillId
  compact?: boolean
  /** Match battle grid for this level (default 7). */
  boardSize?: number
}) {
  const r = effectiveRange ?? range
  const you = spawnSouth(boardSize)
  const cpu = spawnNorth(boardSize)

  const [anchor, setAnchor] = useState<Coord>(() => defaultPreviewAnchor(you, r, selfTarget))

  useEffect(() => {
    setAnchor(defaultPreviewAnchor(you, r, selfTarget))
  }, [skillId, r, selfTarget, you.x, you.y, boardSize])

  const entry: SkillLoadoutEntry = useMemo(
    () => ({
      skillId,
      pattern,
      statusStacks,
      manaDiscount,
    }),
    [skillId, pattern, statusStacks, manaDiscount],
  )

  const dist = manhattan(you, anchor)
  const manaAtAnchor = manaCostForCast(entry, dist)
  const manaAtFeet = manaCostForCast(entry, 0)
  const manaAtMaxDist = manaCostForCast(entry, r)

  const hitCells = useMemo(() => {
    const set = new Set<string>()
    for (const c of cellsForPattern(anchor, pattern)) {
      if (c.x >= 0 && c.x < boardSize && c.y >= 0 && c.y < boardSize) {
        set.add(coordKey(c))
      }
    }
    return set
  }, [anchor, pattern, boardSize])

  const cells: Coord[] = []
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      cells.push({ x, y })
    }
  }

  const wrapClass = `skill-cast-planner${compact ? ' skill-cast-planner--compact' : ''}`

  const boardGridStyle = {
    gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${boardSize}, minmax(0, 1fr))`,
  } as const

  if (selfTarget) {
    return (
      <div className={wrapClass}>
        <p className="skill-cast-planner__title">Battlefield preview</p>
        <p className="skill-cast-planner__explain hint-mini">
          Self-cast — <strong>{manaAtFeet}</strong> mana{compact ? '' : ' (distance does not apply)'}.
        </p>
        <div
          className="board-reference-grid skill-cast-planner__grid"
          style={boardGridStyle}
        >
          {cells.map((c) => {
            const k = coordKey(c)
            const isYou = coordKey(you) === k
            const isCpu = coordKey(cpu) === k
            const inPattern = hitCells.has(k)
            let cls = 'board-reference-cell'
            if (isYou) cls += ' ref-you'
            if (isCpu) cls += ' ref-cpu'
            if (inPattern) cls += ' cast-pattern-cell'
            return (
              <div key={k} className={cls} title={isYou ? 'You · anchor' : isCpu ? 'CPU' : inPattern ? 'Effect' : ''}>
                {isYou ? 'You' : isCpu ? 'CPU' : ''}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className={wrapClass}>
      <p className="skill-cast-planner__title">Where you stand vs where you cast</p>
      <p className="skill-cast-planner__explain hint-mini">
        {compact ? (
          <>
            Click in-range tile for anchor · shaded = effect ·{' '}
            <strong>
              {dist}→{manaAtAnchor}
            </strong>{' '}
            mana · feet {manaAtFeet} · max range {r}: {manaAtMaxDist}
          </>
        ) : (
          <>
            <strong>You</strong> (south) vs <strong>CPU</strong> (north). Click any in-range tile to place a{' '}
            <strong>preview anchor</strong>. The shaded cells show where this skill hits relative to that anchor.{' '}
            <strong>Mana</strong> = loadout base + <strong>distance from you to the anchor</strong> (Manhattan tiles).
            For this preview: <strong>{dist}</strong> tile{dist === 1 ? '' : 's'} →{' '}
            <strong>{manaAtAnchor}</strong> mana · at your feet: <strong>{manaAtFeet}</strong> · worst case at range {r}:{' '}
            <strong>{manaAtMaxDist}</strong>.
          </>
        )}
      </p>
      <div
        className="board-reference-grid skill-cast-planner__grid"
        style={boardGridStyle}
      >
        {cells.map((c) => {
          const k = coordKey(c)
          const isYou = coordKey(you) === k
          const isCpu = coordKey(cpu) === k
          const inRange = manhattan(you, c) <= r
          const isAnchor = coordKey(anchor) === k
          const inPattern = hitCells.has(k)
          const canPick = inRange

          let cls = 'board-reference-cell skill-cast-planner__cell'
          if (isYou) cls += ' ref-you'
          if (isCpu) cls += ' ref-cpu'
          if (inRange) cls += ' cast-in-range'
          if (isAnchor) cls += ' skill-cast-planner__anchor'
          if (inPattern) cls += ' cast-pattern-cell'

          return (
            <button
              key={k}
              type="button"
              className={cls}
              disabled={!canPick}
              onClick={() => setAnchor(c)}
              title={
                isYou
                  ? 'Your tile — click to anchor at your feet'
                  : isAnchor
                    ? `Anchor · ${dist} from you · ${manaAtAnchor} mana`
                    : `Set preview anchor · ${manhattan(you, c)} from you`
              }
            >
              {isYou ? 'You' : isCpu ? 'CPU' : isAnchor ? '★' : ''}
            </button>
          )
        })}
      </div>
      {!compact ? (
        <p className="skill-cast-planner__legend hint-mini">
          Lighter border = in range · <strong>★</strong> = anchor · shaded = skill area.
        </p>
      ) : null}
    </div>
  )
}
