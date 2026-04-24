/**
 * FLAMELESS API – Cloudflare Worker
 *
 * Sits between the public internet and the Raspberry Pi backend.
 * Responsibilities:
 *  1. Authenticate every HTTP request with Bearer token
 *  2. Authenticate WebSocket upgrades via ?token= query param
 *  3. Pass-through WebSocket upgrades directly to the Pi tunnel
 *  4. Proxy all HTTP requests to the Pi tunnel, adding CORS headers
 *  5. Return 502 with a clear message if the Pi is unreachable
 */

export interface Env {
  /** Secret set via: wrangler secret put API_TOKEN */
  API_TOKEN: string
  /** Pi tunnel URL — set in wrangler.toml vars, e.g. https://flameless-pi.cfargotunnel.com */
  BACKEND_URL: string
}

// ─── CORS headers ─────────────────────────────────────────────────────────────
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  'https://flameless-dashboard.pages.dev',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age':       '86400',
}

// ─── Helper: JSON error response ──────────────────────────────────────────────
function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    // ── WebSocket upgrade ───────────────────────────────────────────────────
    // Browsers cannot send custom headers on WebSocket connections,
    // so we accept the token as a query parameter instead.
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const token = url.searchParams.get('token')
      if (!token || token !== env.API_TOKEN) {
        return errorResponse(401, 'Unauthorized')
      }

      // Strip the ?token param before forwarding to backend
      const backendWsUrl = new URL(`${env.BACKEND_URL}${url.pathname}`)
      // Copy remaining search params (minus token)
      url.searchParams.forEach((v, k) => {
        if (k !== 'token') backendWsUrl.searchParams.set(k, v)
      })

      // Pass the WebSocket upgrade straight through to the Pi
      return fetch(backendWsUrl.toString(), request)
    }

    // ── HTTP authentication ─────────────────────────────────────────────────
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || authHeader !== `Bearer ${env.API_TOKEN}`) {
      return errorResponse(401, 'Unauthorized')
    }

    // ── Proxy HTTP request to Pi ────────────────────────────────────────────
    const backendUrl = `${env.BACKEND_URL}${url.pathname}${url.search}`

    try {
      // Forward request to Pi via Cloudflare Tunnel
      const piResponse = await fetch(backendUrl, {
        method:  request.method,
        headers: request.headers,
        body:    ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      })

      // Clone response and inject CORS headers
      const response = new Response(piResponse.body, piResponse)
      Object.entries(CORS).forEach(([k, v]) => response.headers.set(k, v))
      return response

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return errorResponse(502, `Backend unavailable: ${msg}`)
    }
  },
}
