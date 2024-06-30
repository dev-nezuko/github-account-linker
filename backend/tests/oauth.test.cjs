const {test, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, {SERVER_PORT: '3000', DB_URL: 'mongodb://127.0.0.1:27017/synthetic', GITHUB_API_URL: 'https://github.com/login/oauth/access_token', GITHUB_CLIENT_ID: 'synthetic-client', GITHUB_CLIENT_SECRET: 'synthetic-fixture-placeholder'});
const session = require('../dist/helpers/session');
const oauth = require('../dist/helpers/oauthHelper');
const axios = require('axios').default;
const User = require('../dist/models/user').default;
const Integration = require('../dist/models/integration').default;
const controller = require('../dist/controllers/github.controller');
function response(){return {statusCode:200,cookies:[],cleared:[],status(value){this.statusCode=value;return this},json(value){this.body=value;return this},redirect(value){this.url=value;return this},cookie(name,value,options){this.cookies.push({name,value,options});return this},clearCookie(name){this.cleared.push(name);return this}};}
test('authorization uses random state, PKCE and profile scope only', () => {
 const a=response();const b=response();controller.initiateGitHubOAuth({},a);controller.initiateGitHubOAuth({},b);
 const url = new URL(a.url);assert.equal(url.searchParams.get('scope'),'read:user');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 const state=a.cookies.find(c=>c.name===session.STATE_COOKIE);const verifier=a.cookies.find(c=>c.name===session.VERIFIER_COOKIE);
 assert.equal(url.searchParams.get('state'),state.value);assert.equal(url.searchParams.get('code_challenge'),session.pkceChallenge(verifier.value));
 assert.equal(state.options.httpOnly,true);assert.notEqual(a.url,b.url);
});
test('callback rejects missing or mismatched state before token exchange', async () => {
 let exchanges=0;oauth.getGitHubOAuthToken=async()=>{exchanges++;throw Error('must not run')};
 for(const state of [undefined,'wrong']){const res=response();await controller.handleGitHubOAuthCallback({headers:{},query:{code:'synthetic',state}},res);assert.equal(res.statusCode,400);}
 assert.equal(exchanges,0);
});
test('successful callback keeps OAuth token out of browser URL and cookie', async () => {
 const state=session.newNonce();const verifier=session.newNonce();const provider='Bearer synthetic-provider-fixture';
 oauth.getGitHubOAuthToken=async(code,redirect,value)=>{assert.equal(value,verifier);return provider};
 axios.get=async()=>({data:{id:'synthetic-id',login:'synthetic-user'}});
 const user={_id:'synthetic-user-id',save:async()=>{}};User.findOne=async()=>user;Integration.updateOne=async()=>({});
 const res=response();await controller.handleGitHubOAuthCallback({headers:{cookie:`${session.STATE_COOKIE}=${state}; ${session.VERIFIER_COOKIE}=${verifier}`},query:{state,code:'synthetic-code'}},res);
 assert.equal(res.url,'http://localhost:4200/github-integration');assert.equal(user.accessToken,provider);
 const cookie=res.cookies.find(c=>c.name===session.SESSION_COOKIE);assert.equal(cookie.options.httpOnly,true);assert.equal(cookie.options.sameSite,'lax');assert.equal(user.sessionHash,session.sessionHash(cookie.value));
 assert.ok(!JSON.stringify(res.cookies).includes(provider));assert.ok(user.sessionExpiresAt > new Date());
});
test('status rejects a provider Authorization header without an app session', async()=>{
 const res=response();await controller.checkStatus({headers:{authorization:'Bearer synthetic-provider-fixture'}},res);assert.equal(res.statusCode,401);
});
test('state and cookie parsing reject malformed input',()=>{
 assert.equal(session.validState('a'.repeat(64),'b'.repeat(64)),false);
 assert.equal(session.validState('a'.repeat(64),['a'.repeat(64)]),false);
 assert.equal(session.readCookie({headers:{cookie:'github_link_session=%ZZ'}},session.SESSION_COOKIE),undefined);
});

test('failed remote revocation retains local connection state for retry',async()=>{
 const value=session.newNonce();const user={_id:'synthetic',accessToken:'Bearer synthetic-provider-fixture'};
 User.findOne=async query=>{assert.equal(query.sessionHash,session.sessionHash(value));assert.ok(query.sessionExpiresAt.$gt instanceof Date);return user};
 let deleted=false;User.findOneAndDelete=async()=>{deleted=true};Integration.deleteMany=async()=>{deleted=true};axios.delete=async()=>{throw Error('synthetic upstream failure')};
 const res=response();await controller.removeIntegration({headers:{cookie:`${session.SESSION_COOKIE}=${value}`}},res);
 assert.equal(res.statusCode,502);assert.equal(deleted,false);assert.equal(res.cleared.length,0);
});
test('successful revocation deletes local records and clears only the app session',async()=>{
 const value=session.newNonce();User.findOne=async()=>({_id:'synthetic',accessToken:'Bearer synthetic-provider-fixture'});
 const deleted=[];User.findOneAndDelete=async()=>{deleted.push('user')};Integration.deleteMany=async()=>{deleted.push('integration')};
 axios.delete=async(url,options)=>{assert.equal(options.data.access_token,'synthetic-provider-fixture');return {status:204}};
 const res=response();await controller.removeIntegration({headers:{cookie:`${session.SESSION_COOKIE}=${value}`}},res);
 assert.deepEqual(deleted,['integration','user']);assert.equal(res.body.isConnected,false);assert.ok(res.cleared.includes(session.SESSION_COOKIE));
});
