# AI Interactive Course Audit™ — Claude Code Build Brief
_Regenerated to consolidate all confirmed product facts, positioning, and technical requirements._

## What this is
A lead-magnet quiz tool for LightSpeed VT. Prospects answer questions about their
current training program, get a scored diagnostic across 10 categories, and receive
an AI-written executive audit report that positions LightSpeed VT as the solution to
their specific gaps.

A fully working front-end prototype already exists: **`ai-course-audit.html`**
(attached alongside this brief). It has the complete UI, question flow, deterministic
scoring logic, and report layout, all built to LightSpeed VT brand spec, and all
product/feature claims inside it have been verified against LSVT's own sites (see
"Verified Product Facts" below). It currently runs standalone in a browser with
three gaps that only exist because it was built inside claude.ai's artifact sandbox
— **those three gaps are this project's actual scope.**

---

## The three things that need real backend / integration work

### 1. AI report generation currently only works inside claude.ai
The prototype calls `https://api.anthropic.com/v1/messages` directly from the
browser. That works in claude.ai because the sandbox injects an API key
automatically. It will **not** work once this is hosted anywhere else — there's no
key, and you'd never want to expose one client-side anyway.

**Build this:** a small server-side endpoint (serverless function is fine — Vercel,
Cloudflare Worker, AWS Lambda, whatever fits LSVT's existing stack) that:
- Accepts the same payload the front end currently builds client-side (see
  `callClaudeForNarrative()` in the HTML file for the exact prompt and expected
  JSON response shape)
- Holds the real `ANTHROPIC_API_KEY` as a server-side environment variable
- Calls the Anthropic Messages API (model: a current Claude model — check
  `docs.claude.com` for the latest recommended model string, don't hardcode an old one)
- Returns the same JSON shape the front end already expects:
  `{ executiveSummary, categories: {...}, roadmap: [...], overallRecommendation }`
- The front end's fallback narrative logic (`fallbackNarrative()`) should stay as
  the safety net if this endpoint errors or times out — don't remove it.

Update the front end's `fetch()` call to hit this new endpoint instead of
`api.anthropic.com` directly.

### 2. Lead + UTM data needs to actually reach GHL
The prototype captures name, email, phone (all required, validated) plus four
hidden UTM fields (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`,
auto-populated from the page's query string on load) and currently just writes
them to Claude's artifact storage as a stand-in.

**Build this:** on the same lead-capture step, POST the captured data to a GHL
webhook instead:

```
GHL Location ID: 5IhdlYzc3DlT022CwekG
```

Payload should include at minimum:
```json
{
  "name": "...",
  "email": "...",
  "phone": "...",
  "utm_source": "...",
  "utm_medium": "...",
  "utm_campaign": "...",
  "utm_content": "...",
  "company": "...",
  "industry": "...",
  "audience": "...",
  "goal": "...",
  "courseTitle": "...",
  "overallScore": 74,
  "categoryScores": { "learnerEngagement": 58, "...": "..." }
}
```
Map the four UTM fields 1:1 to matching custom fields on the GHL contact record so
attribution survives into reporting. Confirm the exact webhook URL / auth method
with Keith — he manages GHL connector/API config on the Anthropic org side, and
there's a known GHL MCP connector at `https://services.leadconnectorhq.com` that may
already be relevant here (there was previously an egress-allowlist issue blocking
`services.leadconnectorhq.com` for direct REST calls from claude.ai — shouldn't
apply once this is a real backend, but flag it if it comes up).

Ideally this webhook call fires **immediately on lead-gate submit** (before the quiz
even starts, since the capture is front-loaded and required), not just at report
completion — so a lead is captured even if someone abandons mid-quiz.

### 3. This needs to embed cleanly into GHL, WordPress, and Webflow via iframe
This tool will not be its own standalone page — it gets embedded into marketing
pages built natively in GHL, WordPress, and/or Webflow (final platform(s) TBD). The
surrounding page (hero, brand imagery, testimonials, Brad's video, etc.) is built
natively in each platform's own page builder for full creative control. Only the
quiz/report tool itself sits inside an iframe lower on the page.

This decision was made deliberately after evaluating pasting the raw code directly
into each platform's custom-code blocks:
- **Webflow's Code Embed element caps at 50,000 characters.** This file is larger
  than that (~65-70K depending on final build). Splitting across multiple embeds is
  fragile and not worth the maintenance burden — iframe only, no alternative here.
- **GHL's Custom Code element is meant for small snippets**, not a full document —
  it's likely to strip `<head>` content (fonts, icon library script). Use GHL's
  dedicated **iFrame element** instead.
- **WordPress's Custom HTML block** can technically hold it, but `<script>` tags in
  post content get filtered depending on user role and security plugins. Iframe
  avoids that inconsistency.

**Build this — two specific requirements for the embed to work well:**

**a) Auto-resizing iframe, not a fixed-height scroll box.** The quiz has multiple
screens of very different lengths (a 3-field intro vs. an 8-question section), so a
fixed iframe height will either clip content or leave huge empty space depending on
the screen. Implement the standard pattern:
- Inside the tool: on every screen change, `postMessage` the current
  `document.body.scrollHeight` (or a wrapper element's height) to the parent window.
- On the host page: a small listener script resizes the iframe's height to match
  whatever height it receives via `postMessage`.
- This needs to fire on: initial load, every `nextSection()`/`prevSection()` call,
  and after `renderReport()` (the report is much taller than any quiz screen).
- Test this in an actual GHL/WordPress/Webflow iframe, not just a local dev iframe —
  cross-origin `postMessage` behavior is what actually matters here, and it only
  shows up once the tool is hosted on a different domain than the page embedding it.

**b) UTM parameters must pass through the iframe boundary.** The tool already reads
`utm_source` / `utm_medium` / `utm_campaign` / `utm_content` from its own URL query
string on load (see `getUTMParams()` in the HTML). That only works if the **iframe's
`src` URL itself carries those params** — most page builders (including GHL) support
passing merge tags like `{{utm_source}}` into an embed URL's query string, but
that's a per-page config step on whichever platform hosts the final page, not
something fixable in the tool's own code. Flag this explicitly to whoever builds the
final landing pages so it isn't missed — a silent failure here means every lead
loses attribution.

**Where to host the tool itself:** any stable static host works since it's a
single file with no build step — a page on `train.lightspeedvt.com`, GHL's own
Media/File Manager, or Netlify/Vercel static hosting. It just needs a public,
stable URL for the iframe `src` across all the platforms embedding it.

---

## Verified Product Facts (do not deviate without checking these sources)

Every LSVT feature claim in the tool was checked against these two sources. If
Claude Code needs to add or change any product claim, verify it here first —
**do not infer, assume, or invent LSVT feature names, mechanics, or numbers.**

- **`https://support.lightspeedvt.com/`** — main support site; covers the full
  feature set (Private Label Management, Courseware Manager, Interactive Studio,
  Multi Private Label Environment, Reporting, SCORM, VT²GO mobile app, etc.) and the
  AI-specific tools (AI Courseware Wizard, AI Tutor, AI Roleplay, AI Scored
  Response, AI Question Generation, AI Insights, AI Ghost Writer, AI Image
  Generation, AI Speedy Bot). This is also the self-serve resource a $399/mo
  customer uses to set everything up themselves — see pricing note below.
- **`https://instant.lightspeedvt.com/`** — current pricing and add-on services.

**Current pricing & positioning (confirmed directly by Jay — supersedes the page's
own "Instant Training Department" framing, which is outdated language still live on
the page but no longer how this is sold):**
- Base license: **$399/mo minimum, or $3/user, whichever is greater.** This is
  **fully self-serve** — a customer can sign up and run the entire system themselves
  using the support site above. No purchase of additional services is required.
- **White Glove Rollout** and **Course Credits** (1 credit = 1 fully built course,
  done for the client by LSVT's team) are **optional done-for-you services** on top
  of the base license — not bundled in, not required. Frame these as "if you'd
  rather we build/launch it for you" rather than a mandatory next step.
- **Personal Avatar** is also a premium add-on (a studio-quality AI version of the
  client, trained on their own voice/likeness). Every course otherwise includes a
  **Library Avatar** (a professional AI presenter from LSVT's existing library) at
  no extra cost.
- **Naming rule:** AI avatars are real (LSVT licenses third-party avatar
  technology), but the underlying vendor is never named in any client-facing
  content. Only ever say **"Library Avatar"** or **"Personal Avatar."**

**Key exclusive/differentiating features to know about (all verified, use these
exact names):**
- **Interactive Studio** — turns regular video into truly interactive experiences
  with full tracking of learner behavior inside them.
- **Multi Private Label Environment** — run unlimited sub-private-labeled VT
  systems. This is the feature behind reselling: a course owner can license and
  rebrand their own course so another company sells it under their own brand
  (e.g., licensing a car-sales course to an auto dealership, branded as theirs).
  LSVT's own docs call this "one of the big points of differentiation" and describe
  it as enabling "a full B2B training solution."
- **AI Tutor** — an on-demand study partner that answers learner questions in the
  course, explains concepts, and guides learners to the right training.
- **AI Courseware Wizard**, **AI Ghost Writer** — turn raw source material into
  structured course outlines, scripts, and written content.
- **AI Roleplay**, **AI Scored Response**, **AI Question Generation** — practice
  scenarios and assessments built/scored with AI.
- **AI Insights** — plain-English querying of training data; paired with **Deep
  Reporting & Dashboards** for broader analytics.
- **VT²GO** — native mobile app, including offline access.
- **Track record:** LightSpeed VT has been building training technology since 2000
  (over two decades), with over **$1.6 billion in online course sales in the last
  10 years** (per train.lightspeedvt.com). Do not use "25 years" or "200,000+
  companies" — those numbers were never confirmed and have been removed from the
  tool.

---

## What NOT to change
The following are locked in from client review and shouldn't be redesigned without
checking back:
- Visual design system (LightSpeed VT brand tokens: Montserrat/Public Sans, dark
  blue `#12355A` / light blue `#2098D0`, pill buttons, card-based question layout
  with numbered badges — this went through several rounds of contrast/readability
  fixes, don't simplify it back down)
- Question flow, wording, and scoring logic across all 8 sections / 10 categories
- Lead capture is required (name + email + phone) and sits at the front of the
  funnel, not gating the report at the end
- The strict separation between the neutral/critical assessment narrative and the
  clearly-labeled "Why LightSpeed VT" vendor section — this was an explicit client
  requirement so the report doesn't read as disguised marketing copy. Don't blend
  LSVT feature mentions back into the diagnostic category insights, and don't
  reintroduce unverified feature claims into either section.
- The site-wide footer (copyright, Privacy/Disclaimer/AUP links, address, phone)
- The two CTA links at the end of the report — "Book a 15-Minute Demo" points to
  `instant.lightspeedvt.com/talk-to-us`, "Get My System" points to
  `instant.lightspeedvt.com/get-my-system` — plus the pricing/self-serve footnote
  beneath them.

## Nice-to-haves if there's room in scope
- Save partial quiz progress (currently a hard refresh loses answers)
- A results/leads dashboard for LSVT's team, separate from GHL, if useful
- A/B test lead-capture position (front vs. end-gated) once there's real traffic

---

## Build environment note
If the machine picking this up has an older OS or limited local setup, use
**Claude Code on the web** (`claude.ai/code`) rather than the local terminal CLI —
it runs entirely in Anthropic's cloud sandbox, so it doesn't depend on the local
machine's OS version or hardware, just a browser and a paid Claude plan (Pro or
higher). Upload this brief and `ai-course-audit.html` into that session to get
started.

## Files in this handoff
- `ai-course-audit.html` — the full working prototype, single file, no build step
- This brief

## Contact for context
Questions on GHL/connector access → Keith (org admin, manages GHL + API connector
config). Questions on messaging, positioning, or product-fact verification → Jay
(built this brief and the prototype content).
