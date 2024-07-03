import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralised application configuration with fallbacks for legacy
 * environment variable names. This reduces runtime configuration
 * errors by validating required values as early as possible.
 */
const resolveEnv = (keys: string[]): string => {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable. Tried keys: ${keys.join(', ')}`);
};

const appConfig = {
  serverPort: Number.parseInt(
    resolveEnv(['SERVER_PORT', 'SEREVR_PORT']),
    10,
  ),
  dbUrl: resolveEnv(['DB_URL']),
  githubApiUrl: resolveEnv(['GITHUB_API_URL']),
  githubClientId: resolveEnv(['GITHUB_CLIENT_ID']),
  githubClientSecret: resolveEnv(['GITHUB_CLIENT_SECRET']),
};

export default appConfig;
