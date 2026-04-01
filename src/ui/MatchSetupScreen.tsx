import { useMemo, useState } from 'react'
import type { BattleConfig, CpuDifficulty, TeamColorSlot } from '../game/types'
import {
  buildCustomMatchSettings,
  resolveTeamColorSlotForTeamId,
  validateCustomTeamIds,
} from '../game/match-roster'
import { CPU_THINK_TIMEOUT_MS } from '../ai/cpuThinkBudget'
import { randomCpuBuild } from '../game/randomCpuBuild'
import { GameGuide } from './help/GameGuide'
import './board/holographic-board.css'
import './loadout/loadout-surface.css'

const TEAM_COLOR_SLOTS: TeamColorSlot[] = [0, 1, 2, 3, 4, 5, 6, 7]

function defaultTeamIdsForCount(count: 2 | 3 | 4): number[] {
  if (count === 2) return [0, 1]
  if (count === 3) return [0, 0, 1]
  return [0, 0, 1, 2]
}

const TEAM_LABELS = ['A', 'B', 'C', 'D'] as const

/** Named layouts; same roster semantics as the former preset modes. */
const MATCH_TEMPLATES = {
  duel: {
    chip: '1v1',
    hint: 'You vs one CPU',
    fighterCount: 2 as const,
    teamIds: [0, 1],
  },
  ffa: {
    chip: 'FFA',
    hint: 'Four fighters, everyone solo',
    fighterCount: 4 as const,
    teamIds: [0, 1, 2, 3],
  },
  '1v3': {
    chip: '1v3',
    hint: 'You vs three CPUs on one team',
    fighterCount: 4 as const,
    teamIds: [0, 1, 1, 1],
  },
  '2v2': {
    chip: '2v2',
    hint: 'Two vs two',
    fighterCount: 4 as const,
    teamIds: [0, 0, 1, 1],
  },
} as const

type TemplateId = keyof typeof MATCH_TEMPLATES

export type MatchDraft = {
  level: number
  playerLoadout: BattleConfig['playerLoadout']
  playerTraits: BattleConfig['playerTraits']
}

