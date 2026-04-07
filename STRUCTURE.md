# Codebase structure

## Entry points

- `index.html` → `src/main.tsx` → `src/App.tsx`
- `App.tsx` switches screens: loadout → match setup → battle (`BattleScreen`).
- Global styles: `src/index.css`, `src/App.css`

## Top-level directories

| Path | Role |
|------|------|
| `src/game/` | Simulation: state, rules, skills, board, traits, reactions, match roster normalization |
| `src/ai/` | CPU opponent: heuristics / search, optional Web Worker offload |
| `src/ui/` | React screens, board, battle chrome, loadout/help subviews |

## Game layer (`src/game/`)

| File | Notes |
|------|--------|
| `types.ts` | Shared types: `GameState`, `ActorState`, `SkillLoadoutEntry`, `TraitPoints`, `MatchSettings`, `BattleConfig` |
| `engine.ts` | `GameAction`, `applyAction`, `allLegalActions`, turn flow, win checks, combat resolution, sudden-death boundaries |
| `overtime.ts` | Sudden death: storm geometry, Chebyshev lethal check, damage scaling, activation roll |
| `skills.ts` | Skill definitions, patterns, mana/damage/status helpers |
| `traits.ts` | Trait scaling, Strike damage, stamina, defenses |
| `board.ts` | Grid size, coords, spawn positions, Manhattan distance, targeting helpers |
| `match-roster.ts` | `normalizeBattleConfig`, legacy presets → roster |
| `reactions.ts` | Status interactions when tags are applied |
| `elements.ts` | Element typing for skills |
| `actor-label.ts` | Log/display names |
| `status-reference.ts` | Status / reaction reference strings for UI and logs |
| `trait-reference.ts` | Trait copy for UI reference |
| `preset-builds.ts` | Named preset loadouts |
| `randomCpuBuild.ts` | Random CPU loadouts for tests or presets |
| `balance-sim.ts` | Headless CPU-vs-CPU duels (`simulateDuelCpuVsCpu`) and Monte Carlo aggregates for balance sampling |
| `test-fixtures.ts` | Shared test builders |

## AI layer (`src/ai/`)

| File | Notes |
|------|--------|
| `cpu.ts` | `pickCpuAction` and core CPU decision logic |
| `cpu.worker.ts` | Web Worker entry for heavy search off the main thread |
| `cpuWorkerProtocol.ts` | Serialized messages between UI/main thread and worker |
| `requestCpuPick.ts` | Async CPU pick orchestration (worker vs sync path) |
| `cpuThinkBudget.ts` | Thinking time / budget helpers |
| `cpuPositionHash.ts` | Position hashing for transposition-style reuse in search |

## UI layer (`src/ui/`)

### Screens (root)

| File | Notes |
|------|--------|
| `LoadoutScreen.tsx` | Player loadout before a match |
| `MatchSetupScreen.tsx` | Roster and match options |
| `BattleScreen.tsx` | Active battle shell |
| `SkillLoadoutGrid.tsx`, `SkillCastMap.tsx`, `PatternEditor.tsx` | Skill pattern editing |
| `BoardReference.tsx` | Board reference / legend UI |
| `numeric-stepper.tsx` | Shared numeric control |
| `skillLoadoutPreviewAnchor.ts` | Cast-anchor preview helpers for loadout |

### `ui/loadout/`

| File | Notes |
|------|--------|
| `TraitDerivedStatsPanel.tsx` | Trait-driven stat summary |
| `loadoutDerivedBattleStats.ts` | Derived battle stats from loadout |
| `loadout-surface.css` | Loadout layout styles |

### `ui/help/`

| File | Notes |
|------|--------|
| `GameGuide.tsx` | In-app guide modal: tabs Start here / Reference / This screen |
| `reference-modals.css` | Help / reference modal styles |

### `ui/board/`

| File | Notes |
|------|--------|
| `HolographicBattleBoard.tsx` | Main grid view |
| `geometry.ts` | Board geometry helpers |
| `fx.ts` | Visual effects helpers |
| `index.ts` | Barrel exports |
| `holographic-board.css` | Board styles |

### `ui/battle/`

| File | Notes |
|------|--------|
| `classicLog.ts`, `broadcastLog.ts` | Battle log presenters |
| `broadcastReactionPhrases.ts` | Reaction phrase copy for broadcast log |
| `cell-tooltip.ts` | Per-cell tooltip content |
| `cpu-thinking.ts`, `cpuThinkRing.tsx` | CPU “thinking” UI state and ring |
| `actor-inspect.ts`, `ActorInspectModal.tsx` | Actor inspection modal and data |
| `battle-surface.css`, `actor-inspect-modal.css` | Battle-area styles |

## Tests

- Pattern: colocated `*.test.ts` under `src/` next to the module under test.
- Vitest config: `vite.config.ts` (`environment: 'node'`, `include: ['src/**/*.test.ts']`).
- `npm run test:balance` — runs `balance-sim.test.ts` only (Monte Carlo logs a one-line summary to stdout).

## Config

- `vite.config.ts` — Vite + Vitest
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` — TypeScript projects
- `eslint.config.js` — ESLint flat config
