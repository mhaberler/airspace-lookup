export interface Env {
  OPENAIP_KEY: string
  ALLOWED_ORIGIN: string
}

const AIRSPACES_TTL_S = 7 * 24 * 60 * 60
const AIRPORTS_TTL_S = 24 * 60 * 60
const TILES_TTL_S = 30 * 24 * 60 * 60

const RETRY_DELAY_MS = 2000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url: string): Promise<Response> {
  let res = await fetch(url)
  if (res.status === 429) {
    await delay(RETRY_DELAY_MS)
    res = await fetch(url)
  }
  return res
}

function withCors(res: Response, origin: string): Response {
  const headers = new Headers(res.headers)
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Vary', 'Origin')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

async function proxyJson(
  request: Request,
  ctx: ExecutionContext,
  env: Env,
  upstreamUrl: string,
  ttlSeconds: number,
): Promise<Response> {
  const cache = caches.default
  const cacheKey = new Request(request.url, request)

  let res = await cache.match(cacheKey)
  if (!res) {
    const upstream = await fetchWithRetry(upstreamUrl)
    if (upstream.ok) {
      const cacheable = new Response(upstream.body, upstream)
      cacheable.headers.set('Cache-Control', `public, max-age=${ttlSeconds}`)
      ctx.waitUntil(cache.put(cacheKey, cacheable.clone()))
      res = cacheable
    } else {
      res = upstream
    }
  }

  return withCors(res, env.ALLOWED_ORIGIN)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (request.method !== 'GET') {
      return withCors(new Response('Method not allowed', { status: 405 }), env.ALLOWED_ORIGIN)
    }

    if (url.pathname === '/api/airspaces') {
      const pos = url.searchParams.get('pos')
      const dist = url.searchParams.get('dist')
      if (!pos || !dist) {
        return withCors(new Response('Missing pos or dist', { status: 400 }), env.ALLOWED_ORIGIN)
      }
      const upstreamUrl = `https://api.core.openaip.net/api/airspaces?pos=${encodeURIComponent(pos)}&dist=${encodeURIComponent(dist)}&apiKey=${env.OPENAIP_KEY}`
      return proxyJson(request, ctx, env, upstreamUrl, AIRSPACES_TTL_S)
    }

    if (url.pathname === '/api/airports') {
      const pos = url.searchParams.get('pos')
      const dist = url.searchParams.get('dist')
      if (!pos || !dist) {
        return withCors(new Response('Missing pos or dist', { status: 400 }), env.ALLOWED_ORIGIN)
      }
      const upstreamUrl = `https://api.core.openaip.net/api/airports?pos=${encodeURIComponent(pos)}&dist=${encodeURIComponent(dist)}&apiKey=${env.OPENAIP_KEY}`
      return proxyJson(request, ctx, env, upstreamUrl, AIRPORTS_TTL_S)
    }

    const tileMatch = url.pathname.match(/^\/tiles\/(\d+)\/(\d+)\/(\d+)\.png$/)
    if (tileMatch) {
      const [, z, x, y] = tileMatch
      const upstreamUrl = `https://api.tiles.openaip.net/api/data/openaip/${z}/${x}/${y}.png?apiKey=${env.OPENAIP_KEY}`
      return proxyJson(request, ctx, env, upstreamUrl, TILES_TTL_S)
    }

    return withCors(new Response('Not found', { status: 404 }), env.ALLOWED_ORIGIN)
  },
}
