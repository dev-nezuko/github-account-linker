import axios from 'axios';
import appConfig from '../config/appConfig';

export const getGitHubOAuthToken = async (
  code: string,
  redirectUri: string,
  verifier: string,
): Promise<string> => {
  try {
    const response = await axios.post(
      appConfig.githubTokenUrl,
      {
        client_id: appConfig.githubClientId,
        client_secret: appConfig.githubClientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      },
      {
        headers: {
          Accept: 'application/json',
        },
        timeout: 10000,
      },
    );

    // GitHub reports a bad code or verifier as HTTP 200 with an `error` field.
    if (typeof response.data?.access_token !== 'string' || !response.data.access_token) {
      throw new Error('GitHub OAuth response did not include an access token');
    }

    return response.data.access_token;
  } catch {
    throw new Error('Failed to exchange GitHub OAuth code');
  }
};
