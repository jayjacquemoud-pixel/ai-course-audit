# AI Interactive Course Audit™

Lead-magnet quiz tool for LightSpeed VT. See `CLAUDE_CODE_HANDOFF.md` for full
product context, verified feature facts, and what's locked from client
review. This README covers the backend/deployment pieces built on top of the
front-end prototype.

## What's in this repo

- `index.html` — the full tool (quiz, scoring, report). Single file, no build
  step, unchanged from the prototype's design/copy/scoring logic.
- `functions/api/generate-report.js` — Cloudflare Pages Function that calls
  the Anthropic Messages API server-side, so the API key never reaches the
  browser. Cloudflare auto-routes this file to `POST /api/generate-report`.
- `functions/api/submit-lead.js` — Cloudflare Pages Function that forwards
  lead + UTM data to a GHL webhook. Auto-routed to `POST /api/submit-lead`.
- `embed/host-listener-snippet.html` — the script that goes on the *host*
  page (GHL/WordPress/Webflow), not in this repo's deployed tool, to make the
  iframe auto-resize.
- `_headers` — Cloudflare Pages' config file for custom response headers.
  Sets `Content-Security-Policy: frame-ancestors` to allow embedding from
  `monetize.lightspeedvt.com` (the confirmed landing-page domain) and other
  `*.lightspeedvt.com` subdomains. Add more origins here if the tool ends up
  embedded from WordPress/Webflow domains outside that.

Written for **Cloudflare Pages** (zero-config: static file + `functions/`
folder both deploy automatically, no build step, no `wrangler.toml`
needed). The two function files use Cloudflare's Pages Functions handler
signature (`export async function onRequest(context)`, Web-standard
`Request`/`Response` objects, `context.env` for environment variables) —
this is different from Vercel/Netlify/AWS Lambda's Node `(req, res)` style,
so porting to those platforms would need the handler signature adapted
(the actual logic — prompt building, Anthropic call, GHL forwarding — stays
the same).

## Deploying (Cloudflare Pages, via the dashboard)

You don't need the `wrangler` CLI for this — the dashboard's Git integration
does everything, including auto-redeploying on every future push.

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com/) and log in
   (the account's own email doesn't need to match anything else — GHL and
   Anthropic auth are independent of who owns the hosting account).
2. In the left sidebar, go to **Workers & Pages** → **Create application** →
   the **Pages** tab → **Connect to Git**.
3. Authorize Cloudflare's GitHub App if prompted, then select the
   `jayjacquemoud-pixel/ai-course-audit` repository.
4. On the build settings screen:
   - **Production branch**: `claude/new-session-ns2yhl` (or whichever branch
     you want live — change this later in Settings if needed).
   - **Framework preset**: None.
   - **Build command**: leave blank (no build step).
   - **Build output directory**: `/` (the repo root — `index.html` and
     `functions/` live together, there's no separate `dist` folder).
5. Before the first deploy, expand **Environment variables** and add:
   - `ANTHROPIC_API_KEY` — your real Anthropic API key. Click the "Encrypt"
     / secret toggle if offered, so it doesn't show in plaintext in the
     dashboard afterward.
   - `GHL_WEBHOOK_URL` = `https://services.leadconnectorhq.com/hooks/5IhdlYzc3DlT022CwekG/webhook-trigger/fe171456-8aaf-4647-804e-073d56b824be`
     (also mark as secret if offered).
   - (You can also add these after the first deploy, under **Settings** →
     **Environment variables** — just remember to hit **Redeploy** afterward
     for a new env var to take effect on an existing deployment.)
6. Click **Save and Deploy**. Cloudflare builds and gives you a URL like
   `https://ai-course-audit-xxx.pages.dev` — **that's the tool's own
   address**, separate from the landing page. This is what goes in the
   iframe `src` on the GHL landing page (see below).
7. (Optional) **Custom domain**: in the Pages project → **Custom domains** →
   add one (e.g. `tool.lightspeedvt.com`) if you'd rather not use the
   `.pages.dev` URL long-term. Not required to get started.

## Embedding via iframe (GHL / WordPress / Webflow)

The quiz/report tool is not its own landing page — it's embedded via iframe
lower on a page built natively in each platform's page builder (see
`CLAUDE_CODE_HANDOFF.md` for why iframe was chosen over pasting raw code).
The confirmed landing page for this launch is
**`https://monetize.lightspeedvt.com/ai-course-audit-lp`** (a GHL funnel
page) — that page gets the iframe + the listener snippet below; the tool
itself still deploys to its own separate URL.

