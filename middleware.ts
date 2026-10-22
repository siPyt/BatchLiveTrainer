// Vercel Routing Middleware: login gate for the hosted web build only (the Electron app never runs this).
// Credentials come from the BL_USER and BL_PASS environment variables in the Vercel project settings.
// A successful login issues a one-time page ticket, so every reload of the page asks for the login again.
// A separate session cookie lets the loaded page fetch its scripts, styles and images.

export const config = { matcher: '/:path*' }

const LOGIN_PATH = '/__login'
const TICKET_COOKIE = 'bl_ticket'
const SESSION_COOKIE = 'bl_session'
const TICKET_TTL_S = 30
const SESSION_TTL_S = 12 * 60 * 60
const COOKIE_ATTRS = 'Path=/; HttpOnly; Secure; SameSite=Strict'

const enc = new TextEncoder()

function credentials(): { user: string; pass: string } | null {
  const user = process.env.BL_USER
  const pass = process.env.BL_PASS
  return user && pass ? { user, pass } : null
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
  let bin = ''
  for (const b of sig) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const secretOf = (c: { user: string; pass: string }): string => process.env.BL_SECRET || `${c.user}\n${c.pass}`

async function makeToken(secret: string, kind: string, ttlS: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlS
  return `${exp}.${await hmac(secret, `${kind}.${exp}`)}`
}

async function validToken(secret: string, kind: string, token: string | undefined): Promise<boolean> {
  if (!token) return false
  const [expText, sig] = token.split('.')
  const exp = Number(expText)
  if (!sig || !Number.isFinite(exp) || exp < Date.now() / 1000) return false
  return sameString(sig, await hmac(secret, `${kind}.${exp}`))
}

function cookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return undefined
}

function isPageRequest(req: Request, path: string): boolean {
  const dest = req.headers.get('sec-fetch-dest')
  if (dest) return dest === 'document' || dest === 'iframe'
  return path === '/' || path.endsWith('.html') || (req.headers.get('accept') ?? '').includes('text/html')
}

/** Equivalent of next() from @vercel/functions: continue to the static file, adding response headers. */
function next(headers: Headers = new Headers()): Response {
  headers.set('x-middleware-next', '1')
  return new Response(null, { headers })
}

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)

function loginPage(status: number, message = ''): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BatchLiveTrainer - Log On</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #c8ccd2; font: 14px Segoe UI, Arial, sans-serif; color: #1d2329; }
  form { width: 300px; background: #eef0f3; border: 1px solid #8a929c; box-shadow: 0 4px 16px rgba(0,0,0,.2); }
  h1 { margin: 0; padding: 8px 12px; font-size: 14px; color: #fff; background: #2f5f8f; }
  .body { padding: 16px 12px; display: grid; gap: 10px; }
  label { display: grid; gap: 4px; }
  input { padding: 5px 6px; border: 1px solid #8a929c; font: inherit; }
  button { justify-self: end; padding: 4px 18px; font: inherit; cursor: pointer; }
  .err { color: #b00020; }
</style></head>
<body><form method="post" action="${LOGIN_PATH}">
  <h1>BatchLiveTrainer - Log On</h1>
  <div class="body">
    ${message ? `<div class="err" role="alert">${escapeHtml(message)}</div>` : ''}
    <label>User name<input name="username" autocomplete="username" autofocus required></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
    <button type="submit">OK</button>
  </div>
</form></body></html>`
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}

async function handleLogin(req: Request, creds: { user: string; pass: string }): Promise<Response> {
  let user = ''
  let pass = ''
  try {
    const form = await req.formData()
    user = String(form.get('username') ?? '')
    pass = String(form.get('password') ?? '')
  } catch { /* treated as a failed login */ }
  const secret = secretOf(creds)
  const [gotUser, wantUser, gotPass, wantPass] = await Promise.all([user, creds.user, pass, creds.pass].map(v => hmac(secret, v)))
  if (!(sameString(gotUser, wantUser) && sameString(gotPass, wantPass))) return loginPage(401, 'Invalid user name or password.')
  const headers = new Headers({ location: '/', 'cache-control': 'no-store' })
  headers.append('set-cookie', `${TICKET_COOKIE}=${await makeToken(secret, 'ticket', TICKET_TTL_S)}; Max-Age=${TICKET_TTL_S}; ${COOKIE_ATTRS}`)
  headers.append('set-cookie', `${SESSION_COOKIE}=${await makeToken(secret, 'session', SESSION_TTL_S)}; ${COOKIE_ATTRS}`)
  return new Response(null, { status: 303, headers })
}

export default async function middleware(req: Request): Promise<Response> {
  const creds = credentials()
  if (!creds) return new Response('Login is not configured: set BL_USER and BL_PASS in the Vercel project.', { status: 503, headers: { 'cache-control': 'no-store' } })
  const path = new URL(req.url).pathname
  if (path === LOGIN_PATH) return req.method === 'POST' ? handleLogin(req, creds) : loginPage(200)
  const secret = secretOf(creds)
  if (isPageRequest(req, path)) {
    if (!(await validToken(secret, 'ticket', cookie(req, TICKET_COOKIE)))) return loginPage(200)
    // Use up the ticket so the next reload shows the login again.
    return next(new Headers({ 'set-cookie': `${TICKET_COOKIE}=; Max-Age=0; ${COOKIE_ATTRS}`, 'cache-control': 'no-store' }))
  }
  if (await validToken(secret, 'session', cookie(req, SESSION_COOKIE))) return next()
  return new Response('Unauthorized', { status: 401, headers: { 'cache-control': 'no-store' } })
}
