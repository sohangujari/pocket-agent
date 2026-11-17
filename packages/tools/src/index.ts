import { ToolRegistry } from "@pocket/core";
import {
  memoryAdd,
  memoryList,
  memoryPropose,
  memoryRemove,
  memorySearch,
  memoryUpdate,
} from "./memory.js";
import {
  skillCreate,
  skillList,
  skillUpdate,
  skillView,
} from "./skills.js";
import { sessionSearch } from "./sessions.js";
import { httpRequest, webFetch, webSearch } from "./web.js";
import { artifactSave, fileList, fileRead, fileWrite } from "./files.js";
import { terminal } from "./exec.js";
import { scheduleCreate, scheduleDelete, scheduleList } from "./automation.js";
import { delegateTask } from "./delegate.js";
import { clarify, todoWrite } from "./system.js";
import { visionAnalyze } from "./media.js";

export const ALL_TOOLS = [
  memoryAdd,
  memoryPropose,
  memoryUpdate,
  memoryRemove,
  memorySearch,
  memoryList,
  skillList,
  skillView,
  skillCreate,
  skillUpdate,
  sessionSearch,
  webSearch,
  webFetch,
  httpRequest,
  fileWrite,
  fileRead,
  fileList,
  artifactSave,
  terminal,
  scheduleCreate,
  scheduleList,
  scheduleDelete,
  delegateTask,
  todoWrite,
  clarify,
  visionAnalyze,
];

export function buildRegistry(toolsets?: string[] | null): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of ALL_TOOLS) {
    if (toolsets && toolsets.length > 0 && !tool.toolsets.some((t) => toolsets.includes(t))) {
      continue;
    }
    registry.register(tool);
  }
  return registry;
}

export * from "./memory.js";
export * from "./skills.js";
export * from "./sessions.js";
export * from "./web.js";
export * from "./files.js";
export * from "./exec.js";
export * from "./automation.js";
export * from "./delegate.js";
export * from "./system.js";
export * from "./media.js";
export { mirrorToStorage } from "./storage.js";
