import { useState } from 'react'
import type { BattleConfig } from './game/types'
import { LoadoutScreen } from './ui/LoadoutScreen'
import { BattleScreen } from './ui/BattleScreen'
import './App.css'

export default function App() {
  const [battle, setBattle] = useState<BattleConfig | null>(null)

  return (
    <div className="app-root">
      {battle ? (
        <BattleScreen config={battle} onExit={() => setBattle(null)} />
      ) : (
        <LoadoutScreen onStartBattle={(config) => setBattle(config)} />
      )}
    </div>
  )
}
