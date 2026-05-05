import { useState } from 'react'
import { Home } from './pages/Home'
import { Upload } from './pages/Upload'
import { Team } from './pages/Team'
import { Settings } from './pages/Settings'
import { BottomNav, type Tab } from './components/BottomNav'
import { BonziBuddy } from './components/BonziBuddy'

export default function App() {
  const [tab, setTab] = useState<Tab>('home')

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-y-auto pb-20">
        {tab === 'home' && <Home />}
        {tab === 'upload' && <Upload onDone={() => setTab('home')} />}
        {tab === 'team' && <Team />}
        {tab === 'settings' && <Settings />}
      </main>
      <BottomNav current={tab} onChange={setTab} />
      <BonziBuddy />
    </div>
  )
}
