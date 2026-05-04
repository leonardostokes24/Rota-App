import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from '../lib/db'
import { RotaTable } from '../components/RotaTable'

export function Home() {
  const settings = useLiveQuery(() => getSettings(), [])
  const latestRota = useLiveQuery(
    () => db.rotas.orderBy('createdAt').reverse().first(),
    []
  )

  const myName = settings?.myName?.trim() || ''
  const greeting = greetingFor(new Date())

  const myShifts =
    latestRota && myName
      ? latestRota.shifts.filter(
          (s) => s.person.toLowerCase() === myName.toLowerCase()
        )
      : []

  return (
    <div className="p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="mb-6">
        <p className="text-slate-400 text-sm">{greeting},</p>
        <h1 className="text-3xl font-bold">
          {myName || <span className="text-slate-500">set your name in Settings</span>}
        </h1>
      </header>

      {myName && (
        <section className="mb-6">
          <h2 className="text-sm uppercase tracking-wide text-slate-400 mb-2">
            Your shifts
          </h2>
          {myShifts.length > 0 ? (
            <RotaTable shifts={myShifts} highlightPerson={myName} />
          ) : (
            <p className="text-slate-400 text-sm">
              {latestRota
                ? `No shifts found for "${myName}" in the latest rota. Check spelling on the Team tab.`
                : 'No rota uploaded yet. Tap Upload to add one.'}
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="text-sm uppercase tracking-wide text-slate-400 mb-2">
          Full rota{latestRota ? ` · week of ${latestRota.weekOf}` : ''}
        </h2>
        <RotaTable shifts={latestRota?.shifts ?? []} highlightPerson={myName} />
      </section>
    </div>
  )
}

function greetingFor(d: Date) {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
