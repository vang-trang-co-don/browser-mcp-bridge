(() => {
  if ((window as any).__BROWSER_MCP_HOOKED__) return;
  (window as any).__BROWSER_MCP_HOOKED__ = true;

  // Read current script nonce to authorize message channel
  const currentScript = document.currentScript as HTMLScriptElement | null;
  const NONCE = currentScript?.dataset.mcpNonce || "";

  function safeClone(data: any, depth = 0): any {
    if (depth > 4) return "[Object too deep]";
    try {
      if (data === null || data === undefined) return data;
      if (typeof data !== "object") return data;
      if (Array.isArray(data)) return data.slice(0, 50).map((x) => safeClone(x, depth + 1));
      const res: Record<string, any> = {};
      const keys = Object.keys(data).slice(0, 50);
      for (const k of keys) {
        res[k] = safeClone(data[k], depth + 1);
      }
      return res;
    } catch {
      return "[Unclonable]";
    }
  }

  function emitRecord(reqData: any) {
    window.postMessage(
      {
        nonce: NONCE,
        type: "RECORD_REQUEST",
        request: reqData
      },
      "*"
    );
  }

  // Hook window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args: any[]) {
    const start = Date.now();
    let url = "";
    let method = "GET";
    let reqHeaders: Record<string, string> = {};
    let reqBody: any = null;

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
    } catch {}

    const reqId = `fetch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let response: Response;
    try {
      response = await originalFetch.apply(this, args as any);
    } catch (err: any) {
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
        clone
          .json()
          .then((json) => {
            emitRecord({
              id: reqId,
              url,
              method,
              status: response.status,
              requestBody: typeof reqBody === "string" ? reqBody.slice(0, 1000) : safeClone(reqBody),
              responseSample: safeClone(json),
              timestamp: Date.now(),
              durationMs: Date.now() - start
            });
          })
          .catch(() => {});
      } else if (contentType.includes("text") || contentType.includes("xml")) {
        clone
          .text()
          .then((text) => {
            emitRecord({
              id: reqId,
              url,
              method,
              status: response.status,
              responseSample: text.slice(0, 1500),
              timestamp: Date.now(),
              durationMs: Date.now() - start
            });
          })
          .catch(() => {});
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
    } catch {}

    return response;
  };

  // Listen to command requests from content script
  window.addEventListener("message", async (event: MessageEvent) => {
    if (event.source !== window || !event.data || event.data.nonce !== NONCE) return;
    if (event.data.type !== "COMMAND_REQUEST") return;

    const { action, requestId, payload } = event.data;

    if (action === "EXEC_FETCH") {
      try {
        const { url, method = "GET", headers = {}, body } = payload || {};
        const fetchOpts: RequestInit = {
          method,
          headers: { ...headers }
        };

        if (body !== undefined && method !== "GET" && method !== "HEAD") {
          fetchOpts.body = typeof body === "object" ? JSON.stringify(body) : String(body);
          const hdrs = fetchOpts.headers as Record<string, string>;
          if (!hdrs["Content-Type"] && !hdrs["content-type"]) {
            hdrs["Content-Type"] = "application/json";
          }
        }

        const resp = await originalFetch(url, fetchOpts);
        const ct = resp.headers.get("content-type") || "";
        let data: any;
        if (ct.includes("json")) {
          data = await resp.json();
        } else {
          data = await resp.text();
        }

        const respHeaders: Record<string, string> = {};
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
      } catch (err: any) {
        window.postMessage(
          {
            nonce: NONCE,
            type: "COMMAND_RESPONSE",
            requestId,
            error: String(err)
          },
          "*"
        );
      }
      return;
    }

    if (action === "EXEC_EVAL") {
      try {
        const { script } = payload || {};
        const fn = new Function(`return (async () => { ${script} })()`);
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
      } catch (err: any) {
        window.postMessage(
          {
            nonce: NONCE,
            type: "COMMAND_RESPONSE",
            requestId,
            error: String(err)
          },
          "*"
        );
      }
      return;
    }
  });
})();
