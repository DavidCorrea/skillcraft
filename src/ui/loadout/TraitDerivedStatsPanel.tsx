import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { TraitPoints } from '../../game/types'
import { deriveLoadoutBattleStats, derivedStatRowKeysAfterPlusOneOnTrait } from './loadoutDerivedBattleStats'

const FLASH_MS = 900

function rowKey(groupTitle: string, label: string): string {
  return `${groupTitle}\0${label}`
}

export function TraitDerivedStatsPanel({
  traits,
  level,
  hoverBumpTraitKey,
}: {
  traits: TraitPoints
  level: number
  /** Trait currently hovered in the grid; highlights derived rows that would change after +1 to that trait. */
  hoverBumpTraitKey: keyof TraitPoints | null
}) {
  const groups = useMemo(() => deriveLoadoutBattleStats(traits, level), [traits, level])

  const hoverBumpRowKeys = useMemo(() => {
    if (!hoverBumpTraitKey) return new Set<string>()
    return derivedStatRowKeysAfterPlusOneOnTrait(traits, level, hoverBumpTraitKey)
  }, [traits, level, hoverBumpTraitKey])
  const prevValuesRef = useRef<Map<string, string>>(new Map())
  const [flashing, setFlashing] = useState<Set<string>>(() => new Set())

  useLayoutEffect(() => {
    const next = new Map<string, string>()
    const changed = new Set<string>()
    for (const g of groups) {
      for (const r of g.rows) {
        const k = rowKey(g.title, r.label)
        next.set(k, r.value)
        const was = prevValuesRef.current.get(k)
        if (was !== undefined && was !== r.value) {
          changed.add(k)
        }
      }
    }
    prevValuesRef.current = next

    if (changed.size === 0) {
      return
    }

    setFlashing(changed)
    const id = window.setTimeout(() => {
      setFlashing(new Set())
    }, FLASH_MS)
    return () => window.clearTimeout(id)
  }, [groups])

  return (
    <section className="ls-derived" aria-label="Derived battle stats">
      <header className="ls-derived__intro">
        <h3 className="ls-derived__heading">Battle numbers from traits</h3>
        <p className="ls-derived__lede">
          Hover a trait row to preview which values would change after +1.
        </p>
      </header>
      <div className="ls-derived__grid">
        {groups.map((group) => (
          <div key={group.title} className="ls-derived__group">
            <h4 className="ls-derived__group-title">{group.title}</h4>
            <dl className="ls-derived__list">
              {group.rows.map((row) => {
                const k = rowKey(group.title, row.label)
                const flashValue = flashing.has(k)
                const hoverBump = hoverBumpRowKeys.has(k)
                return (
                  <div
                    key={row.label}
                    className={`ls-derived__row${flashValue ? ' ls-derived__row--flash' : ''}${hoverBump ? ' ls-derived__row--hover-bump' : ''}`}
                  >
                    <dt className="ls-derived__label">{row.label}</dt>
                    <dd className="ls-derived__value">{row.value}</dd>
                    <dd className={row.perPoint ? 'ls-derived__per' : 'ls-derived__per ls-derived__per--na'}>
                      {row.perPoint ?? '—'}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </div>
        ))}
      </div>
    </section>
  )
}
