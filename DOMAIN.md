# Domain glossary

Skillcraft is a **grid tactics** game: actors take turns to **move** and **cast** skills — **mana** for elemental magic, **stamina** for **physical** skills (melee and short-range offense). The goal is to reduce enemies to 0 HP.

## Match and sides

- **Match mode** — `teams` (same `teamId` are allies) or `ffa` (everyone else is an enemy unless rules say otherwise).
- **Targeting** — Skills (including adjacent physical skills), and residual tiles can hit **any** actor in range or on the affected cells, including allies and yourself (`canDamageTarget` is always on). CPU still evaluates **opponents** by team / FFA for search (`isOpponentActor`).
- **Human** — Exactly one `humanActorId` in `MatchSettings`; that player controls one roster entry.
- **CPU** — Other roster entries use `pickCpuAction` (in production from a **Web Worker** via `requestCpuPick`) with per-actor **CPU difficulty**: `easy` | `normal` | `hard` | `nightmare`. **Easy** uses greedy heuristics and random legal moves (no minimax). **Normal+** use alpha–beta minimax in **1v1** and paranoid team search with **3+ fighters**, with depth rising by tier; search also has per-difficulty **wall-clock and node budgets** (iterative deepening keeps the **last completed** depth’s best move if the budget is hit). **Hard** / **nightmare** additionally roll stronger random loadouts in `randomCpuBuild`. The main thread uses an emergency timeout (`CPU_THINK_TIMEOUT_MS` in `cpuThinkBudget.ts`, currently 60s) after which the worker is stopped and easy AI is used. For the worker, `gameStateForCpuWorker` strips the **battle log** from the cloned state (search hashes ignore log) to reduce `postMessage` cost.

## Actor resources

- **HP** — Defeated at 0.
- **Mana** — Spent on casts; regains each turn (base + trait-based regen).
- **Stamina** — Spent on **Move** (per tile) and **physical offensive skills**; regains per turn.

## Traits (`TraitPoints`)

Allocated at loadout and **frozen at battle start**. They scale movement range, mana regen, melee and skill damage, defenses, status potency, max HP/mana, and physical modifiers (tempo, rhythm, knockback, slow, lifesteal, bleed, etc.). Exact numbers live in `traits.ts` (e.g. `HP_PER_VITALITY`, `MANA_PER_WISDOM`).

## Skills and loadout

- Each **skill** has a definition in `skills.ts` (element, damage kind, base range label, etc.).
- **Loadout** entries include: `skillId`, **pattern** (offsets from cast anchor — duplicate offsets mean multiple hits), **statusStacks**, optional **manaDiscount**, **rangeTier** (extra cast range / anchor reach), and **aoeTier** (extra pattern reach from anchor). **AoE tier 0** means only the anchor cell unless the skill sets a non-zero `aoeBase` on its definition; each tier adds +1 Chebyshev radius. Cast range and AoE use the same triangular loadout point curve per tier. **Utility** skills (Mend, Ward, Purge — `damageKind: none`) use **min cast distance 0** (anchor may be your tile); damage skills at range tier 0 require a neighbor anchor. Utility max cast range also gains **+1 per 2 Arcane reach** (same formula as the old self-cast range).
- **Mana cost** scales with pattern size, stacks, discounts, and Manhattan distance from caster to anchor.
- **Tile impacts** — Some casts leave residual effects on cells (`TileImpact`); stepping in can apply status/damage.

## Actions (`GameAction`)

- `move` — Orthogonal steps up to `moveMaxSteps`, bounded by stamina and board.
- `cast` — Skill at a target cell if in range and affordable (elemental **mana** skills, **stamina** physical skills, utilities). The **Strike** skill (`skillId: 'strike'`) is the default adjacent physical hit; it uses the same action type as every other skill.

## Statuses

Statuses live on `ActorState.statuses` as `StatusInstance` / `StatusTag` in `types.ts`. Durations tick down on the affected actor’s turn starts (except **frozen**, which consumes **turns** when it forces a skip). DoTs subtract **tenacity** from each tick. Implementation details: `engine.ts` (turn hooks, movement, silence/disarm restrictions, damage).

