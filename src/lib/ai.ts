import { RotaSchema, type Rota } from './types'

// Groq is fully free (no card required), extremely fast (LPU-accelerated),
// and exposes an OpenAI-compatible REST API — so no SDK needed.
// Get a key: https://console.groq.com/keys
//
// Tried in order if a model is overloaded or rate-limited.
const MODEL_FALLBACKS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-20b'
]

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const RETRYABLE_HTTP = [429, 500, 502, 503, 504]
const PER_ATTEMPT_TIMEOUT_MS = 45_000
const MAX_TOKENS = 8000

const SYSTEM_PROMPT = `You convert work-rota spreadsheets into structured JSON.

Your primary goal is to correctly identify the layout (style) of the rota and extract every single shift without exception.

Return ONLY a JSON object. No prose, no markdown code fences.
{
  "weekOf": "YYYY-MM-DD", // The date of the Monday of the rota's week
  "shifts": [
    {"date":"YYYY-MM-DD","person":"string","start":"HH:mm","end":"HH:mm","role":"string"}
  ]
}

Extraction Logic:
1. IDENTIFY LAYOUT: Determine if it's a grid, list, or multiple tables. 
   IMPORTANT: Rotas often use "Column Groups". A single day (e.g., Monday) might be represented by a header in one column, followed by several sub-columns (e.g., for different shifts, or for 'L' and 'D' markers). If you see a date header in a cell, the subsequent columns in that row (and those below it) likely belong to that same day until the next date header appears. Metadata rows (like sub-headers, counts, or notes) may exist between the date header and the actual shift data. Use the date header to anchor all subsequent columns to that day.
2. ANCHOR DATES: Use 'Today's date' to determine the exact YYYY-MM-DD for each day (Mon, Tue, etc.). Ensure "weekOf" is the Monday of that week.
3. EXHAUSTIVE SCAN: Scan every cell. If a cell corresponds to a person and a date, and it is NOT empty or a "SKIP" value, it is a SHIFT.

If the input is in Sparse CSV format (row,col,value), treat each line as a single cell at the specified coordinates (e.g., '5,2,09:00' means row 5, column 2 has value '09:00').

Strict Rules:
- NO SKIPPING: Do not summarize. Do not truncate. If 10 people have shifts, extract all 10. If a person works 5 days, extract all 5.
- SHIFT DETECTION: Any cell that isn't empty, "OFF", "REST", "X", "-", or "N/A" is a shift. Even if it just says "Working" or a role like "BAR" without times.
- NAMES: Use 'Known team members' to help match, but include anyone who clearly has a shift.
- TIMES: Convert to 24h "HH:mm". If no times are provided but it's a shift, leave start/end as "".
- DATES: Convert day names (Mon, Tue) to YYYY-MM-DD.
- OUTPUT: Valid JSON only. No "..." or "etc".`

const FEW_SHOT = `Example. Input grid:
| row | A | B | C | D | E | F | G |
| 1 | Name | Mon | | | Tue | | |
| 2 | Alice | 09:00 | 17:00 | | 10:00 | 18:00 | |
| 3 | Bob | | | | OFF | | |

Today 2025-01-13 (Monday). Output:
{"weekOf":"2025-01-13","shifts":[
{"date":"2025-01-13","person":"Alice","start":"09:00","end":"17:00","role":""},
{"date":"2025-01-14","person":"Alice","start":"10:00","end":"18:00","role":""}]}`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

class TimeoutError extends Error {
  status = 504
  constructor() {
    super('Request timed out')
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError()), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

interface GroqResponse {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string; type?: string }
}

const estTokens = (s: string) => Math.ceil(s.length / 3.7)

