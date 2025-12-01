<!-- Project-specific Copilot instructions (concise, actionable). -->
# Copilot / AI Agent Instructions

This file gives focused, repository-specific guidance so an AI coding agent can be productive immediately.

**Project Summary:**
- **Framework:** Next.js (App Router, `app/` directory).
- **Purpose:** Admin / intake UI for listings with serverless API routes under `app/api` and intake pages under `app/intake`.
- **Languages:** Mixed JavaScript and TypeScript (`.js`, `.jsx`, `.ts`).

**Quick Start (commands)**
- `npm run dev` — run the local Next dev server.
- `npm run build` — build for production.
- `npm run start` — start the built server.
- `npm run lint` — run ESLint.

**Key Architecture & Patterns**
- `app/` is the single source of truth: pages, layout and server routes live here (App Router). Edit route handlers in `app/api/**/route.js` or `.ts`.
- Server-side Supabase: use `lib/supabase/server.js` -> `createClient()` for server RPCs. It expects `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Client-side Supabase: use `lib/supabaseClient.js` (`supabase`) — this uses the same `NEXT_PUBLIC_*` vars and will warn if missing.
- SKU & sequencing: `lib/skuHelpers.ts` (brand/model → codes, slug building) and `lib/sequence.ts` (calls a Postgres RPC `next_sequence`). When changing SKU logic, update both helpers and DB RPCs accordingly.
- Validation: intake payload schema lives in `lib/validation/intake.ts` (Zod). Use it to keep server and client expectations consistent.
- Uploads & images: image helpers and UI are in `components/upload/*` (resizing/compression). The UI expects compressed files from those helpers.

**AI / OpenAI Integration**
- OpenAI client is used in multiple server routes (e.g. `app/api/route.js`, `app/api/intake/ai/route.js`, `app/intake/ai/route.js`). These initialize `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })`.
- Ensure `OPENAI_API_KEY` is present in the environment for server routes (Vercel + local `.env.local`). Do NOT commit secrets.

**Important Conventions & Gotchas (do not ignore)**
- Case-sensitive paths: this repo currently contains both `item/` and `Item/` style directories. Windows (development) is case-insensitive but Linux (Vercel) is case-sensitive — unify names before making deploy changes.
- Mixed JS/TS: be conservative when refactoring across file types. Follow existing exports/import style in the edited file.
- API route shape: handlers follow Next App Router signatures — modify `GET/POST` exported functions (check existing `route.js` handlers for examples).

**Where to look first for common tasks**
- Add or change intake form behavior: `app/intake/page.js`, `components/*` for UI pieces and `app/api/intake/*/route.js` for server logic.
- Change SKU generation: `lib/skuHelpers.ts`, `lib/sequence.ts`, and server route `app/api/intake/generate-sku/route.js`.
- Modify Supabase calls: `lib/supabase/server.js` (server) and `lib/supabaseClient.js` (client). Note the env-var checks and thrown errors in server client.
- Image processing flows: `components/upload/*` (compress/resizer) + upload endpoints in `app/api/intake/upload/route.js`.

**Testing / Verification Tips**
- No automated tests detected — verify manually: run `npm run dev`, exercise the intake UI at `/intake`, and call `/api/intake/generate-sku` via the UI to validate SKU logic.
- For server changes that affect DB RPCs (e.g. `next_sequence`) validate on a staging Supabase instance.

**Safety and security**
- Do not hardcode secrets. Use `.env.local` for local development and Vercel environment variables for deploys.
- OpenAI usage is server-side. Avoid exposing `OPENAI_API_KEY` in client bundles.

**Examples (copyable snippets)**
- Use server supabase safely:
```
import { createClient } from 'lib/supabase/server.js'
const supabase = createClient(); // will throw if NEXT_PUBLIC_* env missing
```
- Use SKU helpers:
```
import { brandCode, modelCode, buildInventorySlug } from 'lib/skuHelpers'
const sku = `${brandCode(brand)}-${modelCode(model)}-${sequence}`
```

If anything above is unclear or you'd like more examples (API call shapes, typical request/response examples, or standard PR checklist for this repository), tell me what to expand and I'll iterate.