- **Burning** — Fire DoT each turn. Participates in many reactions (ice, water, poison, bleed, shock, mud, slow, shield, root).
- **Chilled** — Ice debuff with duration. With **soaked**, can become **frozen** via flash freeze.
- **Frozen** — Skips your entire turn while present; one **frozen** stack is consumed per skipped turn.
- **Soaked** — Water debuff with duration. Enables flash freeze, mud, conductive, and root combos.
- **Shocked** — Lightning debuff: bonus flat damage taken from hits (**vuln**, capped). Duration ticks each turn.
- **Poisoned** — Poison DoT each turn. Combines with fire, bleed, ice, shock, root, regen block, slow, mark.
- **Bleeding** — Physical DoT each turn. Coagulates with poison; cauterized by fire.
- **Slowed** — Increases orthogonal move cost by one step (stacks with **muddy**). Tar / Stagger with fire and shock.
- **Marked** — Extra flat damage taken from hits (**extra**). Called shot can increase **extra** when burn, poison, or shock is also present (capped).
- **Rooted** — Cannot move until duration expires. Waterlogged, stranglehold, grounded, wildfire.
- **Silenced** — Cannot cast elemental magic skills. **Disrupt** clears it when **shocked** is also present.
- **Regen blocked** — Cuts natural HP regen per turn roughly in half while active. **Necrosis** with poison extends poison duration.
- **Muddy** — Move penalty and +1 flat damage taken (see **slowed**). From mud reaction; **Parch** clears it when **burning** is present.
- **Shield** — Absorbs damage before HP. **Melt ward** erodes shield when **burning** is also present.

## Status reactions

When a new status is applied, `reactions.ts` runs **resolveStatusesAfterAdd**: pairwise rules fire in a **fixed order** (below). **Melt** and **Evaporate** may repeat in a loop until stable; other steps run once in sequence. Log lines match in-game battle messages (see `reactionMessages` in `status-reference.ts`).

**Resolution order**

1. Melt / Evaporate (repeat)
2. Detonate
3. Overload
4. Cauterize
5. Coagulate
6. Wildfire
7. Parch
8. Melt ward
9. Flash freeze
10. Mud
11. Waterlogged, Stranglehold, Grounded
12. Crystallize
13. Brittle
14. Caustic
15. Conductive
16. Disrupt
17. Called shot
18. Necrosis
19. Tar, Stagger

**Reaction table**

| Reaction | When | Outcome |
|----------|------|---------|
| Melt | Burning + chilled or frozen | Removes ice; shortens burn duration. |
| Evaporate | Burning + soaked | Removes soaked. |
| Detonate | Burning + poisoned | Immediate damage (burn dot + poison dot); removes both. |
| Overload | Burning + shocked | Immediate damage (capped); removes shock; shortens burn. |
| Cauterize | Bleeding + burning | Removes bleed; shortens burn. |
| Coagulate | Bleeding + poisoned | Immediate damage; removes bleed; keeps poison. |
| Wildfire | Rooted + burning | Removes rooted; keeps burn. |
| Parch | Muddy + burning | Removes muddy. |
| Melt ward | Shield + burning | Reduces shield amount; may remove shield. |
| Flash freeze | Soaked + chilled or frozen | Removes soaked; chilled becomes frozen; frozen + soaked refreshes frozen. |
| Mud | Soaked + slowed | Removes soaked and slow; applies muddy. |
| Waterlogged | Rooted + soaked | Extends rooted duration. |
| Stranglehold | Rooted + poisoned | Extends poison duration. |
| Grounded | Rooted + shocked | Increases shock vuln (capped). |
| Crystallize | Poisoned + chilled or frozen | Removes ice; extends first poison duration. |
| Brittle | Shocked + chilled or frozen | Increases shock vuln (capped). |
| Caustic | Shocked + poisoned | Increases shock vuln (capped). |
| Conductive | Soaked + shocked | Increases shock vuln (capped). |
| Disrupt | Silenced + shocked | Removes silenced. |
| Called shot | Marked + burning, poisoned, or shocked | Increases mark extra (capped). |
| Necrosis | Regen blocked + poisoned | Extends first poison duration. |
| Tar | Slowed + burning | Extends burn duration. |
| Stagger | Slowed + shocked | Extends slow duration. |

