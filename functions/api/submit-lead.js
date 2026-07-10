// Cloudflare Pages Function. Lives at functions/api/submit-lead.js, which
// Cloudflare automatically routes to POST /api/submit-lead — no config
// needed, index.html's fetch('/api/submit-lead') already matches.
//
// Forwards lead + UTM data captured by the quiz to a GHL (GoHighLevel)
// webhook for Location ID 5IhdlYzc3DlT022CwekG. GHL_WEBHOOK_URL is set as an
// environment variable in the Cloudflare Pages dashboard (never committed to
// this repo — it functions like a bearer credential). Until it's set, this
// logs the payload and returns ok:false instead of failing the quiz.

const DEFAULT_LOCATION_ID = '5IhdlYzc3DlT022CwekG';

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

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!payload || !payload.email) {
    return jsonResponse({ error: 'Missing required field: email' }, 400);
  }

  const webhookUrl = env.GHL_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('submit-lead: GHL_WEBHOOK_URL not configured; lead not forwarded ->', payload.email, payload.stage);
    return jsonResponse({ ok: false, warning: 'Lead capture is not yet connected to GHL on the server (GHL_WEBHOOK_URL missing).' });
  }

  const body = {
    locationId: env.GHL_LOCATION_ID || DEFAULT_LOCATION_ID,
    ...payload
  };

  const headers = { 'Content-Type': 'application/json' };
  if (env.GHL_API_KEY) {
    headers.Authorization = `Bearer ${env.GHL_API_KEY}`;
  }

  try {
    const ghlRes = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!ghlRes.ok) {
      const errText = await ghlRes.text().catch(() => '');
      console.error('submit-lead: GHL webhook error', ghlRes.status, errText);
      return jsonResponse({ ok: false, warning: 'GHL rejected the lead payload' });
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error('submit-lead: request to GHL failed', e);
    return jsonResponse({ ok: false, warning: 'Could not reach GHL' });
  }
}
