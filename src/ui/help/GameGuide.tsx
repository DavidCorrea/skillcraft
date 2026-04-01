import { useRef, type ReactNode } from 'react'
import { traitReferenceZones } from '../../game/trait-reference'
import { reactionReference, statusReference } from '../../game/status-reference'
import './reference-modals.css'

export function GameGuide({ contextContent }: { contextContent: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <div className="help-ref-row">
        <button type="button" className="help-ref-btn" onClick={() => dialogRef.current?.showModal()}>
          Guide
        </button>
      </div>

      <dialog ref={dialogRef} className="ls-modal" aria-labelledby="game-guide-title">
        <div className="ls-modal__panel">
          <div className="ls-modal__head">
            <h2 id="game-guide-title" className="ls-modal__title">
              Guide
            </h2>
            <button type="button" className="ls-modal__close" onClick={() => dialogRef.current?.close()}>
              Close
            </button>
          </div>
          <div className="ls-modal__body">
            <section className="ls-modal__section" aria-label="Screen-specific tips">
              <h3 className="ls-modal__h">Screen tips</h3>
              <div className="ls-modal__context">{contextContent}</div>
            </section>
            <section className="ls-modal__section" aria-label="How the game works">
              <h3 className="ls-modal__h">How the game works</h3>
              <p className="ls-modal__note">
                <span className="ls-modal__lead">Goal &amp; turn.</span> Reduce all enemies to <strong>0 HP</strong>.
                Resources: <strong>HP</strong>, <strong>mana</strong> (casts, refills each turn),{' '}
                <strong>stamina</strong> (move and Strike, refills each turn). Actions: <strong>move</strong>{' '}
                orthogonally, <strong>Strike</strong> adjacent hostiles, <strong>cast</strong> from your loadout, or{' '}
                <strong>Skip</strong> to end the turn. Order follows the roster.
              </p>
              <p className="ls-modal__note">
                <span className="ls-modal__lead">Teams &amp; friendly fire.</span> Same team = allies when teams are
                shared; in FFA everyone is on a different team. If <strong>any team has more than one fighter</strong>,{' '}
                <strong>friendly fire</strong> is on: skills and Strikes can damage allies. You can also damage yourself
                with your own skills and residual tiles.
              </p>
              <p className="ls-modal__note">
                <span className="ls-modal__lead">Casts.</span> <strong>Mana cost</strong> scales with pattern size,
                status stacks, mana discount, and <strong>distance</strong> to the target anchor (Manhattan; self-target
                skills add no distance cost). <strong>Duplicate pattern cells</strong> repeat that offset—multiple hits on
                the same cell stack.
              </p>
              <p className="ls-modal__note ls-modal__note--tight">
                <span className="ls-modal__lead">Tiles.</span> Some skills leave <strong>residual effects</strong> on
                cells. <strong>Entering</strong> a marked tile can apply damage or status depending on the effect.
              </p>
            </section>
            <section className="ls-modal__section" aria-label="Traits">
              <h3 className="ls-modal__h">Traits</h3>
              <p className="ls-modal__note">
                Loadout traits cost 1 budget point each. Values are set on the Traits screen and stay fixed for the
                whole battle.
              </p>
              {traitReferenceZones.map((zone) => (
                <div key={zone.title} className="ls-modal__trait-zone">
                  <h4 className="ls-modal__subh">{zone.title}</h4>
                  <ul className="ls-modal__status-list">
                    {zone.traits.map((t) => (
                      <li key={t.key}>
                        <span className="ls-modal__tag">
                          {t.label} ({t.short})
                        </span>
                        <span className="ls-modal__desc">{t.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
            <section className="ls-modal__section" aria-label="All status types">
              <h3 className="ls-modal__h">Statuses</h3>
              <p className="ls-modal__note">
                <strong>Tenacity</strong> (Core trait) reduces damage taken from each burning, poison, and bleed tick.
                Most durations tick on the affected fighter&apos;s turn starts unless a status says otherwise (e.g.{' '}
                frozen).
              </p>
              <ul className="ls-modal__status-list">
                {statusReference.map((s) => (
                  <li key={s.id}>
                    <span className="ls-modal__tag">{s.label}</span>
                    <span className="ls-modal__desc">{s.description}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="ls-modal__section" aria-label="Status reactions">
              <h3 className="ls-modal__h">Reactions</h3>
              <p className="ls-modal__note">
                When a new status is applied, reactions resolve in a fixed order (melt and evaporate may repeat).
                Pairings below are the main interactions.
              </p>
              <table className="ls-modal__table">
                <thead>
                  <tr>
                    <th scope="col">Reaction</th>
                    <th scope="col">When</th>
                    <th scope="col">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {reactionReference.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td>{r.when}</td>
                      <td>{r.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </div>
      </dialog>
    </>
  )
}
