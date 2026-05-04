import { z } from 'zod'

// ---- Schemas (used to validate AI output) ----

export const ShiftSchema = z.object({
  date: z.string().describe('ISO date YYYY-MM-DD'),
  person: z.string(),
  start: z.string().describe('HH:mm 24h'),
  end: z.string().describe('HH:mm 24h'),
  role: z.string().optional().default('')
})

export const RotaSchema = z.object({
  weekOf: z.string().describe('ISO date of the Monday of the week, YYYY-MM-DD'),
  shifts: z.array(ShiftSchema)
})

export type Shift = z.infer<typeof ShiftSchema>
export type Rota = z.infer<typeof RotaSchema>

// ---- App-only entities ----

export interface Person {
  id?: number
  name: string
  isMe?: boolean
  createdAt: number
}

export interface SavedRota {
  id?: number
  weekOf: string
  shifts: Shift[]
  createdAt: number
}

export interface AppSettings {
  key: 'settings'
  apiKey: string
  myName: string
}
