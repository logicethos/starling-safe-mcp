import { detectRecurring, summariseSpending } from "./analysis.js";
import { requireSpendingCategory } from "./categories.js";
import { StarlingClient, StarlingError } from "./client.js";
import {
  feedPayload,
  presentTransaction,
  projectFeed,
  projectFeedItem,
  resolveRange,
  utcDay,
  type PublicTransaction,
} from "./feed.js";
import { requireUid } from "./routes.js";
import {
  asRecord,
  cleanLabel,
  cleanNote,
  currencyCode,
  formatMoney,
  majorToMinor,
  readMoney,
  stringField,
  UNTRUSTED_NOTICE,
  untrustedText,
} from "./text.js";

const FEED_CAP = 5000;
const LIST_CAP = 200;
const STATEMENT_CAP = 80_000;
const ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
]);
const ATTACHMENT_CAP = 1_500_000;

export interface Account {
  accountUid: string;
  defaultCategoryUid: string;
  currency: string;
  accountType: string;
  name: string;
  createdAt: string;
}

export async function listAccounts(client: StarlingClient): Promise<Account[]> {
  const body = await client.getJson("/api/v2/accounts");
  const rows = asRecord(body).accounts;
  if (!Array.isArray(rows)) return [];
  const accounts: Account[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    const accountUid = stringField(record, "accountUid");
    if (accountUid === "") continue;
    accounts.push({
      accountUid,
      defaultCategoryUid: stringField(record, "defaultCategory"),
      currency: stringField(record, "currency"),
      accountType: stringField(record, "accountType"),
      name: untrustedText(record.name, 80),
      createdAt: stringField(record, "createdAt"),
    });
  }
  return accounts;
}

export async function getBalance(
  client: StarlingClient,
  accountUid?: string,
): Promise<Record<string, unknown>> {
  const account = await resolveAccount(client, accountUid);
  const body = await client.getJson(`/api/v2/accounts/${account.accountUid}/balance`);
  const record = asRecord(body);
  return {
    accountUid: account.accountUid,
    clearedBalance: readMoney(record.clearedBalance),
    effectiveBalance: readMoney(record.effectiveBalance),
    pendingTransactions: readMoney(record.pendingTransactions),
    acceptedOverdraft: readMoney(record.acceptedOverdraft),
    amount: readMoney(record.amount),
  };
}

export async function getAccountIdentifiers(
  client: StarlingClient,
  accountUid?: string,
): Promise<Record<string, unknown>> {
  const account = await resolveAccount(client, accountUid);
  const body = await client.getJson(
    `/api/v2/accounts/${account.accountUid}/identifiers`,
  );
  const record = asRecord(body);
  return {
    sensitive: true,
    notice:
      "Sort code, account number, and IBAN. Do not repeat them unless the user asked.",
    accountUid: account.accountUid,
    accountIdentifier: stringField(record, "accountIdentifier"),
    bankIdentifier: stringField(record, "bankIdentifier"),
    iban: stringField(record, "iban"),
    bic: stringField(record, "bic"),
  };
}

export async function getAccountHolder(
  client: StarlingClient,
): Promise<Record<string, unknown>> {
  const body = await client.getJson("/api/v2/account-holder");
  const record = asRecord(body);
  const name = await optional(client, "customer:read", async () => {
    const named = asRecord(await client.getJson("/api/v2/account-holder/name"));
    return untrustedText(named.accountHolderName ?? named.name, 120);
  });
  return {
    accountHolderUid: stringField(record, "accountHolderUid"),
    accountHolderType: stringField(record, "accountHolderType"),
    name,
    omitted:
      "Postal address, email, phone, and date of birth are not returned.",
  };
}

export async function listTransactions(
  client: StarlingClient,
  input: { accountUid?: string; categoryUid?: string; from?: string; to?: string },
): Promise<Record<string, unknown>> {
  const loaded = await loadTransactions(client, input, 30);
  const newest = newestFirst(loaded.items).slice(0, LIST_CAP);
  return feedPayload(newest, loaded.range, loaded.items.length);
}

