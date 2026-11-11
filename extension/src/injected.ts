interface WindowWithHook extends Window {
  __BROWSER_MCP_HOOKED__?: boolean;
}

(() => {
  const win = window as WindowWithHook;
  if (win.__BROWSER_MCP_HOOKED__) return;
  win.__BROWSER_MCP_HOOKED__ = true;

  // Read current script nonce to authorize message channel
  const currentScript = document.currentScript as HTMLScriptElement | null;
  const NONCE = currentScript?.dataset.mcpNonce || "";

  function safeClone(data: unknown, depth = 0): unknown {
    if (depth > 4) return "[Object too deep]";
    try {
      if (data === null || data === undefined) return data;
      if (typeof data !== "object") return data;
      if (Array.isArray(data)) return data.slice(0, 50).map((x) => safeClone(x, depth + 1));
      const res: Record<string, unknown> = {};
      const keys = Object.keys(data as Record<string, unknown>).slice(0, 50);
      for (const k of keys) {
        res[k] = safeClone((data as Record<string, unknown>)[k], depth + 1);
      }
      return res;
    } catch {
      return "[Unclonable]";
    }
  }

  function emitRecord(reqData: unknown): void {
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
  window.fetch = async function (...args: Parameters<typeof originalFetch>): Promise<Response> {
    const start = Date.now();
    let url = "";
    let method = "GET";
    let reqBody: unknown = null;

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
    } catch {}

    const reqId = `fetch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let response: Response;
    try {
      response = await originalFetch.apply(this, args);
    } catch (err: unknown) {
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
          .then((json: unknown) => {
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
          .then((text: string) => {
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

  interface PageCommandEvent {
    readonly nonce: string;
    readonly type: string;
    readonly action: "EXEC_FETCH" | "EXEC_EVAL";
    readonly requestId: string;
    readonly payload: unknown;
  }

  // Listen to command requests from content script
  window.addEventListener("message", async (event: MessageEvent<PageCommandEvent>) => {
    if (event.source !== window || !event.data || event.data.nonce !== NONCE) return;
    if (event.data.type !== "COMMAND_REQUEST") return;

    const { action, requestId, payload } = event.data;

    if (action === "EXEC_FETCH") {
      try {
        const p = (typeof payload === "object" && payload !== null ? payload : {}) as {
          url?: string;
          method?: string;
          headers?: Record<string, string>;
          body?: unknown;
        };

        if (!p.url) throw new Error("Missing url for EXEC_FETCH");

        const fetchOpts: RequestInit = {
          method: p.method || "GET",
          headers: { ...(p.headers || {}) }
        };

        if (p.body !== undefined && fetchOpts.method !== "GET" && fetchOpts.method !== "HEAD") {
          fetchOpts.body = typeof p.body === "object" ? JSON.stringify(p.body) : String(p.body);
          const hdrs = fetchOpts.headers as Record<string, string>;
          if (!hdrs["Content-Type"] && !hdrs["content-type"]) {
            hdrs["Content-Type"] = "application/json";
          }
        }

        const resp = await originalFetch(p.url, fetchOpts);
        const ct = resp.headers.get("content-type") || "";
        let data: unknown;
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
      } catch (err: unknown) {
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
        const p = (typeof payload === "object" && payload !== null ? payload : {}) as { script?: string };
        if (!p.script) throw new Error("Missing script for EXEC_EVAL");

        const fn = new Function(`return (async () => { ${p.script} })()`);
        const result: unknown = await fn();

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
      } catch (err: unknown) {
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
