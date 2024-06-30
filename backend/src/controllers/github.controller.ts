import { Request, Response } from 'express';
import axios from 'axios';
import User from '../models/user';
import Integration from '../models/integration';
import appConfig from '../config/appConfig';
import { getGitHubOAuthToken } from '../helpers/oauthHelper';
import { STATE_COOKIE, VERIFIER_COOKIE, pkceChallenge, SESSION_COOKIE, SESSION_MS, newNonce, sessionHash, cookieOptions, readCookie, validState } from '../helpers/session';

export const initiateGitHubOAuth = (_req: Request, res: Response): void => {
  const state = newNonce();
  const verifier = newNonce();
  res.cookie(VERIFIER_COOKIE, verifier, {...cookieOptions(), maxAge: 10 * 60 * 1000});
  res.cookie(STATE_COOKIE, state, {...cookieOptions(), maxAge: 10 * 60 * 1000});
  const params = new URLSearchParams({client_id: appConfig.githubClientId, redirect_uri: appConfig.oauthCallbackUrl, scope: 'read:user', state, code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256'});
  res.redirect(`${appConfig.githubAuthorizeUrl}?${params}`);
};
const redirectToFrontend = (res: Response, error?: string): void => {
  const url = new URL(appConfig.frontendUrl);
  if (error) url.searchParams.set('error', error);
  res.redirect(url.toString());
};
export const handleGitHubOAuthCallback = async (req: Request, res: Response): Promise<void> => {
  const expected = readCookie(req, STATE_COOKIE);
  const verifier = readCookie(req, VERIFIER_COOKIE);
  res.clearCookie(VERIFIER_COOKIE, cookieOptions());
  res.clearCookie(STATE_COOKIE, cookieOptions());
  // The callback is a top-level browser navigation, so failures go back to the UI
  // with a fixed error code rather than ending on a bare JSON page.
  if (!validState(expected, req.query.state) || !verifier || !/^[a-f0-9]{64}$/.test(verifier)) {
    redirectToFrontend(res, 'invalid_state'); return;
  }
  if (req.query.error !== undefined) {
    redirectToFrontend(res, 'access_denied'); return;
  }
  const code = req.query.code;
  if (!code || typeof code !== 'string') {
    redirectToFrontend(res, 'invalid_callback'); return;
  }
  try {
    const accessToken = await getGitHubOAuthToken(code, appConfig.oauthCallbackUrl, verifier);
    const profile = await axios.get(`${appConfig.githubApiBaseUrl}/user`, {headers: {Authorization: accessToken}, timeout: 10000});
    const {id: githubId, login: username} = profile.data;
    let user = await User.findOne({githubId});
    if (!user) user = new User({githubId, username});
    const session = newNonce();
    user.accessToken = accessToken;
    user.sessionHash = sessionHash(session);
    user.sessionExpiresAt = new Date(Date.now() + SESSION_MS);
    await user.save();
    await Integration.updateOne({userId: user._id}, {$set: {provider: 'GitHub', connectedAt: new Date()}}, {upsert: true});
    res.cookie(SESSION_COOKIE, session, {...cookieOptions(), maxAge: SESSION_MS});
    redirectToFrontend(res);
  } catch {
    // Axios errors can contain client credentials and Authorization headers.
    console.error('GitHub OAuth callback failed');
    redirectToFrontend(res, 'oauth_failed');
  }
};
async function currentUser(req: Request) {
  const value = readCookie(req, SESSION_COOKIE);
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
  return User.findOne({sessionHash: sessionHash(value), sessionExpiresAt: {$gt: new Date()}});
}
export const checkStatus = async (req: Request, res: Response): Promise<void> => {
  const user = await currentUser(req);
  if (!user) {res.status(401).json({isConnected: false, message: 'Connect GitHub to create a session'});return;}
  const integration = await Integration.findOne({userId: user._id});
  res.json({isConnected: Boolean(integration), connectionDate: integration?.connectedAt ?? null});
};
export const removeIntegration = async (req: Request, res: Response): Promise<void> => {
  const user = await currentUser(req);
  if (!user) {res.status(401).json({message: 'Connect GitHub to create a session'});return;}
  try {
    const rawAccessToken = user.accessToken.replace(/^Bearer /, '');
    await axios.delete(`${appConfig.githubApiBaseUrl}/applications/${appConfig.githubClientId}/token`, {
      auth: {username: appConfig.githubClientId, password: appConfig.githubClientSecret},
      data: {access_token: rawAccessToken}, timeout: 10000,
    });
    await Integration.deleteMany({userId: user._id});
    await User.findOneAndDelete({_id: user._id});
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.json({isConnected: false});
  } catch {
    console.error('GitHub token revocation failed');
    res.status(502).json({message: 'Failed to revoke GitHub token; connection has been retained for retry'});
  }
};
