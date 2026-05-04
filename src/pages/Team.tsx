import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'

export function Team() {
  const people = useLiveQuery(() => db.people.orderBy('name').toArray(), []) ?? []
  const [name, setName] = useState('')

  async function add() {
    const n = name.trim()
    if (!n) return
    const exists = people.some((p) => p.name.toLowerCase() === n.toLowerCase())
    if (exists) {
      setName('')
      return
    }
    await db.people.add({ name: n, createdAt: Date.now() })
    setName('')
  }

  async function remove(id?: number) {
    if (id != null) await db.people.delete(id)
  }

  return (
    <div className="p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-2xl font-bold mb-4">Team</h1>

      <div className="flex gap-2 mb-6">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add team member"
          className="flex-1 bg-slate-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          onClick={add}
          className="bg-accent text-white font-medium rounded-xl px-4"
        >
          Add
        </button>
      </div>

      {people.length === 0 ? (
        <p className="text-slate-400 text-sm">
          No team members yet. Add the names that appear in your rota so the app
          can match shifts.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between bg-slate-800/60 rounded-xl px-4 py-3"
            >
              <span>{p.name}</span>
              <button
                onClick={() => remove(p.id)}
                className="text-slate-400 hover:text-red-400 text-sm"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
