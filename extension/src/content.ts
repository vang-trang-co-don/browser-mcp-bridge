declare const browser: typeof import("firefox-webext-browser");
const extApi = typeof browser !== "undefined" ? browser : (chrome as unknown as typeof browser);

const NONCE = `mcp_${Math.random().toString(36).substring(2, 10)}`;

// 1. Inject in-page hook
try {
  const s = document.createElement("script");
  s.src = extApi.runtime.getURL("dist/injected.js");
  s.dataset.mcpNonce = NONCE;
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[BrowserMCP-CS] Injection error:", msg);
}

const pendingResponses = new Map<string, (res: { data?: unknown; error?: string }) => void>();

interface InjectedMessageEvent {
  readonly nonce: string;
  readonly type: "RECORD_REQUEST" | "COMMAND_RESPONSE";
  readonly requestId?: string;
  readonly data?: unknown;
  readonly error?: string;
  readonly request?: unknown;
}

// 2. Listen to messages from injected.js in the page
window.addEventListener("message", (event: MessageEvent<InjectedMessageEvent>) => {
  if (event.source !== window || !event.data || event.data.nonce !== NONCE) return;

  const { type, requestId, data, error, request } = event.data;

  // Realtime request captured in page -> forward to background memory buffer
  if (type === "RECORD_REQUEST" && request) {
    try {
      void extApi.runtime.sendMessage({ type: "RECORD_REQUEST", request });
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
  (
    request: { kind: string; requestId: string; payload: unknown },
    _sender: browser.runtime.MessageSender,
    sendResponse: (res: { data?: unknown; error?: string }) => void
  ) => {
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

    return true; // Keep message channel open for async response
  }
);
