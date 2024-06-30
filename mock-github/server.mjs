// A stand-in for the parts of GitHub this project talks to: the OAuth authorize and
// token endpoints, GET /user and the app token-revocation endpoint. It keeps state in
// memory, checks PKCE the way GitHub does and never calls the real GitHub.
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const DEMO_USER = {id: 90210001, login: 'demo-linker', name: 'Demo Linker', type: 'User'};

const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const token = prefix => `${prefix}_${randomBytes(18).toString('hex')}`;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(req.headers['content-type']?.includes('json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw)));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body === 'object' && body !== null;
  res.writeHead(status, {'content-type': isJson ? 'application/json' : 'text/html; charset=utf-8', ...headers});
  res.end(isJson ? JSON.stringify(body) : body);
}

function consentPage(clientId, approveUrl, denyUrl) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mock GitHub authorization</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#f4f1ea;color:#1d2621;display:grid;place-items:center;min-height:100vh;margin:0}
main{background:#fff;border:1px solid #d5cfc2;border-radius:10px;padding:32px;max-width:420px;margin:16px}
a{display:inline-block;margin-right:12px;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600}
.approve{background:#1f5c45;color:#fff}.deny{color:#1f5c45;border:1px solid #1f5c45}code{background:#eee;padding:1px 4px}</style></head>
<body><main><p><strong>Local mock of GitHub</strong> &mdash; no real account is involved.</p>
<p>The app <code>${escapeHtml(clientId)}</code> asks for <code>read:user</code> on behalf of <strong>${DEMO_USER.login}</strong>.</p>
<p><a class="approve" id="approve" href="${escapeHtml(approveUrl)}">Authorize</a><a class="deny" id="deny" href="${escapeHtml(denyUrl)}">Cancel</a></p></main></body></html>`;
}

export function createMockGitHub({clientId, clientSecret, redirectUri}) {
  const pending = new Map(); // ticket -> authorize request
  const codes = new Map(); // code -> {challenge, redirectUri}
  const liveTokens = new Set();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://mock.invalid');
    const route = `${req.method} ${url.pathname}`;
    try {
      if (route === 'GET /health') return send(res, 200, {status: 'ok'});

      if (route === 'GET /login/oauth/authorize') {
        const q = Object.fromEntries(url.searchParams);
        if (q.client_id !== clientId) return send(res, 404, '<p>Unknown OAuth app</p>');
        if (redirectUri && q.redirect_uri !== redirectUri) return send(res, 400, '<p>redirect_uri does not match the registered callback</p>');
        if (q.code_challenge_method !== 'S256' || !q.code_challenge) return send(res, 400, '<p>PKCE S256 challenge required</p>');
        const ticket = token('ticket');
        pending.set(ticket, q);
        const deny = new URL(q.redirect_uri);
        deny.searchParams.set('error', 'access_denied');
        if (q.state) deny.searchParams.set('state', q.state);
        return send(res, 200, consentPage(clientId, `/login/oauth/approve?ticket=${ticket}`, deny.toString()));
      }

      if (route === 'GET /login/oauth/approve') {
        const request = pending.get(url.searchParams.get('ticket'));
        if (!request) return send(res, 400, '<p>Unknown or used authorization ticket</p>');
        pending.delete(url.searchParams.get('ticket'));
        const code = token('code');
        codes.set(code, {challenge: request.code_challenge, redirectUri: request.redirect_uri});
        const target = new URL(request.redirect_uri);
        target.searchParams.set('code', code);
        if (request.state) target.searchParams.set('state', request.state);
        return send(res, 302, '', {location: target.toString()});
      }

      if (route === 'POST /login/oauth/access_token') {
        const body = await readBody(req);
        const grant = codes.get(body.code);
        codes.delete(body.code);
        if (body.client_id !== clientId || body.client_secret !== clientSecret) return send(res, 200, {error: 'incorrect_client_credentials'});
        if (!grant || grant.redirectUri !== body.redirect_uri) return send(res, 200, {error: 'bad_verification_code'});
        const challenge = createHash('sha256').update(String(body.code_verifier ?? '')).digest('base64url');
        if (challenge !== grant.challenge) return send(res, 200, {error: 'bad_verification_code', error_description: 'PKCE verification failed'});
        const accessToken = token('mock');
        liveTokens.add(accessToken);
        return send(res, 200, {access_token: accessToken, token_type: 'bearer', scope: 'read:user'});
      }

      if (route === 'GET /user') {
        const bearer = req.headers.authorization?.replace(/^Bearer /, '');
        if (!liveTokens.has(bearer)) return send(res, 401, {message: 'Bad credentials'});
        return send(res, 200, DEMO_USER);
      }

      if (req.method === 'DELETE' && url.pathname === `/applications/${clientId}/token`) {
        const expected = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
        if (req.headers.authorization !== expected) return send(res, 404, {message: 'Not Found'});
        const body = await readBody(req);
        if (!liveTokens.delete(body.access_token)) return send(res, 404, {message: 'Not Found'});
        res.writeHead(204).end();
        return undefined;
      }

      // Simulates the user revoking the app from their GitHub settings page.
      if (route === 'POST /_mock/revoke-all') {
        liveTokens.clear();
        res.writeHead(204).end();
        return undefined;
      }

      return send(res, 404, {message: 'Not Found'});
    } catch {
      return send(res, 400, {message: 'Malformed request'});
    }
  });
  server.liveTokenCount = () => liveTokens.size;
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.MOCK_PORT ?? 4010);
  const server = createMockGitHub({
    clientId: process.env.GITHUB_CLIENT_ID ?? 'mock-client-id',
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? 'mock-client-secret',
    redirectUri: process.env.OAUTH_CALLBACK_URL,
  });
  server.listen(port, '0.0.0.0', () => console.log(`Mock GitHub listening on :${port}`));
}
