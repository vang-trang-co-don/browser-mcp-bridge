import { WebSocketServer, WebSocket } from "ws";
import { createRequestId } from "./shared/types.js";
export class BrowserRelay {
    port;
    wss = null;
    activeClient = null;
    pendingRequests = new Map();
    activeTabInfo = {};
    constructor(port = 8765) {
        this.port = port;
    }
    start() {
        return new Promise((resolve, reject) => {
            try {
                this.wss = new WebSocketServer({ port: this.port, host: "127.0.0.1" });
                this.wss.on("listening", () => {
                    console.error(`[BrowserRelay] Listening on ws://127.0.0.1:${this.port}`);
                    resolve();
                });
                this.wss.on("connection", (ws) => {
                    console.error("[BrowserRelay] Browser extension connected");
                    this.activeClient = ws;
                    ws.on("message", (raw) => {
                        try {
                            const msg = JSON.parse(raw.toString("utf-8"));
                            // Discriminated narrowing
                            if (msg.kind === "TAB_UPDATE") {
                                this.activeTabInfo = { url: msg.url, title: msg.title };
                                return;
                            }
                            if (this.pendingRequests.has(msg.requestId)) {
                                const req = this.pendingRequests.get(msg.requestId);
                                clearTimeout(req.timer);
                                this.pendingRequests.delete(msg.requestId);
                                if (msg.kind === "error") {
                                    req.reject(new Error(msg.error));
                                }
                                else if (msg.kind === "success") {
                                    req.resolve(msg.data);
                                }
                            }
                        }
                        catch (err) {
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
                    ws.on("error", (err) => {
                        console.error("[BrowserRelay] WebSocket error:", err.message);
                    });
                });
                this.wss.on("error", (err) => {
                    reject(err);
                });
            }
            catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                reject(error);
            }
        });
    }
    isConnected() {
        return this.activeClient !== null && this.activeClient.readyState === WebSocket.OPEN;
    }
    getActiveTabInfo() {
        return this.activeTabInfo;
    }
    sendCommand(builder, timeoutMs = 30000) {
        if (!this.isConnected()) {
            return Promise.reject(new Error(`Browser extension is not connected to ws://127.0.0.1:${this.port}. Please ensure Firefox is running and the extension is loaded.`));
        }
        const requestId = createRequestId();
        const command = builder(requestId);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Browser command '${command.kind}' timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            this.pendingRequests.set(requestId, { resolve, reject, timer });
            this.activeClient.send(JSON.stringify(command));
        });
    }
    stop() {
        return new Promise((resolve) => {
            if (this.wss) {
                this.wss.close(() => resolve());
            }
            else {
                resolve();
            }
        });
    }
}
