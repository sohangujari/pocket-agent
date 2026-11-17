export type RunEvent = {
  id: number;
  type: string;
  payload: any;
};

export type RunSummary = {
  id: string;
  sessionId: string;
  status: string;
  input: string | null;
  step: number;
  tokensUsed: number;
  costUsd: number;
  source: string;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  title: string | null;
};

export type RunDetail = RunSummary & {
  maxSteps: number;
  output: string | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class PocketClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const message =
        json?.error?.message ?? json?.error ?? `Request failed with ${res.status}`;
      throw new Error(String(message));
    }
    return json as T;
  }

  async health(): Promise<{ ok: boolean; db: string }> {
    const res = await fetch(`${this.baseUrl}/api/health`);
    return (await res.json()) as { ok: boolean; db: string };
  }

  async createRun(message: string, sessionId?: string): Promise<{ runId: string; sessionId: string }> {
    return this.request("/api/v1/runs", {
      method: "POST",
      body: JSON.stringify({ message, sessionId, source: "cli" }),
    });
  }

  async getRun(id: string): Promise<RunDetail> {
    return this.request(`/api/v1/runs/${id}`);
  }

  async listRuns(): Promise<RunSummary[]> {
    const json = await this.request<{ data: RunSummary[] }>("/api/v1/runs");
    return json.data;
  }

  async events(id: string, after = 0): Promise<{ events: RunEvent[]; cursor: number; status: string }> {
    return this.request(`/api/v1/runs/${id}/events?after=${after}`);
  }

  async cancelRun(id: string): Promise<void> {
    await this.request(`/api/v1/runs/${id}/cancel`, { method: "POST" });
  }

  async decideApproval(approvalId: string, decision: "approved" | "rejected"): Promise<void> {
    await this.request(`/api/v1/approvals/${approvalId}`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
  }

  /**
   * Polls the run's event log and invokes handlers as events arrive.
   * Resolves when the run reaches a terminal state.
   */
  async watch(
    runId: string,
    handlers: {
      onEvent?: (event: RunEvent) => void | Promise<void>;
      onApproval?: (event: RunEvent) => Promise<"approved" | "rejected">;
    },
    options: { signal?: AbortSignal } = {},
  ): Promise<string> {
    let cursor = 0;
    let status = "queued";

    while (true) {
      if (options.signal?.aborted) return "cancelled";

      const page = await this.events(runId, cursor);
      status = page.status;

      for (const event of page.events) {
        cursor = event.id;
        await handlers.onEvent?.(event);

        if (event.type === "approval_request" && handlers.onApproval) {
          const decision = await handlers.onApproval(event);
          await this.decideApproval(event.payload.approvalId, decision);
        }
      }

      if (["completed", "failed", "cancelled"].includes(status) && page.events.length === 0) {
        return status;
      }

      await sleep(page.events.length > 0 ? 200 : 800);
    }
  }
}
