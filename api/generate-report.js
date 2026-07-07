// Vercel serverless function (Node.js runtime — global fetch is available).
// Accepts { prompt } built client-side (see callClaudeForNarrative() in
// index.html for the exact prompt and expected response shape), calls the
// Anthropic Messages API with the server-side API key, and returns the
// parsed JSON narrative directly: { executiveSummary, categories, roadmap,
// overallRecommendation }. The front end's fallbackNarrative() takes over if
// this endpoint errors, times out, or isn't configured — this file must
// never throw an unhandled exception, only return a JSON error body.

const ANTHROPIC_MODEL = 'claude-sonnet-5';
const REQUEST_TIMEOUT_MS = 25000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Missing "prompt" in request body' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('generate-report: ANTHROPIC_API_KEY is not configured');
    res.status(500).json({ error: 'Server is not configured for AI generation' });
    return;
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
      res.status(502).json({ error: `Anthropic API error (${anthropicRes.status})` });
      return;
    }

    const data = await anthropicRes.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) {
      res.status(502).json({ error: 'No text content in Anthropic response' });
      return;
    }

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('generate-report: failed to parse model output as JSON', cleaned);
      res.status(502).json({ error: 'AI response was not valid JSON' });
      return;
    }

    res.status(200).json(parsed);
  } catch (e) {
    const timedOut = e.name === 'AbortError';
    console.error('generate-report: request failed', e);
    res.status(timedOut ? 504 : 500).json({ error: timedOut ? 'Request to Anthropic API timed out' : 'Unexpected server error' });
  } finally {
    clearTimeout(timeout);
  }
};
