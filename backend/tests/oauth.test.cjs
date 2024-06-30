const {test, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, {SERVER_PORT: '3000', DB_URL: 'mongodb://127.0.0.1:27017/synthetic', GITHUB_TOKEN_URL: 'http://oauth.test/login/oauth/access_token', GITHUB_AUTHORIZE_URL: 'http://oauth.test/login/oauth/authorize', GITHUB_API_BASE_URL: 'http://api.oauth.test', GITHUB_CLIENT_ID: 'synthetic-client', GITHUB_CLIENT_SECRET: 'synthetic-fixture-placeholder', TOKEN_ENCRYPTION_KEY: '0f'.repeat(32)});
const KEY=Buffer.from('0f'.repeat(32),'hex');
const session = require('../dist/helpers/session');
const oauth = require('../dist/helpers/oauthHelper');
const cipher = require('../dist/helpers/tokenCipher');
const exchangeToken = oauth.getGitHubOAuthToken;
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
 assert.equal(`${url.origin}${url.pathname}`,'http://oauth.test/login/oauth/authorize');
 assert.equal(url.searchParams.get('redirect_uri'),'http://localhost:4200/api/github/callback');
});
test('callback rejects missing or mismatched state before token exchange', async () => {
 let exchanges=0;oauth.getGitHubOAuthToken=async()=>{exchanges++;throw Error('must not run')};
 for(const state of [undefined,'wrong','b'.repeat(64)]){const res=response();await controller.handleGitHubOAuthCallback({headers:{cookie:`${session.STATE_COOKIE}=${'a'.repeat(64)}; ${session.VERIFIER_COOKIE}=${'c'.repeat(64)}`},query:{code:'synthetic',state}},res);assert.equal(res.url,'http://localhost:4200/github-integration?error=invalid_state');assert.deepEqual(res.cleared,[session.VERIFIER_COOKIE,session.STATE_COOKIE]);}
 assert.equal(exchanges,0);
});
test('callback sends a denied or code-less authorization back to the UI', async () => {
 let exchanges=0;oauth.getGitHubOAuthToken=async()=>{exchanges++;throw Error('must not run')};
 const state=session.newNonce();const cookie=`${session.STATE_COOKIE}=${state}; ${session.VERIFIER_COOKIE}=${session.newNonce()}`;
 let res=response();await controller.handleGitHubOAuthCallback({headers:{cookie},query:{state,error:'access_denied',error_description:'The user has denied your application access.'}},res);
 assert.equal(res.url,'http://localhost:4200/github-integration?error=access_denied');
 res=response();await controller.handleGitHubOAuthCallback({headers:{cookie},query:{state,code:['a','b']}},res);
 assert.equal(res.url,'http://localhost:4200/github-integration?error=invalid_callback');
 assert.equal(exchanges,0);
});
test('a failed token exchange redirects with a generic error code', async () => {
 const state=session.newNonce();oauth.getGitHubOAuthToken=async()=>{throw Error('synthetic exchange failure')};
 const res=response();await controller.handleGitHubOAuthCallback({headers:{cookie:`${session.STATE_COOKIE}=${state}; ${session.VERIFIER_COOKIE}=${session.newNonce()}`},query:{state,code:'synthetic-code'}},res);
 assert.equal(res.url,'http://localhost:4200/github-integration?error=oauth_failed');
 assert.equal(res.cookies.length,0);
});
test('successful callback keeps OAuth token out of browser URL and cookie', async () => {
 const state=session.newNonce();const verifier=session.newNonce();const provider='synthetic-provider-fixture';
 oauth.getGitHubOAuthToken=async(code,redirect,value)=>{assert.equal(value,verifier);return provider};
 axios.get=async(url,options)=>{assert.equal(options.headers.Authorization,`Bearer ${provider}`);return {data:{id:'synthetic-id',login:'synthetic-user'}}};
 const user={_id:'synthetic-user-id',save:async()=>{}};User.findOne=async()=>user;Integration.updateOne=async()=>({});
 const res=response();await controller.handleGitHubOAuthCallback({headers:{cookie:`${session.STATE_COOKIE}=${state}; ${session.VERIFIER_COOKIE}=${verifier}`},query:{state,code:'synthetic-code'}},res);
 assert.equal(res.url,'http://localhost:4200/github-integration');assert.ok(!user.accessToken.includes(provider));assert.equal(cipher.decryptToken(user.accessToken,KEY),provider);
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

test('state-changing requests must come from the frontend origin', () => {
 const {requireFrontendOrigin} = require('../dist/middleware/originGuard');
 const run = (method, origin) => {let passed=false;const res=response();requireFrontendOrigin({method,get:()=>origin},res,()=>{passed=true});return {passed,res};};
 assert.equal(run('GET',undefined).passed,true);
 assert.equal(run('DELETE','http://localhost:4200').passed,true);
 for (const origin of [undefined,'http://localhost:8080','http://localhost:4200.evil.test']) {const r=run('DELETE',origin);assert.equal(r.passed,false);assert.equal(r.res.statusCode,403);}
});

test('a token already revoked on GitHub still lets the user remove the link',async()=>{
 const value=session.newNonce();User.findOne=async()=>({_id:'synthetic',accessToken:'Bearer synthetic-provider-fixture'});
 const deleted=[];User.findOneAndDelete=async()=>{deleted.push('user')};Integration.deleteMany=async()=>{deleted.push('integration')};
 axios.delete=async(url,options)=>{assert.ok(options.validateStatus(404));return {status:404}};
 axios.get=async(url,options)=>{assert.equal(url,'http://api.oauth.test/user');assert.equal(options.headers.Authorization,'Bearer synthetic-provider-fixture');return {status:401}};
 const res=response();await controller.removeIntegration({headers:{cookie:`${session.SESSION_COOKIE}=${value}`}},res);
 assert.deepEqual(deleted,['integration','user']);assert.equal(res.body.isConnected,false);
});
test('a 404 for a token that still works is treated as a failed revocation',async()=>{
 const value=session.newNonce();User.findOne=async()=>({_id:'synthetic',accessToken:'Bearer synthetic-provider-fixture'});
 let deleted=false;User.findOneAndDelete=async()=>{deleted=true};Integration.deleteMany=async()=>{deleted=true};
 axios.delete=async()=>({status:404});axios.get=async()=>({status:200,data:{id:1}});
 const res=response();await controller.removeIntegration({headers:{cookie:`${session.SESSION_COOKIE}=${value}`}},res);
 assert.equal(res.statusCode,502);assert.equal(deleted,false);
});

test('stored tokens are AES-GCM sealed, tamper-evident and still read legacy rows',()=>{
 const sealed=cipher.encryptToken('synthetic-provider-fixture',KEY);
 assert.match(sealed,/^v1\./);assert.notEqual(sealed,cipher.encryptToken('synthetic-provider-fixture',KEY));
 assert.equal(cipher.decryptToken(sealed,KEY),'synthetic-provider-fixture');
 const parts=sealed.split('.');parts[2]=Buffer.from('tampered').toString('base64url');
 assert.throws(()=>cipher.decryptToken(parts.join('.'),KEY));
 assert.throws(()=>cipher.decryptToken(sealed,Buffer.alloc(32)));
 assert.equal(cipher.decryptToken('Bearer legacy-fixture',KEY),'legacy-fixture');
});
test('revocation decrypts the stored token before sending it to GitHub',async()=>{
 const value=session.newNonce();User.findOne=async()=>({_id:'synthetic',accessToken:cipher.encryptToken('sealed-fixture',KEY)});
 User.findOneAndDelete=async()=>{};Integration.deleteMany=async()=>{};
 let sent;axios.delete=async(url,options)=>{sent=options.data.access_token;return {status:204}};
 const res=response();await controller.removeIntegration({headers:{cookie:`${session.SESSION_COOKIE}=${value}`}},res);
 assert.equal(sent,'sealed-fixture');assert.equal(res.body.isConnected,false);
});
test('token exchange sends the PKCE verifier and rejects error payloads',async()=>{
 let body;axios.post=async(url,data)=>{body=data;return {data:{access_token:'exchanged-fixture'}}};
 assert.equal(await exchangeToken('code-fixture','http://localhost:4200/api/github/callback','v'.repeat(64)),'exchanged-fixture');
 assert.equal(body.code_verifier,'v'.repeat(64));assert.equal(body.redirect_uri,'http://localhost:4200/api/github/callback');
 axios.post=async()=>({data:{error:'bad_verification_code'}});
 await assert.rejects(exchangeToken('code-fixture','http://localhost:4200/api/github/callback','v'.repeat(64)));
});
