/**
 * H&M Plating — Remittance Agent API Proxy
 * Cloudflare Worker
 *
 * Deploy at: https://dash.cloudflare.com → Workers & Pages → Create Worker
 * Then add secret: Settings → Variables → Add variable → ANTHROPIC_API_KEY
 */

const ALLOWED_ORIGIN = '*'; // Lock this down to your Netlify URL after deploy
                             // e.g. 'https://hm-remittance.netlify.app'

export default {
  async fetch(request, env) {

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // Only allow POST to /proxy
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/proxy') {
      return new Response('Not found', { status: 404 });
    }

    // Forward to Anthropic with your key injected
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const responseData = await anthropicResponse.json();

    return new Response(JSON.stringify(responseData), {
      status: anthropicResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      }
    });
  }
};
