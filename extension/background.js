(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const WS_URL = "ws://127.0.0.1:8765";
  let ws = null;
  let isConnected = false;
  let reconnectTimer = null;

  function updateBadge(connected) {
    isConnected = connected;
    try {
      if (api.browserAction) {
        api.browserAction.setBadgeText({ text: connected ? "ON" : "OFF" });
        api.browserAction.setBadgeBackgroundColor({ color: connected ? "#10b981" : "#ef4444" });
      }
    } catch (e) {}
  }

  async function notifyActiveTab() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      const tabs = await api.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        ws.send(JSON.stringify({
          type: "TAB_UPDATE",
          url: tabs[0].url,
          title: tabs[0].title
        }));
      }
    } catch (e) {}
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
          const { action, requestId, payload } = JSON.parse(event.data);

          const tabs = await api.tabs.query({ active: true, currentWindow: true });
          if (!tabs || !tabs[0]) {
            ws.send(JSON.stringify({ requestId, error: "No active browser tab found" }));
            return;
          }

          const activeTabId = tabs[0].id;
          api.tabs.sendMessage(activeTabId, { action, requestId, payload }, (response) => {
            if (api.runtime.lastError) {
              ws.send(JSON.stringify({
                requestId,
                error: `Tab message error: ${api.runtime.lastError.message}. Make sure the tab page has finished loading.`
              }));
              return;
            }

            if (!response) {
              ws.send(JSON.stringify({ requestId, error: "Empty response from content script" }));
              return;
            }

            ws.send(JSON.stringify({
              requestId,
              data: response.data,
              error: response.error
            }));
          });
        } catch (err) {
          console.error("[BrowserMCP-BG] Message processing error:", err);
        }
      };

      ws.onclose = () => {
        updateBadge(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        updateBadge(false);
      };
    } catch (err) {
      updateBadge(false);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 3000);
  }

  // Monitor active tab changes
  api.tabs.onActivated.addListener(() => notifyActiveTab());
  api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.active) {
      notifyActiveTab();
    }
  });

  // Start initial connection
  connect();
})();