export async function getTransaction(
  client: StarlingClient,
  input: { accountUid?: string; categoryUid?: string; feedItemUid: string },
): Promise<Record<string, unknown>> {
  const located = await locateFeed(client, input);
  const body = await client.getJson(
    `/api/v2/feed/account/${located.accountUid}/category/${located.categoryUid}/${located.feedItemUid}`,
  );
  const item = projectFeedItem(body);
  if (!item) throw new Error("Starling did not return that transaction.");
  return {
    dataNotice: UNTRUSTED_NOTICE,
    transaction: presentTransaction(item),
  };
}

export async function listSpaces(
  client: StarlingClient,
  accountUid?: string,
): Promise<Record<string, unknown>> {
  const account = await resolveAccount(client, accountUid);
  const body = await client.getJson(`/api/v2/account/${account.accountUid}/spaces`);
  return {
    accountUid: account.accountUid,
    dataNotice: UNTRUSTED_NOTICE,
    spaces: projectSpaces(body),
    note: "Spending spaces are read-only here. Savings goals can be created and funded with the savings tools.",
  };
}

export async function listSavingsGoals(
  client: StarlingClient,
  accountUid?: string,
): Promise<SavingsGoal[]> {
  const account = await resolveAccount(client, accountUid);
  const body = await client.getJson(
    `/api/v2/account/${account.accountUid}/savings-goals`,
  );
  return readGoals(body).map((goal) => ({ ...goal, accountUid: account.accountUid }));
}

export async function listCards(client: StarlingClient): Promise<Record<string, unknown>> {
  const body = await client.getJson("/api/v2/cards");
  const rows = asRecord(body).cards;
  const cards = Array.isArray(rows) ? rows.map(projectCard) : [];
  return {
    note: "Cards are read-only. This server cannot lock a card or reveal the full card number.",
    cards,
  };
}

export async function listDirectDebitMandates(
  client: StarlingClient,
  accountUid?: string,
): Promise<Record<string, unknown>> {
  const account = await resolveAccount(client, accountUid);
  const body = await client.getJson(
    `/api/v2/direct-debit/mandates/account/${account.accountUid}`,
  );
  const rows = asRecord(body).mandates;
  const mandates = Array.isArray(rows) ? rows.map(projectMandate) : [];
  return {
    accountUid: account.accountUid,
    dataNotice: UNTRUSTED_NOTICE,
    note: "Direct debits are read-only. This server cannot cancel a mandate.",
    mandates,
  };
}

export async function listPayees(client: StarlingClient): Promise<Record<string, unknown>> {
  const body = await client.getJson("/api/v2/payees");
  const rows = asRecord(body).payees;
  const payees = Array.isArray(rows) ? rows.map(projectPayee) : [];
  return {
    dataNotice: UNTRUSTED_NOTICE,
    note: "Payees are read-only. This server cannot create, edit, or delete a payee, and it cannot pay one.",
    payees,
  };
}

export async function listStatementPeriods(
  client: StarlingClient,
  accountUid?: string,
): Promise<Record<string, unknown>> {
  const account = await resolveAccount(client, accountUid);
  return optionalValue(client, "statement-csv:read", async () => {
    const body = await client.getJson(
      `/api/v2/accounts/${account.accountUid}/statement/available-periods`,
    );
    return { available: true, accountUid: account.accountUid, periods: body };
  }, "Starling did not return statement periods. Use list_transactions or summarise_spending.");
}

export async function getStatementCsv(
  client: StarlingClient,
  input: { accountUid?: string; from: string; to: string },
): Promise<Record<string, unknown>> {
  const account = await resolveAccount(client, input.accountUid);
  const range = resolveRange(input.from, input.to, 31);
  const start = utcDay(range.from);
  const end = utcDay(range.to);
  return optionalValue(client, "statement-csv:read", async () => {
    const csv = await client.getText(
      `/api/v2/accounts/${account.accountUid}/statement/downloadForDateRange/csv`,
      { start, end },
    );
    const truncated = csv.length > STATEMENT_CAP;
    return {
      available: true,
      accountUid: account.accountUid,
      start,
      end,
      truncated,
      dataNotice: UNTRUSTED_NOTICE,
      csv: truncated ? `${csv.slice(0, STATEMENT_CAP)}\n` : csv,
    };
  }, "Starling did not return a CSV statement. Use list_transactions or summarise_spending.");
}

