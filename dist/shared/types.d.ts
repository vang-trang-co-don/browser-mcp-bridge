import { z } from "zod";
/**
 * TypeScript Best Practices Applied:
 * 1. Branded types for RequestId & TabId
 * 2. Discriminated unions for commands & responses (impossible states unrepresentable)
 * 3. Zod schemas owning boundary validation + type inference (schemas before hand-rolled guards)
 * 4. Zero loose `any` (replaced by `unknown` and constructive domain models)
 */
export type RequestId = string & {
    readonly __brand: "RequestId";
};
export type TabId = number & {
    readonly __brand: "TabId";
};
export declare function isRequestId(value: string): value is RequestId;
export declare function createRequestId(): RequestId;
export declare function parseTabId(value: number): TabId;
export declare const TabTargetSchema: z.ZodObject<{
    tabId: z.ZodOptional<z.ZodNumber>;
    urlMatch: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type TabTarget = z.infer<typeof TabTargetSchema>;
export declare const FetchParamsSchema: z.ZodObject<{
    tabId: z.ZodOptional<z.ZodNumber>;
    urlMatch: z.ZodOptional<z.ZodString>;
    url: z.ZodString;
    method: z.ZodDefault<z.ZodEnum<{
        GET: "GET";
        POST: "POST";
        PUT: "PUT";
        PATCH: "PATCH";
        DELETE: "DELETE";
        HEAD: "HEAD";
        OPTIONS: "OPTIONS";
    }>>;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    body: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strip>;
export type FetchParams = z.infer<typeof FetchParamsSchema>;
export type FetchPayload = Omit<FetchParams, "tabId" | "urlMatch">;
export declare const EvalParamsSchema: z.ZodObject<{
    tabId: z.ZodOptional<z.ZodNumber>;
    urlMatch: z.ZodOptional<z.ZodString>;
    script: z.ZodString;
}, z.core.$strip>;
export type EvalParams = z.infer<typeof EvalParamsSchema>;
export type EvalPayload = Omit<EvalParams, "tabId" | "urlMatch">;
export declare const GetRecentRequestsParamsSchema: z.ZodObject<{
    tabId: z.ZodOptional<z.ZodNumber>;
    urlMatch: z.ZodOptional<z.ZodString>;
    filterUrl: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type GetRecentRequestsParams = z.infer<typeof GetRecentRequestsParamsSchema>;
export type GetRecentRequestsPayload = Omit<GetRecentRequestsParams, "tabId" | "urlMatch">;
export interface TabInfo {
    readonly id: number;
    readonly url: string;
    readonly title: string;
    readonly active: boolean;
    readonly windowId: number;
}
export interface CapturedRequest {
    readonly id: string;
    readonly url: string;
    readonly method: string;
    readonly status: number;
    readonly requestHeaders?: Readonly<Record<string, string>>;
    readonly requestBody?: unknown;
    readonly responseSample?: unknown;
    readonly timestamp: number;
    readonly durationMs: number;
    readonly tabId?: number;
    readonly tabUrl?: string;
}
export interface FetchResult {
    readonly status: number;
    readonly statusText: string;
    readonly ok: boolean;
    readonly headers: Readonly<Record<string, string>>;
    readonly data: unknown;
    readonly resolvedTab: {
        readonly id: number;
        readonly url: string;
        readonly title: string;
    };
}
export interface EvalResult {
    readonly result: unknown;
    readonly resolvedTab: {
        readonly id: number;
        readonly url: string;
        readonly title: string;
    };
}
export type BridgeCommand = {
    readonly kind: "LIST_TABS";
    readonly requestId: RequestId;
} | {
    readonly kind: "GET_RECENT_REQUESTS";
    readonly requestId: RequestId;
    readonly target?: TabTarget;
    readonly payload: GetRecentRequestsPayload;
} | {
    readonly kind: "EXEC_FETCH";
    readonly requestId: RequestId;
    readonly target?: TabTarget;
    readonly payload: FetchPayload;
} | {
    readonly kind: "EXEC_EVAL";
    readonly requestId: RequestId;
    readonly target?: TabTarget;
    readonly payload: EvalPayload;
};
export type BridgeResponse<T = unknown> = {
    readonly kind: "success";
    readonly requestId: RequestId;
    readonly data: T;
} | {
    readonly kind: "error";
    readonly requestId: RequestId;
    readonly error: string;
};
export interface TabUpdateNotification {
    readonly kind: "TAB_UPDATE";
    readonly url?: string;
    readonly title?: string;
}
export type ExtensionIncomingMessage = BridgeResponse<unknown> | TabUpdateNotification;
