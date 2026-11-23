import type { PublicTransaction } from "./feed.js";
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
export declare function summariseSpending(items: PublicTransaction[], from: string, to: string, truncated: boolean): SpendingSummary;
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
export declare function detectRecurring(items: PublicTransaction[]): RecurringCandidate[];
export {};