export async function getSpendingInsights(
  client: StarlingClient,
  input: {
    accountUid?: string;
    by: "category" | "counterparty" | "country";
    year: number;
  },
): Promise<Record<string, unknown>> {
  const account = await resolveAccount(client, input.accountUid);
  const dimension =
    input.by === "counterparty"
      ? "counter-party"
      : input.by === "country"
        ? "country"
        : "spending-category";
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    throw new Error("Year must be a four-digit year.");
  }
  return optionalValue(client, "transaction:read", async () => {
    const body = await client.getJson(
      `/api/v2/accounts/${account.accountUid}/spending-insights/${dimension}`,
      { year: String(input.year) },
    );
    return {
      available: true,
      accountUid: account.accountUid,
      by: input.by,
      year: input.year,
      dataNotice: UNTRUSTED_NOTICE,
      insights: sanitiseTree(body),
    };
  }, "Starling did not return spending insights for this token. Use summarise_spending, which totals the transaction feed itself.");
}

export async function listTransactionAttachments(
  client: StarlingClient,
  input: { accountUid?: string; categoryUid?: string; feedItemUid: string },
): Promise<Record<string, unknown>> {
  const located = await locateFeed(client, input);
  const body = await client.getJson(
    `/api/v2/feed/account/${located.accountUid}/category/${located.categoryUid}/${located.feedItemUid}/attachments`,
  );
  return {
    feedItemUid: located.feedItemUid,
    note: "Attachment bytes are not inlined. Images stay on Starling.",
    attachments: sanitiseTree(body),
  };
}

export async function updateTransactionNote(
  client: StarlingClient,
  input: {
    accountUid?: string;
    categoryUid?: string;
    feedItemUid: string;
    userNote: string;
    confirmed: true;
  },
): Promise<Record<string, unknown>> {
  requireConfirmed(input.confirmed);
  const note = cleanNote(input.userNote);
  const located = await locateFeed(client, input);
  await client.putJson(
    `/api/v2/feed/account/${located.accountUid}/category/${located.categoryUid}/${located.feedItemUid}/user-note`,
    { userNote: note },
  );
  return {
    changed: `Replaced the user note on transaction ${located.feedItemUid}. The amount, counterparty, and date are unchanged.`,
    feedItemUid: located.feedItemUid,
    userNote: note,
  };
}

export async function updateSpendingCategory(
  client: StarlingClient,
  input: {
    accountUid?: string;
    categoryUid?: string;
    feedItemUid: string;
    spendingCategory: string;
    confirmed: true;
  },
): Promise<Record<string, unknown>> {
  requireConfirmed(input.confirmed);
  const spendingCategory = requireSpendingCategory(input.spendingCategory);
  const located = await locateFeed(client, input);
  await client.putJson(
    `/api/v2/feed/account/${located.accountUid}/category/${located.categoryUid}/${located.feedItemUid}/spending-category`,
    { spendingCategory },
  );
  return {
    changed: `Set the spending category on transaction ${located.feedItemUid} to ${spendingCategory}. The amount is unchanged.`,
    feedItemUid: located.feedItemUid,
    spendingCategory,
  };
}

