import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { BattleConfig, CpuDifficulty, TeamColorSlot } from '../game/types'
import {
  balancedTeamIdsForSplit,
  buildCustomMatchSettings,
  resolveTeamColorSlotForTeamId,
  validateCustomTeamIds,
} from '../game/match-roster'
import { CPU_THINK_TIMEOUT_MS } from '../ai/cpuThinkBudget'
import { BOARD_MAX } from '../game/board'
import { randomCpuBuild } from '../game/randomCpuBuild'
import { NumberStepper } from './numeric-stepper.tsx'
import './board/holographic-board.css'
import './loadout/loadout-surface.css'

const TEAM_COLOR_SLOTS: TeamColorSlot[] = [0, 1, 2, 3, 4, 5, 6, 7]

const TEAM_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const

const FIGHTER_COUNT_MIN = 2
const FIGHTER_COUNT_MAX = 8

function clampTeamCountForFighters(teamCount: number, fighterCount: number): number {
  const maxTeams = Math.min(fighterCount, TEAM_LABELS.length)
  return Math.max(2, Math.min(teamCount, maxTeams))
}

const CPU_DIFFICULTY_OPTIONS: { value: CpuDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
  { value: 'nightmare', label: 'Nightmare' },
]

function growCpuDifficulties(prev: CpuDifficulty[], newLen: number): CpuDifficulty[] {
  if (newLen <= 0) return []
  const out = prev.slice(0, newLen)
  const seed = out.length > 0 ? out[out.length - 1]! : 'normal'
  while (out.length < newLen) out.push(seed)
  return out
}

type MatchScenarioPreset = {
  label: string
  hint: string
  fighterCount: number
  teamIds: readonly number[]
  /** When false, all CPU slots use the first tier (sidebar + roster stay in sync). */
  cpuDifficultyPerSlot: boolean
  /** One entry per CPU slot (fighterCount − 1); used as-is when per-slot, else flattened to one tier. */
  cpuDifficulties: readonly CpuDifficulty[]
  /** Empty string = auto board from level + headcount. */
  boardOverride: string
  overtimeEnabled: boolean
  roundsUntilOvertime: number
}

