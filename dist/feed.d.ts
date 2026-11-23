import { UNTRUSTED_NOTICE } from "./text.js";
export interface PublicTransaction {
    feedItemUid: string;
    categoryUid: string;
    amountMinor: number;
    currency: string;
    direction: string;
    transactionTime: string;
    settlementTime: string;
    source: string;
    status: string;
    spendingCategory: string;
    counterPartyName: string;
    reference: string;
    userNote: string;
    country: string;
    hasAttachment: boolean;
    hasReceipt: boolean;
}
export interface DateRange {
    from: string;
    to: string;
}
export declare function resolveRange(from: string | undefined, to: string | undefined, defaultDays: number): DateRange;
export declare function utcDay(iso: string): string;
export declare function projectFeed(body: unknown): PublicTransaction[];
export declare function projectFeedItem(value: unknown): PublicTransaction | null;
export declare function presentTransaction(item: PublicTransaction): Record<string, unknown>;
export declare function feedPayload(items: PublicTransaction[], range: DateRange, total: number): Record<string, unknown>;
export { UNTRUSTED_NOTICE };
