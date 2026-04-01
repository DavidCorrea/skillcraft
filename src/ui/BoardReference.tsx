import { BOARD_SIZE, coordKey, spawnNorth, spawnSouth } from '../game/board'

/**
 * Reference grid: where you spawn (south) vs CPU (north). Patterns in the editor are
 * anchored on the cell you click when casting, not on your position.
 */
export function BoardReference({ boardSize = BOARD_SIZE }: { boardSize?: number }) {
  const you = spawnSouth(boardSize)
  const cpu = spawnNorth(boardSize)
  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      cells.push({ x, y })
    }
  }

  return (
    <div className="board-reference">
      <p className="board-reference-title">Battle board (where you stand)</p>
      <div
        className="board-reference-grid"
        style={{ gridTemplateColumns: `repeat(${boardSize}, 1fr)` }}
      >
        {cells.map((c) => {
          const k = coordKey(c)
          const isYou = coordKey(you) === k
          const isCpu = coordKey(cpu) === k
          let cls = 'board-reference-cell'
          if (isYou) cls += ' ref-you'
          if (isCpu) cls += ' ref-cpu'
          return (
            <div key={k} className={cls} title={`${c.x},${c.y}`}>
              {isYou ? 'You' : isCpu ? 'CPU' : ''}
            </div>
          )
        })}
      </div>
      <p className="board-reference-note">
        Skill patterns are drawn from the <strong>cast target</strong> cell you click in battle (center
        of the pattern editor = that cell). Range is measured from your current position to the target.
        Each skill below includes a map: <strong>You</strong> / <strong>CPU</strong> at start, cells you can
        use as anchors, and which anchors hit the CPU with your current pattern. Elements include fire, ice,
        water, electric, poison, wind, earth, and arcane.
      </p>
    </div>
  )
}
