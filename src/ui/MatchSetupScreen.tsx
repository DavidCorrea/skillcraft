import { useMemo, useState } from 'react'
import type { BattleConfig, CpuDifficulty } from '../game/types'
import {
  buildCustomMatchSettings,
  teamIdsHaveMultiMemberTeam,
  validateCustomTeamIds,
} from '../game/match-roster'
import { randomCpuBuild } from '../game/randomCpuBuild'
import { GameGuide } from './help/GameGuide'
import './loadout/loadout-surface.css'

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
    friendlyFire: false,
  },
  ffa: {
    chip: 'FFA',
    hint: 'Four fighters, everyone solo',
    fighterCount: 4 as const,
    teamIds: [0, 1, 2, 3],
    friendlyFire: false,
  },
  '1v3': {
    chip: '1v3',
    hint: 'You vs three CPUs on one team',
    fighterCount: 4 as const,
    teamIds: [0, 1, 1, 1],
    friendlyFire: false,
  },
  '2v2': {
    chip: '2v2',
    hint: 'Two vs two',
    fighterCount: 4 as const,
    teamIds: [0, 0, 1, 1],
    friendlyFire: false,
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
  const [friendlyFire, setFriendlyFire] = useState(false)
  const [boardOverride, setBoardOverride] = useState<string>('')
  const [fighterCount, setFighterCount] = useState<2 | 3 | 4>(2)
  const [teamIds, setTeamIds] = useState<number[]>(() => [...MATCH_TEMPLATES.duel.teamIds])
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

  const showFriendlyFire = teamIdsHaveMultiMemberTeam(teamIds)

  function applyTemplate(id: TemplateId) {
    const t = MATCH_TEMPLATES[id]
    setFighterCount(t.fighterCount)
    setTeamIds([...t.teamIds])
    setFriendlyFire(t.friendlyFire)
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
    const match = buildCustomMatchSettings({
      humanLoadout: draft.playerLoadout,
      humanTraits: draft.playerTraits,
      cpuBuilds,
      teamIds,
      friendlyFire,
      boardSize: boardSizeParsed,
      defaultCpuDifficulty: difficulty,
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
                  Templates apply a preset layout; you can change fighter count or teams afterward. Friendly fire is
                  available when a team has more than one fighter.
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

        {showFriendlyFire ? (
          <label className="ls-field ls-field--inline">
            <span>
              <input
                type="checkbox"
                checked={friendlyFire}
                onChange={(e) => setFriendlyFire(e.target.checked)}
              />
              Friendly fire — teammates can hurt teammates
            </span>
          </label>
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
