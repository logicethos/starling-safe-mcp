import { assertAllowed, type HttpMethod } from "./routes.js";
import { redact } from "./text.js";
import {
  PRODUCTION_HOST,
  SANDBOX_HOST,
  resolveApiHost,
  type StarlingHost,
} from "./version.js";

const QUERY_KEY = /^[A-Za-z]{1,40}$/;
const QUERY_VALUE = /^[0-9A-Za-z:._+-]{1,40}$/;
const DEFAULT_INTERVAL_MS = 200;
const DEFAULT_DAILY_LIMIT = 1000;

export class StarlingError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | undefined;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "StarlingError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
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

export class StarlingClient {
  readonly #token: string;
  readonly #host: StarlingHost;
  readonly #fetch: typeof fetch;
  readonly #intervalMs: number;
  readonly #dailyLimit: number;
  readonly #now: () => number;
  readonly #sleep: (ms: number) => Promise<void>;
  #nextSlot = 0;
  #dayKey = "";
  #dayCount = 0;

  constructor(options: ClientOptions) {
    const token = options.accessToken.trim();
    if (token.length === 0) {
      throw new Error("A Starling access token is required.");
    }
    this.#token = token;
    this.#host = resolveApiHost(options.apiHost ?? PRODUCTION_HOST);
    if (this.#host !== PRODUCTION_HOST && this.#host !== SANDBOX_HOST) {
      throw new Error("Refusing to call a host that is not Starling.");
    }
    this.#fetch = options.fetchImpl ?? fetch;
    this.#intervalMs = options.minIntervalMs ?? DEFAULT_INTERVAL_MS;
    this.#dailyLimit = options.dailyLimit ?? DEFAULT_DAILY_LIMIT;
    this.#now = options.now ?? Date.now;
    this.#sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get host(): StarlingHost {
    return this.#host;
  }

  getJson(path: string, query?: Record<string, string>): Promise<unknown> {
    return this.request("GET", path, { query });
  }

  putJson(path: string, body: unknown): Promise<unknown> {
    return this.request("PUT", path, { json: body });
  }

  postBytes(
    path: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<unknown> {
    return this.request("POST", path, { bytes, contentType });
  }

  getText(path: string, query?: Record<string, string>): Promise<string> {
    return this.requestText("GET", path, query);
  }

  private async request(
    method: HttpMethod,
    path: string,
    options: {
      query?: Record<string, string>;
      json?: unknown;
      bytes?: Uint8Array;
      contentType?: string;
    },
  ): Promise<unknown> {
    const text = await this.requestText(method, path, options.query, options);
    if (text.trim() === "") return { ok: true };
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new StarlingError("Starling returned a response that was not JSON.", 502);
    }
  }

  private async requestText(
    method: HttpMethod,
    path: string,
    query?: Record<string, string>,
    options: { json?: unknown; bytes?: Uint8Array; contentType?: string } = {},
  ): Promise<string> {
    assertAllowed(method, path);
    const url = this.buildUrl(path, query);
    return this.send(method, url, options, false);
  }

  private buildUrl(path: string, query?: Record<string, string>): URL {
    const url = new URL(`https://${this.#host}${path}`);
    if (url.host !== this.#host) {
      throw new Error("Refusing to call a host that is not Starling.");
    }
    if (!query) return url;
    for (const [key, value] of Object.entries(query)) {
      if (!QUERY_KEY.test(key) || !QUERY_VALUE.test(value)) {
        throw new Error("Refusing a query parameter that is not on the allowlist.");
      }
      url.searchParams.set(key, value);
    }
    return url;
  }

  private async send(
    method: HttpMethod,
    url: URL,
    options: { json?: unknown; bytes?: Uint8Array; contentType?: string },
    retried: boolean,
  ): Promise<string> {
    await this.pace();
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${this.#token}`);
    headers.set("Accept", "application/json, text/csv;q=0.9, text/plain;q=0.8");
    let body: string | Uint8Array | undefined;
    if (options.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.json);
    } else if (options.bytes) {
      headers.set("Content-Type", options.contentType ?? "application/octet-stream");
      body = options.bytes;
    }

    const started = this.#now();
    let response: Response;
    try {
      response = await this.#fetch(url, { method, headers, body });
    } catch {
      this.trace(method, url.pathname, 0, this.#now() - started);
      throw new StarlingError("The Starling API could not be reached.", 0);
    }

    this.trace(method, url.pathname, response.status, this.#now() - started);

    if (response.status === 429 && !retried) {
      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
      if (retryAfter !== undefined && retryAfter <= 2) {
        await response.text().catch(() => "");
        await this.#sleep(retryAfter * 1000);
        return this.send(method, url, options, true);
      }
    }

    if (!response.ok) throw await this.errorFrom(response);
    return response.text();
  }

  private async pace(): Promise<void> {
    const now = this.#now();
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.#dayKey) {
      this.#dayKey = day;
      this.#dayCount = 0;
    }
    if (this.#dayCount >= this.#dailyLimit) {
      throw new StarlingError(
        `Stopping after ${this.#dailyLimit} Starling requests in this process today. A personal token is limited to 1000 requests per day. Try again tomorrow.`,
        429,
      );
    }
    const wait = Math.max(0, this.#nextSlot - now);
    this.#nextSlot = Math.max(this.#nextSlot, now) + this.#intervalMs;
    this.#dayCount += 1;
    if (wait > 0) await this.#sleep(wait);
  }

  private async errorFrom(response: Response): Promise<StarlingError> {
    let detail = "";
    try {
      detail = errorDetail(JSON.parse(await response.text()) as unknown, this.#token);
    } catch {
      detail = "";
    }
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    if (response.status === 401) {
      return new StarlingError(
        "Starling rejected the access token. Check STARLING_ACCESS_TOKEN and that it has not been revoked.",
        401,
        retryAfter,
      );
    }
    if (response.status === 403) {
      return new StarlingError(
        "Starling refused this call (HTTP 403). The personal access token is missing a scope listed in the README.",
        403,
        retryAfter,
      );
    }
    if (response.status === 429) {
      return new StarlingError(
        "Starling rate limit reached (5 requests per second or 1000 per day on a personal token). Wait and try again.",
        429,
        retryAfter,
      );
    }
    const suffix = detail ? ` (${detail})` : "";
    return new StarlingError(
      redact(`Starling returned HTTP ${response.status}${suffix}.`, this.#token),
      response.status,
      retryAfter,
    );
  }

  private trace(method: string, path: string, status: number, ms: number): void {
    const template = path.replace(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
      ":uid",
    );
    console.error(
      JSON.stringify({
        source: "starling-safe-mcp",
        method,
        path: template,
        status,
        ms,
      }),
    );
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return seconds;
}

function errorDetail(parsed: unknown, token: string): string {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "";
  }
  const record = parsed as Record<string, unknown>;
  const bits: string[] = [];
  for (const key of ["error", "error_description", "message"] as const) {
    const value = record[key];
    if (typeof value === "string") bits.push(value);
  }
  const errors = record.errors;
  const first = Array.isArray(errors) ? errors[0] : undefined;
  if (first && typeof first === "object" && !Array.isArray(first)) {
    const message = (first as Record<string, unknown>).message;
    if (typeof message === "string") bits.push(message);
  }
  return redact(bits.join(": "), token).slice(0, 180);
}
