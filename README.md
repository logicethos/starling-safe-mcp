# starling-safe-mcp

Local [Model Context Protocol](https://modelcontextprotocol.io) server for a Starling Bank personal access token. It runs on your own machine over stdio.

It can read accounts, balances, transactions, spaces, cards, direct debit mandates, payees, and (when Starling still serves them) statements and spending insights. It can also make a short list of safe edits: transaction notes, spending categories, receipt metadata, a file attached to a transaction, a new savings goal, and moving money between your main balance and your own savings goals.

It cannot send payments, create or delete payees, set up or cancel standing orders, cancel direct debits, change your address or other personal details, or delete a space.

## Not affiliated with Starling Bank

**This project is not affiliated with, endorsed by, or supported by Starling Bank.** It is an independent tool by Stuart Johnson (Logic Ethos Ltd). Starling's name is used only to say which API the server calls. The logo is an original ledger-and-dial mark, not Starling's logo, and it does not use Starling's brand colours. You use it at your own risk. A model can misunderstand an instruction, and text in a transaction reference is data, not a command.

The personal access token is a password. Anyone who has it can call Starling with the scopes you ticked. Keep it in an environment variable, do not commit it, and do not paste it into a chat. Revoke it in the developer portal if it leaks. This server does not store the token and does not log the token or transaction bodies.

## Create a token

1. Open the [Starling Developer Portal](https://developer.starlingbank.com/docs) and sign in.
2. Link your Starling account, then create a personal access token: [Personal access](https://developer.starlingbank.com/personal/token).
3. Tick only the scopes below. A sandbox token, from the [sandbox portal](https://developer-sandbox.starlingbank.com/), talks to `api-sandbox.starlingbank.com` when you set `STARLING_API_HOST`.

### Tick these

| Scope | What this server uses it for |
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

Skip any write scope you do not want the model to have. Reads still work.

### Do not tick these

`payee:create`, `payee:edit`, `payee:delete`, `pay-local:create`, `pay-local-once:create`, `standing-order:create`, `standing-order:delete`, `mandate:delete`, `savings-goal:delete`, `address:edit`.

This server has no tool that calls those APIs. Leaving the scopes unticked means a leaked token still cannot do them.

## Marketplace install

This repository is a Cursor plugin named `starling-safe-mcp` (the package Grok Bot and Cursor install from the plugin marketplace). After Cursor lists it:

1. Open **Customize**.
2. Find `starling-safe-mcp` and choose **Install**.
3. When asked, enter your Starling personal access token. That prompt is the plugin variable `STARLING_ACCESS_TOKEN`. It is a secret you set at install (or later under Plugins → Configure). It is not stored in this repository. Cursor passes it to the server as the environment variable of the same name.
4. The plugin starts `npx -y github:logicethos/starling-safe-mcp#v0.1.0` on stdio. That installs this repository from GitHub at the `v0.1.0` tag. It is not published to npm. The compiled server is already in the repository, so the install does not compile TypeScript.

The installed server uses Starling production (`api.starlingbank.com`). It does not set `STARLING_API_HOST`. Sandbox testing is in [SUBMITTING.md](SUBMITTING.md).

The manifest logo is `assets/logo.svg`. `assets/logo.png` is the same mark as a 512×512 PNG on a solid background.

Create the token with the scopes above before you install. Leave payment scopes unticked.

## Run

Node.js 20 or newer.

Clone and run the committed server. There is no compile step:

```bash
git clone https://github.com/logicethos/starling-safe-mcp.git
cd starling-safe-mcp
npm install --omit=dev
STARLING_ACCESS_TOKEN="your-personal-access-token" node dist/index.js
```

`npm install --omit=dev` only downloads the runtime packages. `dist/index.js` is already in the clone, and it starts with `#!/usr/bin/env node`.

The process speaks MCP on stdin and stdout. Logs, if any, go to stderr and do not include the token or transaction text.

To change the source, run `npm ci` and `npm test`. The test rebuilds `dist/`. Commit that rebuilt `dist/` with the source change.

Sandbox:

```bash
STARLING_ACCESS_TOKEN="your-sandbox-token" \
STARLING_API_HOST=api-sandbox.starlingbank.com \
node dist/index.js
```

`STARLING_API_HOST` may only be `api.starlingbank.com` (the default) or `api-sandbox.starlingbank.com`.

The marketplace plugin runs the tagged GitHub repository, not an npm package:

```bash
STARLING_ACCESS_TOKEN="your-personal-access-token" \
  npx -y github:logicethos/starling-safe-mcp#v0.1.0
```

The tag `v0.1.0` is the release the plugin installs. The same command without `#v0.1.0` follows the default branch.

## Add it as a command connector

Point the MCP client at the command, and put the token in the command environment. Do not put the token in the arguments, and do not commit a real token. Example for a local checkout:

```json
{
  "mcpServers": {
    "starling-bank": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"],
      "env": {
        "STARLING_ACCESS_TOKEN": "your-personal-access-token"
      }
    }
  }
}
```

The marketplace `mcp.json` does not contain a token. It installs the tagged repository and substitutes the install-time secret:

```json
{
  "mcpServers": {
    "starling": {
      "command": "npx",
      "args": ["-y", "github:logicethos/starling-safe-mcp#v0.1.0"],
      "env": {
        "STARLING_ACCESS_TOKEN": "${STARLING_ACCESS_TOKEN}"
      }
    }
  }
}
```

Write tools refuse to run unless `confirmed` is true. Agree the exact change in chat before the model sets that.

Starling allows 5 requests per second and 1000 requests per day on a personal token. This server spaces calls and returns a clear error when the limit is hit.

## Tools

Read: `list_accounts`, `get_balance`, `get_account_identifiers`, `get_account_holder`, `list_transactions`, `get_transaction`, `list_spaces`, `list_savings_goals`, `list_cards`, `list_direct_debit_mandates`, `list_payees`, `list_statement_periods`, `get_statement_csv`, `get_spending_insights`, `list_transaction_attachments`.

Safe edits, each of which describes the change in its result: `update_transaction_note`, `update_spending_category`, `create_savings_goal`, `add_money_to_savings_goal`, `withdraw_money_from_savings_goal`, `save_transaction_receipt`, `upload_transaction_attachment`.

Analysis: `summarise_spending`, `detect_recurring_payments`, `financial_overview`.

`summarise_spending` and `detect_recurring_payments` are computed from the feed. Starling's statement and spending-insights endpoints are called when you ask, and the tool says so if Starling does not serve them.

## Licence

MIT. Copyright (c) 2026 Stuart Johnson, Logic Ethos Ltd.
