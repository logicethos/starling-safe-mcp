export type HttpMethod = "GET" | "PUT" | "POST";
export interface AllowedRoute {
    method: HttpMethod;
    pattern: RegExp;
}
/**
 * Every Starling call must match this table. There is no DELETE, and no
 * path for payments, new payees, standing orders, or cancelling a mandate.
 */
export declare const ALLOWED_ROUTES: readonly AllowedRoute[];
export declare function requireUid(value: string, label: string): string;
export declare function assertAllowed(method: string, path: string): void;
