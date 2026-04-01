import { useState } from 'react'
import type { BattleConfig } from './game/types'
import { LoadoutScreen } from './ui/LoadoutScreen'
import { BattleScreen } from './ui/BattleScreen'
import { MatchSetupScreen, type MatchDraft } from './ui/MatchSetupScreen'
import './App.css'

export default function App() {
  const [battle, setBattle] = useState<BattleConfig | null>(null)
  const [matchDraft, setMatchDraft] = useState<MatchDraft | null>(null)

  return (
    <div className="app-root">
      {battle ? (
        <BattleScreen config={battle} onExit={() => setBattle(null)} />
      ) : matchDraft ? (
        <MatchSetupScreen
          draft={matchDraft}
          onBack={() => setMatchDraft(null)}
          onConfirm={(config) => {
            setBattle(config)
            setMatchDraft(null)
          }}
        />
      ) : (
        <LoadoutScreen
          onContinueToMatch={(draft) => {
            setMatchDraft(draft)
          }}
        />
      )}
    </div>
  )
}
