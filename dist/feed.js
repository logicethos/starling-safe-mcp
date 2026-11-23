import { asRecord, boolField, readMoney, stringField, untrustedText, UNTRUSTED_NOTICE, } from "./text.js";
const DAY = 86_400_000;
const MAX_RANGE_DAYS = 366;
export function resolveRange(from, to, defaultDays) {
    const end = to ? parseUserDate(to, "end") : new Date();
    const start = from
        ? parseUserDate(from, "start")
        : new Date(end.getTime() - defaultDays * DAY);
    if (end.getTime() < start.getTime()) {
        throw new Error("The start date must be on or before the end date.");
    }
    const days = (end.getTime() - start.getTime()) / DAY;
    if (days > MAX_RANGE_DAYS) {
        throw new Error("Date range must be 366 days or less. Call again for an earlier window.");
    }
    return { from: start.toISOString(), to: end.toISOString() };
}
export function utcDay(iso) {
    return iso.slice(0, 10);
}
function parseUserDate(value, edge) {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const time = edge === "end" ? "T23:59:59.999Z" : "T00:00:00.000Z";
        const date = new Date(`${trimmed}${time}`);
        if (Number.isNaN(date.getTime()))
            throw new Error("That date is not valid.");
        return date;
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(trimmed)) {
        throw new Error("Dates must be YYYY-MM-DD or an ISO-8601 UTC timestamp.");
    }
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime()))
        throw new Error("That date is not valid.");
    return date;
}
export function projectFeed(body) {
    const items = asRecord(body).feedItems;
    if (!Array.isArray(items))
        return [];
    const projected = [];
    for (const item of items) {
        const row = projectFeedItem(item);
        if (row)
            projected.push(row);
    }
    return projected;
}
export function projectFeedItem(value) {
    const record = asRecord(value);
    const feedItemUid = stringField(record, "feedItemUid");
    if (feedItemUid === "")
        return null;
    const amount = readMoney(record.amount);
    return {
        feedItemUid,
        categoryUid: stringField(record, "categoryUid"),
        amountMinor: amount?.minorUnits ?? 0,
        currency: amount?.currency ?? "",
        direction: stringField(record, "direction"),
        transactionTime: stringField(record, "transactionTime"),
        settlementTime: stringField(record, "settlementTime"),
        source: stringField(record, "source"),
        status: stringField(record, "status"),
        spendingCategory: stringField(record, "spendingCategory"),
        counterPartyName: untrustedText(record.counterPartyName),
        reference: untrustedText(record.reference),
        userNote: untrustedText(record.userNote),
        country: stringField(record, "country"),
        hasAttachment: boolField(record, "hasAttachment"),
        hasReceipt: boolField(record, "hasReceipt"),
    };
}
export function presentTransaction(item) {
    return {
        feedItemUid: item.feedItemUid,
        categoryUid: item.categoryUid,
        amount: {
            currency: item.currency,
            minorUnits: item.amountMinor,
            major: minorMajor(item.amountMinor),
        },
        direction: item.direction,
        transactionTime: item.transactionTime,
        settlementTime: item.settlementTime,
        source: item.source,
        status: item.status,
        spendingCategory: item.spendingCategory,
        counterPartyName: item.counterPartyName,
        reference: item.reference,
        userNote: item.userNote,
        country: item.country,
        hasAttachment: item.hasAttachment,
        hasReceipt: item.hasReceipt,
    };
}
export function feedPayload(items, range, total) {
    return {
        from: range.from,
        to: range.to,
        total,
        returned: items.length,
        truncated: items.length < total,
        dataNotice: UNTRUSTED_NOTICE,
        transactions: items.map(presentTransaction),
    };
}
function minorMajor(minor) {
    const sign = minor < 0 ? "-" : "";
    const abs = Math.abs(minor);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
export { UNTRUSTED_NOTICE };
//# sourceMappingURL=feed.js.map