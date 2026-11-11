(() => {
  if (window.__BROWSER_MCP_HOOKED__) return;
  window.__BROWSER_MCP_HOOKED__ = true;

  const requestBuffer = [];
  const MAX_BUFFER = 30;

  function safeClone(data, depth = 0) {
    if (depth > 4) return "[Object too deep]";
    try {
      if (data === null || data === undefined) return data;
      if (typeof data !== "object") return data;
      if (Array.isArray(data)) return data.slice(0, 50).map(x => safeClone(x, depth + 1));
      const res = {};
      const keys = Object.keys(data).slice(0, 50);
      for (const k of keys) {
        res[k] = safeClone(data[k], depth + 1);
      }
      return res;
    } catch {
      return "[Unclonable]";
    }
  }

  // 1. Hook Fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const start = Date.now();
    let url = "";
    let method = "GET";
    let reqHeaders = {};
    let reqBody = null;

    try {
      if (typeof args[0] === "string") {
        url = args[0];
      } else if (args[0] instanceof Request) {
        url = args[0].url;
        method = args[0].method || "GET";
      }

      if (args[1]) {
        method = args[1].method || method;
        reqHeaders = args[1].headers || {};
        reqBody = args[1].body || null;
      }
    } catch (e) {}

    let response;
    try {
      response = await originalFetch.apply(this, args);
    } catch (err) {
      requestBuffer.push({
        url,
        method,
        status: 0,
        error: String(err),
        timestamp: Date.now(),
        duration: Date.now() - start
      });
      if (requestBuffer.length > MAX_BUFFER) requestBuffer.shift();
      throw err;
    }

    try {
      const clone = response.clone();
      const contentType = clone.headers.get("content-type") || "";
      if (contentType.includes("json")) {
        clone.json().then(json => {
          requestBuffer.push({
            url,
            method,
            status: response.status,
            requestBody: typeof reqBody === "string" ? reqBody.slice(0, 1000) : safeClone(reqBody),
            responseSample: safeClone(json),
            timestamp: Date.now(),
            duration: Date.now() - start
          });
          if (requestBuffer.length > MAX_BUFFER) requestBuffer.shift();
        }).catch(() => {});
      } else if (contentType.includes("text") || contentType.includes("xml")) {
        clone.text().then(text => {
          requestBuffer.push({
            url,
            method,
            status: response.status,
            responseSample: text.slice(0, 1500),
            timestamp: Date.now(),
            duration: Date.now() - start
          });
          if (requestBuffer.length > MAX_BUFFER) requestBuffer.shift();
        }).catch(() => {});
      }
    } catch (e) {}

    return response;
  };

  // 2. Listen to bridge commands from content script
  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "BROWSER_MCP_CS") return;
    const { action, requestId, payload } = event.data;

    if (action === "GET_RECENT_REQUESTS") {
      let list = [...requestBuffer];
      if (payload?.filterUrl) {
        const q = String(payload.filterUrl).toLowerCase();
        list = list.filter(r => r.url && r.url.toLowerCase().includes(q));
      }
      const limit = payload?.limit ? Math.min(payload.limit, 50) : 10;
      const data = list.slice(-limit).reverse();
      window.postMessage({ source: "BROWSER_MCP_PAGE", requestId, data }, "*");
      return;
    }

    if (action === "EXEC_FETCH") {
      try {
        const { url, method = "GET", headers = {}, body } = payload || {};
        const fetchOpts = {
          method,
          headers: { ...headers }
        };
        if (body !== undefined && method !== "GET" && method !== "HEAD") {
          fetchOpts.body = typeof body === "object" ? JSON.stringify(body) : String(body);
          if (!fetchOpts.headers["Content-Type"] && !fetchOpts.headers["content-type"]) {
            fetchOpts.headers["Content-Type"] = "application/json";
          }
        }

        const resp = await originalFetch(url, fetchOpts);
        const ct = resp.headers.get("content-type") || "";
        let data;
        if (ct.includes("json")) {
          data = await resp.json();
        } else {
          data = await resp.text();
        }

        const respHeaders = {};
        resp.headers.forEach((v, k) => { respHeaders[k] = v; });

        window.postMessage({
          source: "BROWSER_MCP_PAGE",
          requestId,
          data: {
            status: resp.status,
            statusText: resp.statusText,
            ok: resp.ok,
            headers: respHeaders,
            data
          }
        }, "*");
      } catch (err) {
        window.postMessage({ source: "BROWSER_MCP_PAGE", requestId, error: String(err) }, "*");
      }
      return;
    }

    if (action === "EXEC_EVAL") {
      try {
        const { script } = payload || {};
        const fn = new Function(`return (async () => { ${script} })()`);
        const result = await fn();
        window.postMessage({ source: "BROWSER_MCP_PAGE", requestId, data: safeClone(result) }, "*");
      } catch (err) {
        window.postMessage({ source: "BROWSER_MCP_PAGE", requestId, error: String(err) }, "*");
      }
      return;
    }
  });
})();