export async function createSavingsGoal(
  client: StarlingClient,
  input: {
    accountUid?: string;
    name: string;
    currency?: string;
    target?: string;
    confirmed: true;
  },
): Promise<Record<string, unknown>> {
  requireConfirmed(input.confirmed);
  const account = await resolveAccount(client, input.accountUid);
  const name = cleanLabel(input.name, 40, "Savings goal name");
  const currency = currencyCode(input.currency ?? account.currency);
  const body: Record<string, unknown> = { name, currency };
  if (input.target !== undefined && input.target.trim() !== "") {
    body.target = { currency, minorUnits: majorToMinor(input.target) };
  }
  const created = asRecord(
    await client.putJson(`/api/v2/account/${account.accountUid}/savings-goals`, body),
  );
  return {
    changed: `Created savings goal "${name}" on account ${account.accountUid}. No money was moved.`,
    accountUid: account.accountUid,
    savingsGoalUid: stringField(created, "savingsGoalUid"),
    name,
    currency,
  };
}

export async function addMoneyToSavingsGoal(
  client: StarlingClient,
  input: {
    accountUid?: string;
    savingsGoalUid: string;
    amount: string;
    currency?: string;
    confirmed: true;
  },
): Promise<Record<string, unknown>> {
  return moveSavings(client, input, "add");
}

export async function withdrawMoneyFromSavingsGoal(
  client: StarlingClient,
  input: {
    accountUid?: string;
    savingsGoalUid: string;
    amount: string;
    currency?: string;
    confirmed: true;
  },
): Promise<Record<string, unknown>> {
  return moveSavings(client, input, "withdraw");
}

export async function saveTransactionReceipt(
  client: StarlingClient,
  input: {
    feedItemUid: string;
    merchantName: string;
    total: string;
    currency?: string;
    items?: { description: string; quantity?: number; amount: string }[];
    confirmed: true;
  },
): Promise<Record<string, unknown>> {
  requireConfirmed(input.confirmed);
  const feedItemUid = requireUid(input.feedItemUid, "feedItemUid");
  const currency = currencyCode(input.currency);
  const merchantName = cleanLabel(input.merchantName, 80, "Merchant name");
  const totalMinor = majorToMinor(input.total);
  const items = (input.items ?? []).slice(0, 30).map((item) => ({
    description: cleanLabel(item.description, 80, "Receipt item"),
    quantity: item.quantity ?? 1,
    amount: Number((majorToMinor(item.amount) / 100).toFixed(2)),
    currency,
  }));
  await client.putJson(`/api/v2/feed/receipt/${feedItemUid}`, {
    receiptIdentifier: crypto.randomUUID(),
    merchantName,
    totalAmount: Number((totalMinor / 100).toFixed(2)),
    totalCurrency: currency,
    items,
  });
  return {
    changed: `Saved a receipt on transaction ${feedItemUid} for ${formatMoney(totalMinor, currency)} at ${merchantName}. The bank transaction amount is unchanged.`,
    feedItemUid,
  };
}

export async function uploadTransactionAttachment(
  client: StarlingClient,
  input: {
    accountUid?: string;
    categoryUid?: string;
    feedItemUid: string;
    contentType: string;
    base64: string;
    confirmed: true;
  },
): Promise<Record<string, unknown>> {
  requireConfirmed(input.confirmed);
  const contentType = input.contentType.trim().toLowerCase();
  if (!ATTACHMENT_TYPES.has(contentType)) {
    throw new Error(
      "Attachment content type must be image/jpeg, image/png, image/webp, application/pdf, or text/plain.",
    );
  }
  const bytes = decodeBase64(input.base64);
  if (bytes.byteLength > ATTACHMENT_CAP) {
    throw new Error("Attachment is larger than 1.5 MB.");
  }
  const located = await locateFeed(client, input);
  const created = asRecord(
    await client.postBytes(
      `/api/v2/feed/account/${located.accountUid}/category/${located.categoryUid}/${located.feedItemUid}/attachments`,
      bytes,
      contentType,
    ),
  );
  return {
    changed: `Uploaded an attachment onto transaction ${located.feedItemUid}. The transaction amount is unchanged.`,
    feedItemUid: located.feedItemUid,
    feedItemAttachmentUid: stringField(created, "feedItemAttachmentUid"),
    bytes: bytes.byteLength,
  };
}

