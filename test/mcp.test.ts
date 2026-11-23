import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server.js";
import { accountBody, jsonResponse } from "./helpers.js";

const FORBIDDEN =
  /^(create|send|make)_payment|standing_order|cancel_mandate|delete_space|delete_savings|create_payee|lock_card|payee_create/;

describe("MCP server", () => {
  it("lists the safe tool set and answers list_accounts", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl: typeof fetch = async (input) => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(href);
      if (url.pathname === "/api/v2/accounts") return jsonResponse(accountBody());
      return jsonResponse({ error: "unexpected" }, 404);
    };
    const server = createServer({
      accessToken: "super-secret-token-value",
      fetchImpl,
      minIntervalMs: 0,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    expect(names).toContain("list_accounts");
    expect(names).toContain("summarise_spending");
    expect(names).toContain("detect_recurring_payments");
    expect(names).toContain("financial_overview");
    expect(names).toContain("add_money_to_savings_goal");
    expect(names).toContain("withdraw_money_from_savings_goal");
    expect(names).toContain("update_transaction_note");
    for (const name of names) expect(name).not.toMatch(FORBIDDEN);

    const note = listed.tools.find((tool) => tool.name === "update_transaction_note");
    expect(note?.description).toMatch(/WRITE/);
    expect(note?.description).toMatch(/Does not change the amount/);

    const result = await client.callTool({ name: "list_accounts", arguments: {} });
    const text = JSON.stringify(result);
    expect(text).toContain("defaultCategoryUid");
    expect(text).not.toContain("super-secret-token-value");
    await client.close();
    await server.close();
  });
});
