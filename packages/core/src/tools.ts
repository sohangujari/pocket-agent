import type { ZodType } from "zod";
import type { ToolSchema } from "./llm.js";

export type ToolRisk = "safe" | "caution" | "dangerous";

export type ToolContext = {
  runId: string;
  sessionId: string;
  userId: string;
  depth: number;
  registry: ToolRegistry;
  signal?: AbortSignal;
  emit: (type: string, payload: unknown) => Promise<void>;
};

export type ToolDefinition<I = any> = {
  name: string;
  description: string;
  schema: ZodType<I>;
  parameters: Record<string, unknown>;
  risk: ToolRisk;
  toolsets: string[];
  timeoutMs?: number;
  /** Short label shown in the UI while the tool runs. */
  label?: string;
  run: (input: I, ctx: ToolContext) => Promise<unknown>;
};

export type Toolset = {
  id: string;
  label: string;
  description: string;
};

export const TOOLSETS: Toolset[] = [
  { id: "memory", label: "Memory", description: "Remember and recall durable facts." },
  { id: "skills", label: "Skills", description: "Create and follow reusable procedures." },
  { id: "sessions", label: "Session search", description: "Search past conversations." },
  { id: "web", label: "Web", description: "Search and read the web." },
  { id: "files", label: "Files", description: "Read and write workspace artifacts." },
  { id: "exec", label: "Terminal", description: "Run shell commands (approval gated)." },
  { id: "automation", label: "Automation", description: "Schedules and recurring work." },
  { id: "delegate", label: "Delegation", description: "Spawn child agents." },
  { id: "media", label: "Media", description: "Vision and image generation." },
  { id: "system", label: "System", description: "Todos, questions, small utilities." },
];

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  all(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  enabled(toolsets?: string[] | null): ToolDefinition[] {
    if (!toolsets || toolsets.length === 0) return this.all();
    return this.all().filter((t) => t.toolsets.some((s) => toolsets.includes(s)));
  }

  schemas(toolsets?: string[] | null): ToolSchema[] {
    return this.enabled(toolsets).map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
}
