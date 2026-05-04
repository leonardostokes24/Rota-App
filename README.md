# Rota

Your team rota, on your phone. Drop in an Excel file, an AI parses it, your shifts show up on the home screen.

## What you've got

A web app that:
- Runs in a browser
- Installs to your Android home screen as a real app icon (PWA)
- Reads `.xlsx`, `.xls`, or `.csv` rotas
- Uses **Groq** (fully free, no card required, very fast) to convert messy spreadsheets into structured shifts
- Stores everything locally on your phone — no account, no cloud

## Stack

- React + TypeScript + Vite (fast dev, small build)
- Tailwind CSS (styling)
- vite-plugin-pwa (turns the site into an installable app)
- SheetJS / `xlsx` (reads Excel files in the browser)
- Groq API via plain `fetch` — OpenAI-compatible, no SDK needed
- Dexie (local browser database)
- Zod (validates AI responses)

## First-time setup

You only do this once.

1. **Install Node.js (LTS).** Grab the installer from https://nodejs.org and click through. This gives you `node` and `npm` on your machine.
2. **Open a terminal** in this folder. On Windows: open the folder in File Explorer, click the address bar, type `cmd`, hit Enter.
3. **Install the dependencies:**
   ```
   npm install
   ```
   This downloads everything the app needs into a `node_modules` folder. Takes a minute or two.
4. **Run it locally:**
   ```
   npm run dev
   ```
   You'll see a URL like `http://localhost:5173`. Open it in your browser. The app should load.

## Using the app

1. **Get a free Groq API key.** Go to https://console.groq.com/keys, sign in (Google sign-in works), click **Create API Key**, copy the `gsk_…` string. No credit card required.
2. Open the **Settings** tab in the app, paste the key, type your name, hit Save.
3. Go to **Team** and add the names of everyone who appears in your rota (this helps the app match shifts to people).
4. Go to **Upload**, pick your Excel rota, wait a couple seconds for Groq to parse it, hit Save.
5. The **Home** screen now shows your shifts for the week.

## Why Groq

It was the cleanest answer to "fully free and fast":

- **Free**: no credit card, no trial period, just sign in and go.
- **Fast**: LPU-accelerated inference, often 500+ tokens/second — typical rota parses in under a second.
- **Generous limits**: 30 req/min and tens of thousands of requests/day on the free tier — way more than a rota app needs.
- **Good models**: Llama 3.3 70B (default), Llama 3.1 8B, Gemma 2 — the app falls back automatically if one's overloaded.

## Putting it on your Android phone

The clean way is to deploy the app to a public URL and install it from Chrome.

### Free deploy via Vercel (5 minutes)

1. Sign up at https://vercel.com (use your GitHub account if you have one).
2. Push this folder to a new GitHub repo (or use Vercel's CLI: `npm i -g vercel` then `vercel` in this folder).
3. Vercel auto-detects Vite, builds it, and gives you a URL like `https://rota-app-xyz.vercel.app`.
4. On your Android phone, open that URL in Chrome.
5. Tap the three-dot menu → **Install app** (or **Add to Home screen**).
6. You now have a Rota icon on your home screen that opens full-screen, no browser bar.

### Or run on your phone over local Wi-Fi (testing only)

1. Make sure your laptop and phone are on the same Wi-Fi.
2. Run `npm run dev` — note the "Network:" URL it prints (something like `http://192.168.x.x:5173`).
3. Open that URL in Chrome on your phone.
   Note: PWA install requires HTTPS, which local dev doesn't give you, so you can use the app but you can't fully install it this way. Use Vercel for the real install.

## File map

```
public/
  icons/                  PWA app icons (192px, 512px)
src/
  main.tsx                React entry
  App.tsx                 Tab routing shell
  index.css               Tailwind base
  pages/
    Home.tsx              "Hi, you" + shifts for the week
    Upload.tsx            File picker → AI parse → preview → save
    Team.tsx              Add/remove team member names
    Settings.tsx          Your name + Groq API key
  components/
    BottomNav.tsx         Android-style bottom tab bar
    ShiftCard.tsx         One row of the rota
    RotaTable.tsx         List of ShiftCards
  lib/
    types.ts              TypeScript types + Zod schemas
    db.ts                 Dexie database (people, rotas, settings)
    excel.ts              Reads spreadsheet → CSV string
    ai.ts                 Calls Groq, validates response
vite.config.ts            PWA + plugins
tailwind.config.ts
package.json
```

## Troubleshooting

**"Add your Groq API key in Settings first."** — open Settings, paste your key from https://console.groq.com/keys, hit Save.

**"Groq rejected the API key"** (401/403) — the key is invalid or revoked. Generate a new one at https://console.groq.com/keys and paste it in Settings.

**"AI returned non-JSON"** — try uploading again. If it keeps happening, the spreadsheet is probably very unusual; try cleaning it up (header row at the top, names down one column, days across).

**"Hit Groq's free-tier rate limit"** — you've sent more than 30 requests in a minute. Wait 60 seconds and try again.

**Model names retired** — if Groq deprecates a model, you'll see "model_decommissioned" or similar in the console. Open `src/lib/ai.ts` and update `MODEL_FALLBACKS` from https://console.groq.com/docs/models.

**Install button doesn't appear on Android.** — the app must be served over HTTPS. Local dev uses HTTP. Deploy to Vercel and try again from there.

**Want to change the app name / icon / colors?** — edit `vite.config.ts` (PWA manifest), `tailwind.config.ts` (colors), and the files in `public/icons/`.

## When you want cloud sync later

The data layer is in `src/lib/db.ts`. Swap Dexie for Supabase calls and add an auth screen — the rest of the app keeps working. The TypeScript types in `src/lib/types.ts` map cleanly onto Supabase tables.
