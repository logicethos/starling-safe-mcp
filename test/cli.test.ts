import { spawn } from "node:child_process";
import { once } from "node:events";
import { describe, expect, it } from "vitest";

describe("stdio entry", () => {
  it("exits when STARLING_ACCESS_TOKEN is missing", async () => {
    const child = spawn(process.execPath, ["dist/index.js"], {
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    const timer = setTimeout(() => child.kill(), 5000);
    const [code] = (await once(child, "close")) as [number | null];
    clearTimeout(timer);
    expect(code).toBe(1);
    expect(stderr).toContain("STARLING_ACCESS_TOKEN");
    expect(stderr).not.toMatch(/eyJ/);
  });

  it("does not print the token when stdin closes", async () => {
    const token = "super-secret-token-value";
    const child = spawn(process.execPath, ["dist/index.js"], {
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        STARLING_ACCESS_TOKEN: token,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.stdin?.end();
    const timer = setTimeout(() => child.kill(), 4000);
    await once(child, "close");
    clearTimeout(timer);
    expect(stderr).toContain("starling-safe-mcp ready on stdio");
    expect(stderr).toContain("api.starlingbank.com");
    expect(stderr).not.toContain(token);
  });
});
