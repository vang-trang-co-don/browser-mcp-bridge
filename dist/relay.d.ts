import { BridgeAction, TabTarget } from "./shared/types.js";
export interface PendingRequest {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timer: NodeJS.Timeout;
}
export declare class BrowserRelay {
    private port;
    private wss;
    private activeClient;
    private pendingRequests;
    private activeTabInfo;
    constructor(port?: number);
    start(): Promise<void>;
    isConnected(): boolean;
    getActiveTabInfo(): {
        url?: string;
        title?: string;
    };
    sendCommand<T = any>(action: BridgeAction, payload?: any, target?: TabTarget, timeoutMs?: number): Promise<T>;
    stop(): Promise<void>;
}
