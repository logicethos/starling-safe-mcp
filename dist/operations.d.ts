import { StarlingClient } from "./client.js";
import { readMoney } from "./text.js";
export interface Account {
    accountUid: string;
    defaultCategoryUid: string;
    currency: string;
    accountType: string;
    name: string;
    createdAt: string;
}
export declare function listAccounts(client: StarlingClient): Promise<Account[]>;
export declare function getBalance(client: StarlingClient, accountUid?: string): Promise<Record<string, unknown>>;
export declare function getAccountIdentifiers(client: StarlingClient, accountUid?: string): Promise<Record<string, unknown>>;
export declare function getAccountHolder(client: StarlingClient): Promise<Record<string, unknown>>;
export declare function listTransactions(client: StarlingClient, input: {
    accountUid?: string;
    categoryUid?: string;
    from?: string;
    to?: string;
}): Promise<Record<string, unknown>>;
export declare function getTransaction(client: StarlingClient, input: {
    accountUid?: string;
    categoryUid?: string;
    feedItemUid: string;
}): Promise<Record<string, unknown>>;
export declare function listSpaces(client: StarlingClient, accountUid?: string): Promise<Record<string, unknown>>;
export declare function listSavingsGoals(client: StarlingClient, accountUid?: string): Promise<SavingsGoal[]>;
export declare function listCards(client: StarlingClient): Promise<Record<string, unknown>>;
export declare function listDirectDebitMandates(client: StarlingClient, accountUid?: string): Promise<Record<string, unknown>>;
export declare function listPayees(client: StarlingClient): Promise<Record<string, unknown>>;
export declare function listStatementPeriods(client: StarlingClient, accountUid?: string): Promise<Record<string, unknown>>;
export declare function getStatementCsv(client: StarlingClient, input: {
    accountUid?: string;
    from: string;
    to: string;
}): Promise<Record<string, unknown>>;
export declare function getSpendingInsights(client: StarlingClient, input: {
    accountUid?: string;
    by: "category" | "counterparty" | "country";
    year: number;
}): Promise<Record<string, unknown>>;
export declare function listTransactionAttachments(client: StarlingClient, input: {
    accountUid?: string;
    categoryUid?: string;
    feedItemUid: string;
}): Promise<Record<string, unknown>>;
export declare function updateTransactionNote(client: StarlingClient, input: {
    accountUid?: string;
    categoryUid?: string;
    feedItemUid: string;
    userNote: string;
    confirmed: true;
}): Promise<Record<string, unknown>>;
export declare function updateSpendingCategory(client: StarlingClient, input: {
    accountUid?: string;
    categoryUid?: string;
    feedItemUid: string;
    spendingCategory: string;
    confirmed: true;
}): Promise<Record<string, unknown>>;
export declare function createSavingsGoal(client: StarlingClient, input: {
    accountUid?: string;
    name: string;
    currency?: string;
    target?: string;
    confirmed: true;
}): Promise<Record<string, unknown>>;
export declare function addMoneyToSavingsGoal(client: StarlingClient, input: {
    accountUid?: string;
    savingsGoalUid: string;
    amount: string;
    currency?: string;
    confirmed: true;
}): Promise<Record<string, unknown>>;
export declare function withdrawMoneyFromSavingsGoal(client: StarlingClient, input: {
    accountUid?: string;
    savingsGoalUid: string;
    amount: string;
    currency?: string;
    confirmed: true;
}): Promise<Record<string, unknown>>;
export declare function saveTransactionReceipt(client: StarlingClient, input: {
    feedItemUid: string;
    merchantName: string;
    total: string;
    currency?: string;
    items?: {
        description: string;
        quantity?: number;
        amount: string;
    }[];
    confirmed: true;
}): Promise<Record<string, unknown>>;
export declare function uploadTransactionAttachment(client: StarlingClient, input: {
    accountUid?: string;
    categoryUid?: string;
    feedItemUid: string;
    contentType: string;
    base64: string;
    confirmed: true;
}): Promise<Record<string, unknown>>;
export declare function summariseAccountSpending(client: StarlingClient, input: {
    accountUid?: string;
    categoryUid?: string;
    from?: string;
    to?: string;
}): Promise<Record<string, unknown>>;
export declare function findRecurringPayments(client: StarlingClient, input: {
    accountUid?: string;
    categoryUid?: string;
    from?: string;
    to?: string;
}): Promise<Record<string, unknown>>;
export declare function financialOverview(client: StarlingClient): Promise<Record<string, unknown>>;
interface SavingsGoal {
    accountUid: string;
    savingsGoalUid: string;
    name: string;
    state: string;
    totalSaved: ReturnType<typeof readMoney>;
    target: ReturnType<typeof readMoney>;
}
export {};
