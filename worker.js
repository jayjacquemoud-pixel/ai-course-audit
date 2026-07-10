// Entry point for Cloudflare's unified Workers deploy (the "Create a Worker"
// Git-import flow, distinct from the classic Pages Functions convention).
// Routes the two API paths to their handlers in functions/api/*.js and
// falls back to serving static assets (index.html etc.) for everything
// else via the ASSETS binding declared in wrangler.jsonc.

import { onRequest as generateReport } from './functions/api/generate-report.js';
import { onRequest as submitLead } from './functions/api/submit-lead.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/generate-report') {
      return generateReport({ request, env, ctx });
    }
    if (url.pathname === '/api/submit-lead') {
      return submitLead({ request, env, ctx });
    }

    return env.ASSETS.fetch(request);
  }
};
