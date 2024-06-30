const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, {DB_URL: 'mongodb://127.0.0.1:27017/synthetic', GITHUB_CLIENT_ID: 'synthetic-client', GITHUB_CLIENT_SECRET: 'synthetic-fixture-placeholder', TOKEN_ENCRYPTION_KEY: '0f'.repeat(32), GITHUB_AUTHORIZE_URL: 'http://oauth.test/login/oauth/authorize'});
const {createApp} = require('../dist/app');
const User = require('../dist/models/user').default;

let server;
let base;
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('health and connect respond through the real router', async () => {
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), {status: 'ok'});
  const res = await fetch(`${base}/api/github/connect`, {redirect: 'manual'});
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /^http:\/\/oauth\.test\/login\/oauth\/authorize\?/);
  const cookies = res.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  for (const cookie of cookies) assert.match(cookie, /HttpOnly; SameSite=Lax/);
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('writes from another origin are refused before reaching a handler', async () => {
  let looked = false;
  User.findOne = async () => { looked = true; return null; };
  for (const headers of [{}, {origin: 'http://localhost:8080'}]) {
    const res = await fetch(`${base}/api/github/remove`, {method: 'DELETE', headers});
    assert.equal(res.status, 403);
  }
  assert.equal(looked, false);
  const allowed = await fetch(`${base}/api/github/logout`, {method: 'POST', headers: {origin: 'http://localhost:4200'}});
  assert.equal(allowed.status, 204);
});

test('a rejected async handler becomes a generic 500 without details', async () => {
  User.findOne = async () => { throw new Error('synthetic database outage'); };
  const res = await fetch(`${base}/api/github/status`, {headers: {cookie: `github_link_session=${'a'.repeat(64)}`}});
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), {message: 'Request failed'});
});
