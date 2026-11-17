import { and, asc, eq, gt } from "drizzle-orm";
import { getDb, runEvents, runs } from "@pocket/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const lastEventId = request.headers.get("last-event-id");
  let cursor = Number(url.searchParams.get("after") ?? lastEventId ?? 0);
  if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

  const db = getDb();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const abort = () => {
        closed = true;
      };
      request.signal.addEventListener("abort", abort);

      const send = (chunk: string) => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          closed = true;
          return false;
        }
      };

      send("retry: 2000\n\n");

      let idleTicks = 0;
      try {
        while (!closed) {
          const events = await db
            .select()
            .from(runEvents)
            .where(and(eq(runEvents.runId, id), gt(runEvents.id, cursor)))
            .orderBy(asc(runEvents.id))
            .limit(200);

          for (const event of events) {
            cursor = event.id;
            const ok = send(
              `id: ${event.id}\ndata: ${JSON.stringify({
                id: event.id,
                type: event.type,
                payload: event.payload,
              })}\n\n`,
            );
            if (!ok) break;
          }

          const [run] = await db
            .select({ status: runs.status })
            .from(runs)
            .where(eq(runs.id, id))
            .limit(1);

          if (!run) {
            send(`event: end\ndata: ${JSON.stringify({ status: "missing" })}\n\n`);
            break;
          }

          if (["completed", "failed", "cancelled"].includes(run.status) && events.length === 0) {
            send(`event: end\ndata: ${JSON.stringify({ status: run.status })}\n\n`);
            break;
          }

          if (events.length === 0) {
            idleTicks += 1;
            if (idleTicks % 30 === 0) send(": ping\n\n");
          } else {
            idleTicks = 0;
          }

          await sleep(400);
        }
      } catch (error) {
        console.error("[stream]", error);
        send(`event: end\ndata: ${JSON.stringify({ status: "error" })}\n\n`);
      } finally {
        request.signal.removeEventListener("abort", abort);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