export async function summariseAccountSpending(
  client: StarlingClient,
  input: { accountUid?: string; categoryUid?: string; from?: string; to?: string },
): Promise<Record<string, unknown>> {
  const loaded = await loadTransactions(client, input, 30);
  return {
    accountUid: loaded.accountUid,
    categoryUid: loaded.categoryUid,
    ...summariseSpending(
      loaded.items,
      loaded.range.from,
      loaded.range.to,
      loaded.truncated,
    ),
  };
}

export async function findRecurringPayments(
  client: StarlingClient,
  input: { accountUid?: string; categoryUid?: string; from?: string; to?: string },
): Promise<Record<string, unknown>> {
  const loaded = await loadTransactions(client, input, 180);
  return {
    accountUid: loaded.accountUid,
    categoryUid: loaded.categoryUid,
    from: loaded.range.from,
    to: loaded.range.to,
    truncated: loaded.truncated,
    dataNotice: UNTRUSTED_NOTICE,
    candidates: detectRecurring(loaded.items),
  };
}

export async function financialOverview(
  client: StarlingClient,
): Promise<Record<string, unknown>> {
  const accounts = await listAccounts(client);
  const shown = accounts.slice(0, 4);
  const accountViews = [];
  for (const account of shown) {
    const balance = await getBalance(client, account.accountUid);
    const goals = await optional(client, "savings-goal:read", () =>
      listSavingsGoals(client, account.accountUid),
    );
    accountViews.push({ ...account, balance, savingsGoals: goals });
  }
  const primary = shown[0];
  let last30Days: unknown = null;
  let directDebitMandates: unknown = null;
  if (primary) {
    last30Days = await optional(client, "transaction:read", () =>
      summariseAccountSpending(client, { accountUid: primary.accountUid }),
    );
    directDebitMandates = await optional(client, "mandate:read", () =>
      listDirectDebitMandates(client, primary.accountUid),
    );
  }
  return {
    generatedAt: new Date().toISOString(),
    accounts: accountViews,
    moreAccounts: Math.max(0, accounts.length - shown.length),
    primaryAccountUid: primary?.accountUid ?? null,
    last30Days,
    directDebitMandates,
    dataNotice: UNTRUSTED_NOTICE,
  };
}

interface SavingsGoal {
  accountUid: string;
  savingsGoalUid: string;
  name: string;
  state: string;
  totalSaved: ReturnType<typeof readMoney>;
  target: ReturnType<typeof readMoney>;
}

async function moveSavings(
  client: StarlingClient,
  input: {
    accountUid?: string;
    savingsGoalUid: string;
    amount: string;
    currency?: string;
    confirmed: true;
  },
  direction: "add" | "withdraw",
): Promise<Record<string, unknown>> {
  requireConfirmed(input.confirmed);
  const account = await resolveAccount(client, input.accountUid);
  const savingsGoalUid = requireUid(input.savingsGoalUid, "savingsGoalUid");
  const goals = await listSavingsGoals(client, account.accountUid);
  const goal = goals.find((item) => item.savingsGoalUid === savingsGoalUid);
  if (!goal) {
    throw new Error(
      "That savings goal is not on this account. Money only moves between the main balance and one of this account's own savings goals. Nothing was moved.",
    );
  }
  const currency = currencyCode(input.currency ?? account.currency);
  const minorUnits = majorToMinor(input.amount);
  const transferUid = crypto.randomUUID();
  const verb = direction === "add" ? "add-money" : "withdraw-money";
  await client.putJson(
    `/api/v2/account/${account.accountUid}/savings-goals/${savingsGoalUid}/${verb}/${transferUid}`,
    { amount: { currency, minorUnits } },
  );
  const changed =
    direction === "add"
      ? `Moved ${formatMoney(minorUnits, currency)} from the main balance of account ${account.accountUid} into savings goal "${goal.name}" (${savingsGoalUid}). This does not pay another person. A repeat of this call moves money again.`
      : `Moved ${formatMoney(minorUnits, currency)} from savings goal "${goal.name}" (${savingsGoalUid}) back to the main balance of account ${account.accountUid}. The goal was not deleted. A repeat of this call moves money again.`;
  return {
    changed,
    accountUid: account.accountUid,
    savingsGoalUid,
    transferUid,
    amount: { currency, minorUnits, major: formatMoney(minorUnits, currency) },
  };
}

