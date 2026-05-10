const SIMPLE_SHELL_OPERATOR_PATTERN = /(?:&&|\|\||[;|<>`]|[$][(])/u;
const SIMPLE_SHELL_KEYWORD_PATTERN = /^(?:if|then|else|elif|fi|for|while|until|case|do|done|function)\b/u;

export function prepareAssistantTerminalInput(code: string): string {
  const normalized = code.replace(/\r\n?/g, "\n");
  const sudoSequence = buildSudoSequence(normalized);
  if (sudoSequence) {
    return `${sudoSequence}\n`;
  }
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

function buildSudoSequence(code: string) {
  const commands = code
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  if (commands.length < 2 || !commands.some(usesSudoCommand)) {
    return null;
  }

  if (!commands.every(isSimpleShellCommand)) {
    return null;
  }

  return `sudo -v && { ${commands.join("; ")}; }`;
}

function usesSudoCommand(command: string) {
  return command === "sudo" || command.startsWith("sudo ");
}

function isSimpleShellCommand(command: string) {
  return (
    !command.endsWith("\\") &&
    !command.includes("{") &&
    !command.includes("}") &&
    !SIMPLE_SHELL_OPERATOR_PATTERN.test(command) &&
    !SIMPLE_SHELL_KEYWORD_PATTERN.test(command)
  );
}
