import { WebSocketServer, WebSocket } from "ws";
import {
  BridgeCommand,
  createRequestId,
  ExtensionIncomingMessage,
  RequestId
} from "./shared/types.js";

interface PendingRequest<T = unknown> {
  readonly resolve: (value: T) => void;
  readonly reject: (reason: Error) => void;
  readonly timer: NodeJS.Timeout;
}

export class BrowserRelay {
  private wss: WebSocketServer | null = null;
  private activeClient: WebSocket | null = null;
  private readonly pendingRequests = new Map<RequestId, PendingRequest<any>>();
  private activeTabInfo: { readonly url?: string; readonly title?: string } = {};

  constructor(private readonly port: number = 8765) {}

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.port, host: "127.0.0.1" });

        this.wss.on("listening", () => {
          console.error(`[BrowserRelay] Listening on ws://127.0.0.1:${this.port}`);
          resolve();
        });

        this.wss.on("connection", (ws: WebSocket) => {
          console.error("[BrowserRelay] Browser extension connected");
          this.activeClient = ws;

          ws.on("message", (raw: Buffer) => {
            try {
              const msg = JSON.parse(raw.toString("utf-8")) as ExtensionIncomingMessage;

              // Discriminated narrowing
              if (msg.kind === "TAB_UPDATE") {
                this.activeTabInfo = { url: msg.url, title: msg.title };
                return;
              }

              if (this.pendingRequests.has(msg.requestId)) {
                const req = this.pendingRequests.get(msg.requestId)!;
                clearTimeout(req.timer);
                this.pendingRequests.delete(msg.requestId);

                if (msg.kind === "error") {
                  req.reject(new Error(msg.error));
                } else if (msg.kind === "success") {
                  req.resolve(msg.data);
                }
              }
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              console.error("[BrowserRelay] Message parse error:", message);
            }
          });

          ws.on("close", () => {
            console.error("[BrowserRelay] Browser extension disconnected");
            if (this.activeClient === ws) {
              this.activeClient = null;
              this.activeTabInfo = {};
            }
          });

          ws.on("error", (err: Error) => {
            console.error("[BrowserRelay] WebSocket error:", err.message);
          });
        });

        this.wss.on("error", (err: Error) => {
          reject(err);
        });
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        reject(error);
      }
    });
  }

  public isConnected(): boolean {
    return this.activeClient !== null && this.activeClient.readyState === WebSocket.OPEN;
  }

  public getActiveTabInfo(): { readonly url?: string; readonly title?: string } {
    return this.activeTabInfo;
  }

  public sendCommand<T>(
    builder: (id: RequestId) => BridgeCommand,
    timeoutMs: number = 30000
  ): Promise<T> {
    if (!this.isConnected()) {
      return Promise.reject(
        new Error(
          `Browser extension is not connected to ws://127.0.0.1:${this.port}. Please ensure Firefox is running and the extension is loaded.`
        )
      );
    }

    const requestId = createRequestId();
    const command = builder(requestId);

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Browser command '${command.kind}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timer });
      this.activeClient!.send(JSON.stringify(command));
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