/** Fantasy-named presets: roster, CPU tiers (unified vs per-CPU), board, sudden death. */
const MATCH_SCENARIOS = {
  champions_circle: {
    label: "Champion's circle",
    hint: 'Sole duel: one rival, tight arena, hard CPU, no storm clock.',
    fighterCount: 2,
    teamIds: [0, 1],
    cpuDifficultyPerSlot: false,
    cpuDifficulties: ['hard'],
    boardOverride: '',
    overtimeEnabled: false,
    roundsUntilOvertime: 12,
  },
  blood_moot: {
    label: 'Blood moot (three claimants)',
    hint: 'Three-way brawl; uneven CPU minds; mid board; storm after ten rounds.',
    fighterCount: 3,
    teamIds: [0, 1, 2],
    cpuDifficultyPerSlot: true,
    cpuDifficulties: ['easy', 'hard'],
    boardOverride: '11',
    overtimeEnabled: true,
    roundsUntilOvertime: 10,
  },
  shattered_square: {
    label: 'Shattered square',
    hint: 'Four free blades, even temper; arena breathes with your level; no overtime.',
    fighterCount: 4,
    teamIds: [0, 1, 2, 3],
    cpuDifficultyPerSlot: false,
    cpuDifficulties: ['normal', 'normal', 'normal'],
    boardOverride: '',
    overtimeEnabled: false,
    roundsUntilOvertime: 12,
  },
  wailing_crossroads: {
    label: 'Wailing crossroads',
    hint: 'Five solo banners; all CPUs cruel; wide stone; closing storm.',
    fighterCount: 5,
    teamIds: [0, 1, 2, 3, 4],
    cpuDifficultyPerSlot: false,
    cpuDifficulties: ['hard', 'hard', 'hard', 'hard'],
    boardOverride: '13',
    overtimeEnabled: true,
    roundsUntilOvertime: 8,
  },
  phantom_conclave: {
    label: 'Phantom conclave',
    hint: 'Six rivals; scouts and executioners mixed; grand floor; no storm.',
    fighterCount: 6,
    teamIds: [0, 1, 2, 3, 4, 5],
    cpuDifficultyPerSlot: true,
    cpuDifficulties: ['easy', 'normal', 'normal', 'hard', 'hard'],
    boardOverride: '15',
    overtimeEnabled: false,
    roundsUntilOvertime: 12,
  },
  eclipse_tournament: {
    label: 'Eclipse tournament',
    hint: 'Seven solo fighters; steady foe line; vast ring; long fuse storm.',
    fighterCount: 7,
    teamIds: [0, 1, 2, 3, 4, 5, 6],
    cpuDifficultyPerSlot: false,
    cpuDifficulties: ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
    boardOverride: '17',
    overtimeEnabled: true,
    roundsUntilOvertime: 12,
  },
  cataclysm_melee: {
    label: 'Cataclysm melee',
    hint: 'Eight-way riot; every CPU its own weight; full span; storm hunts early.',
    fighterCount: 8,
    teamIds: [0, 1, 2, 3, 4, 5, 6, 7],
    cpuDifficultyPerSlot: true,
    cpuDifficulties: ['easy', 'normal', 'normal', 'normal', 'hard', 'hard', 'nightmare'],
    boardOverride: '19',
    overtimeEnabled: true,
    roundsUntilOvertime: 6,
  },
  gallows_duel: {
    label: 'Gallows duel',
    hint: 'You vs two henchmen; soft minds; nine cells; calm air.',
    fighterCount: 3,
    teamIds: [0, 1, 1],
    cpuDifficultyPerSlot: false,
    cpuDifficulties: ['easy', 'easy'],
    boardOverride: '9',
    overtimeEnabled: false,
    roundsUntilOvertime: 12,
  },
  faithful_bonds: {
    label: 'Faithful bonds',
    hint: 'You and one ally vs a champion; ally steady, foe sharp.',
    fighterCount: 3,
    teamIds: [0, 0, 1],
    cpuDifficultyPerSlot: true,
    cpuDifficulties: ['normal', 'hard'],
    boardOverride: '9',
    overtimeEnabled: false,
    roundsUntilOvertime: 12,
  },
  tyrant_balcony: {
    label: "Tyrant's balcony",
    hint: 'You alone vs three court mages; all harsh; storm in fourteen rounds.',
    fighterCount: 4,
    teamIds: [0, 1, 1, 1],
    cpuDifficultyPerSlot: false,
    cpuDifficulties: ['hard', 'hard', 'hard'],
    boardOverride: '11',
    overtimeEnabled: true,
    roundsUntilOvertime: 14,
  },
  last_standing: {
    label: 'Last standing',
    hint: 'Four hunters ring you; nightmare chorus; storm at ten.',
    fighterCount: 5,
    teamIds: [0, 1, 1, 1, 1],
    cpuDifficultyPerSlot: false,
    cpuDifficulties: ['nightmare', 'nightmare', 'nightmare', 'nightmare'],
    boardOverride: '13',
    overtimeEnabled: true,
    roundsUntilOvertime: 10,
  },
  seven_gallows: {
    label: 'Seven gallows',
    hint: 'You vs seven nooses; tiers climb to nightmare; storm soon.',
    fighterCount: 8,
    teamIds: [0, 1, 1, 1, 1, 1, 1, 1],
    cpuDifficultyPerSlot: true,
    cpuDifficulties: ['easy', 'normal', 'normal', 'hard', 'hard', 'nightmare', 'nightmare'],
    boardOverride: '19',
    overtimeEnabled: true,
    roundsUntilOvertime: 7,
  },
  shield_wall: {
    label: 'Shield wall',
    hint: 'Two shields vs two spears; fair wind; open ground.',
    fighterCount: 4,
    teamIds: [0, 0, 1, 1],
    cpuDifficultyPerSlot: false,
    cpuDifficulties: ['normal', 'normal', 'normal'],
    boardOverride: '',
    overtimeEnabled: false,
    roundsUntilOvertime: 12,
  },
  broken_spear: {
    label: 'Broken spear cohort',
    hint: 'Pair vs trio; all CPUs grim; eleven paces.',
    fighterCount: 5,
    teamIds: [0, 0, 1, 1, 1],
    cpuDifficultyPerSlot: false,
    cpuDifficulties: ['hard', 'hard', 'hard', 'hard'],
    boardOverride: '11',
    overtimeEnabled: false,
    roundsUntilOvertime: 12,
  },
  cinder_cartel: {
    label: 'Cinder cartel',
    hint: 'Three vs two; mixed CPU tempers; ember floor.',
    fighterCount: 5,
    teamIds: [0, 0, 0, 1, 1],
    cpuDifficultyPerSlot: true,
    cpuDifficulties: ['easy', 'normal', 'normal', 'hard'],
    boardOverride: '11',
    overtimeEnabled: false,
    roundsUntilOvertime: 12,
  },
  war_bond: {
    label: 'War bond',
    hint: 'Triads clash; even odds; storm after twelve.',
    fighterCount: 6,
    teamIds: [0, 0, 0, 1, 1, 1],
    cpuDifficultyPerSlot: false,
    cpuDifficulties: ['normal', 'normal', 'normal', 'normal', 'normal'],
    boardOverride: '13',
    overtimeEnabled: true,
    roundsUntilOvertime: 12,
  },
  triple_seal: {
    label: 'Triple seal',
    hint: 'Three pairs; each CPU its own omen; wide ground.',
    fighterCount: 6,
    teamIds: [0, 0, 1, 1, 2, 2],
    cpuDifficultyPerSlot: true,
    cpuDifficulties: ['easy', 'normal', 'hard', 'normal', 'hard'],
    boardOverride: '15',
    overtimeEnabled: false,
    roundsUntilOvertime: 12,
  },
  iron_fist: {
    label: 'Iron fist line',
    hint: 'Four rank against two; unified steel mind; long march board.',
    fighterCount: 6,
    teamIds: [0, 0, 0, 0, 1, 1],
    cpuDifficultyPerSlot: false,
    cpuDifficulties: ['normal', 'normal', 'normal', 'normal', 'normal'],
    boardOverride: '15',
    overtimeEnabled: false,
    roundsUntilOvertime: 12,
  },
  crimson_pact: {
    label: 'Crimson pact',
    hint: 'Two oathbound vs four reavers; hard line; storm at nine.',
    fighterCount: 6,
    teamIds: [0, 0, 1, 1, 1, 1],
    cpuDifficultyPerSlot: false,
    cpuDifficulties: ['hard', 'hard', 'hard', 'hard', 'hard'],
    boardOverride: '15',
    overtimeEnabled: true,
    roundsUntilOvertime: 9,
  },
  octagon_war: {
    label: 'Octagon war',
    hint: 'Four on four; hard across the board; storm at eight.',
    fighterCount: 8,
    teamIds: [0, 0, 0, 0, 1, 1, 1, 1],
    cpuDifficultyPerSlot: false,
    cpuDifficulties: ['hard', 'hard', 'hard', 'hard', 'hard', 'hard', 'hard'],
    boardOverride: '17',
    overtimeEnabled: true,
    roundsUntilOvertime: 8,
  },
  fours_fray: {
    label: "Four houses' fray",
    hint: 'Four duos; every CPU a different weight; full map; early storm.',
    fighterCount: 8,
    teamIds: [0, 0, 1, 1, 2, 2, 3, 3],
    cpuDifficultyPerSlot: true,
    cpuDifficulties: ['easy', 'normal', 'hard', 'normal', 'hard', 'nightmare', 'normal'],
    boardOverride: '19',
    overtimeEnabled: true,
    roundsUntilOvertime: 6,
  },
} as const satisfies Record<string, MatchScenarioPreset>

