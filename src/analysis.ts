import type { PublicTransaction } from "./feed.js";
import { formatMajor, formatMoney, UNTRUSTED_NOTICE } from "./text.js";

const SPEND_STATUSES = new Set(["SETTLED", "PENDING"]);

export interface SpendingSummary {
  from: string;
  to: string;
  dataNotice: string;
  includedStatuses: string[];
  byCurrency: CurrencySummary[];
  truncated: boolean;
}

interface CurrencySummary {
  currency: string;
  outMinor: number;
  inMinor: number;
  outMajor: string;
  inMajor: string;
  netMajor: string;
  byCategory: Bucket[];
  byMerchant: Bucket[];
}

interface Bucket {
  name: string;
  outMinor: number;
  outMajor: string;
  count: number;
}

export function summariseSpending(
  items: PublicTransaction[],
  from: string,
  to: string,
  truncated: boolean,
): SpendingSummary {
  const currencies = new Map<string, Accumulator>();
  for (const item of items) {
    if (!SPEND_STATUSES.has(item.status) || item.currency === "") continue;
    const acc = currencies.get(item.currency) ?? new Accumulator();
    const out = item.direction === "OUT";
    const inn = item.direction === "IN";
    if (out) acc.out += item.amountMinor;
    if (inn) acc.in += item.amountMinor;
    if (out) {
      const category = item.spendingCategory || "UNCATEGORISED";
      add(acc.categories, category, item.amountMinor);
      const merchant = item.counterPartyName || "(unknown)";
      add(acc.merchants, merchant.toLowerCase(), item.amountMinor, merchant);
    }
    currencies.set(item.currency, acc);
  }

  const byCurrency = [...currencies.entries()]
    .map(([currency, acc]) => ({
      currency,
      outMinor: acc.out,
      inMinor: acc.in,
      outMajor: formatMajor(acc.out),
      inMajor: formatMajor(acc.in),
      netMajor: formatMajor(acc.in - acc.out),
      byCategory: top(acc.categories, 40),
      byMerchant: top(acc.merchants, 15),
    }))
    .sort((a, b) => b.outMinor - a.outMinor);

  return {
    from,
    to,
    dataNotice: UNTRUSTED_NOTICE,
    includedStatuses: ["SETTLED", "PENDING"],
    byCurrency,
    truncated,
  };
}

export interface RecurringCandidate {
  merchant: string;
  currency: string;
  cadence: "weekly" | "monthly" | "yearly";
  occurrences: number;
  typicalMinor: number;
  typicalAmount: string;
  confidence: "high" | "medium";
  source: string;
  spendingCategory: string;
  lastTransactionTime: string;
  feedItemUids: string[];
  note: string;
}

export function detectRecurring(items: PublicTransaction[]): RecurringCandidate[] {
  const groups = new Map<string, PublicTransaction[]>();
  for (const item of items) {
    if (item.direction !== "OUT") continue;
    if (!SPEND_STATUSES.has(item.status)) continue;
    if (item.transactionTime === "" || item.counterPartyName === "") continue;
    const key = `${item.currency}|${item.counterPartyName.toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const found: RecurringCandidate[] = [];
  for (const group of groups.values()) {
    const candidate = classify(
      group.slice().sort((a, b) => a.transactionTime.localeCompare(b.transactionTime)),
    );
    if (candidate) found.push(candidate);
  }
  found.sort((a, b) => b.typicalMinor - a.typicalMinor);
  return found;
}

function classify(sorted: PublicTransaction[]): RecurringCandidate | null {
  if (sorted.length < 2) return null;
  const gaps: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!previous || !current) return null;
    const start = Date.parse(previous.transactionTime);
    const end = Date.parse(current.transactionTime);
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    gaps.push(Math.round((end - start) / 86_400_000));
  }
  const gap = median(gaps);
  const cadence = cadenceOf(gap);
  if (!cadence) return null;
  const amounts = sorted.map((item) => item.amountMinor);
  const typical = Math.round(median(amounts));
  if (typical <= 0) return null;
  const similar = amounts.every((amount) => Math.abs(amount - typical) / typical <= 0.15);
  if (!similar) return null;
  const direct = sorted.every(
    (item) => item.source === "DIRECT_DEBIT" || item.source === "STANDING_ORDER",
  );
  const enough =
    sorted.length >= 3 ||
    (cadence === "yearly" && sorted.length >= 2) ||
    (direct && cadence === "monthly" && sorted.length >= 2);
  if (!enough) return null;
  const last = sorted[sorted.length - 1];
  if (!last) return null;
  const subscription = sorted.every((item) => item.spendingCategory === "SUBSCRIPTIONS");
  return {
    merchant: last.counterPartyName,
    currency: last.currency,
    cadence,
    occurrences: sorted.length,
    typicalMinor: typical,
    typicalAmount: formatMoney(typical, last.currency),
    confidence: direct || subscription ? "high" : "medium",
    source: last.source,
    spendingCategory: last.spendingCategory,
    lastTransactionTime: last.transactionTime,
    feedItemUids: sorted.slice(-12).map((item) => item.feedItemUid),
    note: "Possible recurring payment. This is a pattern in the feed, not a mandate Starling has confirmed.",
  };
}

function cadenceOf(days: number): "weekly" | "monthly" | "yearly" | null {
  if (days >= 6 && days <= 8) return "weekly";
  if (days >= 26 && days <= 35) return "monthly";
  if (days >= 350 && days <= 380) return "yearly";
  return null;
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

class Accumulator {
  out = 0;
  in = 0;
  categories = new Map<string, BucketDraft>();
  merchants = new Map<string, BucketDraft>();
}

interface BucketDraft {
  name: string;
  outMinor: number;
  count: number;
}

function add(
  map: Map<string, BucketDraft>,
  key: string,
  minor: number,
  display = key,
): void {
  const current = map.get(key) ?? { name: display, outMinor: 0, count: 0 };
  current.outMinor += minor;
  current.count += 1;
  map.set(key, current);
}

function top(map: Map<string, BucketDraft>, limit: number): Bucket[] {
  return [...map.values()]
    .sort((a, b) => b.outMinor - a.outMinor)
    .slice(0, limit)
    .map((bucket) => ({
      name: bucket.name,
      outMinor: bucket.outMinor,
      outMajor: formatMajor(bucket.outMinor),
      count: bucket.count,
    }));
}
