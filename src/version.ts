export const VERSION = "0.1.0";
export const PACKAGE_NAME = "starling-safe-mcp";
export const ACCESS_TOKEN_ENV = "STARLING_ACCESS_TOKEN";
export const API_HOST_ENV = "STARLING_API_HOST";

export const PRODUCTION_HOST = "api.starlingbank.com";
export const SANDBOX_HOST = "api-sandbox.starlingbank.com";

export const ALLOWED_HOSTS = [PRODUCTION_HOST, SANDBOX_HOST] as const;
export type StarlingHost = (typeof ALLOWED_HOSTS)[number];

export function resolveApiHost(value: string | undefined): StarlingHost {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return PRODUCTION_HOST;
  const host = trimmed.toLowerCase();
  if (host === PRODUCTION_HOST || host === SANDBOX_HOST) return host;
  throw new Error(
    `${API_HOST_ENV} must be ${PRODUCTION_HOST} or ${SANDBOX_HOST}.`,
  );
}

export interface RuntimeConfig {
  accessToken: string;
  apiHost: StarlingHost;
}

export function readRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  const accessToken = env[ACCESS_TOKEN_ENV]?.trim() ?? "";
  if (accessToken === "") {
    throw new Error(
      `${ACCESS_TOKEN_ENV} is not set. Create a personal access token in the Starling Developer Portal and export it before starting this server.`,
    );
  }
  return {
    accessToken,
    apiHost: resolveApiHost(env[API_HOST_ENV]),
  };
}
