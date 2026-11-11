"use strict";
const extApi = typeof browser !== "undefined" ? browser : chrome;
const WS_URL = "ws://127.0.0.1:8765";
let ws = null;
let reconnectTimer = null;
const tabBuffers = /* @__PURE__ */ new Map();
const MAX_BUFFER_PER_TAB = 50;
function updateBadge(connected) {
  try {
    if (extApi.browserAction) {
      extApi.browserAction.setBadgeText({ text: connected ? "ON" : "OFF" });
      extApi.browserAction.setBadgeBackgroundColor({
        color: connected ? "#10b981" : "#ef4444"
      });
    }
  } catch {
  }
}
async function notifyActiveTab() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    const tabs = await extApi.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]) {
      ws.send(
        JSON.stringify({
          kind: "TAB_UPDATE",
          url: tabs[0].url,
          title: tabs[0].title
        })
      );
    }
  } catch {
  }
}
async function resolveTargetTab(target) {
  const allTabs = await extApi.tabs.query({});
  if (target?.tabId !== void 0) {
    const found = allTabs.find((t) => t.id === target.tabId);
    if (found) return found;
    throw new Error(`Tab ID ${target.tabId} not found in open tabs`);
  }
  if (target?.urlMatch) {
    const q = target.urlMatch.toLowerCase();
    const found = allTabs.find((t) => t.url && t.url.toLowerCase().includes(q));
    if (found) return found;
    throw new Error(`No open tab matching URL pattern: "${target.urlMatch}"`);
  }
  const activeTabs = await extApi.tabs.query({ active: true, currentWindow: true });
  if (activeTabs[0]) return activeTabs[0];
  if (allTabs[0]) return allTabs[0];
  throw new Error("No browser tab is currently open");
}
function sendSuccess(requestId, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const resp = { kind: "success", requestId, data };
    ws.send(JSON.stringify(resp));
  }
}
function sendError(requestId, error) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const resp = { kind: "error", requestId, error };
    ws.send(JSON.stringify(resp));
  }
}
function assertExhaustive(value) {
  throw new Error(`Unhandled command variant: ${JSON.stringify(value)}`);
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
    ws.onmessage = async (event) => {
      try {
        const cmd = JSON.parse(event.data);
        switch (cmd.kind) {
          case "LIST_TABS": {
            const rawTabs = await extApi.tabs.query({});
            const tabList = rawTabs.map((t) => ({
              id: t.id ?? -1,
              url: t.url || "",
              title: t.title || "",
              active: Boolean(t.active),
              windowId: t.windowId ?? -1
            }));
            sendSuccess(cmd.requestId, tabList);
            break;
          }
          case "GET_RECENT_REQUESTS": {
            let targetTab;
            try {
              targetTab = await resolveTargetTab(cmd.target);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              sendError(cmd.requestId, msg);
              break;
            }
            const tabId = targetTab.id ?? -1;
            const bgBuffer = tabBuffers.get(tabId) || [];
            let filtered = [...bgBuffer];
            if (cmd.payload.filterUrl) {
              const q = cmd.payload.filterUrl.toLowerCase();
              filtered = filtered.filter((r) => r.url.toLowerCase().includes(q));
            }
            const limit = Math.min(cmd.payload.limit, 50);
            sendSuccess(cmd.requestId, {
              targetTab: { id: tabId, url: targetTab.url || "", title: targetTab.title || "" },
              requests: filtered.slice(-limit).reverse()
            });
            break;
          }
          case "EXEC_FETCH":
          case "EXEC_EVAL": {
            let targetTab;
            try {
              targetTab = await resolveTargetTab(cmd.target);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              sendError(cmd.requestId, msg);
              break;
            }
            const tabId = targetTab.id ?? -1;
            extApi.tabs.sendMessage(
              tabId,
              { kind: cmd.kind, requestId: cmd.requestId, payload: cmd.payload },
              (response) => {
                if (extApi.runtime.lastError) {
                  sendError(
                    cmd.requestId,
                    `Tab message error on tab ${tabId} (${targetTab.url}): ${extApi.runtime.lastError.message}. Make sure the page has completed loading.`
                  );
                  return;
                }
                if (!response) {
                  sendError(cmd.requestId, `Empty response from tab ${tabId} content script`);
                  return;
                }
                if (response.error) {
                  sendError(cmd.requestId, response.error);
                } else {
                  sendSuccess(cmd.requestId, {
                    ...typeof response.data === "object" && response.data !== null ? response.data : { result: response.data },
                    resolvedTab: { id: tabId, url: targetTab.url || "", title: targetTab.title || "" }
                  });
                }
              }
            );
            break;
          }
          default:
            assertExhaustive(cmd);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[BrowserMCP-BG] Message dispatch error:", msg);
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
function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, 3e3);
}
extApi.runtime.onMessage.addListener((msg, sender) => {
  if (typeof msg === "object" && msg !== null && "type" in msg && msg.type === "RECORD_REQUEST" && "request" in msg && sender.tab?.id !== void 0) {
    const tabId = sender.tab.id;
    if (!tabBuffers.has(tabId)) {
      tabBuffers.set(tabId, []);
    }
    const buf = tabBuffers.get(tabId);
    buf.push({
      ...msg.request,
      tabId,
      tabUrl: sender.tab.url
    });
    if (buf.length > MAX_BUFFER_PER_TAB) buf.shift();
  }
});
extApi.tabs.onRemoved.addListener((tabId) => {
  tabBuffers.delete(tabId);
});
extApi.tabs.onActivated.addListener(() => {
  void notifyActiveTab();
});
extApi.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    void notifyActiveTab();
  }
});
connect();