Two things have to be done on the **host page**, not in this tool:

1. **Pass UTM params into the iframe `src`.** The tool reads
   `utm_source`/`utm_medium`/`utm_campaign`/`utm_content` from its own URL on
   load. That only works if the iframe's `src` carries them, e.g.:
   ```
   https://YOUR-DEPLOYED-DOMAIN/?utm_source={{utm_source}}&utm_medium={{utm_medium}}&utm_campaign={{utm_campaign}}&utm_content={{utm_content}}
   ```
   Most page builders (including GHL) support merge tags like `{{utm_source}}`
   in an embed URL's query string — this is a per-page config step on
   whichever platform hosts the final page. **Flag this to whoever builds the
   landing pages** — skipping it silently drops attribution for every lead.

2. **Add the resize listener.** Paste `embed/host-listener-snippet.html` onto
   the host page (once per page) and give the iframe the matching `id`. The
   tool posts its height to the parent on load, on every quiz screen change,
   and when the report renders; the snippet resizes the iframe to match so
   screens of very different lengths never clip or leave empty space.

   In GHL specifically, use the dedicated **iFrame element** (not the Custom
   Code element, which is meant for small snippets and may strip `<head>`
   content).

### Testing the embed

Test in an actual GHL/WordPress/Webflow iframe on its real domain, not just a
local dev iframe — cross-origin `postMessage` behavior only shows up once the
tool is served from a different origin than the page embedding it.

## GHL webhook payload fields (for mapping custom fields)

`functions/api/submit-lead.js` forwards a flat JSON object to the GHL inbound webhook —
every field is a top-level key (no nested objects), since GHL's inbound
webhook trigger only auto-detects flat keys as individually mappable merge
fields. Two POSTs happen per completed visitor, both to the same webhook, so
map by `email` and use `stage` to tell them apart (see the "stage" field
below):

| Field | Sent on | Example | Notes |
|---|---|---|---|
| `name`, `email`, `phone` | both | `"Jane Doe"` | required; from the lead-gate form |
| `stage` | both | `"started_audit"` or `"completed_audit"` | `started_audit` fires on lead-gate submit (before any questions); `completed_audit` fires again at the end with full scores. Map/branch on this if you want different automations for abandoned vs. completed. |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` | both | `"google"` | from the iframe's query string — blank if the host page didn't pass them through |
| `submittedAt` | both | ISO timestamp | |
| `company`, `industry`, `audience`, `goal`, `courseTitle` | `completed_audit` only | free text | from the quiz's profile/course sections |
| `overallScore` | `completed_audit` only | `74` | 0–100 |
| `score_courseStructure`, `score_contentQuality`, `score_learnerEngagement`, `score_knowledgeRetention`, `score_assessmentStrategy`, `score_aiReadiness`, `score_mobileLearning`, `score_reportingAnalytics`, `score_scalability` | `completed_audit` only | `58` | 0–100 each, one flat field per category — map each to its own custom field if you want per-category reporting in GHL |

## Local development

```
npm install --no-save wrangler
npx wrangler pages dev .
```

This serves `index.html` and runs the `functions/api/*.js` functions locally
with the same routing as production, on `http://localhost:8788` by default.
Create a `.dev.vars` file (gitignored — same `KEY=value` format as a
standard `.env` file) with `ANTHROPIC_API_KEY` and `GHL_WEBHOOK_URL` for
local testing; `wrangler` picks it up automatically.

## Notes on the report-generation flow

`callClaudeForNarrative()` in `index.html` still builds the full prompt
client-side (unchanged prompt engineering, category list, tone rules) — only
the network call moves server-side. It POSTs `{ prompt }` to
`/api/generate-report`, which adds the real API key, calls Anthropic, parses
the model's JSON output, and returns it directly in the shape the front end
expects: `{ executiveSummary, categories, roadmap, overallRecommendation }`.

If that call fails or times out (20s client-side / 25s server-side),
`generateReport()` falls back to `fallbackNarrative()` exactly as before —
that safety net was not touched.
