# Submitting starling-safe-mcp

Independent local MCP server for a Starling personal access token: it reads balances and spending, and it can edit notes, categories, and the user's own savings goals, with no payment tools.

**Not affiliated with Starling Bank.** The logo is an original pine-and-brass ledger and safe dial (`assets/logo.svg`, `assets/logo.png`). It is not Starling's mark and it does not use Starling's brand colours.

## Reviewer testing

1. Clone the repository and run `npm ci && npm test`. Node.js 20 or newer is required (the workflow uses 22). Every test should pass. No token is required, and the tests do not call Starling.
2. Open the [Starling sandbox developer portal](https://developer-sandbox.starlingbank.com/) and create a personal access token. Tick only the scopes in [Token scopes](#token-scopes). Do not tick a payment, payee-write, standing-order, or mandate-delete scope.
3. `dist/` is already committed, so a clone can run without compiling. From the repository root, install runtime dependencies and start the server against the sandbox host:

   ```bash
   npm install --omit=dev
   STARLING_ACCESS_TOKEN="<sandbox personal access token>" \
   STARLING_API_HOST=api-sandbox.starlingbank.com \
   node dist/index.js
   ```

   Stderr should contain `starling-safe-mcp ready on stdio (api-sandbox.starlingbank.com)`. The token must not appear in that line. `STARLING_API_HOST` accepts only `api-sandbox.starlingbank.com` and `api.starlingbank.com`. Any other host is rejected and is not echoed.
4. Point an MCP client at that process on stdio (the token stays in the environment, not in the arguments). Call `list_accounts`, then `get_balance` for one returned account, then `summarise_spending`. Confirm the replies are account data and that no money moves.
5. Ask for a change to one sandbox transaction note. Confirm the assistant shows a preview that names the transaction and the exact new note, and that it does not call `update_transaction_note` until you agree. After you agree, confirm the call includes `confirmed: true` and the result describes the change. Repeat the same preview-then-confirm check for one savings-goal transfer if the sandbox account has a goal: the preview must show the amount, currency, and goal, and a successful call must not be retried.
6. Confirm a write with `confirmed` omitted or set to anything other than `true` fails with the server's confirmation error, and that the account is unchanged.
7. Check the marketplace package without a real token. `.cursor-plugin/plugin.json` names the plugin `starling-safe-mcp`, points `logo` at `assets/logo.svg`, and declares `STARLING_ACCESS_TOKEN` as a required string the user enters at install. `mcp.json` runs `npx` with args `-y` and `github:logicethos/starling-safe-mcp#v0.1.0`, and its env value is the placeholder `${STARLING_ACCESS_TOKEN}` with no real token. `skills/starling-banking/SKILL.md` has `name` and `description` frontmatter. The installed server talks to production. Sandbox still needs `STARLING_API_HOST=api-sandbox.starlingbank.com` on a manual run, as in step 3. This package is not published to npm.

## Token scopes

Tick these on the sandbox token, and on any production token you use yourself:

| Scope | What the server uses it for |
| --- | --- |
| `account:read` | List accounts |
| `account-list:read` | List accounts (tick both; Starling has used each name) |
| `balance:read` | Balances |
| `account-identifier:read` | Sort code, account number, IBAN |
| `customer:read` | Account-holder name only. Address is not shown |
| `transaction:read` | Transaction feed |
| `space:read` | Spaces |
| `savings-goal:read` | Savings goals |
| `card:read` | Cards, read only |
| `mandate:read` | Direct debit mandates, read only |
| `payee:read` | Payees, read only |
| `transaction:edit` | Notes and spending categories |
| `savings-goal:create` | Create a savings goal |
| `savings-goal-transfer:create` | Move money from the main balance into your own savings goal |
| `savings-goal-transfer:delete` | Move money from your own savings goal back to the main balance. The goal is not deleted. Starling uses this name for that transfer |
| `statement-csv:read` | CSV statement, if the endpoint is available |
| `metadata:create` or `receipt:write` | Save a receipt on a transaction |

Do not tick: `payee:create`, `payee:edit`, `payee:delete`, `pay-local:create`, `pay-local-once:create`, `standing-order:create`, `standing-order:delete`, `mandate:delete`, `savings-goal:delete`, `address:edit`.

The server has no tool that calls those APIs. Leaving the scopes unticked means a leaked token still cannot do them. Skip any write scope you do not want the model to have. Reads still work.

## Marketplace submission checklist

From the [Cursor plugins reference](https://cursor.com/docs/reference/plugins):

- [x] Plugin has a valid root `plugin.json` or `.cursor-plugin/plugin.json` manifest
- [x] `name` is unique, lowercase, kebab-case (`starling-safe-mcp`)
- [x] `description` clearly explains the plugin's purpose
- [x] All included components have valid files and frontmatter (`skills/starling-banking/SKILL.md`)
- [x] Logo is committed to the repo and referenced by relative path (`assets/logo.svg`, with `assets/logo.png` on a solid plate)
- [x] `README.md` documents usage and any configuration
- [x] Agent Plugins conform to the Agent Plugins schemas (this is a Cursor Plugin; it does not ship a root Agent Plugins manifest)
- [x] Cursor Plugins using variables declare every `${VAR}` from `mcp.json` in the manifest schema (`STARLING_ACCESS_TOKEN` only)
- [x] All paths in manifest are relative and valid (no `..`, no absolute paths)
- [x] Plugin has been tested locally (`npm test` in this repo; the server is already in production use by the owner; sandbox steps above are for the marketplace reviewer)
- [x] Cursor multi-plugin repositories have `.cursor-plugin/marketplace.json` at the repo root with unique plugin names (this repository is a single plugin, so it has no marketplace manifest)

Submit the public repository at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish).
