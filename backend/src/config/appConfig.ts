import dotenv from 'dotenv';

dotenv.config();

const readEnv = (keys: string[], fallback?: string): string => {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable. Tried keys: ${keys.join(', ')}`);
};

const readUrl = (keys: string[], fallback: string): string => {
  const value = readEnv(keys, fallback);
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${keys[0]} must be an http(s) URL`);
  }
  return url.toString().replace(/\/$/, '');
};

const oauthCallbackUrl = readUrl(['OAUTH_CALLBACK_URL'], 'http://localhost:4200/api/github/callback');
const frontendUrl = readUrl(['FRONTEND_URL'], 'http://localhost:4200/github-integration');

const appConfig = {
  serverPort: Number.parseInt(readEnv(['SERVER_PORT', 'SEREVR_PORT'], '3000'), 10),
  host: readEnv(['HOST'], '127.0.0.1'),
  dbUrl: readEnv(['DB_URL']),
  githubClientId: readEnv(['GITHUB_CLIENT_ID']),
  githubClientSecret: readEnv(['GITHUB_CLIENT_SECRET']),
  // GITHUB_API_URL is the variable's older name; it always held the token endpoint.
  githubTokenUrl: readUrl(['GITHUB_TOKEN_URL', 'GITHUB_API_URL'], 'https://github.com/login/oauth/access_token'),
  githubAuthorizeUrl: readUrl(['GITHUB_AUTHORIZE_URL'], 'https://github.com/login/oauth/authorize'),
  githubApiBaseUrl: readUrl(['GITHUB_API_BASE_URL'], 'https://api.github.com'),
  oauthCallbackUrl,
  frontendUrl,
  frontendOrigin: new URL(frontendUrl).origin,
  // Cookies follow the scheme the browser actually uses for the callback.
  secureCookies: new URL(oauthCallbackUrl).protocol === 'https:',
};

export default appConfig;
