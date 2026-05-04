import Dexie, { type Table } from 'dexie'
import type { Person, SavedRota, AppSettings } from './types'

class RotaDB extends Dexie {
  people!: Table<Person, number>
  rotas!: Table<SavedRota, number>
  settings!: Table<AppSettings, string>

  constructor() {
    super('rota-app')
    this.version(1).stores({
      people: '++id, name, isMe',
      rotas: '++id, weekOf, createdAt',
      settings: 'key'
    })
  }
}

export const db = new RotaDB()

export async function getSettings(): Promise<AppSettings> {
  const s = await db.settings.get('settings')
  return s ?? { key: 'settings', apiKey: '', myName: '' }
}

export async function saveSettings(patch: Partial<AppSettings>) {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, key: 'settings' })
}
