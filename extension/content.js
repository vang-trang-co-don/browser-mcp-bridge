(() => {
  // 1. Inject hook into page's main world
  try {
    const s = document.createElement("script");
    s.src = (typeof browser !== "undefined" ? browser : chrome).runtime.getURL("injected.js");
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  } catch (err) {
    console.error("[BrowserMCP-CS] Injection error:", err);
  }

  const pending = new Map();

  // 2. Listen to responses from injected.js in page
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "BROWSER_MCP_PAGE") return;
    const { requestId, data, error } = event.data;
    if (pending.has(requestId)) {
      const sendResponse = pending.get(requestId);
      pending.delete(requestId);
      sendResponse({ data, error });
    }
  });

  // 3. Listen to commands from background.js
  const api = typeof browser !== "undefined" ? browser : chrome;
  api.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { action, requestId, payload } = request;

    pending.set(requestId, sendResponse);

    window.postMessage({
      source: "BROWSER_MCP_CS",
      action,
      requestId,
      payload
    }, "*");

    return true; // Keep channel open for async sendResponse
  });
})();
