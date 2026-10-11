# Study AI Planner

Upload a CBSE textbook (Classes 9 to 12). The AI reads every page of every chapter and turns it into
notes, revision sheets, formula tables, mind maps, CBSE-pattern worksheets with answer keys, NCERT solutions
and a day-by-day study plan to your exam. Everything downloads as a PDF. It costs nothing to run.

## What it does

- **Accounts:** email and password or Google sign-in. Each student sees only their own books (Postgres row-level security).
- **Full-book reading:** upload one book PDF (split into chapters from its bookmarks, or by hand) or the chapter PDFs from ncert.nic.in.
  Chapters are read one at a time, in full, with progress, and reading resumes where it stopped.
- **Note styles:** detailed notes, one-page revision sheet, formula/definitions sheet, mind map, CBSE worksheet
  (MCQ, assertion-reason, 2/3/5-mark, case-based, with answer key), important questions, NCERT solutions, or any request in your own words.
  Each style is a saved instruction template in [`styles.ts`](supabase/functions/_shared/styles.ts).
- **Notes viewer:** Markdown with KaTeX maths, Mermaid mind maps and Hindi (Devanagari) text. Download PDF uses the browser's print to PDF (A4).
- **Study planner:** spreads chapters over study days by length, a worksheet after each chapter, the last days kept for revision.
  Tick days off; re-plan after missed days. Pure code, unit tested.
- **Two AIs:**
  - **Local (default, free):** Ollama on your own computer. The browser extracts each page's text and sends it to `localhost:11434`.
  - **Claude (your own API key):** reads the chapter PDF itself, including diagrams and scanned pages, and can make a Premium PDF with Anthropic's PDF Agent Skill.
    The key stays in the browser and goes only to Anthropic.

## How it is built

```
Browser (React + Vite + Tailwind)
 ├─ pdf.js / pdf-lib ........ find chapters, cut chapter PDFs, extract page text
 ├─ Ollama (localhost) ...... local AI, or Anthropic API (student's key) for Claude
 └─ Supabase (free tier)
     ├─ Auth ................ email/password, Google
     ├─ Postgres + RLS ...... books, chapters, notes, plans, plan_days
     └─ Storage ............. private chapter PDFs under <user id>/<book id>/
```

| Piece | Where |
|---|---|
| Pages | [`src/pages`](src/pages) |
| Chapter detection and splitting | [`src/lib/pdf.js`](src/lib/pdf.js), [`src/lib/ranges.js`](src/lib/ranges.js) |
| AI engines (local / Claude) | [`src/lib/ai.js`](src/lib/ai.js), [`src/lib/localai.js`](src/lib/localai.js) |
| Note writing | [`src/lib/generate.js`](src/lib/generate.js) |
| Planner | [`src/lib/planner.js`](src/lib/planner.js) |
| Database | [`supabase/migrations`](supabase/migrations) |

Limits that keep it free: 3 books per student (enforced in the database), 50 MB per PDF.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5180. For the local AI, install [Ollama](https://ollama.com) and pull a model (for example `ollama pull llama3.2`;
bigger models write better notes). `npm test` runs the chapter-range and planner tests.

## Deploy

1. Push this folder to a GitHub repository. The `keep-awake` workflow pings Supabase every 3 days so the free project never pauses.
2. Import the repository in Vercel (framework: Vite). `.env` already holds the public Supabase URL and publishable key.
3. In Supabase, go to Authentication → URL Configuration, set Site URL to the Vercel address and add it to Redirect URLs.
4. On the deployed site the local AI works only for visitors running Ollama who allow the site:
   set the environment variable `OLLAMA_ORIGINS=https://<your-site>.vercel.app` and restart Ollama. Everyone else can use Claude with their own key.

## Known limits

- Local AI reads text only; diagrams are seen through their labels. Scanned books need Claude.
- AI answer keys can contain mistakes. Check worksheet answers against the book.
