import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { traitReferenceZones } from '../../game/trait-reference'
import { reactionReference, statusReference } from '../../game/status-reference'
import './reference-modals.css'

const TABS = ['start', 'reference', 'screen'] as const
type GuideTab = (typeof TABS)[number]

const TAB_LABEL: Record<GuideTab, string> = {
  start: 'Start here',
  reference: 'Reference',
  screen: 'This screen',
}

export function GameGuide({ contextContent }: { contextContent: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [activeTab, setActiveTab] = useState<GuideTab>('start')
  const [isOpen, setIsOpen] = useState(false)

  const closeGuide = useCallback(() => {
    dialogRef.current?.close()
  }, [])

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    const onClose = () => {
      setIsOpen(false)
      setActiveTab('start')
    }
    d.addEventListener('close', onClose)
    return () => d.removeEventListener('close', onClose)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const d = dialogRef.current
      if (!d || !d.open) return
      const rect = d.getBoundingClientRect()
      const { clientX: x, clientY: y } = e
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        d.close()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [isOpen])
  const baseId = useId()
  const tabIds = {
    start: `${baseId}-tab-start`,
    reference: `${baseId}-tab-reference`,
    screen: `${baseId}-tab-screen`,
  } as const
  const panelIds = {
    start: `${baseId}-panel-start`,
    reference: `${baseId}-panel-reference`,
    screen: `${baseId}-panel-screen`,
  } as const

  const focusTabIndex = useCallback((index: number) => {
    tabRefs.current[index]?.focus()
  }, [])

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = (index + 1) % TABS.length
        setActiveTab(TABS[next])
        focusTabIndex(next)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = (index - 1 + TABS.length) % TABS.length
        setActiveTab(TABS[prev])
        focusTabIndex(prev)
      } else if (e.key === 'Home') {
        e.preventDefault()
        setActiveTab('start')
        focusTabIndex(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setActiveTab('screen')
        focusTabIndex(TABS.length - 1)
      }
    },
    [focusTabIndex],
  )

  return (
    <>
      <div className="help-ref-row">
        <button
          type="button"
          className="help-ref-btn"
          aria-expanded={isOpen}
          onClick={() => {
            const d = dialogRef.current
            if (!d) return
            if (d.open) {
              d.close()
              return
            }
            d.showModal()
            setIsOpen(true)
          }}
        >
          Guide
        </button>
      </div>

      <dialog ref={dialogRef} className="ls-modal ls-modal--sheet" aria-labelledby="game-guide-title">
        <div className="ls-modal__panel">
          <div className="ls-modal__head">
            <h2 id="game-guide-title" className="ls-modal__title">
              Guide
            </h2>
            <button type="button" className="ls-modal__close" onClick={closeGuide}>
              Close
            </button>
          </div>

          <div className="ls-modal__tabbar" role="tablist" aria-label="Guide sections">
            {TABS.map((tab, index) => (
              <button
                key={tab}
                ref={(el) => {
                  tabRefs.current[index] = el
                }}
                type="button"
                role="tab"
                id={tabIds[tab]}
                className={`ls-modal__tab${activeTab === tab ? ' ls-modal__tab--active' : ''}`}
                aria-selected={activeTab === tab}
                aria-controls={panelIds[tab]}
                tabIndex={activeTab === tab ? 0 : -1}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(e) => handleTabKeyDown(e, index)}
              >
                {TAB_LABEL[tab]}
              </button>
            ))}
          </div>

          <div className="ls-modal__body">
            <div
              id={panelIds.start}
              role="tabpanel"
              aria-labelledby={tabIds.start}
              hidden={activeTab !== 'start'}
              className="ls-modal__tabpanel"
            >
              <section className="ls-modal__section" aria-label="Basics">
                <h3 className="ls-modal__h">Basics</h3>
                <p className="ls-modal__note">
                  <span className="ls-modal__lead">Goal.</span> Reduce all enemies to <strong>0 HP</strong>. Turns
                  follow the roster order.
                </p>
                <p className="ls-modal__note">
                  <span className="ls-modal__lead">Actions.</span> <strong>Move</strong> (orthogonal steps, stamina),{' '}
                  <strong>Strike</strong> adjacent hostiles, <strong>cast</strong> from your loadout (mana), or{' '}
                  <strong>Skip</strong> to end your turn.
                </p>
                <p className="ls-modal__note">
                  <span className="ls-modal__lead">Resources.</span> <strong>Mana</strong> refills each turn (casts).{' '}
                  <strong>Stamina</strong> refills each turn (move and Strike).
                </p>
                <p className="ls-modal__note ls-modal__note--tight">
                  <span className="ls-modal__lead">Targeting.</span> In team modes, same team = allies; in FFA everyone
                  else is an enemy. <strong>Skills, Strikes, and residual tiles</strong> can hit anyone on affected
                  cells—including allies and you.
                </p>
              </section>

              <section className="ls-modal__section" aria-label="Casts and tiles">
                <h3 className="ls-modal__h">Casts &amp; tiles</h3>
                <p className="ls-modal__note">
                  <strong>Mana cost</strong> scales with pattern size, status stacks, discounts, and{' '}
                  <strong>distance</strong> from you to the anchor cell. <strong>Duplicate cells</strong> in a pattern hit
                  the same tile multiple times.
                </p>
                <p className="ls-modal__note ls-modal__note--tight">
                  Some skills leave <strong>residual effects</strong> on the grid; stepping on them can deal damage or
                  apply status.
                </p>
              </section>

              <section className="ls-modal__section" aria-label="First battles">
                <h3 className="ls-modal__h">First battles</h3>
                <ol className="ls-modal__guide-list">
                  <li>
                    <strong>Stamina budget.</strong> Moving and Striking share stamina—don&apos;t strand yourself out of
                    range with an empty bar.
                  </li>
                  <li>
                    <strong>First cast.</strong> Click the anchor tile; range is measured from your tile to that anchor.
                    Check the pattern overlay before you commit.
                  </li>
                  <li>
                    <strong>One ailment at a time.</strong> Pick an element you understand; read the battle log when a
                    new line appears—that&apos;s the game telling you a reaction fired.
                  </li>
                </ol>
              </section>

              <section className="ls-modal__section" aria-label="Common mistakes">
                <h3 className="ls-modal__h">Common mistakes</h3>
                <ul className="ls-modal__guide-list ls-modal__guide-list--unordered">
                  <li>
                    <strong>Friendly fire.</strong> Wide patterns and hazards can clip allies or your own tile.
                  </li>
                  <li>
                    <strong>DoT timing.</strong> Burning, poison, and bleed ticks are reduced by <strong>Tenacity</strong>{' '}
                    (Defense trait). Most durations count down on the <em>affected</em> fighter&apos;s turn starts;
                    frozen forces skipped turns.
                  </li>
                  <li>
                    <strong>Skill thresholds.</strong> Stack counts and special forms (e.g. ice that becomes freeze) are
                    spelled out on each skill in loadout—open the skill card, don&apos;t guess.
                  </li>
                </ul>
              </section>

              <section className="ls-modal__section" aria-label="Worked reaction example">
                <h3 className="ls-modal__h">Example: Flash freeze</h3>
                <p className="ls-modal__note">
                  A fighter is <strong>Soaked</strong> and you apply <strong>Chilled</strong> (or more ice). When the new
                  tag lands, the engine runs reactions in a <strong>fixed order</strong>. <strong>Flash freeze</strong>{' '}
                  fires when soaked meets chill or freeze: it <strong>removes Soaked</strong>, can push chill toward{' '}
                  <strong>Frozen</strong>, and may refresh freeze if both soaked and frozen were already present. You
                  should see a log line like &quot;Flash freeze: soaked target flash-freezes solid.&quot;
                </p>
                <p className="ls-modal__note">
                  If several tags are involved at once (e.g. soaked + chill + shock), <strong>order matters</strong>:
                  flash freeze can consume soaked before other soak-based rules run, so the outcome may differ from what
                  you&apos;d guess. When in doubt, trust the log, then check the <strong>Reference</strong> tab&apos;s
                  reaction table.
                </p>
              </section>

              <section className="ls-modal__section" aria-label="Sudden death">
                <h3 className="ls-modal__h">Sudden death</h3>
                <p className="ls-modal__note ls-modal__note--tight">
                  Optional in match setup: after enough full rounds, a storm shrinks the safe zone.{' '}
                  <strong>Pulsing</strong> red tiles vs <strong>solid</strong> red describe whether the next boundary
                  will skip storm damage—details for your current match are under <strong>This screen</strong> when
                  you&apos;re in setup or battle.
                </p>
              </section>

              <section className="ls-modal__section" aria-label="Where to learn more">
                <h3 className="ls-modal__h">Where to learn more</h3>
                <p className="ls-modal__note ls-modal__note--tight">
                  The <strong>battle log</strong> is the source of truth for complex chains. Full trait, status, and
                  reaction lists live under <strong>Reference</strong>. Screen-specific controls and options are under{' '}
                  <strong>This screen</strong>.
                </p>
              </section>
            </div>

            <div
              id={panelIds.reference}
              role="tabpanel"
              aria-labelledby={tabIds.reference}
              hidden={activeTab !== 'reference'}
              className="ls-modal__tabpanel"
            >
              <details className="ls-modal__details">
                <summary className="ls-modal__summary">Traits</summary>
                <div className="ls-modal__details-body">
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
                </div>
              </details>

              <details className="ls-modal__details">
                <summary className="ls-modal__summary">Statuses</summary>
                <div className="ls-modal__details-body">
                  <p className="ls-modal__note">
                    <strong>Tenacity</strong> (Defense trait) reduces damage taken from each burning, poison, and bleed
                    tick. Most durations tick on the affected fighter&apos;s turn starts unless a status says otherwise
                    (e.g. frozen).
                  </p>
                  <p className="ls-modal__note">
                    <strong>Physical damage skills</strong> (Strike, Splinter, Cleave, Shove, Hamstring, Rend): each hit
                    applies <strong>Bleeding</strong> (strength scales with Bleed bonus and status potency). Optional{' '}
                    <strong>Slowed</strong> (Physical slow trait), <strong>knockback</strong> (except Shove, which always
                    pushes; other skills need Physical knockback), and <strong>lifesteal</strong> (trait) apply when you
                    invest in those traits.
                  </p>
                  <ul className="ls-modal__status-list">
                    {statusReference.map((s) => (
                      <li key={s.id}>
                        <span className="ls-modal__tag">{s.label}</span>
                        <span className="ls-modal__desc">{s.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>

              <details className="ls-modal__details">
                <summary className="ls-modal__summary">Reactions</summary>
                <div className="ls-modal__details-body">
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
                </div>
              </details>
            </div>

            <div
              id={panelIds.screen}
              role="tabpanel"
              aria-labelledby={tabIds.screen}
              hidden={activeTab !== 'screen'}
              className="ls-modal__tabpanel"
            >
              <section className="ls-modal__section" aria-label="This screen">
                <h3 className="ls-modal__h">This screen</h3>
                <div className="ls-modal__context">{contextContent}</div>
              </section>
            </div>
          </div>

          <div className="ls-modal__foot">
            <button type="button" className="ls-modal__close ls-modal__close--primary" onClick={closeGuide}>
              Close guide
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
