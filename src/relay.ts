import { WebSocketServer, WebSocket } from "ws";
import {
  BridgeAction,
  BridgeCommand,
  BridgeResponse,
  TabTarget,
  TabInfo
} from "./shared/types.js";

export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: NodeJS.Timeout;
}

export class BrowserRelay {
  private wss: WebSocketServer | null = null;
  private activeClient: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private activeTabInfo: { url?: string; title?: string } = {};

  constructor(private port: number = 8765) {}

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

          ws.on("message", (raw: string) => {
            try {
              const msg: BridgeResponse & { type?: string; url?: string; title?: string } =
                JSON.parse(raw.toString());

              if (msg.type === "TAB_UPDATE") {
                this.activeTabInfo = { url: msg.url, title: msg.title };
                return;
              }

              if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
                const req = this.pendingRequests.get(msg.requestId)!;
                clearTimeout(req.timer);
                this.pendingRequests.delete(msg.requestId);

                if (msg.error) {
                  req.reject(new Error(msg.error));
                } else {
                  req.resolve(msg.data);
                }
              }
            } catch (err: any) {
              console.error("[BrowserRelay] Message parse error:", err.message);
            }
          });

          ws.on("close", () => {
            console.error("[BrowserRelay] Browser extension disconnected");
            if (this.activeClient === ws) {
              this.activeClient = null;
              this.activeTabInfo = {};
            }
          });

          ws.on("error", (err) => {
            console.error("[BrowserRelay] WebSocket error:", err.message);
          });
        });

        this.wss.on("error", (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  public isConnected(): boolean {
    return this.activeClient !== null && this.activeClient.readyState === WebSocket.OPEN;
  }

  public getActiveTabInfo() {
    return this.activeTabInfo;
  }

  public sendCommand<T = any>(
    action: BridgeAction,
    payload: any = {},
    target?: TabTarget,
    timeoutMs: number = 30000
  ): Promise<T> {
    if (!this.isConnected()) {
      return Promise.reject(
        new Error(
          "Browser extension is not connected to ws://127.0.0.1:" +
            this.port +
            ". Make sure Firefox has the extension installed and running."
        )
      );
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Browser command '${action}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      const command: BridgeCommand = {
        requestId,
        action,
        target,
        payload
      };

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
