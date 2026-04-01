# Skillcraft

Turn-based tactical battle on a square grid: build a skill loadout and traits, then fight in duels, team modes, or free-for-all. The game logic lives in plain TypeScript; the UI is React (Vite).

## Quick start

```bash
npm install
npm run dev
```

- **Build:** `npm run build`
- **Preview production build:** `npm run preview`
- **Tests:** `npm run test` (Vitest, `src/**/*.test.ts`)
- **Lint:** `npm run lint`

## Documentation

| Doc | Purpose |
|-----|---------|
| [STRUCTURE.md](./STRUCTURE.md) | Where code lives, entry points, test layout |
| [DOMAIN.md](./DOMAIN.md) | Game terms, rules at a glance, data concepts |

## Stack

- React 19, TypeScript, Vite 8
- Vitest for unit tests (Node environment)

## Flow (app)

1. **Loadout** — pick skills, pattern per skill, traits, then continue to match setup.
2. **Match setup** — roster, teams, board options, CPU difficulty.
3. **Battle** — grid UI, human vs CPU (and multi-actor matches). CPU uses heuristics and optional minimax in duels (`src/ai/cpu.ts`).

Core simulation: `src/game/engine.ts` (actions, turns, combat). Skills and costs: `src/game/skills.ts`. Board helpers: `src/game/board.ts`.
