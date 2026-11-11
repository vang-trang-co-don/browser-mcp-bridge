import type {
  BridgeCommand,
  BridgeResponse,
  CapturedRequest,
  TabInfo,
  TabTarget
} from "../../src/shared/types.js";

// Use standard WebExtension API (browser or chrome)
declare const browser: typeof import("firefox-webext-browser");
const extApi = typeof browser !== "undefined" ? browser : (chrome as any);

const WS_URL = "ws://127.0.0.1:8765";
let ws: WebSocket | null = null;
let reconnectTimer: any = null;

// Persistent per-tab rolling request buffer in background memory (survives page reloads!)
const tabBuffers = new Map<number, CapturedRequest[]>();
const MAX_BUFFER_PER_TAB = 50;

function updateBadge(connected: boolean) {
  try {
    if (extApi.browserAction) {
      extApi.browserAction.setBadgeText({ text: connected ? "ON" : "OFF" });
      extApi.browserAction.setBadgeBackgroundColor({
        color: connected ? "#10b981" : "#ef4444"
      });
    }
  } catch {}
}

async function notifyActiveTab() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    const tabs = await extApi.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]) {
      ws.send(
        JSON.stringify({
          type: "TAB_UPDATE",
          url: tabs[0].url,
          title: tabs[0].title
        })
      );
    }
  } catch {}
}

async function resolveTargetTab(target?: TabTarget): Promise<any> {
  const allTabs = await extApi.tabs.query({});

  // 1. Explicit Tab ID
  if (target?.tabId !== undefined) {
    const found = allTabs.find((t: any) => t.id === target.tabId);
    if (found) return found;
    throw new Error(`Tab ID ${target.tabId} not found in open tabs`);
  }

  // 2. Explicit URL Pattern (e.g. "hoadondientu.gdt.gov.vn" or "ipos.vn")
  if (target?.urlMatch) {
    const q = target.urlMatch.toLowerCase();
    const found = allTabs.find((t: any) => t.url && t.url.toLowerCase().includes(q));
    if (found) return found;
    throw new Error(`No open tab matching URL pattern: "${target.urlMatch}"`);
  }

  // 3. Fallback to currently focused tab
  const activeTabs = await extApi.tabs.query({ active: true, currentWindow: true });
  if (activeTabs[0]) return activeTabs[0];
  if (allTabs[0]) return allTabs[0];

  throw new Error("No browser tab is currently open");
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log("[BrowserMCP-BG] Connected to MCP Relay:", WS_URL);
      updateBadge(true);
      notifyActiveTab();
    };

    ws.onmessage = async (event: MessageEvent) => {
      try {
        const cmd: BridgeCommand = JSON.parse(event.data);
        const { requestId, action, target, payload } = cmd;

        // LIST_TABS handled directly by background
        if (action === "LIST_TABS") {
          const rawTabs = await extApi.tabs.query({});
          const tabList: TabInfo[] = rawTabs.map((t: any) => ({
            id: t.id!,
            url: t.url || "",
            title: t.title || "",
            active: Boolean(t.active),
            windowId: t.windowId
          }));
          sendResponse({ requestId, data: tabList });
          return;
        }

        // Resolve target tab deterministically (no focus race condition)
        let targetTab: any;
        try {
          targetTab = await resolveTargetTab(target);
        } catch (err: any) {
          sendResponse({ requestId, error: err.message });
          return;
        }

        const tabId = targetTab.id!;

        // GET_RECENT_REQUESTS can also merge background buffer
        if (action === "GET_RECENT_REQUESTS") {
          const bgBuffer = tabBuffers.get(tabId) || [];
          let filtered = [...bgBuffer];
          if (payload?.filterUrl) {
            const q = String(payload.filterUrl).toLowerCase();
            filtered = filtered.filter((r) => r.url && r.url.toLowerCase().includes(q));
          }
          const limit = payload?.limit ? Math.min(payload.limit, 50) : 10;
          sendResponse({
            requestId,
            data: {
              targetTab: { id: tabId, url: targetTab.url, title: targetTab.title },
              requests: filtered.slice(-limit).reverse()
            }
          });
          return;
        }

        // Delegate EXEC_FETCH & EXEC_EVAL to content script
        extApi.tabs.sendMessage(
          tabId,
          { action, requestId, payload },
          (response: any) => {
            if (extApi.runtime.lastError) {
              sendResponse({
                requestId,
                error: `Tab message error on tab ${tabId} (${targetTab.url}): ${extApi.runtime.lastError.message}. Make sure the page has completed loading.`
              });
              return;
            }

            if (!response) {
              sendResponse({
                requestId,
                error: `Empty response from tab ${tabId} content script`
              });
              return;
            }

            sendResponse({
              requestId,
              data: {
                ...response.data,
                resolvedTab: { id: tabId, url: targetTab.url, title: targetTab.title }
              },
              error: response.error
            });
          }
        );
      } catch (err: any) {
        console.error("[BrowserMCP-BG] Message dispatch error:", err);
      }
    };

    ws.onclose = () => {
      updateBadge(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      updateBadge(false);
    };
  } catch {
    updateBadge(false);
    scheduleReconnect();
  }
}

function sendResponse(resp: BridgeResponse) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(resp));
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, 3000);
}

// Receive recorded requests from content scripts and store in background memory
extApi.runtime.onMessage.addListener((msg: any, sender: any) => {
  if (msg?.type === "RECORD_REQUEST" && sender.tab?.id) {
    const tabId = sender.tab.id;
    if (!tabBuffers.has(tabId)) {
      tabBuffers.set(tabId, []);
    }
    const buf = tabBuffers.get(tabId)!;
    buf.push({
      ...msg.request,
      tabId,
      tabUrl: sender.tab.url
    });
    if (buf.length > MAX_BUFFER_PER_TAB) buf.shift();
  }
});

// Clean up buffer when tab is closed
extApi.tabs.onRemoved.addListener((tabId: number) => {
  tabBuffers.delete(tabId);
});

// Active tab listeners
extApi.tabs.onActivated.addListener(() => notifyActiveTab());
extApi.tabs.onUpdated.addListener((tabId: number, changeInfo: any, tab: any) => {
  if (changeInfo.status === "complete" && tab.active) {
    notifyActiveTab();
  }
});

connect();
