import type { Shift } from '../lib/types'

export function ShiftCard({ shift, highlight }: { shift: Shift; highlight?: boolean }) {
  const date = new Date(shift.date + 'T00:00:00')
  const day = date.toLocaleDateString(undefined, { weekday: 'short' })
  const dayNum = date.getDate()

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border ${
        highlight
          ? 'bg-accent/10 border-accent/40'
          : 'bg-slate-800/50 border-slate-700'
      }`}
    >
      <div className="w-12 text-center">
        <div className="text-[11px] uppercase text-slate-400">{day}</div>
        <div className="text-2xl font-semibold leading-none">{dayNum}</div>
      </div>
      <div className="flex-1">
        <div className="font-medium">{shift.person}</div>
        <div className="text-sm text-slate-400">
          {shift.start} – {shift.end}
          {shift.role ? ` · ${shift.role}` : ''}
        </div>
      </div>
    </div>
  )
}
