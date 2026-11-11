// Content script running in isolated world
declare const browser: typeof import("firefox-webext-browser");
const extApi = typeof browser !== "undefined" ? browser : (chrome as any);

const NONCE = `mcp_${Math.random().toString(36).substring(2, 10)}`;

// 1. Inject in-page hook
try {
  const s = document.createElement("script");
  s.src = extApi.runtime.getURL("dist/injected.js");
  s.dataset.mcpNonce = NONCE;
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
} catch (err) {
  console.error("[BrowserMCP-CS] Injection error:", err);
}

const pendingResponses = new Map<string, (res: any) => void>();

// 2. Listen to messages from injected.js in the page
window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window || !event.data || event.data.nonce !== NONCE) return;

  const { type, requestId, data, error, request } = event.data;

  // Realtime request captured in page -> forward to background memory buffer
  if (type === "RECORD_REQUEST" && request) {
    try {
      extApi.runtime.sendMessage({ type: "RECORD_REQUEST", request });
    } catch {}
    return;
  }

  // Command response (EXEC_FETCH / EXEC_EVAL)
  if (type === "COMMAND_RESPONSE" && requestId && pendingResponses.has(requestId)) {
    const callback = pendingResponses.get(requestId)!;
    pendingResponses.delete(requestId);
    callback({ data, error });
  }
});

// 3. Listen to commands dispatched from background.ts
extApi.runtime.onMessage.addListener(
  (request: any, sender: any, sendResponse: (res: any) => void) => {
    const { action, requestId, payload } = request;

    pendingResponses.set(requestId, sendResponse);

    window.postMessage(
      {
        nonce: NONCE,
        type: "COMMAND_REQUEST",
        action,
        requestId,
        payload
      },
      "*"
    );

    return true; // Keep message channel open for async response
  }
);