async function resolveAccount(
  client: StarlingClient,
  accountUid?: string,
): Promise<Account> {
  const accounts = await listAccounts(client);
  if (accountUid) {
    const uid = requireUid(accountUid, "accountUid");
    const found = accounts.find((account) => account.accountUid === uid);
    if (!found) {
      throw new Error("That account is not available to this access token.");
    }
    return found;
  }
  const only = accounts[0];
  if (accounts.length === 1 && only) return only;
  throw new Error(
    "This token can see more than one account. Pass accountUid from list_accounts.",
  );
}

async function locateFeed(
  client: StarlingClient,
  input: { accountUid?: string; categoryUid?: string; feedItemUid: string },
): Promise<{ accountUid: string; categoryUid: string; feedItemUid: string }> {
  const account = await resolveAccount(client, input.accountUid);
  const categoryUid = input.categoryUid
    ? requireUid(input.categoryUid, "categoryUid")
    : account.defaultCategoryUid;
  if (categoryUid === "") {
    throw new Error("Pass categoryUid. This account has no default category.");
  }
  return {
    accountUid: account.accountUid,
    categoryUid,
    feedItemUid: requireUid(input.feedItemUid, "feedItemUid"),
  };
}

async function loadTransactions(
  client: StarlingClient,
  input: { accountUid?: string; categoryUid?: string; from?: string; to?: string },
  defaultDays: number,
): Promise<{
  accountUid: string;
  categoryUid: string;
  range: { from: string; to: string };
  items: PublicTransaction[];
  truncated: boolean;
}> {
  const account = await resolveAccount(client, input.accountUid);
  const categoryUid = input.categoryUid
    ? requireUid(input.categoryUid, "categoryUid")
    : account.defaultCategoryUid;
  if (categoryUid === "") {
    throw new Error("Pass categoryUid. This account has no default category.");
  }
  const range = resolveRange(input.from, input.to, defaultDays);
  const body = await client.getJson(
    `/api/v2/feed/account/${account.accountUid}/category/${categoryUid}/transactions-between`,
    {
      minTransactionTimestamp: range.from,
      maxTransactionTimestamp: range.to,
    },
  );
  const all = projectFeed(body).filter((item) => inRange(item, range));
  return {
    accountUid: account.accountUid,
    categoryUid,
    range,
    items: all.slice(0, FEED_CAP),
    truncated: all.length > FEED_CAP,
  };
}

function inRange(
  item: PublicTransaction,
  range: { from: string; to: string },
): boolean {
  if (item.transactionTime === "") return true;
  const time = Date.parse(item.transactionTime);
  if (Number.isNaN(time)) return true;
  return time >= Date.parse(range.from) && time <= Date.parse(range.to);
}

function newestFirst(items: PublicTransaction[]): PublicTransaction[] {
  return items
    .slice()
    .sort((a, b) => b.transactionTime.localeCompare(a.transactionTime));
}

function readGoals(body: unknown): Omit<SavingsGoal, "accountUid">[] {
  const record = asRecord(body);
  const rows = record.savingsGoalList ?? record.savingsGoals;
  if (!Array.isArray(rows)) return [];
  const goals: Omit<SavingsGoal, "accountUid">[] = [];
  for (const row of rows) {
    const item = asRecord(row);
    const savingsGoalUid = stringField(item, "savingsGoalUid");
    if (savingsGoalUid === "") continue;
    goals.push({
      savingsGoalUid,
      name: untrustedText(item.name, 80),
      state: stringField(item, "state"),
      totalSaved: readMoney(item.totalSaved),
      target: readMoney(item.target),
    });
  }
  return goals;
}