async function callGemini(opts: {
  apiKey: string
  systemPrompt: string
  userPrompt: string
}): Promise<string> {
  const res = await withTimeout(
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${opts.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: opts.systemPrompt }]
        },
        contents: [
          {
            parts: [{ text: opts.userPrompt }]
          }
        ],
        generationConfig: {
          response_mime_type: 'application/json'
        }
      })
    }),
    PER_ATTEMPT_TIMEOUT_MS
  )

  if (!res.ok) {
    const bodyText = await res.text()
    const err = new Error(`[${res.status}] ${res.statusText}${bodyText ? ' — ' + bodyText.slice(0, 300) : ''}`) as Error & { status?: number; bodyText?: string }
    err.status = res.status
    err.bodyText = bodyText
    throw err
  }

  const json = await res.json()
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!content) throw new Error('Empty response from Gemini.')
  return content
}

async function callGroq(opts: {
  apiKey: string
  model: string
  systemPrompt: string
  userPrompt: string
}): Promise<string> {
  const res = await withTimeout(
    fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: opts.userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: MAX_TOKENS
      })
    }),
    PER_ATTEMPT_TIMEOUT_MS
  )

  if (!res.ok) {
    let bodyText = ''
    try {
      bodyText = await res.text()
    } catch {
      /* ignore */
    }
    const err = new Error(
      `[${res.status}] ${res.statusText}${bodyText ? ' — ' + bodyText.slice(0, 300) : ''}`
    ) as Error & { status?: number; bodyText?: string }
    err.status = res.status
    err.bodyText = bodyText
    throw err
  }

  const json = (await res.json()) as GroqResponse
  if (json.error) {
    throw new Error(json.error.message ?? 'Groq returned an error.')
  }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from Groq.')
  return content
}

function buildUserPrompt(opts: {
  todayISO: string
  knownNames?: string[]
  spreadsheet: string
  spreadsheetLabel: string
  includeFewShot: boolean
}): string {
  const namesHint =
    opts.knownNames && opts.knownNames.length > 0
      ? `\n\nKnown team members (extract shifts for any name matching these, even with different capitalisation/abbreviation):\n- ${opts.knownNames.join('\n- ')}`
      : ''
  const fewShot = opts.includeFewShot ? `\n\n${FEW_SHOT}` : ''
  return (
    `Today is ${opts.todayISO}.${namesHint}${fewShot}\n\n` +
    `Now process THIS rota. Return JSON only.\n\n` +
    `${opts.spreadsheetLabel}:\n${opts.spreadsheet}`
  )
}

