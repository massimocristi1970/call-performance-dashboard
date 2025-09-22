// js/renderers.js
import { dataLoader } from './data-loader.js';
import chartManager from './chart-manager.js';

// Local helper (do NOT add to utils.js)
function durationToSeconds(str) {
  if (!str) return 0;
  const parts = String(str).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(str) || 0;
}
function secondsToMMSS(seconds) {
  if (!seconds || isNaN(seconds)) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Small DOM helper
function setTileText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

class PageRenderer {
  constructor() {
    this.currentFilters = {};
  }

  updateFilters(filters) {
    this.currentFilters = filters || {};
  }

  // ---------------- INBOUND ----------------
  async renderInbound(filters) {
    const data = dataLoader.getData('inbound', filters);
    if (!data || data.length === 0) return;

    // 🔹 KPI Tiles
    const totalInbound = data.length;
    const avgWait =
      data.reduce((sum, r) => sum + (r.waitTime_numeric || 0), 0) /
      (totalInbound || 1);

    setTileText("inbound-total-calls", totalInbound.toLocaleString());
    setTileText("inbound-avg-wait", secondsToMMSS(avgWait));

    // Charts
    chartManager.createCallsOverTimeChart("inbound-calls-over-time", data, {
      dateField: "date_parsed",
    });
    chartManager.createStatusChart("inbound-status", data);
    chartManager.createAgentChart("inbound-agent", data);
  }

  // ---------------- OUTBOUND ----------------
  async renderOutbound(filters) {
    const callsData = dataLoader.getData("outbound", filters) || [];
    const connectRaw = dataLoader.getData("outbound_connectrate", filters) || [];
    const connectData = connectRaw.filter((r) => {
      const dir = (r["Initial Direction"] || "").toString().toLowerCase();
      return dir.includes("outbound");
    });

    // 🔹 KPI Tiles
    const totalOutboundCalls = callsData.reduce(
      (sum, r) => sum + (Number(r.OutboundCalls_numeric) || 0),
      0
    );
    const totalOutboundRows = connectData.length;
    const connectedRows = connectData.reduce((acc, r) => {
      const sec = durationToSeconds(r["Duration"]);
      return acc + (sec > 150 ? 1 : 0);
    }, 0);
    const connectRate =
      totalOutboundRows > 0 ? (connectedRows / totalOutboundRows) * 100 : 0;

    setTileText("outbound-total-calls", totalOutboundCalls.toLocaleString());
    setTileText("outbound-connect-rate", `${connectRate.toFixed(1)}%`);

    // Charts
    chartManager.createCallsOverTimeChart(
      "outbound-calls-over-time",
      callsData,
      { dateField: "date_parsed", valueField: "OutboundCalls_numeric" }
    );
    chartManager.createBarChart("outbound-agent", callsData, {
      groupBy: "Agent",
      valueField: "OutboundCalls_numeric",
      label: "Calls per Agent",
    });
    const outcomesRows = [
      { label: "Connected (>2:30)", value: connectedRows },
      {
        label: "Not Connected",
        value: Math.max(totalOutboundRows - connectedRows, 0),
      },
    ];
    chartManager.createDoughnutChart("outbound-outcomes", outcomesRows, {
      labelField: "label",
      valueField: "value",
      title: "Outbound Call Outcomes",
    });
  }

  // ---------------- FCR ----------------
  async renderFCR(filters) {
    const data = dataLoader.getData("fcr", filters);
    if (!data || data.length === 0) return;

    // 🔹 KPI Tiles
    const totalCases = data.reduce(
      (sum, r) => sum + (Number(r.Count_numeric) || 0),
      0
    );
    // If no "Resolved" column is in CSV, we fallback to assuming all are resolved
    const resolvedCases = data.reduce((sum, r) => {
      if (r.Resolved && String(r.Resolved).toLowerCase() === "yes") {
        return sum + (Number(r.Count_numeric) || 0);
      }
      return sum;
    }, 0);
    const fcrRate = totalCases > 0 ? (resolvedCases / totalCases) * 100 : 0;

    setTileText("fcr-total-cases", totalCases.toLocaleString());
    setTileText("fcr-rate", `${fcrRate.toFixed(1)}%`);

    // Charts
    chartManager.createCallsOverTimeChart("fcr-cases-over-time", data, {
      dateField: "date_parsed",
      valueField: "Count_numeric",
    });
  }
}

const pageRenderer = new PageRenderer();
export default pageRenderer;
export { pageRenderer };
