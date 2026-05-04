import { useState } from 'react'
import { readSpreadsheet } from '../lib/excel'
import { parseRotaWithAI } from '../lib/ai'
import { db, getSettings } from '../lib/db'
import { RotaTable } from '../components/RotaTable'
import type { Rota } from '../lib/types'

type Status = 'idle' | 'reading' | 'parsing' | 'preview' | 'error'

export function Upload({ onDone }: { onDone: () => void }) {
  const [status, setStatus] = useState<Status>('idle')
  const [statusText, setStatusText] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Rota | null>(null)
  const [fileName, setFileName] = useState('')

  async function handleFile(file: File) {
    setError('')
    setFileName(file.name)
    setStatus('reading')
    setStatusText('Reading spreadsheet…')
    try {
       const settings = await getSettings()
       if (settings.aiProvider === 'groq' && !settings.apiKey) {
         throw new Error('Add your Groq API key in Settings first.')
       }
       if (settings.aiProvider === 'gemini' && !settings.geminiApiKey) {
         throw new Error('Add your Gemini API key in Settings first.')
       }
       const { csv, markdown, sparseCsv } = await readSpreadsheet(file)
       setStatus('parsing')
       setStatusText('Asking AI to parse the rota…')
       const todayISO = new Date().toISOString().slice(0, 10)
       // Pull team names so the AI knows what to look for — big quality boost.
       const team = await db.people.toArray()
       const knownNames = team.map((p) => p.name)
       const rota = await parseRotaWithAI({
         apiKey: settings.apiKey,
         geminiApiKey: settings.geminiApiKey,
         aiProvider: settings.aiProvider,
         csv,
         markdown,
         sparseCsv,
         todayISO,
         knownNames,
         onStatus: setStatusText
       })

    } catch (e) {
      console.error('[upload] failed:', e)
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  function reset() {
    setStatus('idle')
    setStatusText('')
    setError('')
    setPreview(null)
    setFileName('')
  }

  // Already auto-saved on successful parse — this just navigates home.
  function done() {
    onDone()
  }

  return (
    <div className="p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-2xl font-bold mb-4">Upload rota</h1>

      <label className="block">
        <div className="border-2 border-dashed border-slate-700 rounded-2xl p-8 text-center bg-slate-800/30">
          <div className="text-4xl mb-2">📄</div>
          <div className="font-medium">
            {fileName || 'Tap to choose Excel file'}
          </div>
          <div className="text-xs text-slate-400 mt-1">.xlsx, .xls or .csv</div>
        </div>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            // Reset value so picking the same file again still fires onChange
            e.target.value = ''
            if (f) handleFile(f)
          }}
        />
      </label>

      <div className="mt-4">
        {(status === 'reading' || status === 'parsing') && (
          <Status text={statusText} />
        )}
        {status === 'error' && (
          <div className="space-y-2">
            <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/40 text-red-200 text-sm whitespace-pre-wrap">
              {error}
            </div>
            <button
              onClick={reset}
              className="w-full bg-slate-800 text-slate-200 rounded-xl py-2 text-sm"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {status === 'preview' && preview && (
        <div className="mt-6">
          <div className="p-3 mb-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-sm">
            ✓ Saved · {preview.shifts.length} shift{preview.shifts.length === 1 ? '' : 's'}
            {preview.weekOf ? ` · week of ${preview.weekOf}` : ''}
          </div>
          <RotaTable shifts={preview.shifts} />
          <button
            onClick={done}
            className="mt-4 w-full bg-accent hover:bg-accent/90 text-white font-medium rounded-xl py-3"
          >
            Go to Home
          </button>
        </div>
      )}
    </div>
  )
}

function Status({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-300 text-sm">
      <span className="inline-block h-3 w-3 rounded-full bg-accent animate-pulse" />
      {text}
    </div>
  )
}
