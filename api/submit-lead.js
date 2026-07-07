// Vercel serverless function. Forwards lead + UTM data captured by the quiz
// to a GHL (GoHighLevel) webhook for Location ID 5IhdlYzc3DlT022CwekG.
//
// The exact webhook URL and auth method still need to be confirmed with
// Keith (org admin who manages the GHL/API connector config) — see
// CLAUDE_CODE_HANDOFF.md. Until GHL_WEBHOOK_URL is set, this endpoint logs
// the payload and returns ok:false with a warning instead of failing loudly,
// so the quiz UI is never blocked by a missing webhook config.
//
// Expected setup once confirmed: GHL's "Inbound Webhook" workflow trigger
// gives you a POST URL under https://services.leadconnectorhq.com/hooks/...
// — set that as GHL_WEBHOOK_URL. If GHL's REST API is used instead (contact
// upsert with a private integration token), set GHL_API_KEY and this file
// sends it as a Bearer token; adjust the body shape to match that API's
// contract if so.

const DEFAULT_LOCATION_ID = '5IhdlYzc3DlT022CwekG';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const payload = req.body || {};
  if (!payload.email) {
    res.status(400).json({ error: 'Missing required field: email' });
    return;
  }

  const webhookUrl = process.env.GHL_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('submit-lead: GHL_WEBHOOK_URL not configured; lead not forwarded ->', payload.email, payload.stage);
    res.status(200).json({ ok: false, warning: 'Lead capture is not yet connected to GHL on the server (GHL_WEBHOOK_URL missing).' });
    return;
  }

  const body = {
    locationId: process.env.GHL_LOCATION_ID || DEFAULT_LOCATION_ID,
    ...payload
  };

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.GHL_API_KEY) {
    headers.Authorization = `Bearer ${process.env.GHL_API_KEY}`;
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
      res.status(200).json({ ok: false, warning: 'GHL rejected the lead payload' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('submit-lead: request to GHL failed', e);
    res.status(200).json({ ok: false, warning: 'Could not reach GHL' });
  }
};