export async function parseRotaWithAI(opts: {
  apiKey: string
  geminiApiKey?: string
  aiProvider: 'groq' | 'gemini'
  csv: string
  markdown?: string
  sparseCsv?: string
  todayISO: string
  knownNames?: string[]
  onStatus?: (msg: string) => void
}): Promise<Rota> {
  const { apiKey, geminiApiKey, aiProvider, csv, markdown, sparseCsv, todayISO, knownNames, onStatus } = opts
  const activeApiKey = aiProvider === 'gemini' ? geminiApiKey : apiKey
  if (!activeApiKey) throw new Error(`Missing ${aiProvider.toUpperCase()} API key. Add it in Settings.`)
  if (!csv.trim() && !markdown?.trim() && !sparseCsv?.trim()) {
    throw new Error('The spreadsheet looks empty.')
  }

  const SAFE_INPUT_TOKENS = 8000
  const useMarkdown = !!markdown && estTokens(markdown) <= SAFE_INPUT_TOKENS
  const includeFewShot = estTokens(SYSTEM_PROMPT) + estTokens(FEW_SHOT) < 1500

  type Variant = {
    label: string
    payload: string
    payloadKind: 'markdown' | 'csv' | 'sparseCsv'
    fewShot: boolean
  }

  const variants: Variant[] = []
  if (useMarkdown) {
    variants.push({
      label: 'Spreadsheet as a grid',
      payload: markdown!,
      payloadKind: 'markdown',
      fewShot: includeFewShot
    })
  }

  if (estTokens(csv) <= SAFE_INPUT_TOKENS) {
    variants.push({
      label: 'Spreadsheet (CSV)',
      payload: csv,
      payloadKind: 'csv',
      fewShot: includeFewShot
    })
  }

  if (sparseCsv && estTokens(sparseCsv) <= SAFE_INPUT_TOKENS) {
    variants.push({
      label: 'Spreadsheet (Sparse CSV)',
      payload: sparseCsv,
      payloadKind: 'sparseCsv',
      fewShot: includeFewShot
    })
  }

  variants.push({
    label: 'Spreadsheet (CSV)',
    payload: csv,
    payloadKind: 'csv',
    fewShot: false
  })

  if (sparseCsv) {
    variants.push({
      label: 'Spreadsheet (Sparse CSV)',
      payload: sparseCsv,
      payloadKind: 'sparseCsv',
      fewShot: false
    })
  }

  let lastErr: unknown = null

  for (let m = 0; m < MODEL_FALLBACKS.length; m++) {
    const modelName = MODEL_FALLBACKS[m]

    for (let v = 0; v < variants.length; v++) {
      const variant = variants[v]
      const userPrompt = buildUserPrompt({
        todayISO,
        knownNames,
        spreadsheet: variant.payload,
        spreadsheetLabel: variant.label,
        includeFewShot: variant.fewShot
      })

      onStatus?.(`Asking ${aiProvider === 'gemini' ? 'Gemini' : modelName.split('-')[0]}…`)

      try {
        const text = (
          aiProvider === 'gemini'
            ? await callGemini({
                apiKey: activeApiKey,
                systemPrompt: SYSTEM_PROMPT,
                userPrompt
              })
            : await callGroq({
                apiKey: activeApiKey,
                model: modelName,
                systemPrompt: SYSTEM_PROMPT,
                userPrompt
              })
        ).trim()

        let parsed: unknown
        try {
          parsed = JSON.parse(text)
        } catch {
          throw new Error(`AI returned non-JSON: ${text.slice(0, 200)}`)
        }
        const validated = RotaSchema.safeParse(parsed)
        if (!validated.success) {
          console.error('Zod validation issues:', validated.error.issues)
          throw new Error(
            'AI response did not match the expected rota shape. (See console for details.)'
          )
        }
        console.info(
          `[ai] ${aiProvider === 'gemini' ? 'Gemini' : modelName} (${variant.payloadKind}${variant.fewShot ? '+fs' : ''}) ` +
            `returned ${validated.data.shifts.length} shifts ` +
            `across ${new Set(validated.data.shifts.map((s) => s.person.toLowerCase())).size} people.`
        )
        return validated.data
      } catch (err) {
        console.error(
          `[ai] ${aiProvider === 'gemini' ? 'Gemini' : modelName} (${variant.payloadKind}${variant.fewShot ? '+fs' : ''}) failed:`,
          err
        )
        lastErr = err
        const status = (err as { status?: number })?.status ?? null
        const body = (err as { bodyText?: string })?.bodyText ?? ''
        const isTooLarge =
          status === 413 ||
          /tokens per minute|TPM|too large|context_length/i.test(body)

        if (isTooLarge && v < variants.length - 1) {
          onStatus?.('Rota is large — trying a smaller payload…')
          continue
        }

        const retryable = status != null && RETRYABLE_HTTP.includes(status)
        if (retryable && m < MODEL_FALLBACKS.length - 1) {
          onStatus?.(`${aiProvider === 'gemini' ? 'Gemini' : modelName} busy, switching model…`)
          break
        }

        throw friendlyError(err, status)
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('AI call failed.')
}

interface GroqResponse {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string; type?: string }
}

function friendlyError(err: unknown, status: number | null): Error {
  if (status === 401 || status === 403) {
    return new Error(
      'Groq rejected the API key. Re-paste it on the Settings tab — get a new one at console.groq.com/keys.'
    )
  }
  if (status === 413) {
    return new Error(
      "This rota is too big for Groq's free tier even after compacting. Try uploading a single-week sheet, or wait a minute and retry."
    )
  }
  if (status === 429) {
    return new Error(
      "Hit Groq's free-tier rate limit. Wait about a minute and try again."
    )
  }
  if (status === 503 || status === 502) {
    return new Error(
      'Groq is temporarily overloaded. Wait a few seconds and try again.'
    )
  }
  if (status === 504) {
    return new Error('Groq took too long to respond. Try again.')
  }
  return err instanceof Error ? err : new Error(String(err))
}
