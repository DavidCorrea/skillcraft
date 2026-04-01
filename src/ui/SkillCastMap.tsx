import { BOARD_SIZE, coordKey, manhattan, spawnNorth, spawnSouth } from '../game/board'
import { countHitsOnEnemy } from '../game/skills'
import type { PatternOffset } from '../game/types'

/**
 * Board view: you (south) and CPU (north) at battle start, plus where you may anchor this skill
 * (Manhattan range from you) and which anchors overlap the CPU with your current pattern.
 * Pass `effectiveRange` when previewing Arcane reach (defaults to `range`).
 */
export function SkillCastMap({
  range,
  effectiveRange,
  pattern,
  boardSize = BOARD_SIZE,
}: {
  range: number
  /** With Arcane reach trait; if omitted, `range` is used. */
  effectiveRange?: number
  pattern: PatternOffset[]
  boardSize?: number
}) {
  const r = effectiveRange ?? range
  const you = spawnSouth(boardSize)
  const cpu = spawnNorth(boardSize)
  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      cells.push({ x, y })
    }
  }

  return (
    <div className="skill-cast-map">
      <p className="skill-cast-map-title">From your position — cast targets</p>
      <div
        className="board-reference-grid skill-cast-map-grid"
        style={{ gridTemplateColumns: `repeat(${boardSize}, 1fr)` }}
      >
        {cells.map((c) => {
          const k = coordKey(c)
          const isYou = coordKey(you) === k
          const isCpu = coordKey(cpu) === k
          const inRange = manhattan(you, c) <= r
          const hitsCpuAtStart = inRange && countHitsOnEnemy(cpu, c, pattern) > 0

          let cls = 'board-reference-cell'
          if (isYou) cls += ' ref-you'
          if (isCpu) cls += ' ref-cpu'
          if (inRange) cls += ' cast-in-range'
          if (hitsCpuAtStart) cls += ' cast-hits-cpu'

          let title = `${c.x},${c.y}`
          if (isYou) title = 'You (start)'
          else if (isCpu) title = 'CPU (start)'
          if (inRange) title += ' · valid anchor'
          if (hitsCpuAtStart) title += ' · pattern hits CPU'

          return (
            <div key={k} className={cls} title={title}>
              {isYou ? 'You' : isCpu ? 'CPU' : ''}
            </div>
          )
        })}
      </div>
      <p className="skill-cast-map-legend">
        <span className="legend-swatch range" aria-hidden /> Manhattan ≤ {r} from you ·{' '}
        <span className="legend-swatch hits" aria-hidden /> anchor overlaps CPU with this pattern (start
        positions)
      </p>
    </div>
  )
}
