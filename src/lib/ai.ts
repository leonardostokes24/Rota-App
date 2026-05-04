import { RotaSchema, type Rota } from './types'

// Groq is fully free (no card required), extremely fast (LPU-accelerated),
// and exposes an OpenAI-compatible REST API — so no SDK needed.
// Get a key: https://console.groq.com/keys
//
// Tried in order if a model is overloaded or rate-limited.
// llama-3.3-70b is best quality but has only 12k TPM on the free tier;
// gemma2-9b has higher TPM (15k) so we fall to it on 413/429-tpm.
const MODEL_FALLBACKS = [
  'llama-3.3-70b-versatile',
  'gemma2-9b-it',
  'llama-3.1-8b-instant'
]

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const RETRYABLE_HTTP = [429, 500, 502, 503, 504]
const PER_ATTEMPT_TIMEOUT_MS = 45_000
const MAX_TOKENS = 8000

// Tighter prompt — removes verbose explanations while keeping the rules
// that prevent the model from missing names or truncating output.
const SYSTEM_PROMPT = `You convert work-rota spreadsheets into structured JSON.

Rotas appear as: a grid (names down, days across), a transposed grid (days down, names across), a list (one shift per row), or stacked sub-tables.

Return ONE JSON object, no prose, no code fences:
{
  "weekOf": "YYYY-MM-DD",
  "shifts": [
    {"date":"YYYY-MM-DD","person":"string","start":"HH:mm","end":"HH:mm","role":"string"}
  ]
}

Rules:
- EXHAUSTIVE: include every (person, date) shift you can find. If 8 people work, output shifts for all 8. Do not summarise or skip.
- NAMES: identify every distinct name in the data first (including merged cells, ALL CAPS, abbreviations) before building shifts.
- TIMES: convert all formats to 24h "HH:mm". "9-5" -> 09:00–17:00. "9am-2pm" -> 09:00–14:00. "1730" -> 17:30. Larger number is end.
- SKIP: cells that are empty or say OFF / REST / DAY OFF / X / - / N/A.
- DATES: if only weekdays are shown, infer the date from today's date provided below. Always return YYYY-MM-DD.
- ROLES: text like "9-5 BAR" -> times in start/end, "BAR" in role. If no times, leave start/end "".
- Do NOT truncate the JSON array. Prefer short role strings to cutting shifts.`

const FEW_SHOT = `Example. Input grid:
| row | A | B | C |
| 1 | Name | Mon | Tue |
| 2 | Alice | 9-5 | OFF |
| 3 | Bob | OFF | 10-6 |

Today 2025-01-13. Output:
{"weekOf":"2025-01-13","shifts":[
{"date":"2025-01-13","person":"Alice","start":"09:00","end":"17:00","role":""},
{"date":"2025-01-14","person":"Bob","start":"10:00","end":"18:00","role":""}]}`

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

// Rough char-to-token estimate so we can pre-emptively pick a smaller payload.
const estTokens = (s: string) => Math.ceil(s.length / 3.7)

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
  csv: string
  markdown?: string
  todayISO: string
  knownNames?: string[]
  onStatus?: (msg: string) => void
}): Promise<Rota> {
  const { apiKey, csv, markdown, todayISO, knownNames, onStatus } = opts
  if (!apiKey) throw new Error('Missing Groq API key. Add it in Settings.')
  if (!csv.trim() && !markdown?.trim()) {
    throw new Error('The spreadsheet looks empty.')
  }

  // Pick the most informative representation that fits comfortably below
  // the 12k TPM ceiling of the default 70B model. Markdown grid is best
  // for LLMs but verbose; CSV is more compact.
  const SAFE_INPUT_TOKENS = 8000 // leaves room for system + few-shot + output
  const useMarkdown = !!markdown && estTokens(markdown) <= SAFE_INPUT_TOKENS
  const includeFewShot = estTokens(SYSTEM_PROMPT) + estTokens(FEW_SHOT) < 1500

  type Variant = {
    label: string
    payload: string
    payloadKind: 'markdown' | 'csv'
    fewShot: boolean
  }
  // Variants are tried left-to-right when we hit 413/TPM rate limits.
  const variants: Variant[] = []
  if (useMarkdown) {
    variants.push({
      label: 'Spreadsheet as a grid',
      payload: markdown!,
      payloadKind: 'markdown',
      fewShot: includeFewShot
    })
  }
  variants.push({
    label: 'Spreadsheet (CSV)',
    payload: csv,
    payloadKind: 'csv',
    fewShot: includeFewShot
  })
  // Final fallback: CSV with no few-shot (smallest possible input)
  variants.push({
    label: 'Spreadsheet (CSV)',
    payload: csv,
    payloadKind: 'csv',
    fewShot: false
  })

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

      onStatus?.(`Asking ${modelName.split('-')[0]}…`)

      try {
        const text = (
          await callGroq({
            apiKey,
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
          `[ai] ${modelName} (${variant.payloadKind}${variant.fewShot ? '+fs' : ''}) ` +
            `returned ${validated.data.shifts.length} shifts ` +
            `across ${new Set(validated.data.shifts.map((s) => s.person.toLowerCase())).size} people.`
        )
        return validated.data
      } catch (err) {
        console.error(
          `[ai] ${modelName} (${variant.payloadKind}${variant.fewShot ? '+fs' : ''}) failed:`,
          err
        )
        lastErr = err
        const status = (err as { status?: number })?.status ?? null
        const body = (err as { bodyText?: string })?.bodyText ?? ''
        const isTooLarge =
          status === 413 ||
          /tokens per minute|TPM|too large|context_length/i.test(body)

        // Too big? Try a smaller variant (CSV → CSV without few-shot).
        if (isTooLarge && v < variants.length - 1) {
          onStatus?.('Rota is large — trying a smaller payload…')
          continue
        }

        // Other transient errors — switch model.
        const retryable = status != null && RETRYABLE_HTTP.includes(status)
        if (retryable && m < MODEL_FALLBACKS.length - 1) {
          onStatus?.(`${modelName} busy, switching model…`)
          break // breaks the variant loop, outer loop advances to next model
        }

        // We've exhausted reasonable retries on this attempt.
        throw friendlyError(err, status)
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Groq call failed.')
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
