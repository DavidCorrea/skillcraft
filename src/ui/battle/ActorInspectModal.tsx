import { useLayoutEffect, useRef } from 'react'
import type { ActorId, GameState } from '../../game/types'
import { STAMINA_REGEN_PER_TURN } from '../../game/traits'
import { battleActorLabel } from './cell-tooltip'
import {
  buildPatternPreview,
  cpuDifficultyLabel,
  formatStatusLine,
  skillInspectMeta,
  traitZonesForInspect,
} from './actor-inspect'
import '../help/reference-modals.css'
import './actor-inspect-modal.css'

type PatternModel = ReturnType<typeof buildPatternPreview>

function PatternPreview({ model }: { model: PatternModel | null }) {
  if (!model) {
    return (
      <div className="actor-inspect__pattern-wrap">
        <p className="actor-inspect__pattern-caption">Pattern</p>
        <p className="actor-inspect__meta-line">—</p>
      </div>
    )
  }

  return (
    <div className="actor-inspect__pattern-wrap">
      <p className="actor-inspect__pattern-caption">Pattern (anchor +)</p>
      <div
        className="actor-inspect__pattern"
        style={{
          gridTemplateColumns: `repeat(${model.cols}, minmax(1rem, 1.35rem))`,
        }}
      >
        {model.cells.map((cell, i) => {
          const cls = [
            'actor-inspect__pattern-cell',
            cell.isAnchor ? 'actor-inspect__pattern-cell--anchor' : '',
            cell.count > 0 ? 'actor-inspect__pattern-cell--hit' : '',
            cell.count > 1 ? 'actor-inspect__pattern-cell--multi' : '',
          ]
            .filter(Boolean)
            .join(' ')
          let inner: string
          if (cell.count > 1) inner = String(cell.count)
          else if (cell.count === 1) inner = '·'
          else if (cell.isAnchor) inner = '+'
          else inner = '\u00a0'
          return (
            <div
              key={i}
              className={cls}
              title={cell.isAnchor ? 'Cast anchor (target cell)' : undefined}
            >
              {inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ActorInspectModal({
  game,
  actorId,
  onClose,
}: {
  game: GameState
  actorId: ActorId | null
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const actor = actorId ? game.actors[actorId] : undefined

  useLayoutEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (actorId && actor) {
      if (!d.open) d.showModal()
    } else {
      d.close()
    }
  }, [actorId, actor])

  return (
    <dialog
      ref={dialogRef}
      className="ls-modal actor-inspect"
      aria-labelledby="actor-inspect-title"
      onClose={onClose}
    >
      {actor && actorId ? (
        <div className="ls-modal__panel">
          <div className="ls-modal__head">
            <h2 id="actor-inspect-title" className="ls-modal__title">
              {battleActorLabel(game, actorId)}
            </h2>
            <button type="button" className="ls-modal__close" onClick={() => dialogRef.current?.close()}>
              Close
            </button>
          </div>
          <div className="ls-modal__body">
            <section className="ls-modal__section" aria-label="Summary">
              <p className="ls-modal__note actor-inspect__meta-line">
                Team {game.teamByActor[actorId] ?? '—'}
                {actorId === game.humanActorId ? (
                  <> · You</>
                ) : (
                  <>
                    {' '}
                    · CPU {cpuDifficultyLabel(game, actorId) ?? '—'}
                  </>
                )}
              </p>
              <div className="actor-inspect__stats">
                <div className="actor-inspect__stat">
                  <span className="actor-inspect__stat-k">HP</span>
                  <span className="actor-inspect__stat-v">
                    {actor.hp}/{actor.maxHp}
                  </span>
                </div>
                <div className="actor-inspect__stat">
                  <span className="actor-inspect__stat-k">Mana</span>
                  <span className="actor-inspect__stat-v">
                    {actor.mana}/{actor.maxMana}
                  </span>
                </div>
                <div className="actor-inspect__stat">
                  <span className="actor-inspect__stat-k">Stamina</span>
                  <span className="actor-inspect__stat-v">
                    {actor.stamina}/{actor.maxStamina}
                  </span>
                </div>
              </div>
              <p className="ls-modal__note ls-modal__note--tight actor-inspect__meta-line">
                +{actor.manaRegenPerTurn} MP/turn · +{STAMINA_REGEN_PER_TURN} SP/turn · {actor.moveMaxSteps} move step
                {actor.moveMaxSteps === 1 ? '' : 's'} · {actor.tilesMovedThisTurn} tiles moved this turn · physical streak{' '}
                {actor.physicalStreak}
              </p>
            </section>

            <section className="ls-modal__section" aria-label="Traits">
              <h3 className="ls-modal__h">Traits</h3>
              {traitZonesForInspect(actor.traits).map((zone) => (
                <div key={zone.title} className="actor-inspect__trait-block">
                  <h4 className="ls-modal__subh">{zone.title}</h4>
                  <table className="actor-inspect__trait-table">
                    <thead>
                      <tr>
                        <th scope="col">Trait</th>
                        <th scope="col">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zone.rows.map((row) => (
                        <tr
                          key={row.short}
                          className={row.value === 0 ? 'actor-inspect__trait-row--zero' : undefined}
                        >
                          <td>
                            {row.label} ({row.short})
                          </td>
                          <td className="actor-inspect__trait-val">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>

            <section className="ls-modal__section" aria-label="Skills">
              <h3 className="ls-modal__h">Skills</h3>
              {game.loadouts[actorId]?.length ? (
                <ul className="actor-inspect__skills">
                  {game.loadouts[actorId]!.map((e) => {
                    const meta = skillInspectMeta(e, actor.traits)
                    const mpStr =
                      meta.mpMin === meta.mpMax ? `${meta.mpMin} MP` : `${meta.mpMin}–${meta.mpMax} MP`
                    return (
                      <li key={e.skillId} className="actor-inspect__skill">
                        <div className="actor-inspect__skill-head">
                          <span className="actor-inspect__skill-name">{meta.name}</span>
                          <span
                            className={`actor-inspect__skill-elem actor-inspect__skill-elem--${meta.element}`}
                          >
                            {meta.element}
                          </span>
                        </div>
                        <div className="actor-inspect__skill-body">
                          <dl className="actor-inspect__skill-meta">
                            <dt>Mana</dt>
                            <dd>{mpStr}</dd>
                            <dt>Range</dt>
                            <dd>{meta.rangeLabel}</dd>
                            <dt>AoE</dt>
                            <dd>{meta.aoeLabel}</dd>
                            {meta.rangeTier > 0 ? (
                              <>
                                <dt>Cast tier</dt>
                                <dd>+{meta.rangeTier}</dd>
                              </>
                            ) : null}
                            {meta.aoeTier > 0 ? (
                              <>
                                <dt>AoE tier</dt>
                                <dd>+{meta.aoeTier}</dd>
                              </>
                            ) : null}
                            <dt>Status stacks</dt>
                            <dd>{meta.stacks}</dd>
                            {e.costDiscount > 0 ? (
                              <>
                                <dt>Mana discount</dt>
                                <dd>−{e.costDiscount} (loadout)</dd>
                              </>
                            ) : null}
                            <dt>Loadout cost</dt>
                            <dd>{meta.loadoutPts} pts</dd>
                          </dl>
                          <PatternPreview model={buildPatternPreview(e.pattern)} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="ls-modal__note">No skills.</p>
              )}
            </section>

            <section className="ls-modal__section" aria-label="Statuses">
              <h3 className="ls-modal__h">Statuses</h3>
              {actor.statuses.length > 0 ? (
                <ul className="actor-inspect__status-list">
                  {actor.statuses.map((s) => (
                    <li key={s.id}>{formatStatusLine(s)}</li>
                  ))}
                </ul>
              ) : (
                <p className="ls-modal__note">None.</p>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </dialog>
  )
}
