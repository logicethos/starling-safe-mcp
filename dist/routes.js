const UID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
function route(method, path) {
    return { method, pattern: new RegExp(`^${path}$`) };
}
/**
 * Every Starling call must match this table. There is no DELETE, and no
 * path for payments, new payees, standing orders, or cancelling a mandate.
 */
export const ALLOWED_ROUTES = [
    route("GET", "/api/v2/accounts"),
    route("GET", `/api/v2/accounts/${UID}/balance`),
    route("GET", `/api/v2/accounts/${UID}/identifiers`),
    route("GET", `/api/v2/accounts/${UID}/statement/available-periods`),
    route("GET", `/api/v2/accounts/${UID}/statement/downloadForDateRange/csv`),
    route("GET", `/api/v2/accounts/${UID}/spending-insights/spending-category`),
    route("GET", `/api/v2/accounts/${UID}/spending-insights/counter-party`),
    route("GET", `/api/v2/accounts/${UID}/spending-insights/country`),
    route("GET", "/api/v2/account-holder"),
    route("GET", "/api/v2/account-holder/name"),
    route("GET", `/api/v2/account/${UID}/spaces`),
    route("GET", `/api/v2/account/${UID}/savings-goals`),
    route("PUT", `/api/v2/account/${UID}/savings-goals`),
    route("PUT", `/api/v2/account/${UID}/savings-goals/${UID}/add-money/${UID}`),
    route("PUT", `/api/v2/account/${UID}/savings-goals/${UID}/withdraw-money/${UID}`),
    route("GET", `/api/v2/feed/account/${UID}/category/${UID}/transactions-between`),
    route("GET", `/api/v2/feed/account/${UID}/category/${UID}/${UID}`),
    route("PUT", `/api/v2/feed/account/${UID}/category/${UID}/${UID}/user-note`),
    route("PUT", `/api/v2/feed/account/${UID}/category/${UID}/${UID}/spending-category`),
    route("GET", `/api/v2/feed/account/${UID}/category/${UID}/${UID}/attachments`),
    route("POST", `/api/v2/feed/account/${UID}/category/${UID}/${UID}/attachments`),
    route("PUT", `/api/v2/feed/receipt/${UID}`),
    route("GET", "/api/v2/cards"),
    route("GET", "/api/v2/payees"),
    route("GET", `/api/v2/direct-debit/mandates/account/${UID}`),
];
const UID_EXACT = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export function requireUid(value, label) {
    if (!UID_EXACT.test(value)) {
        throw new Error(`${label} must be a UUID returned by a previous Starling tool.`);
    }
    return value;
}
export function assertAllowed(method, path) {
    if (!path.startsWith("/api/v2/") ||
        path.includes("?") ||
        path.includes("..") ||
        path.includes("//") ||
        path.includes("\\")) {
        throw new Error("Refusing a Starling path that is not on the allowlist.");
    }
    const allowed = ALLOWED_ROUTES.some((entry) => entry.method === method && entry.pattern.test(path));
    if (!allowed) {
        throw new Error("Refusing a Starling path that is not on the allowlist.");
    }
}
//# sourceMappingURL=routes.js.map