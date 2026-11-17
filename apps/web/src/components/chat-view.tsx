"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Check,
  ChevronDown,
  CircleStop,
  LoaderCircle,
  ShieldAlert,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { Mark } from "./mark";
import { useToasts } from "./toast-center";
import { Markdown } from "./markdown";
import { StatusChip } from "./ui";
import { cn } from "@/lib/cn";
import { fmtDate, num } from "@/lib/format";
import type { UIMessage, UITool } from "@/lib/chat";

type Todo = { text: string; status: "pending" | "in_progress" | "done" };
type Approval = {
  approvalId: string;
  toolCallId: string;
  name: string;
  args: unknown;
  risk: string;
};

type Props = {
  sessionId?: string;
  initialTitle?: string;
  initialMessages: UIMessage[];
  initialRunId?: string;
  initialCursor?: number;
  initialAssistantId?: string;
  initialApproval?: Approval | null;
};

const SUGGESTIONS = [
  {
    title: "Research and compare",
    prompt: "Research 3 competitors in the AI agent space and save a comparison table as an artifact.",
    tone: "var(--butter)",
  },
  {
    title: "Make it recurring",
    prompt: "Every weekday at 9am, summarise the latest AI news and send it to me on Telegram.",
    tone: "var(--mint)",
  },
  {
    title: "Remember my setup",
    prompt: "Remember that I deploy on Render with Supabase, and that I prefer pnpm over npm.",
    tone: "var(--lavender)",
  },
];

