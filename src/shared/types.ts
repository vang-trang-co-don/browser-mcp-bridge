/**
 * Shared Type Definitions for Browser MCP Bridge
 * Eliminates implicit state by providing explicit schemas for:
 * 1. Targeted tabs (no hidden focus assumptions)
 * 2. Persistent network telemetry buffers
 * 3. Type-safe command and response envelopes
 */

export interface TabTarget {
  /** Explicit tab ID to direct the command to */
  tabId?: number;
  /** Substring/pattern of URL (e.g. "hoadondientu.gdt.gov.vn") to match target tab, immune to alt-tabbing */
  urlMatch?: string;
}

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  active: boolean;
  windowId: number;
}

export interface CapturedRequest {
  id: string;
  url: string;
  method: string;
  status: number;
  requestHeaders?: Record<string, string>;
  requestBody?: any;
  responseSample?: any;
  timestamp: number;
  durationMs: number;
  tabId?: number;
  tabUrl?: string;
}

export type BridgeAction =
  | "LIST_TABS"
  | "GET_RECENT_REQUESTS"
  | "EXEC_FETCH"
  | "EXEC_EVAL";

export interface BridgeCommand<T = any> {
  requestId: string;
  action: BridgeAction;
  target?: TabTarget;
  payload: T;
}

export interface BridgeResponse<T = any> {
  requestId: string;
  data?: T;
  error?: string;
}

export interface GetRecentRequestsParams extends TabTarget {
  filterUrl?: string;
  limit?: number;
}

export interface FetchParams extends TabTarget {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  headers?: Record<string, string>;
  body?: any;
}

export interface FetchResult {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  data: any;
  resolvedTab: { id: number; url: string; title: string };
}

export interface EvalParams extends TabTarget {
  script: string;
}

export interface EvalResult {
  result: any;
  resolvedTab: { id: number; url: string; title: string };
}
