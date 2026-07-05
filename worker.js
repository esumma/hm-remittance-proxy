/**
 * H&M Plating — Remittance Agent API Proxy v2
 * Cloudflare Worker
 * 
 * Routes:
 *   POST /proxy        → Anthropic API (PDF extraction, matching, posting)
 *   POST /qbo-lookup   → Anthropic + QBO MCP (live AR fetch)
 */

const ALLOWED_ORIGIN = '*';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    // ── Route 1: Standard Anthropic proxy ────────────────────────────────────
    if (url.pathname === '/proxy') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // ── Route 2: QBO AR lookup via Anthropic + QBO MCP ───────────────────────
    if (url.pathname === '/qbo-lookup') {
      const { invoiceNumbers, customerHints } = body;

      const prompt = `You are connected to QuickBooks Online via MCP for H&M Plating Co.

Fetch the current A/R aging detail report to find open invoices.

I need you to look up the following invoice numbers and return their current open balance:
${invoiceNumbers.map(n => `- ${n}`).join('\n')}

Note: Invoice numbers ending in HM belong to H&M Plating Co. Invoice numbers ending in SD belong to Schumacher-Dixie LLC. Both are in the same QuickBooks company.

Use the qbo_accounting_get_ar_aging_detail tool to get open invoices.

Return ONLY a JSON array (no markdown, no explanation):
[
  {
    "invoiceNumber": "exact invoice number as in QBO",
    "customerName": "customer name from QBO",
    "invoiceDate": "YYYY-MM-DD",
    "dueDate": "YYYY-MM-DD", 
    "originalAmount": 0.00,
    "openBalance": 0.00,
    "agingDays": 0,
    "qboId": "internal QBO invoice ID"
  }
]

Only include invoices you actually found in QBO with a balance > 0.
If an invoice is not found or has zero balance, omit it.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          messages: [{ role: 'user', content: prompt }],
          mcp_servers: [{
            type: 'url',
            url: 'https://ai-inc.quickbooks.intuit.com/v1/mcp',
            name: 'quickbooks-mcp'
          }]
        }),
      });

      const data = await response.json();

      // Extract text from response
      const textBlocks = (data.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      // Try to parse JSON array from response
      let invoices = [];
      try {
        const clean = textBlocks.replace(/```json|```/g, '').trim();
        const match = clean.match(/\[[\s\S]*\]/);
        if (match) invoices = JSON.parse(match[0]);
      } catch (e) {
        console.error('QBO parse error:', e);
      }

      return new Response(JSON.stringify({ invoices, raw: textBlocks }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    return new Response('Not found', { status: 404 });
  }
};