export function ChatView({
  sessionId: initialSessionId,
  initialTitle,
  initialMessages,
  initialRunId,
  initialCursor = 0,
  initialAssistantId,
  initialApproval = null,
}: Props) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [title, setTitle] = useState(initialTitle ?? "New session");
  const [input, setInput] = useState("");
  const [runId, setRunId] = useState<string | undefined>(initialRunId);
  const [streaming, setStreaming] = useState(Boolean(initialRunId));
  const [status, setStatus] = useState<string | null>(initialRunId ? "running" : null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [approval, setApproval] = useState<Approval | null>(initialApproval);
  const [clarify, setClarify] = useState<{ question: string; options: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tokens, setTokens] = useState(0);
  const [disconnected, setDisconnected] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const { push: pushToast } = useToasts();

  const sessionRef = useRef<string | undefined>(initialSessionId);
  const runRef = useRef<string | undefined>(initialRunId);
  const esRef = useRef<EventSource | null>(null);
  const cursorRef = useRef<number>(initialCursor);
  const assistantRef = useRef<string | undefined>(initialAssistantId);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Tool results don't carry their arguments, so keep them keyed by call id.
  const toolArgsRef = useRef<Record<string, Record<string, unknown>>>({});

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
    });
  }, []);

  const refresh = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) return;
    try {
      const res = await fetch(`/api/sessions/${id}/messages`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setMessages(json.messages ?? []);
      const lastAssistant = [...(json.messages ?? [])]
        .reverse()
        .find((m: UIMessage) => m.role === "assistant");
      if (lastAssistant) assistantRef.current = lastAssistant.id;
    } catch {
      /* keep local state */
    }
  }, []);

  const openStream = useCallback(
    (id: string, after: number) => {
      esRef.current?.close();
      const es = new EventSource(`/api/runs/${id}/stream?after=${after}`);
      esRef.current = es;
      setDisconnected(false);

      es.onmessage = (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        cursorRef.current = data.id ?? cursorRef.current;
        const payload = data.payload ?? {};

        switch (data.type) {
          case "run_started":
            setStatus("running");
            break;

          case "step_started": {
            const msgId = `a-${data.id}`;
            assistantRef.current = msgId;
            setMessages((prev) => [
              ...prev,
              {
                id: msgId,
                role: "assistant",
                content: "",
                tools: [],
                createdAt: new Date().toISOString(),
              },
            ]);
            break;
          }

          case "text": {
            const delta = String(payload.delta ?? "");
            if (!delta) break;
            let target = assistantRef.current;
            if (!target) {
              target = `a-${data.id}`;
              assistantRef.current = target;
              const msgId = target;
              setMessages((prev) => [
                ...prev,
                {
                  id: msgId,
                  role: "assistant",
                  content: delta,
                  tools: [],
                  createdAt: new Date().toISOString(),
                },
              ]);
            } else {
              const id = target;
              setMessages((prev) =>
                prev.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)),
              );
            }
            break;
          }

          case "tool_call": {
            const tool: UITool = {
              id: payload.id,
              name: payload.name,
              args: payload.args,
              risk: payload.risk,
            };
            toolArgsRef.current[payload.id] = (payload.args ?? {}) as Record<string, unknown>;
            const target = assistantRef.current;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === target ? { ...m, tools: [...m.tools, tool] } : m,
              ),
            );
            break;
          }

          case "tool_result": {
            setMessages((prev) =>
              prev.map((m) => ({
                ...m,
                tools: m.tools.map((t) =>
                  t.id === payload.id
                    ? {
                        ...t,
                        result: String(payload.output ?? ""),
                        ok: Boolean(payload.ok),
                        durationMs: payload.durationMs,
                      }
                    : t,
                ),
              })),
            );

            // A reminder or schedule is a durable side effect the owner should be
            // able to confirm at a glance — and dismiss when they're done reading it.
            if (payload.name === "schedule_create" && payload.ok) {
              try {
                const created = JSON.parse(String(payload.output ?? "{}")) as {
                  created?: boolean;
                  kind?: string;
                  runAt?: string;
                  nextRunAt?: string;
                  inMinutes?: number;
                };
                if (created.created) {
                  const args = toolArgsRef.current[payload.id] ?? {};
                  const title =
                    String(args.title ?? "").trim() ||
                    (created.kind === "once" ? "Reminder" : "Schedule");
                  const once = created.kind === "once";
                  const when = created.runAt ?? created.nextRunAt ?? null;
                  pushToast({
                    id: String(payload.id ?? Date.now()),
                    title,
                    kind: once ? "once" : "cron",
                    detail: once
                      ? `Reminder set for ${fmtDate(when)}. It fires even if you close the app.`
                      : `Schedule created${when ? ` — next run ${fmtDate(when)}` : ""}.`,
                  });
                }
              } catch {
                /* a failed create is already visible in the tool chip */
              }
            }
            break;
          }

          case "approval_request":
            setApproval({
              approvalId: payload.approvalId,
              toolCallId: payload.toolCallId,
              name: payload.name,
              args: payload.args,
              risk: payload.risk,
            });
            setStatus("awaiting_approval");
            break;

          case "todo":
            setTodos(Array.isArray(payload.items) ? payload.items : []);
            break;

          case "clarify":
            setClarify({
              question: String(payload.question ?? ""),
              options: Array.isArray(payload.options) ? payload.options : [],
            });
            break;

          case "usage":
            setTokens(Number(payload.total ?? 0));
            break;

          case "provider_error":
            setNotice(`${payload.provider}: ${payload.message}`);
            break;

          case "error":
            setError(String(payload.message ?? "The run failed."));
            setStreaming(false);
            setStatus("failed");
            break;

          case "done":
            setStreaming(false);
            setStatus("completed");
            break;

          case "cancelled":
            setStreaming(false);
            setStatus("cancelled");
            break;
        }
      };

      es.onerror = () => {
        setDisconnected(true);
      };

      es.addEventListener("end", () => {
        es.close();
        esRef.current = null;
        setDisconnected(false);
        setStreaming(false);
        setApproval(null);
        void refresh();
      });
    },
    [refresh],
  );

  useEffect(() => {
    if (initialRunId) {
      runRef.current = initialRunId;
      openStream(initialRunId, initialCursor);
    }
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, todos.length, approval, clarify, scrollToBottom]);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || streaming) return;

    setError(null);
    setNotice(null);
    setClarify(null);
    setStreaming(true);
    setStatus("queued");
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setMessages((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
        tools: [],
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionRef.current, message: text }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not start the run.");
        setStreaming(false);
        return;
      }

      if (!sessionRef.current) {
        sessionRef.current = json.sessionId;
        setSessionId(json.sessionId);
        window.history.replaceState(null, "", `/chat/${json.sessionId}`);
        router.refresh();
      }

      runRef.current = json.runId;
      setRunId(json.runId);
      cursorRef.current = 0;
      openStream(json.runId, 0);
    } catch {
      setError("Network error. Is the server awake?");
      setStreaming(false);
    }
  }

  async function stop() {
    const id = runRef.current;
    if (!id) return;
    await fetch(`/api/runs/${id}/cancel`, { method: "POST" });
  }

  async function decide(decision: "approved" | "rejected") {
    if (!approval) return;
    setDeciding(true);
    const current = approval;
    setApproval(null);
    try {
      await fetch(`/api/approvals/${current.approvalId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      setStatus("running");
      setStreaming(true);
      if (!esRef.current && runRef.current) {
        openStream(runRef.current, cursorRef.current);
      }
    } finally {
      setDeciding(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.66rem] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            {initialSessionId ? "Session" : "New task"}
          </p>
          <h1 className="display mt-1 truncate text-[1.6rem] sm:text-[1.9rem]">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {tokens > 0 && <span className="chip hidden sm:inline-flex">{num(tokens)} tokens</span>}
          {status && <StatusChip status={status} />}
          <Link href="/chat" className="btn btn-sm">
            New
          </Link>
        </div>
      </div>

      {disconnected && (
        <div className="mb-3 rounded-[12px] border border-[var(--hairline)] bg-[var(--butter)] px-3 py-2 text-[0.75rem] text-[var(--butter-ink)]">
          Reconnecting to the run… the agent keeps working on the server.
        </div>
      )}

      {notice && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-[0.75rem] text-[var(--ink-muted)]">
          <span className="min-w-0 break-words">{notice}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 text-[var(--ink-faint)]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {todos.length > 0 && (
        <div className="card mb-4 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[0.7rem] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Plan</p>
            <span className="chip">
              {todos.filter((t) => t.status === "done").length}/{todos.length}
            </span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {todos.map((todo, i) => (
              <li key={i} className="flex items-start gap-2 text-[0.82rem]">
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    todo.status === "done"
                      ? "border-[var(--ok)] bg-[var(--ok)] text-white"
                      : todo.status === "in_progress"
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-[var(--hairline-strong)]",
                  )}
                >
                  {todo.status === "done" ? (
                    <Check className="h-2.5 w-2.5" />
                  ) : todo.status === "in_progress" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  ) : null}
                </span>
                <span
                  className={cn(
                    todo.status === "done" && "text-[var(--ink-faint)] line-through",
                    todo.status === "in_progress" && "font-medium",
                  )}
                >
                  {todo.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 space-y-6">
        {empty && !streaming ? (
          <div className="pt-6 sm:pt-10">
            <p className="text-[0.68rem] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
              Pocket Agent
            </p>
            <h2 className="display mt-3 max-w-[18ch] text-[clamp(2.2rem,5vw,3.4rem)]">
              What should I take care of?
            </h2>
            <p className="mt-3 max-w-[52ch] text-[0.9rem] leading-relaxed text-[var(--ink-muted)]">
              I can search, read, write files, run commands (with your approval), remember
              things, and turn good work into reusable skills.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  onClick={() => void send(s.prompt)}
                  className="group rounded-[var(--r-lg)] border border-[var(--hairline)] p-4 text-left transition-transform hover:-translate-y-0.5"
                  style={{ background: s.tone }}
                >
                  <Sparkles className="h-4 w-4 opacity-60" />
                  <p className="mt-3 text-[0.85rem] font-medium">{s.title}</p>
                  <p className="mt-1 line-clamp-3 text-[0.74rem] leading-relaxed opacity-75">
                    {s.prompt}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => <MessageRow key={message.id} message={message} />)
        )}

        {streaming && !approval && (
          <div className="flex items-center gap-2 pl-10 text-[0.75rem] text-[var(--ink-muted)]">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            <span className="pulse-dot text-[var(--accent)]">working</span>
            <button onClick={stop} className="ml-2 text-[var(--ink-faint)] underline-offset-2 hover:underline">
              stop
            </button>
          </div>
        )}

        {approval && (
          <div className="card border-[var(--hairline-strong)] p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--butter)] text-[var(--butter-ink)]">
                <ShieldAlert className="h-4 w-4" />
              </span>
              <p className="text-[0.85rem] font-medium">Approval needed</p>
              <span className="chip chip-butter ml-auto">{approval.risk}</span>
            </div>
            <p className="mt-3 text-[0.82rem] text-[var(--ink-muted)]">
              The agent wants to run <span className="font-medium text-[var(--ink)]">{approval.name}</span>.
            </p>
            <pre className="mt-2 max-h-40 overflow-auto rounded-[10px] bg-[var(--surface-3)] p-3 font-mono text-[0.7rem] leading-relaxed">
              {JSON.stringify(approval.args, null, 2)}
            </pre>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => void decide("approved")}
                disabled={deciding}
                className="btn btn-primary btn-sm"
              >
                <Check className="h-3.5 w-3.5" /> Approve
              </button>
              <button
                onClick={() => void decide("rejected")}
                disabled={deciding}
                className="btn btn-danger btn-sm"
              >
                <X className="h-3.5 w-3.5" /> Reject
              </button>
              <span className="ml-auto text-[0.68rem] text-[var(--ink-faint)]">
                The run is paused until you decide.
              </span>
            </div>
          </div>
        )}

        {clarify && (
          <div className="card border-[var(--hairline)] bg-[var(--lavender)] p-4 sm:p-5">
            <p className="text-[0.7rem] uppercase tracking-[0.14em] text-[var(--lavender-ink)]/70">
              The agent needs one detail
            </p>
            <p className="mt-2 text-[0.9rem] font-medium text-[var(--lavender-ink)]">
              {clarify.question}
            </p>
            {clarify.options.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {clarify.options.map((option) => (
                  <button
                    key={option}
                    onClick={() => void send(option)}
                    className="btn btn-sm"
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-[12px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-[0.8rem] text-[var(--danger)]">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-6 px-4 pb-2 pt-2 sm:-mx-6 sm:px-6 lg:bottom-0 lg:-mx-8 lg:px-8">
        <div className="mx-auto max-w-[860px]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="card flex items-end gap-2 p-2"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={streaming ? "Working… you can stop or wait" : "Ask anything, or give a task…"}
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.88rem] leading-relaxed outline-none placeholder:text-[var(--ink-faint)]"
            />
            {streaming ? (
              <button
                type="button"
                onClick={stop}
                className="btn btn-sm h-9 shrink-0"
                title="Stop the run"
              >
                <CircleStop className="h-4 w-4" /> Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={input.trim().length === 0}
                className="btn btn-primary h-9 w-9 shrink-0 rounded-full p-0"
                aria-label="Send"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </form>
          <p className="mt-1.5 hidden text-center text-[0.64rem] text-[var(--ink-faint)] sm:block">
            Enter to send · Shift+Enter for a new line · runs continue if you close this tab
          </p>
        </div>
      </div>

    </div>
  );
}

function MessageRow({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] whitespace-pre-wrap rounded-[18px] rounded-br-[6px] bg-[var(--surface-3)] px-4 py-2.5 text-[0.88rem] leading-relaxed sm:max-w-[75%]">
          {message.content}
        </div>
      </div>
    );
  }

  if (!message.content && message.tools.length === 0) return null;

  return (
    <div className="fade-in flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--surface)]">
        <Mark className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {message.content && <Markdown text={message.content} />}
        {message.tools.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.tools.map((tool) => (
              <ToolRow key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolRow({ tool }: { tool: UITool }) {
  const pending = tool.result === undefined;
  return (
    <details className="group rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-2)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[0.75rem]">
        <Wrench className="h-3.5 w-3.5 text-[var(--ink-faint)]" />
        <span className="font-medium">{tool.name}</span>
        {pending ? (
          <LoaderCircle className="h-3 w-3 animate-spin text-[var(--ink-faint)]" />
        ) : (
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              tool.ok ? "bg-[var(--ok)]" : "bg-[var(--danger)]",
            )}
          />
        )}
        {tool.durationMs !== undefined && (
          <span className="text-[0.65rem] text-[var(--ink-faint)]">
            {(tool.durationMs / 1000).toFixed(1)}s
          </span>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 text-[var(--ink-faint)] transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-[var(--hairline)] px-3 py-2">
        <div>
          <p className="text-[0.62rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">Input</p>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[0.68rem] leading-relaxed text-[var(--ink-muted)]">
            {JSON.stringify(tool.args, null, 2)}
          </pre>
        </div>
        {tool.result !== undefined && (
          <div>
            <p className="text-[0.62rem] uppercase tracking-[0.12em] text-[var(--ink-faint)]">Output</p>
            <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[0.68rem] leading-relaxed text-[var(--ink-muted)]">
              {tool.result}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}
