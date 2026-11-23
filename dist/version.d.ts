export declare const VERSION = "0.1.0";
export declare const PACKAGE_NAME = "starling-safe-mcp";
export declare const ACCESS_TOKEN_ENV = "STARLING_ACCESS_TOKEN";
export declare const API_HOST_ENV = "STARLING_API_HOST";
export declare const PRODUCTION_HOST = "api.starlingbank.com";
export declare const SANDBOX_HOST = "api-sandbox.starlingbank.com";
export declare const ALLOWED_HOSTS: readonly ["api.starlingbank.com", "api-sandbox.starlingbank.com"];
export type StarlingHost = (typeof ALLOWED_HOSTS)[number];
export declare function resolveApiHost(value: string | undefined): StarlingHost;
export interface RuntimeConfig {
    accessToken: string;
    apiHost: StarlingHost;
}
export declare function readRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig;
