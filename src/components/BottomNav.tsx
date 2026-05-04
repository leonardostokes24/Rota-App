export type Tab = 'home' | 'upload' | 'team' | 'settings'

const items: { tab: Tab; label: string; icon: string }[] = [
  { tab: 'home', label: 'Home', icon: '🏠' },
  { tab: 'upload', label: 'Upload', icon: '📥' },
  { tab: 'team', label: 'Team', icon: '👥' },
  { tab: 'settings', label: 'Settings', icon: '⚙️' }
]

export function BottomNav({
  current,
  onChange
}: {
  current: Tab
  onChange: (t: Tab) => void
}) {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] z-10">
      {items.map((it) => {
        const active = it.tab === current
        return (
          <button
            key={it.tab}
            onClick={() => onChange(it.tab)}
            className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition ${
              active ? 'text-accent' : 'text-slate-400'
            }`}
          >
            <span className="text-xl leading-none">{it.icon}</span>
            <span className="text-[11px]">{it.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
