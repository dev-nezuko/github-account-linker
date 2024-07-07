import { Request, Response } from 'express';
import axios from 'axios';
import User from '../models/user';
import Integration from '../models/integration';
import appConfig from '../config/appConfig';
import { getGitHubOAuthToken } from '../helpers/oauthHelper';

const clientId = appConfig.githubClientId;
const clientSecret = appConfig.githubClientSecret;
const redirectUri = 'http://localhost:3000/api/github/callback';

/**
 * Starts the GitHub OAuth dance by redirecting the browser to GitHub.
 * Keeping this logic small and deterministic simplifies testing and
 * reduces the risk of leaking server‑side state.
 */
export const initiateGitHubOAuth = (_req: Request, res: Response): void => {
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri,
  )}&scope=repo,user`;

  res.redirect(githubAuthUrl);
};

/**
 * Handles the OAuth callback from GitHub, persists the user and
 * integration metadata, and then returns control back to the SPA.
 * All failure branches either redirect with a neutral state or send
 * a clear HTTP error to keep client behaviour predictable.
 */
export const handleGitHubOAuthCallback = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    res.status(400).json({ message: 'Missing or invalid GitHub OAuth code' });
    return;
  }

  try {
    const accessToken = await getGitHubOAuthToken(code, redirectUri);

    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: accessToken,
      },
    });

    const { id: githubId, login: username } = userResponse.data;

    let user = await User.findOne({ githubId });
    if (!user) {
      user = new User({
        username,
        githubId,
        accessToken,
      });
      await user.save();
    } else {
      // Keep the latest access token in sync so future calls use
      // the freshest credentials.
      user.accessToken = accessToken;
      await user.save();
    }

    const integration = new Integration({
      userId: user._id,
      provider: 'GitHub',
      connectedAt: new Date(),
    });

    await integration.save();

    res.redirect(
      `http://localhost:4200/github-integration?token=${encodeURIComponent(
        accessToken,
      )}`,
    );
  } catch (error) {
    // In an OAuth flow it is safer to redirect back to the SPA
    // than to leak internal error details to the browser.
    // The client can then decide how to surface a generic failure.
    console.error('GitHub OAuth Error:', error);
    res.redirect('http://localhost:4200/github-integration');
  }
};

/**
 * Returns the current integration status for the caller based on the
 * provided access token. Responses are explicit about auth failures
 * so that the frontend can react accordingly.
 */
export const checkStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { authorization } = req.headers;

  if (!authorization) {
    res.status(401).json({ isConnected: false, message: 'Missing Authorization header' });
    return;
  }

  const decodedToken = decodeURIComponent(authorization);
  const user = await User.findOne({ accessToken: decodedToken });

  if (!user) {
    res.status(401).json({ isConnected: false, message: 'Invalid access token' });
    return;
  }

  const integration = await Integration.findOne({ userId: user._id });

  res.json({
    isConnected: Boolean(integration),
    connectionDate: integration?.connectedAt ?? null,
  });
};

/**
 * Revokes the remote GitHub token and deletes the local integration
 * state. Explicit responses allow the frontend to distinguish between
 * auth errors and idempotent removal attempts.
 */
export const removeIntegration = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { authorization } = req.headers;

  if (!authorization) {
    res.status(401).json({ message: 'Missing Authorization header' });
    return;
  }

  const decodedToken = decodeURIComponent(authorization);

  try {
    const user = await User.findOne({ accessToken: decodedToken });

    if (!user) {
      res.status(404).json({ message: 'GitHub integration not found for user' });
      return;
    }

    const tokenParts = decodedToken.split(' ');
    const rawAccessToken = tokenParts.length === 2 ? tokenParts[1] : decodedToken;

    await axios.delete(`https://api.github.com/applications/${clientId}/token`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString(
          'base64',
        )}`,
      },
      data: {
        access_token: rawAccessToken,
      },
    });

    await User.findOneAndDelete({ _id: user._id });
    await Integration.findOneAndDelete({ userId: user._id });

    res.json({ isConnected: false });
  } catch (error) {
    console.error('Error removing GitHub integration:', error);
    res.status(502).json({ message: 'Failed to revoke GitHub token' });
  }
};
