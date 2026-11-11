import { BridgeCommand, RequestId } from "./shared/types.js";
export declare class BrowserRelay {
    private readonly port;
    private wss;
    private activeClient;
    private readonly pendingRequests;
    private activeTabInfo;
    constructor(port?: number);
    start(): Promise<void>;
    isConnected(): boolean;
    getActiveTabInfo(): {
        readonly url?: string;
        readonly title?: string;
    };
    sendCommand<T>(builder: (id: RequestId) => BridgeCommand, timeoutMs?: number): Promise<T>;
    stop(): Promise<void>;
}