export function MatchSetupScreen({
  draft,
  onConfirm,
  onBack,
}: {
  draft: MatchDraft
  onConfirm: (config: BattleConfig) => void
  onBack: () => void
}) {
  const [difficulty, setDifficulty] = useState<CpuDifficulty>('normal')
  const [boardOverride, setBoardOverride] = useState<string>('')
  const [fighterCount, setFighterCount] = useState<2 | 3 | 4>(2)
  const [teamIds, setTeamIds] = useState<number[]>(() => [...MATCH_TEMPLATES.duel.teamIds])
  /** Per-team palette slot overrides; empty means default `clamp(teamId, 0, 7)`. */
  const [teamColorSlotByTeamId, setTeamColorSlotByTeamId] = useState<
    Partial<Record<number, TeamColorSlot>>
  >({})
  /** Which template matches current fields; empty after manual edits. */
  const [activeTemplate, setActiveTemplate] = useState<TemplateId | ''>('duel')

  const boardSizeParsed = useMemo(() => {
    const t = boardOverride.trim()
    if (!t) return undefined
    const n = Number(t)
    if (!Number.isFinite(n)) return undefined
    return Math.min(15, Math.max(7, Math.round(n)))
  }, [boardOverride])

  const customTeamError = useMemo(() => validateCustomTeamIds(teamIds), [teamIds])

  const distinctTeamIds = useMemo(() => Array.from(new Set(teamIds)).sort((a, b) => a - b), [teamIds])

  /** Resolved palette slot per team (defaults + overrides), for exclusive picking. */
  const resolvedColorByTeamId = useMemo(() => {
    const rec: Partial<Record<number, TeamColorSlot>> = {}
    for (const t of distinctTeamIds) {
      rec[t] = resolveTeamColorSlotForTeamId(t, teamColorSlotByTeamId)
    }
    return rec
  }, [distinctTeamIds, teamColorSlotByTeamId])

  function applyTemplate(id: TemplateId) {
    const t = MATCH_TEMPLATES[id]
    setFighterCount(t.fighterCount)
    setTeamIds([...t.teamIds])
    setTeamColorSlotByTeamId({})
    setActiveTemplate(id)
  }

  function markCustomized() {
    setActiveTemplate('')
  }

  function buildConfig(): BattleConfig {
    const level = draft.level
    const err = validateCustomTeamIds(teamIds)
    if (err) throw new Error(err)
    const cpuBuilds = []
    for (let i = 0; i < teamIds.length - 1; i++) {
      const b = randomCpuBuild(level)
      cpuBuilds.push({ loadout: b.cpuLoadout, traits: b.cpuTraits })
    }
    const colorKeys = Object.keys(teamColorSlotByTeamId)
    const match = buildCustomMatchSettings({
      humanLoadout: draft.playerLoadout,
      humanTraits: draft.playerTraits,
      cpuBuilds,
      teamIds,
      boardSize: boardSizeParsed,
      defaultCpuDifficulty: difficulty,
      teamColorSlotByTeamId: colorKeys.length > 0 ? teamColorSlotByTeamId : undefined,
    })
    const first = cpuBuilds[0]!
    return {
      level,
      playerLoadout: draft.playerLoadout,
      playerTraits: draft.playerTraits,
      cpuLoadout: first.loadout,
      cpuTraits: first.traits,
      match,
    }
  }

  return (
    <div className="loadout-surface match-setup">
      <header className="ls-match-head">
        <div>
          <h1 className="ls-title">Match setup</h1>
          <p className="ls-sub">
            Set teams per fighter, or apply a template and tweak. CPUs roll random loadouts at start.
          </p>
        </div>
        <div className="ls-match-head__aside">
          <span className="ls-match-meta">LV {draft.level}</span>
          <GameGuide
            contextContent={
              <>
                <p className="ls-modal__note">
                  Assign each fighter slot to a team letter. Same letter means allies; you need at least two different
                  teams. CPUs get random loadouts when the battle starts.
                </p>
                <p className="ls-modal__note">
                  Templates apply a preset layout; you can change fighter count or teams afterward. When any team has
                  more than one fighter, friendly fire applies — skills and Strikes can hit allies.
                </p>
                <p className="ls-modal__note">
                  <strong>CPU difficulty</strong> applies to computer fighters. Non-Easy levels use lookahead search:
                  deeper in <strong>1v1</strong> than with <strong>three or more fighters</strong> (branching is higher
                  in big matches). Nightmare &gt; Hard &gt; Normal; Easy sometimes picks among legal moves at random.
                </p>
              </>
            }
          />
        </div>
      </header>

      <div className="ls-main">
        <div className="ls-field ls-field--templates">
          <span>Templates</span>
          <p className="ls-custom-hint">Apply a preset, then edit teams or fighter count below.</p>
          <div className="ls-template-chips" role="group" aria-label="Match templates">
            {(Object.keys(MATCH_TEMPLATES) as TemplateId[]).map((id) => {
              const t = MATCH_TEMPLATES[id]
              return (
                <button
                  key={id}
                  type="button"
                  title={t.hint}
                  className={`ls-template-chip${activeTemplate === id ? ' is-active' : ''}`}
                  onClick={() => applyTemplate(id)}
                >
                  {t.chip}
                </button>
              )
            })}
          </div>
        </div>

        <label className="ls-field">
          <span>Fighters</span>
          <select
            className="ls-select"
            value={String(fighterCount)}
            onChange={(e) => {
              const c = Number(e.target.value) as 2 | 3 | 4
              setFighterCount(c)
              setTeamIds(defaultTeamIdsForCount(c))
              setTeamColorSlotByTeamId({})
              markCustomized()
            }}
            aria-label="Number of fighters"
          >
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </label>

        <div className="ls-field ls-custom-teams" aria-label="Team per fighter">
          <span>Team per fighter</span>
          <p className="ls-custom-hint">
            Same team letter = allies. At least two different teams required.
          </p>
          <div className="ls-custom-slots">
            {teamIds.map((tid, slot) => (
              <label key={slot} className="ls-field ls-field--row">
                <span className="ls-custom-slot-label">
                  {slot === 0 ? 'You' : `CPU ${slot}`}
                </span>
                <select
                  className="ls-select"
                  value={String(Math.min(3, Math.max(0, tid)))}
                  onChange={(e) => {
                    const next = Number(e.target.value)
                    markCustomized()
                    setTeamIds((prev) => {
                      const copy = [...prev]
                      copy[slot] = next
                      return copy
                    })
                  }}
                  aria-label={slot === 0 ? 'Your team' : `CPU ${slot} team`}
                >
                  {TEAM_LABELS.map((label, teamIndex) => (
                    <option key={teamIndex} value={String(teamIndex)}>
                      Team {label} ({teamIndex})
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {customTeamError ? (
            <p className="ls-custom-err" role="alert">
              {customTeamError}
            </p>
          ) : null}
        </div>

        <div className="ls-field ls-field--team-colors" aria-label="Team colors">
          <span>Team colors</span>
          <p className="ls-custom-hint">
            Palette for board tokens and the battle HUD. Defaults match team number. Each color can only be assigned to
            one team.
          </p>
          {distinctTeamIds.map((tid) => {
            const label = TEAM_LABELS[tid] ?? String(tid)
            return (
              <div key={tid} className="ls-team-color-row">
                <span className="ls-team-color-label">
                  Team {label} ({tid})
                </span>
                <div
                  className="ls-team-color-swatches"
                  role="radiogroup"
                  aria-label={`Color for team ${tid}`}
                >
                  {TEAM_COLOR_SLOTS.map((slot) => {
                    const selected = resolvedColorByTeamId[tid] === slot
                    const takenByOther = distinctTeamIds.some(
                      (oth) => oth !== tid && resolvedColorByTeamId[oth] === slot,
                    )
                    const disabled = takenByOther && !selected
                    return (
                      <button
                        key={slot}
                        type="button"
                        className={`ls-team-swatch${selected ? ' is-selected' : ''}`}
                        role="radio"
                        aria-checked={selected}
                        disabled={disabled}
                        title={
                          disabled
                            ? `Color taken by another team (slot ${slot})`
                            : `Color slot ${slot}`
                        }
                        onClick={() => {
                          setTeamColorSlotByTeamId((prev) => ({ ...prev, [tid]: slot }))
                          markCustomized()
                        }}
                      >
                        <span
                          className={`holo-piece holo-piece--t${slot} ls-team-swatch__disc`}
                          aria-hidden
                        />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <label className="ls-field">
          <span>CPU difficulty</span>
          <select
            className="ls-select"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as CpuDifficulty)}
            aria-label="CPU difficulty"
          >
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="hard">Hard</option>
            <option value="nightmare">Nightmare</option>
          </select>
        </label>

        {difficulty === 'nightmare' ? (
          <p className="ls-modal__note" role="status">
            Nightmare uses very deep lookahead — CPU turns can take a long time and stress your machine. Expect up to{' '}
            {CPU_THINK_TIMEOUT_MS / 1000} seconds per CPU turn (search is capped there; after that, the CPU falls back to
            a quick move).
          </p>
        ) : null}

        <label className="ls-field">
          <span>Board size (optional, odd 7–15; empty = auto)</span>
          <input
            className="ls-input"
            type="text"
            inputMode="numeric"
            placeholder="Auto"
            value={boardOverride}
            onChange={(e) => setBoardOverride(e.target.value)}
            aria-label="Board size override"
          />
        </label>
      </div>

      <footer className="ls-foot ls-foot--end">
        <div className="ls-foot__actions">
          <button type="button" className="ls-btn-ghost" onClick={onBack}>
            Back
          </button>
          <button
            type="button"
            className="ls-btn-primary"
            disabled={customTeamError !== null}
            onClick={() => {
              if (validateCustomTeamIds(teamIds)) return
              onConfirm(buildConfig())
            }}
          >
            Start battle
          </button>
        </div>
      </footer>
    </div>
  )
}
