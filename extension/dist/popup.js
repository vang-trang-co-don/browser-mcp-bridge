"use strict";
(() => {
  const statusContainer = document.getElementById("statusContainer");
  if (!statusContainer) return;
  const testWs = new WebSocket("ws://127.0.0.1:8765");
  testWs.onopen = () => {
    statusContainer.innerHTML = `
      <div class="status-badge online">
        <span class="dot dot-green"></span>
        <span>Connected to MCP Relay</span>
      </div>
    `;
    testWs.close();
  };
  testWs.onerror = () => {
    statusContainer.innerHTML = `
      <div class="status-badge offline">
        <span class="dot dot-red"></span>
        <span>Relay Offline</span>
      </div>
    `;
  };
})();