Overlapping triples (e.g. soaked + chilled + shock) resolve in this order: flash freeze consumes **soaked** before **Conductive** can run, so you may see **Brittle** instead of **Conductive** on the same application.

## Sudden death (overtime)

Optional match rules (`MatchSettings.overtimeEnabled`, `roundsUntilOvertime`): after **N full rounds** (each living fighter has taken one turn per round, `fullRoundsCompleted`), **sudden death** activates if enabled.

- **Storm geometry** — Rolled once at activation (`rollStormActivation` in `overtime.ts`): a **storm center** near the board edge and a **safe radius** (Chebyshev distance from center). Cells outside that disk are **lethal** for storm purposes (`isOvertimeLethal`).
- **Damage** — Storm ticks use `applyHpLoss`: **shield** is consumed first, then **HP**. **Fortitude** (physical mitigation) does **not** apply. Damage amount scales with shrink steps (`STORM_BASE_DAMAGE`, `STORM_DAMAGE_INCREMENT` in `overtime.ts`).
- **Cadence** — Storm damage does **not** hit every full-round boundary. The state alternates **skip** vs **damage** boundaries (`stormSkipsNextBoundary` on `OvertimeState`). On activation, the first boundary after overtime begins is a **skip** (no storm damage); after that, storm damage and skip alternate. **UI:** lethal tiles **pulse** when the **next** boundary will skip storm damage; **solid** red when the next boundary will apply it (`isOvertimeStormPulseRound`).
- **Shrink** — The safe zone shrinks on a fixed schedule of overtime rounds (`SHRINK_EVERY_OT_ROUNDS` in `overtime.ts`). If a shrink-qualified round falls on a **skip** boundary, shrink is **deferred** to the next **damage** boundary (`deferredShrink`).
- **Implementation** — `processFullRoundBoundary` in `engine.ts` drives activation, skip vs storm-damage rounds, periodic storm vs shrink; helpers and geometry live in `overtime.ts`.

## Battle log, shields, and kill credit

- **Shield before HP** — Any damage that uses `applyHpLoss` (skill hits, residual tile triggers, storm ticks, etc.) removes **shield** first, then reduces **HP**. The structured log can record **`shieldAbsorbed`** on that event (gross damage is still the full hit; classic mode may append `(N to shield)` on **`strike`** log lines (the Strike skill only) and **residual_trigger** lines when that field is present).
- **`lastHpDamageFrom`** — `GameState` keeps, per victim id, which actor last dealt **HP** damage (after shield) to them. Used only for **narration** (not AI search hashes). It updates on attributed hits (skill casts and residual damage credited to the tile **owner**). **Storm ticks**, **DoT** at turn start, and **status reaction** immediate damage do **not** set it.
- **Kill steal (log milestone)** — If a hit **kills** a fighter and `lastHpDamageFrom[victim]` is set to someone other than the **killer**, the engine appends a **`battle_milestone`** with `milestone: 'kill_steal'` (killer, victim, **creditedDamagerId**). **Classic** shows that line; **first blood** stays broadcast-oriented only. **Broadcast** adds extra caster/killer flavor on top.
- **Strike positional flavor** — Single-target **Strike** skill log detail (`kind: 'strike'`) may include **`positionalContext`**: `flanked` (≥2 orthogonal adjacent **opponents** who can be damaged from the attacker) or `surrounded` (≥3). Broadcast uses it for extra caster lines; classic does not spell it out.
- **Illegal attempts** — Failed actions (wrong turn, out-of-range move, invalid cast target, pattern/AoE violations, etc.) append **`action_denied`** with a **`reason`** enum; classic text is generated per reason (`actionDeniedClassicText` in `engine.ts`).

## Legacy vs roster config

New matches should use **`MatchSettings` + roster** (`MatchRosterEntry[]`). **`BattleConfig`** may still carry **`LegacyMatchSettings`** (presets like duel / 1v3); `normalizeBattleConfig` in `match-roster.ts` converts to a canonical roster-driven setup.

## Deprecated ids

`PLAYER_ID`, `CPU_ID`, `ALLY_ID` in `types.ts` are legacy preset labels; prefer `humanActorId` and opaque `ActorId` values from the roster.
