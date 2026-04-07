# Domain glossary

Skillcraft is a **grid tactics** game: actors take turns to **move**, **strike** (melee), or **cast** skills. The goal is to reduce enemies to 0 HP.

## Match and sides

- **Match mode** — `teams` (same `teamId` are allies) or `ffa` (everyone else is an enemy unless rules say otherwise).
- **Targeting** — Skills, Strikes (adjacent actors), and residual tiles can hit **any** actor in range or on the affected cells, including allies and yourself (`canDamageTarget` is always on). CPU still evaluates **opponents** by team / FFA for search (`isOpponentActor`).
- **Human** — Exactly one `humanActorId` in `MatchSettings`; that player controls one roster entry.
- **CPU** — Other roster entries use `pickCpuAction` with per-actor **CPU difficulty**: `easy` | `normal` | `hard` (search depth differs in duels).

## Actor resources

- **HP** — Defeated at 0.
- **Mana** — Spent on casts; regains each turn (base + trait-based regen).
- **Stamina** — Spent on **Move** (per tile) and **Strike**; regains per turn.

## Traits (`TraitPoints`)

Allocated at loadout and **frozen at battle start**. They scale movement range, mana regen, melee and skill damage, defenses, status potency, max HP/mana, and Strike modifiers (knockback, slow, tempo, rhythm, lifesteal, duel reduction, etc.). Exact numbers live in `traits.ts` (e.g. `HP_PER_VITALITY`, `MANA_PER_WISDOM`).

## Skills and loadout

- Each **skill** has a definition in `skills.ts` (element, damage kind, base range label, etc.).
- **Loadout** entries include: `skillId`, **pattern** (offsets from cast anchor — duplicate offsets mean multiple hits), **statusStacks**, optional **manaDiscount**, **rangeTier** (extra cast range / anchor reach), and **aoeTier** (extra pattern reach from anchor). **AoE tier 0** means only the anchor cell unless the skill sets a non-zero `aoeBase` on its definition; each tier adds +1 Chebyshev radius. Cast range and AoE use the same triangular loadout point curve per tier. **Utility** skills (Mend, Ward, Purge — `damageKind: none`) use **min cast distance 0** (anchor may be your tile); damage skills at range tier 0 require a neighbor anchor. Utility max cast range also gains **+1 per 2 Arcane reach** (same formula as the old self-cast range).
- **Mana cost** scales with pattern size, stacks, discounts, and Manhattan distance from caster to anchor.
- **Tile impacts** — Some casts leave residual effects on cells (`TileImpact`); stepping in can apply status/damage.

## Actions (`GameAction`)

- `move` — Orthogonal steps up to `moveMaxSteps`, bounded by stamina and board.
- `cast` — Skill at a target cell if in range and affordable.
- `strike` — Adjacent melee attack; optional explicit `targetId` when several enemies are adjacent.

## Statuses

Statuses live on `ActorState.statuses` as `StatusInstance` / `StatusTag` in `types.ts`. Durations tick down on the affected actor’s turn starts (except **frozen**, which consumes **turns** when it forces a skip). DoTs subtract **tenacity** from each tick. Implementation details: `engine.ts` (turn hooks, movement, strike restrictions, damage).

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
- **Silenced** — Cannot cast skills. **Disrupt** clears it when **shocked** is also present.
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
- **Damage** — Storm ticks use `applyHpLoss`: **shield** is consumed first, then **HP**. Physical armor / fortitude do **not** apply. Damage amount scales with shrink steps (`STORM_BASE_DAMAGE`, `STORM_DAMAGE_INCREMENT` in `overtime.ts`).
- **Cadence** — Storm damage does **not** hit every full-round boundary. The state alternates **skip** vs **strike** boundaries (`stormSkipsNextBoundary` on `OvertimeState`). On activation, the first boundary after overtime begins is a **skip** (no storm damage); after that, damage and skip alternate. **UI:** lethal tiles **pulse** when the **next** boundary will skip storm damage; **solid** red when the next boundary will apply it (`isOvertimeStormPulseRound`).
- **Shrink** — The safe zone shrinks on a fixed schedule of overtime rounds (`SHRINK_EVERY_OT_ROUNDS` in `overtime.ts`). If a shrink-qualified round falls on a **skip** boundary, shrink is **deferred** to the next strike boundary (`deferredShrink`).
- **Implementation** — `processFullRoundBoundary` in `engine.ts` drives activation, skip/strike, periodic storm vs shrink; helpers and geometry live in `overtime.ts`.

## Legacy vs roster config

New matches should use **`MatchSettings` + roster** (`MatchRosterEntry[]`). **`BattleConfig`** may still carry **`LegacyMatchSettings`** (presets like duel / 1v3); `normalizeBattleConfig` in `match-roster.ts` converts to a canonical roster-driven setup.

## Deprecated ids

`PLAYER_ID`, `CPU_ID`, `ALLY_ID` in `types.ts` are legacy preset labels; prefer `humanActorId` and opaque `ActorId` values from the roster.
