import { z } from "zod";

/**
 * TypeScript Best Practices Applied:
 * 1. Branded types for RequestId & TabId
 * 2. Discriminated unions for commands & responses (impossible states unrepresentable)
 * 3. Zod schemas owning boundary validation + type inference (schemas before hand-rolled guards)
 * 4. Zero loose `any` (replaced by `unknown` and constructive domain models)
 */

// 1. Branded Types
export type RequestId = string & { readonly __brand: "RequestId" };
export type TabId = number & { readonly __brand: "TabId" };

export function isRequestId(value: string): value is RequestId {
  return typeof value === "string" && value.length > 0;
}

export function createRequestId(): RequestId {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` as RequestId;
}

export function parseTabId(value: number): TabId {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid TabId: ${value}`);
  }
  return value as TabId;
}

// 2. Zod Boundary Schemas
export const TabTargetSchema = z.object({
  tabId: z.number().int().positive().optional(),
  urlMatch: z.string().min(1).optional()
});
export type TabTarget = z.infer<typeof TabTargetSchema>;

export const FetchParamsSchema = TabTargetSchema.extend({
  url: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).default("GET"),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional()
});
export type FetchParams = z.infer<typeof FetchParamsSchema>;
export type FetchPayload = Omit<FetchParams, "tabId" | "urlMatch">;

export const EvalParamsSchema = TabTargetSchema.extend({
  script: z.string().min(1)
});
export type EvalParams = z.infer<typeof EvalParamsSchema>;
export type EvalPayload = Omit<EvalParams, "tabId" | "urlMatch">;

export const GetRecentRequestsParamsSchema = TabTargetSchema.extend({
  filterUrl: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10)
});
export type GetRecentRequestsParams = z.infer<typeof GetRecentRequestsParamsSchema>;
export type GetRecentRequestsPayload = Omit<GetRecentRequestsParams, "tabId" | "urlMatch">;

// 3. Domain Models
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
  readonly resolvedTab: { readonly id: number; readonly url: string; readonly title: string };
}

export interface EvalResult {
  readonly result: unknown;
  readonly resolvedTab: { readonly id: number; readonly url: string; readonly title: string };
}

// 4. Discriminated Union Commands (Host -> Extension)
export type BridgeCommand =
  | {
      readonly kind: "LIST_TABS";
      readonly requestId: RequestId;
    }
  | {
      readonly kind: "GET_RECENT_REQUESTS";
      readonly requestId: RequestId;
      readonly target?: TabTarget;
      readonly payload: GetRecentRequestsPayload;
    }
  | {
      readonly kind: "EXEC_FETCH";
      readonly requestId: RequestId;
      readonly target?: TabTarget;
      readonly payload: FetchPayload;
    }
  | {
      readonly kind: "EXEC_EVAL";
      readonly requestId: RequestId;
      readonly target?: TabTarget;
      readonly payload: EvalPayload;
    };

// 5. Discriminated Union Responses (Extension -> Host)
export type BridgeResponse<T = unknown> =
  | {
      readonly kind: "success";
      readonly requestId: RequestId;
      readonly data: T;
    }
  | {
      readonly kind: "error";
      readonly requestId: RequestId;
      readonly error: string;
    };

export interface TabUpdateNotification {
  readonly kind: "TAB_UPDATE";
  readonly url?: string;
  readonly title?: string;
}

export type ExtensionIncomingMessage =
  | BridgeResponse<unknown>
  | TabUpdateNotification;
