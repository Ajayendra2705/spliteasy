import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Server-Sent Events stream for an expense's chat. The client connects with an
// EventSource; the server pushes each new message as it appears. This makes the
// chat genuinely real-time (push, not client polling).
//
// On serverless the function has a max lifetime, so the stream self-closes a bit
// before that and the browser's EventSource transparently reconnects, sending the
// `Last-Event-ID` header so we resume exactly where we left off (no gaps, no dupes).

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TICK_MS = 1000; // how often we look for new messages
const CLOSE_AFTER_MS = 25_000; // self-close before the serverless limit; client reconnects

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const expense = await prisma.expense.findUnique({
    where: { id: params.id },
    select: { id: true, groupId: true },
  });
  if (!expense) return new Response("Not found", { status: 404 });

  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: expense.groupId, userId: user.id } },
  });
  if (!member) return new Response("Forbidden", { status: 403 });

  // Resume point: the EventSource sends Last-Event-ID on reconnect; first connect
  // may pass ?after=<iso>. Null means "send everything so far, then stream".
  const lastEventId = req.headers.get("last-event-id") || new URL(req.url).searchParams.get("after");
  let cursor: Date | null = lastEventId ? new Date(lastEventId) : null;

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let closer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const stop = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        if (closer) clearTimeout(closer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };

      const tick = async () => {
        if (closed) return;
        try {
          const rows = await prisma.message.findMany({
            where: { expenseId: params.id, ...(cursor ? { createdAt: { gt: cursor } } : {}) },
            orderBy: { createdAt: "asc" },
            include: { user: { select: { id: true, name: true } } },
          });
          for (const m of rows) {
            const id = new Date(m.createdAt).toISOString();
            safeEnqueue(`id: ${id}\nevent: message\ndata: ${JSON.stringify(m)}\n\n`);
            cursor = m.createdAt;
          }
          safeEnqueue(`: keep-alive\n\n`); // heartbeat so proxies don't drop the connection
        } catch {
          /* transient DB error - try again next tick */
        }
      };

      // Close the stream if the client disconnects.
      req.signal.addEventListener("abort", stop);

      await tick(); // immediately send the backlog (or nothing on a fresh expense)
      timer = setInterval(tick, TICK_MS);
      closer = setTimeout(stop, CLOSE_AFTER_MS);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
      if (closer) clearTimeout(closer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable proxy buffering so events flush immediately
    },
  });
}
