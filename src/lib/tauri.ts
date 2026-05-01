import { invoke } from "@tauri-apps/api/core";
import type { AppBootstrap, ConnectionGroup } from "../types";

type CommandMap = {
  app_bootstrap: {
    args: undefined;
    result: AppBootstrap;
  };
  list_connection_groups: {
    args: undefined;
    result: ConnectionGroup[];
  };
};

export function invokeCommand<Name extends keyof CommandMap>(
  name: Name,
  args?: CommandMap[Name]["args"],
): Promise<CommandMap[Name]["result"]> {
  return invoke<CommandMap[Name]["result"]>(name, args);
}
