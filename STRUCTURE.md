# Codebase structure

## Entry points

- `index.html` → `src/main.tsx` → `src/App.tsx`
- `App.tsx` switches screens: loadout → match setup → battle (`BattleScreen`).

## Top-level directories

| Path | Role |
|------|------|
| `src/game/` | Simulation: state, rules, skills, board, traits, reactions, match roster normalization |
| `src/ai/` | CPU opponent (`pickCpuAction`) |
| `src/ui/` | React screens and board components |

## Game layer (`src/game/`)

| File | Notes |
|------|--------|
| `types.ts` | Shared types: `GameState`, `ActorState`, `SkillLoadoutEntry`, `TraitPoints`, `MatchSettings`, `BattleConfig` |
| `engine.ts` | `GameAction`, `applyAction`, `allLegalActions`, turn flow, win checks, combat resolution |
| `skills.ts` | Skill definitions, patterns, mana/damage/status helpers |
| `traits.ts` | Trait scaling, Strike damage, stamina, defenses |
| `board.ts` | Grid size, coords, spawn positions, Manhattan distance, targeting helpers |
| `match-roster.ts` | `normalizeBattleConfig`, legacy presets → roster |
| `reactions.ts` | Status interactions when tags are applied |
| `elements.ts` | Element typing for skills |
| `actor-label.ts` | Log/display names |
| `randomCpuBuild.ts` | Random CPU loadouts for tests or presets |
| `test-fixtures.ts` | Shared test builders |

## UI layer (`src/ui/`)

| Area | Role |
|------|------|
| `LoadoutScreen.tsx` | Player loadout before a match |
| `MatchSetupScreen.tsx` | Roster and match options |
| `BattleScreen.tsx` | Active battle |
| `SkillCastPlanner.tsx`, `SkillCastMap.tsx`, `PatternEditor.tsx` | Skill pattern editing |
| `board/` | `HolographicBattleBoard`, geometry, effects (`fx.ts`), styles |
| `battle/` | Battle chrome, tooltips, CSS |

## Tests

- Pattern: colocated `*.test.ts` under `src/` (e.g. `engine.test.ts`, `skills.test.ts`).
- Vitest config: `vite.config.ts` (`environment: 'node'`, `include: ['src/**/*.test.ts']`).

## Config

- `vite.config.ts` — Vite + Vitest
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` — TypeScript projects
- `eslint.config.js` — ESLint flat config
