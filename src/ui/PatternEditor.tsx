import type { PatternOffset } from '../game/types'
import { PATTERN_GRID_RADIUS, countGridToPatternOffsets, patternOffsetsToCountGrid } from '../game/skills'

const SIZE = PATTERN_GRID_RADIUS * 2 + 1

export function PatternEditor({
  pattern,
  onChange,
  disabled,
  compact = false,
}: {
  pattern: PatternOffset[]
  onChange: (next: PatternOffset[]) => void
  disabled?: boolean
  /** Minimal chrome for loadout surface (hides long copy). */
  compact?: boolean
}) {
  const grid = patternOffsetsToCountGrid(pattern)

  function setCell(xi: number, yi: number, nextCount: number): void {
    const g = grid.map((row) => [...row])
    g[yi]![xi] = Math.max(0, nextCount)
    onChange(countGridToPatternOffsets(g))
  }

  function cycleCell(xi: number, yi: number): void {
    const cur = grid[yi]![xi]!
    const next = cur >= 9 ? 0 : cur + 1
    setCell(xi, yi, next)
  }

  return (
    <div className={`pattern-editor ${disabled ? 'disabled' : ''}${compact ? ' pattern-editor--compact' : ''}`}>
      {!compact ? (
        <p className="pattern-label">
          <strong>Shape around the cast anchor</strong> — center is where you click on the board (the anchor). Each
          filled cell costs <strong>1 loadout point</strong>. A number &gt; 1 in a cell means that tile is struck again
          (stronger hit / more stacks from that tile).
        </p>
      ) : (
        <p className="pattern-label pattern-label--compact">
          Anchor = board click · cells = loadout pts · &gt;1 = repeat strike
        </p>
      )}
      <div
        className="pattern-grid"
        style={{
          gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${SIZE}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: SIZE * SIZE }, (_, i) => {
          const xi = i % SIZE
          const yi = Math.floor(i / SIZE)
          const isCenter = xi === PATTERN_GRID_RADIUS && yi === PATTERN_GRID_RADIUS
          const n = grid[yi]![xi]!
          return (
            <button
              key={`${xi}-${yi}`}
              type="button"
              className={`pattern-cell ${isCenter ? 'center' : ''} ${n > 0 ? 'on' : ''}`}
              disabled={disabled}
              onClick={() => cycleCell(xi, yi)}
              aria-label={`offset ${xi - PATTERN_GRID_RADIUS},${yi - PATTERN_GRID_RADIUS}`}
            >
              {n > 0 ? n : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}
