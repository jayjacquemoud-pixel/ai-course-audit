# AI Interactive Course Audit™

Lead-magnet quiz tool for LightSpeed VT. See `CLAUDE_CODE_HANDOFF.md` for full
product context, verified feature facts, and what's locked from client
review. This README covers the backend/deployment pieces built on top of the
front-end prototype.

## What's in this repo

- `index.html` — the full tool (quiz, scoring, report). Single file, no build
  step, unchanged from the prototype's design/copy/scoring logic.
- `api/generate-report.js` — serverless endpoint that calls the Anthropic
  Messages API server-side, so the API key never reaches the browser.
- `api/submit-lead.js` — serverless endpoint that forwards lead + UTM data to
  a GHL webhook.
- `embed/host-listener-snippet.html` — the script that goes on the *host*
  page (GHL/WordPress/Webflow), not in this repo's deployed tool, to make the
  iframe auto-resize.
- `vercel.json` — sets `Content-Security-Policy: frame-ancestors` to allow
  embedding from `monetize.lightspeedvt.com` (the confirmed landing-page
  domain) and other `*.lightspeedvt.com` subdomains. Add more origins here if
  the tool ends up embedded from WordPress/Webflow domains outside that.

Written for Vercel (zero-config: static file + `/api` folder both deploy
automatically), but `api/*.js` are plain `(req, res) => {}` Node handlers —
porting to Netlify Functions or an AWS Lambda + API Gateway adapter is a
small wrapper, not a rewrite.

## Deploying

1. Push this repo to GitHub, then import it in Vercel (or run `vercel` from
   this directory).
2. Set environment variables in the Vercel project settings:

   | Variable | Required | Purpose |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Yes | Server-side key used by `api/generate-report.js`. Never expose this client-side. |
   | `GHL_WEBHOOK_URL` | Yes (for lead capture to work) | The GHL inbound webhook URL for Location ID `5IhdlYzc3DlT022CwekG`. **Confirmed** — Jay provided the exact `services.leadconnectorhq.com/hooks/.../webhook-trigger/...` URL in the build chat; set it as this env var in the deployment platform's dashboard. Not committed to this repo since it functions like a bearer credential (anyone with the URL can write leads into the live GHL account). Until it's set, `api/submit-lead.js` logs the payload server-side and returns `{ok:false}` instead of failing the quiz. |
   | `GHL_API_KEY` | No | Only needed if GHL's REST API (Bearer token) is used instead of an inbound webhook. |
   | `GHL_LOCATION_ID` | No | Overrides the default `5IhdlYzc3DlT022CwekG` if needed. |

3. Deploy. The tool is served at the project's root URL — **that Vercel/host
   URL is the tool's own address, separate from the landing page below.** It
   still needs to be decided/confirmed; once it is, that's what goes in the
   iframe `src` on the landing page.

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

## Local development

```
npm i -g vercel   # if not already installed
vercel dev
```

`vercel dev` serves `index.html` and runs the `/api` functions locally with
the same routing as production. Create a `.env` file (gitignored) with
`ANTHROPIC_API_KEY` and `GHL_WEBHOOK_URL` for local testing.

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
