#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { BrowserRelay } from "./relay.js";
import {
  FetchParams,
  EvalParams,
  GetRecentRequestsParams,
  TabInfo
} from "./shared/types.js";

const PORT = parseInt(process.env.BROWSER_MCP_PORT || "8765", 10);
const relay = new BrowserRelay(PORT);

const server = new Server(
  {
    name: "browser-mcp-bridge",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "browser_list_tabs",
        description:
          "Lists all open browser tabs (id, url, title, active). Use this to explicitly pick a tabId or confirm the target web application is open.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "browser_get_active_tab",
        description: "Returns the URL, title, and connection status of the currently focused browser tab.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "browser_get_recent_requests",
        description:
          "Returns the rolling buffer of recent XHR and Fetch network requests recorded from the target tab. Useful for discovering API endpoints and schemas by observing user actions.",
        inputSchema: {
          type: "object",
          properties: {
            tabId: {
              type: "number",
              description: "Optional explicit tab ID to inspect. Immune to user switching tabs."
            },
            urlMatch: {
              type: "string",
              description: "Optional URL substring to target (e.g. 'hoadondientu.gdt.gov.vn' or 'ipos.vn')"
            },
            filterUrl: {
              type: "string",
              description: "Optional case-insensitive substring to filter captured request URLs"
            },
            limit: {
              type: "number",
              description: "Max number of recent requests to return (default: 10, max: 50)"
            }
          }
        }
      },
      {
        name: "browser_fetch",
        description:
          "Executes an authenticated HTTP fetch call directly inside the target browser tab context. Retains all cookies, session tokens, and bypasses CORS/WAF rules.",
        inputSchema: {
          type: "object",
          properties: {
            tabId: {
              type: "number",
              description: "Optional explicit tab ID. Immune to user switching tabs."
            },
            urlMatch: {
              type: "string",
              description: "Optional URL substring to match (e.g. 'ipos.vn' or 'gdt.gov.vn')"
            },
            url: {
              type: "string",
              description: "Absolute or relative URL to fetch"
            },
            method: {
              type: "string",
              enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
              description: "HTTP method (defaults to GET)"
            },
            headers: {
              type: "object",
              description: "Optional custom HTTP headers",
              additionalProperties: { type: "string" }
            },
            body: {
              description: "Request body (JSON object or string)"
            }
          },
          required: ["url"]
        }
      },
      {
        name: "browser_eval",
        description:
          "Evaluates a JavaScript expression inside the target browser tab DOM context and returns the result.",
        inputSchema: {
          type: "object",
          properties: {
            tabId: {
              type: "number",
              description: "Optional explicit tab ID. Immune to user switching tabs."
            },
            urlMatch: {
              type: "string",
              description: "Optional URL substring to match (e.g. 'ipos.vn' or 'gdt.gov.vn')"
            },
            script: {
              type: "string",
              description: "JavaScript expression or async function body to evaluate"
            }
          },
          required: ["script"]
        }
      }
    ]
  };
});

// Handle tool executions
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = rawArgs || {};

  try {
    switch (name) {
      case "browser_list_tabs": {
        const tabs = await relay.sendCommand<TabInfo[]>("LIST_TABS", {});
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tabs, null, 2)
            }
          ]
        };
      }

      case "browser_get_active_tab": {
        const info = relay.getActiveTabInfo();
        const connected = relay.isConnected();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  connected,
                  port: PORT,
                  tab: info
                },
                null,
                2
              )
            }
          ]
        };
      }

      case "browser_get_recent_requests": {
        const params: GetRecentRequestsParams = args as any;
        const target = { tabId: params.tabId, urlMatch: params.urlMatch };
        const result = await relay.sendCommand("GET_RECENT_REQUESTS", params, target);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "browser_fetch": {
        const params: FetchParams = args as any;
        const target = { tabId: params.tabId, urlMatch: params.urlMatch };
        const result = await relay.sendCommand("EXEC_FETCH", params, target);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "browser_eval": {
        const params: EvalParams = args as any;
        const target = { tabId: params.tabId, urlMatch: params.urlMatch };
        const result = await relay.sendCommand("EXEC_EVAL", params, target);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${error.message}`
        }
      ]
    };
  }
});

async function main() {
  await relay.start();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[browser-mcp-bridge] MCP Server running on stdio");
}

main().catch((err) => {
  console.error("[browser-mcp-bridge] Fatal error:", err);
  process.exit(1);
});
