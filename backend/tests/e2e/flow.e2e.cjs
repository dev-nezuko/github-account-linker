// Full OAuth round trip against a real MongoDB (DB_URL) and the bundled GitHub mock.
// Run with: DB_URL=mongodb://... npm run test:e2e
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const CLIENT_ID = 'e2e-client-id';
const CLIENT_SECRET = 'e2e-client-secret';
const FRONTEND = 'http://localhost:4200';
const CALLBACK = `${FRONTEND}/api/github/callback`;

let mock, api, mockBase, apiBase, mongoose, User;

class Browser {
  jar = new Map();
  async fetch(url, init = {}) {
    const cookie = [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ');
    const res = await fetch(url, {redirect: 'manual', ...init, headers: {...init.headers, ...(cookie ? {cookie} : {})}});
    for (const header of res.headers.getSetCookie()) {
      const [pair] = header.split(';');
      const [name, value] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
      if (/Expires=Thu, 01 Jan 1970/.test(header) || value === '') this.jar.delete(name);
      else this.jar.set(name, value);
    }
    return res;
  }
  // The browser would reach the API through the frontend proxy; tests talk to it directly.
  toApi(location) {
    const url = new URL(location);
    return url.origin === FRONTEND ? `${apiBase}${url.pathname}${url.search}` : location;
  }
  async signIn({tamper} = {}) {
    const connect = await this.fetch(`${apiBase}/api/github/connect`);
    assert.equal(connect.status, 302);
    if (tamper) tamper(this);
    const consent = await (await this.fetch(connect.headers.get('location'))).text();
    const approve = consent.match(/id="approve" href="([^"]+)"/)[1].replace(/&#38;/g, '&');
    const toCallback = await this.fetch(new URL(approve, mockBase).toString());
    assert.equal(toCallback.status, 302);
    const callback = await this.fetch(this.toApi(toCallback.headers.get('location')));
    assert.equal(callback.status, 302);
    return callback.headers.get('location');
  }
  status() { return this.fetch(`${apiBase}/api/github/status`); }
}

before(async () => {
  assert.ok(process.env.DB_URL, 'DB_URL must point at a disposable MongoDB database');
  const {createMockGitHub} = await import(pathToFileURL(path.join(__dirname, '../../../mock-github/server.mjs')).href);
  mock = createMockGitHub({clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: CALLBACK});
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
  mockBase = `http://127.0.0.1:${mock.address().port}`;
  Object.assign(process.env, {
    GITHUB_CLIENT_ID: CLIENT_ID, GITHUB_CLIENT_SECRET: CLIENT_SECRET, TOKEN_ENCRYPTION_KEY: 'e2'.repeat(32),
    GITHUB_AUTHORIZE_URL: `${mockBase}/login/oauth/authorize`, GITHUB_TOKEN_URL: `${mockBase}/login/oauth/access_token`,
    GITHUB_API_BASE_URL: mockBase, OAUTH_CALLBACK_URL: CALLBACK, FRONTEND_URL: `${FRONTEND}/github-integration`,
  });
  mongoose = require('mongoose');
  await mongoose.connect(process.env.DB_URL);
  await mongoose.connection.dropDatabase();
  User = require('../../dist/models/user').default;
  await User.init();
  await require('../../dist/models/integration').default.init();
  api = require('../../dist/app').createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => api.once('listening', resolve));
  apiBase = `http://127.0.0.1:${api.address().port}`;
});

after(async () => {
  api?.close();
  mock?.close();
  await mongoose?.connection.dropDatabase();
  await mongoose?.disconnect();
});

test('sign-in links the account and keeps the token sealed in MongoDB', async () => {
  const browser = new Browser();
  assert.equal((await browser.status()).status, 401);
  assert.equal(await browser.signIn(), `${FRONTEND}/github-integration`);
  assert.deepEqual([...browser.jar.keys()], ['github_link_session']);
  const status = await (await browser.status()).json();
  assert.equal(status.isConnected, true);
  assert.equal(status.username, 'demo-linker');
  const stored = await User.findOne({githubId: '90210001'}).lean();
  assert.match(stored.accessToken, /^v1\./);
  assert.ok(!stored.accessToken.includes('mock_'));
  assert.notEqual(stored.sessionHash, browser.jar.get('github_link_session'));
});

test('a callback whose state was swapped is refused before the code is used', async () => {
  const browser = new Browser();
  const location = await browser.signIn({tamper: b => b.jar.set('github_oauth_state', 'f'.repeat(64))});
  assert.equal(location, `${FRONTEND}/github-integration?error=invalid_state`);
  assert.equal((await browser.status()).status, 401);
});

test('a callback with the wrong PKCE verifier fails the token exchange', async () => {
  const browser = new Browser();
  const location = await browser.signIn({tamper: b => b.jar.set('github_oauth_verifier', 'e'.repeat(64))});
  assert.equal(location, `${FRONTEND}/github-integration?error=oauth_failed`);
  assert.equal((await browser.status()).status, 401);
});

test('denying consent on GitHub returns access_denied', async () => {
  const browser = new Browser();
  const connect = await browser.fetch(`${apiBase}/api/github/connect`);
  const consent = await (await browser.fetch(connect.headers.get('location'))).text();
  const deny = consent.match(/id="deny" href="([^"]+)"/)[1].replace(/&#38;/g, '&');
  const callback = await browser.fetch(browser.toApi(deny));
  assert.equal(callback.headers.get('location'), `${FRONTEND}/github-integration?error=access_denied`);
});

test('sign-out invalidates the session server-side but keeps the link', async () => {
  const browser = new Browser();
  await browser.signIn();
  const stolen = browser.jar.get('github_link_session');
  const out = await browser.fetch(`${apiBase}/api/github/logout`, {method: 'POST', headers: {origin: FRONTEND}});
  assert.equal(out.status, 204);
  assert.equal(browser.jar.size, 0);
  const replay = await fetch(`${apiBase}/api/github/status`, {headers: {cookie: `github_link_session=${stolen}`}});
  assert.equal(replay.status, 401);
  assert.equal(await User.countDocuments(), 1);
});

test('remove revokes the token at the provider and deletes local records', async () => {
  const browser = new Browser();
  await browser.signIn();
  const live = mock.liveTokenCount();
  const blocked = await browser.fetch(`${apiBase}/api/github/remove`, {method: 'DELETE', headers: {origin: 'http://localhost:8080'}});
  assert.equal(blocked.status, 403);
  const removed = await browser.fetch(`${apiBase}/api/github/remove`, {method: 'DELETE', headers: {origin: FRONTEND}});
  assert.deepEqual(await removed.json(), {isConnected: false});
  assert.equal(mock.liveTokenCount(), live - 1);
  assert.equal(await User.countDocuments(), 0);
  assert.equal((await browser.status()).status, 401);
});

test('a grant already revoked on GitHub can still be removed locally', async () => {
  const browser = new Browser();
  await browser.signIn();
  await fetch(`${mockBase}/_mock/revoke-all`, {method: 'POST'});
  const removed = await browser.fetch(`${apiBase}/api/github/remove`, {method: 'DELETE', headers: {origin: FRONTEND}});
  assert.equal(removed.status, 200);
  assert.equal(await User.countDocuments(), 0);
});
