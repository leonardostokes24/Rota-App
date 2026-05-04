import type { Shift } from '../lib/types'
import { ShiftCard } from './ShiftCard'

export function RotaTable({
  shifts,
  highlightPerson
}: {
  shifts: Shift[]
  highlightPerson?: string
}) {
  if (shifts.length === 0) {
    return (
      <p className="text-slate-400 text-sm">No shifts yet — upload a rota to get started.</p>
    )
  }
  const sorted = [...shifts].sort((a, b) =>
    a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)
  )
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((s, i) => (
        <ShiftCard
          key={`${s.date}-${s.person}-${i}`}
          shift={s}
          highlight={
            !!highlightPerson &&
            s.person.toLowerCase() === highlightPerson.toLowerCase()
          }
        />
      ))}
    </div>
  )
}
