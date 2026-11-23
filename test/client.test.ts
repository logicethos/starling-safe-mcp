import { afterEach, describe, expect, it, vi } from "vitest";
import { StarlingClient, StarlingError } from "../src/client.js";
import { jsonResponse, recordingFetch } from "./helpers.js";

const TOKEN = "super-secret-token-value";

afterEach(() => {
  vi.restoreAllMocks();
});

function client(
  fetchImpl: typeof fetch,
  extra: { dailyLimit?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): StarlingClient {
  return new StarlingClient({
    accessToken: TOKEN,
    apiHost: "api.starlingbank.com",
    fetchImpl,
    minIntervalMs: 0,
    ...extra,
  });
}

describe("StarlingClient", () => {
  it("calls only the configured Starling host and sends the bearer token", async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ accounts: [] }));
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
    await client(fetchImpl).getJson("/api/v2/accounts");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.starlingbank.com/api/v2/accounts");
    expect(calls[0]?.authorization).toBe(`Bearer ${TOKEN}`);
    expect(logs.join("\n")).not.toContain(TOKEN);
    expect(logs.join("\n")).toContain("/api/v2/accounts");
  });

  it("refuses a non-Starling host before any request", () => {
    expect(
      () =>
        new StarlingClient({
          accessToken: TOKEN,
          apiHost: "evil.example",
          fetchImpl: async () => jsonResponse({}),
        }),
    ).toThrow(/STARLING_API_HOST/);
  });

  it("strips the token from an error body", async () => {
    const { fetchImpl } = recordingFetch(
      () =>
        new Response(JSON.stringify({ message: `leaked ${TOKEN}` }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(client(fetchImpl).getJson("/api/v2/accounts")).rejects.toThrow(StarlingError);
    try {
      await client(fetchImpl).getJson("/api/v2/accounts");
    } catch (error) {
      expect(String(error)).not.toContain(TOKEN);
      expect(String(error)).toContain("HTTP 400");
    }
  });

  it("retries once when Retry-After is at most two seconds", async () => {
    let attempts = 0;
    const slept: number[] = [];
    const fetchImpl: typeof fetch = async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("{}", {
          status: 429,
          headers: { "retry-after": "1", "content-type": "application/json" },
        });
      }
      return jsonResponse({ accounts: [] });
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await client(fetchImpl, {
      sleep: async (ms) => {
        slept.push(ms);
      },
    }).getJson("/api/v2/accounts");
    expect(result).toEqual({ accounts: [] });
    expect(attempts).toBe(2);
    expect(slept).toContain(1000);
  });

  it("does not retry a long Retry-After", async () => {
    let attempts = 0;
    const fetchImpl: typeof fetch = async () => {
      attempts += 1;
      return new Response("{}", {
        status: 429,
        headers: { "retry-after": "30", "content-type": "application/json" },
      });
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(client(fetchImpl).getJson("/api/v2/accounts")).rejects.toThrow(/rate limit/);
    expect(attempts).toBe(1);
  });

  it("stops at the daily personal-token limit", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ accounts: [] }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const limited = client(fetchImpl, { dailyLimit: 1 });
    await limited.getJson("/api/v2/accounts");
    await expect(limited.getJson("/api/v2/accounts")).rejects.toThrow(/1000 requests per day/);
  });

  it("spaces calls at five per second", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ accounts: [] }));
    const slept: number[] = [];
    let clock = 1_700_000_000_000;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const paced = new StarlingClient({
      accessToken: TOKEN,
      fetchImpl,
      minIntervalMs: 200,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
    await paced.getJson("/api/v2/accounts");
    await paced.getJson("/api/v2/accounts");
    expect(slept).toEqual([200]);
  });
});
