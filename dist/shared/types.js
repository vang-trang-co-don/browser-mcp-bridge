import { z } from "zod";
export function isRequestId(value) {
    return typeof value === "string" && value.length > 0;
}
export function createRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
export function parseTabId(value) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid TabId: ${value}`);
    }
    return value;
}
// 2. Zod Boundary Schemas
export const TabTargetSchema = z.object({
    tabId: z.number().int().positive().optional(),
    urlMatch: z.string().min(1).optional()
});
export const FetchParamsSchema = TabTargetSchema.extend({
    url: z.string().min(1),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).default("GET"),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional()
});
export const EvalParamsSchema = TabTargetSchema.extend({
    script: z.string().min(1)
});
export const GetRecentRequestsParamsSchema = TabTargetSchema.extend({
    filterUrl: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(10)
});
