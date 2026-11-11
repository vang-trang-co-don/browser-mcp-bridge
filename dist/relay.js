import { WebSocketServer, WebSocket } from "ws";
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
                            const msg = JSON.parse(raw.toString());
                            if (msg.type === "TAB_UPDATE") {
                                this.activeTabInfo = { url: msg.url, title: msg.title };
                                return;
                            }
                            if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
                                const req = this.pendingRequests.get(msg.requestId);
                                clearTimeout(req.timer);
                                this.pendingRequests.delete(msg.requestId);
                                if (msg.error) {
                                    req.reject(new Error(msg.error));
                                }
                                else {
                                    req.resolve(msg.data);
                                }
                            }
                        }
                        catch (err) {
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
            }
            catch (err) {
                reject(err);
            }
        });
    }
    isConnected() {
        return this.activeClient !== null && this.activeClient.readyState === WebSocket.OPEN;
    }
    getActiveTabInfo() {
        return this.activeTabInfo;
    }
    sendCommand(action, payload = {}, target, timeoutMs = 30000) {
        if (!this.isConnected()) {
            return Promise.reject(new Error("Browser extension is not connected to ws://127.0.0.1:" +
                this.port +
                ". Make sure Firefox has the extension installed and running."));
        }
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Browser command '${action}' timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            this.pendingRequests.set(requestId, { resolve, reject, timer });
            const command = {
                requestId,
                action,
                target,
                payload
            };
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
