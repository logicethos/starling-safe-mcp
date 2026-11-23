export interface RecordedCall {
  url: string;
  method: string;
  body: string | undefined;
  authorization: string | null;
}

export function recordingFetch(
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>,
): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const headers = new Headers(init?.headers);
    const rawBody = init?.body;
    calls.push({
      url: href,
      method: init?.method ?? "GET",
      body: typeof rawBody === "string" ? rawBody : undefined,
      authorization: headers.get("authorization"),
    });
    return handler(new URL(href), init ?? {});
  };
  return { fetchImpl, calls };
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export const ACCOUNT_UID = "11111111-1111-4111-8111-111111111111";
export const CATEGORY_UID = "22222222-2222-4222-8222-222222222222";
export const FEED_UID = "33333333-3333-4333-8333-333333333333";
export const GOAL_UID = "44444444-4444-4444-8444-444444444444";

export function accountBody() {
  return {
    accounts: [
      {
        accountUid: ACCOUNT_UID,
        accountType: "PRIMARY",
        defaultCategory: CATEGORY_UID,
        currency: "GBP",
        createdAt: "2020-01-01T00:00:00.000Z",
        name: "Personal",
      },
    ],
  };
}