type TemplateId = keyof typeof MATCH_SCENARIOS

const TEMPLATE_GROUPS: { heading: string; ids: TemplateId[] }[] = [
  {
    heading: 'The wilds',
    ids: [
      'blood_moot',
      'shattered_square',
      'wailing_crossroads',
      'phantom_conclave',
      'eclipse_tournament',
      'cataclysm_melee',
    ],
  },
  {
    heading: 'Oaths & trials',
    ids: [
      'champions_circle',
      'gallows_duel',
      'faithful_bonds',
      'tyrant_balcony',
      'last_standing',
      'seven_gallows',
    ],
  },
  {
    heading: 'War bands',
    ids: [
      'shield_wall',
      'broken_spear',
      'cinder_cartel',
      'war_bond',
      'triple_seal',
      'iron_fist',
      'crimson_pact',
      'octagon_war',
      'fours_fray',
    ],
  },
]

export type MatchDraft = {
  level: number
  playerLoadout: BattleConfig['playerLoadout']
  playerTraits: BattleConfig['playerTraits']
}

export type MatchSetupFormHandle = {
  tryConfirm: () => BattleConfig | null
}

export type MatchSetupFormProps = {
  draft: MatchDraft
  /** Fired when team validation changes (avoids stale ref reads for footer UI). */
  onValidityChange?: (v: { canStart: boolean; teamError: string | null }) => void
}