function projectSpaces(body: unknown): Record<string, unknown>[] {
  const record = asRecord(body);
  const savings = readGoals(record);
  const spendingRows = record.spendingSpaces ?? record.spaces;
  const spending = Array.isArray(spendingRows)
    ? spendingRows.map((row) => {
        const item = asRecord(row);
        return {
          kind: "spending",
          spaceUid: stringField(item, "spaceUid") || stringField(item, "categoryUid"),
          name: untrustedText(item.name, 80),
          balance: readMoney(item.balance ?? item.totalSaved),
        };
      })
    : [];
  return [
    ...savings.map((goal) => ({ kind: "savings", ...goal })),
    ...spending.filter((space) => space.spaceUid !== ""),
  ];
}

function projectCard(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  const card: Record<string, unknown> = {
    cardUid: stringField(record, "cardUid"),
    type: stringField(record, "type") || stringField(record, "cardType"),
    enabled: record.enabled === true,
    status: stringField(record, "status"),
    nameOnCard: untrustedText(record.nameOnCard, 80),
    currency: stringField(record, "currency"),
    accountUid: stringField(record, "accountUid"),
  };
  for (const [key, field] of Object.entries(record)) {
    if (/last/i.test(key) && typeof field === "string" && /^\d{2,4}$/.test(field)) {
      card[key] = field;
    }
  }
  return card;
}

function projectMandate(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  const last = asRecord(record.lastPayment);
  return {
    uid: stringField(record, "uid"),
    status: stringField(record, "status"),
    originatorName: untrustedText(record.originatorName),
    reference: untrustedText(record.reference),
    nextDate: stringField(record, "nextDate"),
    lastDate: stringField(record, "lastDate"),
    lastAmount: readMoney(last.lastAmount),
    cancelled: stringField(record, "cancelled"),
  };
}

function projectPayee(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  const accounts = Array.isArray(record.accounts) ? record.accounts : [];
  return {
    payeeUid: stringField(record, "payeeUid"),
    payeeName: untrustedText(record.payeeName),
    payeeType: stringField(record, "payeeType"),
    accounts: accounts.map((account) => {
      const item = asRecord(account);
      return {
        description: untrustedText(item.description, 80),
        accountIdentifier: stringField(item, "accountIdentifier"),
        bankIdentifier: stringField(item, "bankIdentifier"),
      };
    }),
  };
}

function sanitiseTree(value: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (typeof value === "string") return untrustedText(value, 500);
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitiseTree(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value).slice(0, 40)) {
      if (/pan|cardnumber|password|pin|authorization|accessToken/i.test(key)) continue;
      out[key] = sanitiseTree(child, depth + 1);
    }
    return out;
  }
  return null;
}

function requireConfirmed(value: unknown): void {
  if (value !== true) {
    throw new Error(
      "confirmed must be true, and only after the user has agreed to this exact change.",
    );
  }
}

function decodeBase64(value: string): Uint8Array {
  const trimmed = value.trim();
  if (
    trimmed.startsWith("data:") ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) ||
    trimmed.length % 4 !== 0
  ) {
    throw new Error("Attachment data must be plain base64, without a data: URL prefix.");
  }
  const buffer = Buffer.from(trimmed, "base64");
  if (buffer.byteLength === 0) throw new Error("Attachment data is empty.");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

async function optional<T>(
  client: StarlingClient,
  scope: string,
  fn: () => Promise<T>,
): Promise<T | { available: false; reason: string }> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof StarlingError && (error.status === 403 || error.status === 404)) {
      return {
        available: false,
        reason: `Starling refused this read (HTTP ${error.status}). The token may be missing ${scope}.`,
      };
    }
    throw error;
  }
}

async function optionalValue(
  client: StarlingClient,
  scope: string,
  fn: () => Promise<Record<string, unknown>>,
  unavailable: string,
): Promise<Record<string, unknown>> {
  const result = await optional(client, scope, fn);
  if (isUnavailable(result)) {
    return { available: false, reason: result.reason || unavailable };
  }
  return result;
}

function isUnavailable(
  value: unknown,
): value is { available: false; reason: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "available" in value &&
    (value as { available: unknown }).available === false
  );
}
