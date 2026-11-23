import { type StarlingHost } from "./version.js";
export declare class StarlingError extends Error {
    readonly status: number;
    readonly retryAfterSeconds: number | undefined;
    constructor(message: string, status: number, retryAfterSeconds?: number);
}
export interface ClientOptions {
    accessToken: string;
    apiHost?: string;
    fetchImpl?: typeof fetch;
    minIntervalMs?: number;
    dailyLimit?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}
export declare class StarlingClient {
    #private;
    constructor(options: ClientOptions);
    get host(): StarlingHost;
    getJson(path: string, query?: Record<string, string>): Promise<unknown>;
    putJson(path: string, body: unknown): Promise<unknown>;
    postBytes(path: string, bytes: Uint8Array, contentType: string): Promise<unknown>;
    getText(path: string, query?: Record<string, string>): Promise<string>;
    private request;
    private requestText;
    private buildUrl;
    private send;
    private pace;
    private errorFrom;
    private trace;
}