export const MatchSetupForm = forwardRef<MatchSetupFormHandle, MatchSetupFormProps>(
  function MatchSetupForm({ draft, onValidityChange }, ref) {
    const [cpuDifficulties, setCpuDifficulties] = useState<CpuDifficulty[]>(['normal'])
    /** When false, one control sets every CPU to the same tier. */
    const [cpuDifficultyPerSlot, setCpuDifficultyPerSlot] = useState(false)
    const [boardOverride, setBoardOverride] = useState<string>('')
    const [fighterCount, setFighterCount] = useState<number>(2)
    /** How many team letters (A…) are available in the roster; drives Teams dropdown and caps team picks. */
    const [teamPartitionCount, setTeamPartitionCount] = useState(2)
    const [teamIds, setTeamIds] = useState<number[]>(() => [...MATCH_SCENARIOS.champions_circle.teamIds])
    /** Per-team palette slot overrides; empty means default `clamp(teamId, 0, 7)`. */
    const [teamColorSlotByTeamId, setTeamColorSlotByTeamId] = useState<
      Partial<Record<number, TeamColorSlot>>
    >({})
    /** Which template matches current fields; empty after manual edits. */
    const [activeTemplate, setActiveTemplate] = useState<TemplateId | ''>('champions_circle')
    const [overtimeEnabled, setOvertimeEnabled] = useState(false)
    const [roundsUntilOvertime, setRoundsUntilOvertime] = useState(12)

    const onValidityChangeRef = useRef(onValidityChange)
    onValidityChangeRef.current = onValidityChange

    const boardSizeParsed = useMemo(() => {
      const t = boardOverride.trim()
      if (!t) return undefined
      const n = Number(t)
      if (!Number.isFinite(n)) return undefined
      return Math.min(BOARD_MAX, Math.max(7, Math.round(n)))
    }, [boardOverride])

    const customTeamError = useMemo(() => validateCustomTeamIds(teamIds), [teamIds])

    useEffect(() => {
      onValidityChangeRef.current?.({
        canStart: customTeamError === null,
        teamError: customTeamError,
      })
    }, [customTeamError])

    const distinctTeamIds = useMemo(() => Array.from(new Set(teamIds)).sort((a, b) => a - b), [teamIds])

    /** Resolved palette slot per team (defaults + overrides), for exclusive picking. */
    const resolvedColorByTeamId = useMemo(() => {
      const rec: Partial<Record<number, TeamColorSlot>> = {}
      for (const t of distinctTeamIds) {
        rec[t] = resolveTeamColorSlotForTeamId(t, teamColorSlotByTeamId)
      }
      return rec
    }, [distinctTeamIds, teamColorSlotByTeamId])

    const nCpu = fighterCount - 1

    const maxTeamOptions = Math.min(fighterCount, TEAM_LABELS.length)
    const rosterTeamIndexMax = teamPartitionCount - 1

    const useUnifiedCpuDifficultyUi = nCpu <= 1 || !cpuDifficultyPerSlot

    const hasNightmareSelected = useMemo(() => {
      if (!useUnifiedCpuDifficultyUi) return cpuDifficulties.some((d) => d === 'nightmare')
      return (cpuDifficulties[0] ?? 'normal') === 'nightmare'
    }, [useUnifiedCpuDifficultyUi, cpuDifficulties])

    function applyTemplate(id: TemplateId) {
      const s = MATCH_SCENARIOS[id]
      const nCpu = s.fighterCount - 1
      let diffs = [...s.cpuDifficulties]
      if (diffs.length < nCpu) {
        diffs = growCpuDifficulties(diffs.length > 0 ? diffs : ['normal'], nCpu)
      } else if (diffs.length > nCpu) {
        diffs = diffs.slice(0, nCpu)
      }
      if (!s.cpuDifficultyPerSlot && nCpu > 0) {
        const v = diffs[0] ?? 'normal'
        diffs = Array.from({ length: nCpu }, () => v)
      }
      setFighterCount(s.fighterCount)
      setTeamIds([...s.teamIds])
      setTeamPartitionCount(new Set(s.teamIds).size)
      setCpuDifficultyPerSlot(nCpu > 1 && s.cpuDifficultyPerSlot)
      setCpuDifficulties(diffs)
      setBoardOverride(s.boardOverride)
      setOvertimeEnabled(s.overtimeEnabled)
      setRoundsUntilOvertime(s.roundsUntilOvertime)
      setTeamColorSlotByTeamId({})
      setActiveTemplate(id)
    }

    function markCustomized() {
      setActiveTemplate('')
    }

    const buildConfig = useCallback((): BattleConfig | null => {
      const level = draft.level
      const err = validateCustomTeamIds(teamIds)
      if (err) return null
      const cpuBuilds = []
      const nCpuLocal = teamIds.length - 1
      const diffs =
        cpuDifficulties.length === nCpuLocal
          ? cpuDifficulties
          : growCpuDifficulties(cpuDifficulties, nCpuLocal)
      for (let i = 0; i < nCpuLocal; i++) {
        const b = randomCpuBuild(level, diffs[i] ?? 'normal')
        cpuBuilds.push({ loadout: b.cpuLoadout, traits: b.cpuTraits })
      }
      const colorKeys = Object.keys(teamColorSlotByTeamId)
      const match = buildCustomMatchSettings({
        humanLoadout: draft.playerLoadout,
        humanTraits: draft.playerTraits,
        cpuBuilds,
        teamIds,
        boardSize: boardSizeParsed,
        defaultCpuDifficulty: diffs[0] ?? 'normal',
        cpuDifficulties: diffs,
        teamColorSlotByTeamId: colorKeys.length > 0 ? teamColorSlotByTeamId : undefined,
        overtimeEnabled,
        ...(overtimeEnabled
          ? {
              roundsUntilOvertime: Math.max(1, Math.min(99, Math.round(roundsUntilOvertime))),
            }
          : {}),
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
    }, [
      draft.level,
      draft.playerLoadout,
      draft.playerTraits,
      teamIds,
      cpuDifficulties,
      teamColorSlotByTeamId,
      boardSizeParsed,
      overtimeEnabled,
      roundsUntilOvertime,
    ])

    useImperativeHandle(
      ref,
      () => ({
        tryConfirm: () => buildConfig(),
      }),
      [buildConfig],
    )

    return (
      <div className="ls-match-layout">
        <aside className="ls-match-side" aria-label="Match presets and CPU defaults">
          <label className="ls-field ls-field--templates">
            <span>Scenario</span>
            <select
              className="ls-select"
              value={activeTemplate}
              onChange={(e) => {
                const id = e.target.value as TemplateId | ''
                if (id === '') {
                  setActiveTemplate('')
                  return
                }
                applyTemplate(id)
              }}
              aria-label="Match scenario template"
            >
              <option value="">Custom (current)</option>
              {TEMPLATE_GROUPS.map((g) => (
                <optgroup key={g.heading} label={g.heading}>
                  {g.ids.map((id) => {
                    const s = MATCH_SCENARIOS[id]
                    return (
                      <option key={id} value={id} title={s.hint}>
                        {s.label}
                      </option>
                    )
                  })}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="ls-field">
            <span>Fighters</span>
            <select
              className="ls-select"
              value={String(fighterCount)}
              onChange={(e) => {
                const c = Number(e.target.value)
                const nextTeamCount = clampTeamCountForFighters(teamPartitionCount, c)
                setFighterCount(c)
                setTeamPartitionCount(nextTeamCount)
                setTeamIds(balancedTeamIdsForSplit(c, nextTeamCount))
                setCpuDifficulties((prev) => growCpuDifficulties(prev, c - 1))
                setTeamColorSlotByTeamId({})
                markCustomized()
              }}
              aria-label="Number of fighters"
            >
              {Array.from({ length: FIGHTER_COUNT_MAX - FIGHTER_COUNT_MIN + 1 }, (_, i) => {
                const n = FIGHTER_COUNT_MIN + i
                return (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                )
              })}
            </select>
          </label>

          <label className="ls-field">
            <span>Teams</span>
            <select
              className="ls-select"
              value={String(teamPartitionCount)}
              onChange={(e) => {
                const t = Number(e.target.value)
                setTeamPartitionCount(t)
                setTeamIds(balancedTeamIdsForSplit(fighterCount, t))
                setTeamColorSlotByTeamId({})
                markCustomized()
              }}
              aria-label="Number of teams"
            >
              {Array.from({ length: maxTeamOptions - 2 + 1 }, (_, i) => {
                const n = 2 + i
                return (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                )
              })}
            </select>
          </label>

          <div className="ls-field" aria-label="CPU difficulty">
            <span>CPU difficulty</span>
            {useUnifiedCpuDifficultyUi ? (
              <select
                className="ls-select"
                value={cpuDifficulties[0] ?? 'normal'}
                onChange={(e) => {
                  const v = e.target.value as CpuDifficulty
                  setCpuDifficulties(Array.from({ length: Math.max(0, nCpu) }, () => v))
                }}
                aria-label="CPU difficulty for all computer fighters"
              >
                {CPU_DIFFICULTY_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="ls-custom-hint">Set each CPU tier in the roster.</p>
            )}
            {nCpu > 1 ? (
              <button
                type="button"
                className="ls-btn-ghost"
                onClick={() => {
                  if (cpuDifficultyPerSlot) {
                    setCpuDifficulties((prev) =>
                      Array.from({ length: nCpu }, () => prev[0] ?? 'normal'),
                    )
                    setCpuDifficultyPerSlot(false)
                  } else {
                    setCpuDifficultyPerSlot(true)
                  }
                }}
              >
                {cpuDifficultyPerSlot ? 'One difficulty for all CPUs' : 'Set per CPU…'}
              </button>
            ) : null}
          </div>

          {hasNightmareSelected ? (
            <p className="ls-modal__note" role="status">
              Nightmare is CPU-heavy; turns can run up to {CPU_THINK_TIMEOUT_MS / 1000}s each, then fall back to a quick
              move.
            </p>
          ) : null}
        </aside>

        <section
          className="ls-match-roster"
          aria-label="Roster and team colors"
          title="Same team letter = allies. At least two different teams required."
        >
          <div className="ls-field ls-match-roster-field">
            <span>Roster</span>
            <p className="ls-custom-hint ls-match-roster-hint">
              Same team letter = allies. At least two different teams required.
            </p>
            <div className="ls-match-roster-grid">
              {teamIds.map((tid, slot) => (
                <div key={slot} className="ls-match-slot-row">
                  <span className="ls-match-slot-label">{slot === 0 ? 'You' : `CPU ${slot}`}</span>
                  <select
                    className="ls-select ls-match-slot-team"
                    value={String(Math.min(rosterTeamIndexMax, Math.max(0, tid)))}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      markCustomized()
                      const copy = [...teamIds]
                      copy[slot] = next
                      setTeamIds(copy)
                    }}
                    aria-label={slot === 0 ? 'Your team' : `CPU ${slot} team`}
                  >
                    {Array.from({ length: teamPartitionCount }, (_, teamIndex) => {
                      const label = TEAM_LABELS[teamIndex] ?? String(teamIndex)
                      return (
                        <option key={teamIndex} value={String(teamIndex)}>
                          Team {label}
                        </option>
                      )
                    })}
                  </select>
                  {slot === 0 ? (
                    <select
                      className="ls-select ls-match-slot-diff"
                      disabled
                      value="—"
                      aria-label="CPU difficulty does not apply to you"
                      title="Human fighter — no CPU tier"
                    >
                      <option value="—">—</option>
                    </select>
                  ) : (
                    <select
                      className="ls-select ls-match-slot-diff"
                      disabled={useUnifiedCpuDifficultyUi}
                      value={cpuDifficulties[slot - 1] ?? 'normal'}
                      onChange={(e) => {
                        const v = e.target.value as CpuDifficulty
                        setCpuDifficulties((prev) => {
                          const next = [...prev]
                          next[slot - 1] = v
                          return next
                        })
                      }}
                      aria-label={`CPU ${slot} difficulty`}
                      title={
                        useUnifiedCpuDifficultyUi
                          ? 'Same difficulty for all CPUs — change it under CPU difficulty in the left column'
                          : undefined
                      }
                    >
                      {CPU_DIFFICULTY_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
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
              Tokens and HUD palette; defaults follow team index. Each color once across teams.
            </p>
            {distinctTeamIds.map((tid) => {
              const label = TEAM_LABELS[tid] ?? String(tid)
              return (
                <div key={tid} className="ls-team-color-row">
                  <span className="ls-team-color-label">Team {label}</span>
                  <div
                    className="ls-team-color-swatches"
                    role="radiogroup"
                    aria-label={`Color for team ${label}`}
                  >
                    {TEAM_COLOR_SLOTS.map((colorSlot) => {
                      const selected = resolvedColorByTeamId[tid] === colorSlot
                      const takenByOther = distinctTeamIds.some(
                        (oth) => oth !== tid && resolvedColorByTeamId[oth] === colorSlot,
                      )
                      const disabled = takenByOther && !selected
                      return (
                        <button
                          key={colorSlot}
                          type="button"
                          className={`ls-team-swatch${selected ? ' is-selected' : ''}`}
                          role="radio"
                          aria-checked={selected}
                          disabled={disabled}
                          title={
                            disabled
                              ? `Color taken by another team (slot ${colorSlot})`
                              : `Color slot ${colorSlot}`
                          }
                          onClick={() => {
                            setTeamColorSlotByTeamId((prev) => ({ ...prev, [tid]: colorSlot }))
                            markCustomized()
                          }}
                        >
                          <span
                            className={`holo-piece holo-piece--t${colorSlot} ls-team-swatch__disc`}
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
        </section>

        <aside className="ls-match-rail" aria-label="More match options">
          <p className="ls-rail__title">More options</p>
          <div className="ls-match-rail__fields">
            <label className="ls-field">
              <span>Board size (odd 7–19, empty = auto)</span>
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

            <div className="ls-field" aria-label="Sudden death overtime">
              <span>Sudden death</span>
              <label className="ls-field ls-field--inline">
                <span>
                  <input
                    type="checkbox"
                    checked={overtimeEnabled}
                    onChange={(e) => setOvertimeEnabled(e.target.checked)}
                    aria-label="Enable sudden death overtime"
                  />
                  Storm shrinks the board after N full rounds (everyone acts once per round).
                </span>
              </label>
              {overtimeEnabled ? (
                <label className="ls-field ls-field--overtime-rounds">
                  <span>Rounds until sudden death</span>
                  <NumberStepper
                    variant="field"
                    min={1}
                    max={99}
                    value={roundsUntilOvertime}
                    onValueChange={(v) => setRoundsUntilOvertime(Math.max(1, Math.min(99, Math.round(v))))}
                    aria-label="Full rounds before sudden death begins"
                  />
                </label>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    )
  },
)
