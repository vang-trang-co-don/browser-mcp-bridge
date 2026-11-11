"use strict";
const extApi = typeof browser !== "undefined" ? browser : chrome;
const NONCE = `mcp_${Math.random().toString(36).substring(2, 10)}`;
try {
  const s = document.createElement("script");
  s.src = extApi.runtime.getURL("dist/injected.js");
  s.dataset.mcpNonce = NONCE;
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[BrowserMCP-CS] Injection error:", msg);
}
const pendingResponses = /* @__PURE__ */ new Map();
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || event.data.nonce !== NONCE) return;
  const { type, requestId, data, error, request } = event.data;
  if (type === "RECORD_REQUEST" && request) {
    try {
      void extApi.runtime.sendMessage({ type: "RECORD_REQUEST", request });
    } catch {
    }
    return;
  }
  if (type === "COMMAND_RESPONSE" && requestId && pendingResponses.has(requestId)) {
    const callback = pendingResponses.get(requestId);
    pendingResponses.delete(requestId);
    callback({ data, error });
  }
});
extApi.runtime.onMessage.addListener(
  (request, _sender, sendResponse) => {
    const { kind, requestId, payload } = request;
    pendingResponses.set(requestId, sendResponse);
    window.postMessage(
      {
        nonce: NONCE,
        type: "COMMAND_REQUEST",
        action: kind,
        requestId,
        payload
      },
      "*"
    );
    return true;
  }
);
