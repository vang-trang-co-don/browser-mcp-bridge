"use strict";
(() => {
  const win = window;
  if (win.__BROWSER_MCP_HOOKED__) return;
  win.__BROWSER_MCP_HOOKED__ = true;
  const currentScript = document.currentScript;
  const NONCE = currentScript?.dataset.mcpNonce || "";
  function safeClone(data, depth = 0) {
    if (depth > 4) return "[Object too deep]";
    try {
      if (data === null || data === void 0) return data;
      if (typeof data !== "object") return data;
      if (Array.isArray(data)) return data.slice(0, 50).map((x) => safeClone(x, depth + 1));
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
  function emitRecord(reqData) {
    window.postMessage(
      {
        nonce: NONCE,
        type: "RECORD_REQUEST",
        request: reqData
      },
      "*"
    );
  }
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const start = Date.now();
    let url = "";
    let method = "GET";
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
        reqBody = args[1].body ?? null;
      }
    } catch {
    }
    const reqId = `fetch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let response;
    try {
      response = await originalFetch.apply(this, args);
    } catch (err) {
      emitRecord({
        id: reqId,
        url,
        method,
        status: 0,
        error: String(err),
        timestamp: Date.now(),
        durationMs: Date.now() - start
      });
      throw err;
    }
    try {
      const clone = response.clone();
      const contentType = clone.headers.get("content-type") || "";
      if (contentType.includes("json")) {
        clone.json().then((json) => {
          emitRecord({
            id: reqId,
            url,
            method,
            status: response.status,
            requestBody: typeof reqBody === "string" ? reqBody.slice(0, 1e3) : safeClone(reqBody),
            responseSample: safeClone(json),
            timestamp: Date.now(),
            durationMs: Date.now() - start
          });
        }).catch(() => {
        });
      } else if (contentType.includes("text") || contentType.includes("xml")) {
        clone.text().then((text) => {
          emitRecord({
            id: reqId,
            url,
            method,
            status: response.status,
            responseSample: text.slice(0, 1500),
            timestamp: Date.now(),
            durationMs: Date.now() - start
          });
        }).catch(() => {
        });
      } else {
        emitRecord({
          id: reqId,
          url,
          method,
          status: response.status,
          timestamp: Date.now(),
          durationMs: Date.now() - start
        });
      }
    } catch {
    }
    return response;
  };
  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.nonce !== NONCE) return;
    if (event.data.type !== "COMMAND_REQUEST") return;
    const { action, requestId, payload } = event.data;
    if (action === "EXEC_FETCH") {
      try {
        const p = typeof payload === "object" && payload !== null ? payload : {};
        if (!p.url) throw new Error("Missing url for EXEC_FETCH");
        const fetchOpts = {
          method: p.method || "GET",
          headers: { ...p.headers || {} }
        };
        if (p.body !== void 0 && fetchOpts.method !== "GET" && fetchOpts.method !== "HEAD") {
          fetchOpts.body = typeof p.body === "object" ? JSON.stringify(p.body) : String(p.body);
          const hdrs = fetchOpts.headers;
          if (!hdrs["Content-Type"] && !hdrs["content-type"]) {
            hdrs["Content-Type"] = "application/json";
          }
        }
        const resp = await originalFetch(p.url, fetchOpts);
        const ct = resp.headers.get("content-type") || "";
        let data;
        if (ct.includes("json")) {
          data = await resp.json();
        } else {
          data = await resp.text();
        }
        const respHeaders = {};
        resp.headers.forEach((v, k) => {
          respHeaders[k] = v;
        });
        window.postMessage(
          {
            nonce: NONCE,
            type: "COMMAND_RESPONSE",
            requestId,
            data: {
              status: resp.status,
              statusText: resp.statusText,
              ok: resp.ok,
              headers: respHeaders,
              data
            }
          },
          "*"
        );
      } catch (err) {
        window.postMessage(
          {
            nonce: NONCE,
            type: "COMMAND_RESPONSE",
            requestId,
            error: err instanceof Error ? err.message : String(err)
          },
          "*"
        );
      }
      return;
    }
    if (action === "EXEC_EVAL") {
      try {
        const p = typeof payload === "object" && payload !== null ? payload : {};
        if (!p.script) throw new Error("Missing script for EXEC_EVAL");
        const fn = new Function(`return (async () => { ${p.script} })()`);
        const result = await fn();
        window.postMessage(
          {
            nonce: NONCE,
            type: "COMMAND_RESPONSE",
            requestId,
            data: {
              result: safeClone(result)
            }
          },
          "*"
        );
      } catch (err) {
        window.postMessage(
          {
            nonce: NONCE,
            type: "COMMAND_RESPONSE",
            requestId,
            error: err instanceof Error ? err.message : String(err)
          },
          "*"
        );
      }
      return;
    }
  });
})();
