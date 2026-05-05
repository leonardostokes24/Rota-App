import { useEffect, useState } from 'react'
import { getSettings, saveSettings, db } from '../lib/db'
import { AppSettings } from '../lib/types'

export function Settings() {
  const [myName, setMyName] = useState('')
  const [groqApiKey, setGroqApiKey] = useState('')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [aiProvider, setAiProvider] = useState<'groq' | 'gemini'>('groq')
  const [saved, setSaved] = useState(false)
  const [showGroqKey, setShowGroqKey] = useState(false)
  const [showGeminiKey, setShowGeminiKey] = useState(false)

  useEffect(() => {
    getSettings().then((s) => {
      setMyName(s.myName)
      setGroqApiKey(s.apiKey)
      setGeminiApiKey(s.geminiApiKey)
      setAiProvider(s.aiProvider)
    })
  }, [])

  async function save() {
    await saveSettings({ 
      myName: myName.trim(), 
      apiKey: groqApiKey.trim(),
      geminiApiKey: geminiApiKey.trim(),
      aiProvider
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function clearAllRotas() {
    if (!confirm('Delete every saved rota? This cannot be undone.')) return
    await db.rotas.clear()
  }

  return (
    <div className="p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <Field label="Your name">
        <input
          value={myName}
          onChange={(e) => setMyName(e.target.value)}
          placeholder="e.g. Leonardo"
          className="w-full bg-slate-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-accent"
        />
        <p className="text-xs text-slate-400 mt-1">
          This is shown on the home screen and used to highlight your shifts.
        </p>
      </Field>

      <Field label="AI Provider">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setAiProvider('groq')}
            className={`py-2 rounded-xl text-sm font-medium transition-colors ${aiProvider === 'groq' ? 'bg-accent text-white' : 'bg-slate-800 text-slate-400'}`}
          >
            Groq
          </button>
          <button
            onClick={() => setAiProvider('gemini')}
            className={`py-2 rounded-xl text-sm font-medium transition-colors ${aiProvider === 'gemini' ? 'bg-accent text-white' : 'bg-slate-800 text-slate-400'}`}
          >
            Gemini
          </button>
        </div>
       </Field>
 
       {aiProvider === 'groq' && (

        <Field label="Groq API key">
          <div className="flex gap-2">
            <input
              type={showGroqKey ? 'text' : 'password'}
              value={groqApiKey}
              onChange={(e) => setGroqApiKey(e.target.value)}
              placeholder="gsk_…"
              autoComplete="off"
              className="flex-1 bg-slate-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
            />
            <button
              onClick={() => setShowGroqKey((v) => !v)}
              className="px-3 bg-slate-800 rounded-xl text-sm"
            >
              {showGroqKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Get one free (no card needed) at{' '}
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              className="underline text-accent"
            >
              console.groq.com/keys
            </a>
            . Stored only on this device.
          </p>
        </Field>
      )}

      {aiProvider === 'gemini' && (
        <Field label="Gemini API key">
          <div className="flex gap-2">
            <input
              type={showGeminiKey ? 'text' : 'password'}
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="AIza..."
              autoComplete="off"
              className="flex-1 bg-slate-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
            />
            <button
              onClick={() => setShowGeminiKey((v) => !v)}
              className="px-3 bg-slate-800 rounded-xl text-sm"
            >
              {showGeminiKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Get one free at{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="underline text-accent"
            >
              aistudio.google.com
            </a>
            . Stored only on this device.
          </p>
        </Field>
      )}

      <button
        onClick={save}
        className="w-full bg-accent text-white font-medium rounded-xl py-3 mb-3"
      >
        {saved ? 'Saved ✓' : 'Save'}
      </button>

      <hr className="my-6 border-slate-800" />

      <button
        onClick={clearAllRotas}
        className="w-full bg-red-500/10 text-red-300 border border-red-500/30 rounded-xl py-3 text-sm"
      >
        Clear all saved rotas
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-sm uppercase tracking-wide text-slate-400 mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}
