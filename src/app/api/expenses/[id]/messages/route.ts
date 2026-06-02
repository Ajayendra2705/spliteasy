import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, requireUser } from "@/lib/auth";
import { requireMembership } from "@/lib/groups";
import { handle } from "@/lib/http";

type Params = { params: { id: string } };

// Resolve the expense and confirm the caller is a member of its group.
async function loadExpenseForUser(expenseId: string, userId: string) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: { id: true, groupId: true },
  });
  if (!expense) throw new ApiError(404, "Expense not found");
  await requireMembership(expense.groupId, userId);
  return expense;
}

// GET /api/expenses/:id/messages?after=<iso> - chat messages, optionally only
// those created after a timestamp (used by the client poll for live updates).
export async function GET(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    await loadExpenseForUser(params.id, user.id);

    const after = new URL(req.url).searchParams.get("after");
    const messages = await prisma.message.findMany({
      where: {
        expenseId: params.id,
        ...(after ? { createdAt: { gt: new Date(after) } } : {}),
      },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true } } },
    });
    return { messages };
  });
}

const postSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(1000),
});

// POST /api/expenses/:id/messages - send a chat message.
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    await loadExpenseForUser(params.id, user.id);
    const { body } = postSchema.parse(await req.json());

    const message = await prisma.message.create({
      data: { expenseId: params.id, userId: user.id, body },
      include: { user: { select: { id: true, name: true } } },
    });
    return { message };
  });
}
