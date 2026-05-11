import {
  calculateIpv4Subnet,
  normalizeAgentWidgetDefinition,
  transformQuickTool,
} from "./widgets";

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

const subnet = calculateIpv4Subnet("192.168.10.44/27");
assertEqual(subnet.ok, true);
if (subnet.ok) {
  assertEqual(subnet.networkAddress, "192.168.10.32");
  assertEqual(subnet.broadcastAddress, "192.168.10.63");
  assertEqual(subnet.firstUsableAddress, "192.168.10.33");
  assertEqual(subnet.lastUsableAddress, "192.168.10.62");
  assertEqual(subnet.usableHosts, "30");
}

const encoded = transformQuickTool("urlEncode", "https://kkterm.local/a b");
assertEqual(encoded.output, "https%3A%2F%2Fkkterm.local%2Fa%20b");

const customWidget = normalizeAgentWidgetDefinition(`{
  "id": "agent-weekly-checklist",
  "title": "Weekly Ops Checklist",
  "category": "report",
  "summary": "A locally saved report widget.",
  "body": "Review backup status before maintenance windows."
}`);
assertEqual(customWidget.ok, true);
if (customWidget.ok) {
  assertEqual(customWidget.widget.id, "agent-weekly-checklist");
  assertEqual(customWidget.widget.category, "report");
}
