import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../src/ai/terminalCommandSend.ts", import.meta.url);
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const module = { exports: {} };
vm.runInNewContext(compiled, { exports: module.exports, module }, { filename: sourcePath.pathname });

const { prepareAssistantTerminalInput } = module.exports;

assert.equal(
  prepareAssistantTerminalInput(
    [
      "# Disable the timer so it will not start on boot",
      "sudo systemctl disable etfreports-daily-report.timer",
      "",
      "# Stop it if currently running",
      "sudo systemctl stop etfreports-daily-report.timer",
      "",
      "# Verify status",
      "systemctl status etfreports-daily-report.timer",
    ].join("\n"),
  ),
  "sudo -v && { sudo systemctl disable etfreports-daily-report.timer; sudo systemctl stop etfreports-daily-report.timer; systemctl status etfreports-daily-report.timer; }\n",
);

assert.equal(
  prepareAssistantTerminalInput("echo one\necho two"),
  "echo one\necho two\n",
);

assert.equal(
  prepareAssistantTerminalInput("sudo sh -c 'echo one && echo two'\nsystemctl status demo"),
  "sudo sh -c 'echo one && echo two'\nsystemctl status demo\n",
);
