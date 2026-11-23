#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";
import { redact } from "./text.js";
import { readRuntimeConfig } from "./version.js";
let config;
try {
    config = readRuntimeConfig(process.env);
}
catch (error) {
    const message = error instanceof Error ? error.message : "Configuration error.";
    console.error(message);
    process.exit(1);
}
console.error(`starling-safe-mcp ready on stdio (${config.apiHost})`);
serveStdio(() => createServer(config), {
    onerror(error) {
        console.error(redact(error.message, config.accessToken));
    },
});
//# sourceMappingURL=index.js.map