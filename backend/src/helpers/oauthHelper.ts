import axios from 'axios';
import appConfig from '../config/appConfig';

/**
 * Exchanges the short‑lived GitHub OAuth `code` for an access token.
 * This helper normalises the response into a `Bearer` token string and
 * surfaces clear errors so API handlers can return meaningful messages.
 */
export const getGitHubOAuthToken = async (
  code: string,
  redirectUri: string,
): Promise<string> => {
  try {
    const response = await axios.post(
      appConfig.githubApiUrl,
      {
        client_id: appConfig.githubClientId,
        client_secret: appConfig.githubClientSecret,
        code,
        redirect_uri: redirectUri,
      },
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    if (!response.data?.access_token) {
      // Explicit guard helps when GitHub responds with an error payload
      // so we fail fast instead of silently returning an undefined token.
      throw new Error('GitHub OAuth response did not include an access token');
    }

    return `Bearer ${response.data.access_token}`;
  } catch (error) {
    // Wrapping the original error makes it easier for callers to
    // distinguish OAuth failures from generic server issues.
    throw new Error(
      `Failed to exchange GitHub OAuth code for access token: ${
        (error as Error).message
      }`,
    );
  }
};
