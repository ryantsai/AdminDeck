import { invoke } from "@tauri-apps/api/core";
import type { AppBootstrap } from "../types";

type CommandMap = {
  app_bootstrap: {
    args: undefined;
    result: AppBootstrap;
  };
};

export function invokeCommand<Name extends keyof CommandMap>(
  name: Name,
  args?: CommandMap[Name]["args"],
): Promise<CommandMap[Name]["result"]> {
  return invoke<CommandMap[Name]["result"]>(name, args);
}
