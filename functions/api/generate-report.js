// Cloudflare Pages Function. Lives at functions/api/generate-report.js, which
// Cloudflare automatically routes to POST /api/generate-report — no config
// needed, index.html's fetch('/api/generate-report') already matches.
//
// Accepts { prompt } built client-side (see callClaudeForNarrative() in
// index.html for the exact prompt and expected response shape), calls the
// Anthropic Messages API with the server-side API key (set as an
// environment variable in the Cloudflare Pages dashboard, not in this repo),
// and returns the parsed JSON narrative directly: { executiveSummary,
// categories, roadmap, overallRecommendation }. The front end's
// fallbackNarrative() takes over if this errors, times out, or isn't
// configured — this must never throw unhandled, only return a JSON error
// body.

const ANTHROPIC_MODEL = 'claude-sonnet-5';
const REQUEST_TIMEOUT_MS = 25000;

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  return handlePost(context);
}

async function handlePost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { prompt } = body || {};
  if (!prompt || typeof prompt !== 'string') {
    return jsonResponse({ error: 'Missing "prompt" in request body' }, 400);
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('generate-report: ANTHROPIC_API_KEY is not configured');
    return jsonResponse({ error: 'Server is not configured for AI generation' }, 500);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => '');
      console.error('generate-report: Anthropic API error', anthropicRes.status, errText);
      return jsonResponse({ error: `Anthropic API error (${anthropicRes.status})` }, 502);
    }

    const data = await anthropicRes.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) {
      return jsonResponse({ error: 'No text content in Anthropic response' }, 502);
    }

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('generate-report: failed to parse model output as JSON', cleaned);
      return jsonResponse({ error: 'AI response was not valid JSON' }, 502);
    }

    return jsonResponse(parsed, 200);
  } catch (e) {
    const timedOut = e.name === 'AbortError';
    console.error('generate-report: request failed', e);
    return jsonResponse(
      { error: timedOut ? 'Request to Anthropic API timed out' : 'Unexpected server error' },
      timedOut ? 504 : 500
    );
  } finally {
    clearTimeout(timeout);
  }
}
