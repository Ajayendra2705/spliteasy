import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, requireUser } from "@/lib/auth";
import { requireMembership } from "@/lib/groups";
import { handle } from "@/lib/http";
import { computeSplits } from "@/lib/splits";

type Params = { params: { id: string } };

// GET /api/expenses/:id - expense detail with splits.
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const expense = await prisma.expense.findUnique({
      where: { id: params.id },
      include: {
        paidBy: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    if (!expense) throw new ApiError(404, "Expense not found");
    await requireMembership(expense.groupId, user.id);
    return { expense };
  });
}

const updateSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(120),
  amount: z.number().positive("Amount must be greater than zero"),
  paidById: z.string().min(1, "Payer is required"),
  splitType: z.enum(["EQUAL", "UNEQUAL", "PERCENTAGE", "SHARE"]),
  participants: z
    .array(z.object({ userId: z.string().min(1), value: z.number().optional() }))
    .min(1, "Select at least one participant"),
});

// PATCH /api/expenses/:id - edit an expense; its splits are fully recomputed.
export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const expense = await prisma.expense.findUnique({ where: { id: params.id } });
    if (!expense) throw new ApiError(404, "Expense not found");
    await requireMembership(expense.groupId, user.id);

    const body = updateSchema.parse(await req.json());

    // Every referenced user must be a member of the expense's group.
    const members = await prisma.groupMember.findMany({
      where: { groupId: expense.groupId },
      select: { userId: true },
    });
    const memberIds = new Set(members.map((m) => m.userId));
    if (!memberIds.has(body.paidById)) throw new ApiError(400, "Payer must be a group member");
    for (const p of body.participants) {
      if (!memberIds.has(p.userId)) throw new ApiError(400, "All participants must be group members");
    }

    let computed: ReturnType<typeof computeSplits>;
    try {
      computed = computeSplits(body.amount, body.splitType, body.participants);
    } catch (e) {
      throw new ApiError(400, e instanceof Error ? e.message : "Invalid split");
    }

    // Replace the splits and update the expense in one transaction.
    await prisma.$transaction([
      prisma.expenseSplit.deleteMany({ where: { expenseId: params.id } }),
      prisma.expense.update({
        where: { id: params.id },
        data: {
          description: body.description,
          amount: body.amount,
          splitType: body.splitType,
          paidById: body.paidById,
          splits: {
            create: computed.map((c) => ({
              userId: c.userId,
              amount: c.amount,
              weight: c.weight,
            })),
          },
        },
      }),
    ]);
    return { ok: true };
  });
}

// DELETE /api/expenses/:id - remove an expense (any group member).
export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const expense = await prisma.expense.findUnique({ where: { id: params.id } });
    if (!expense) throw new ApiError(404, "Expense not found");
    await requireMembership(expense.groupId, user.id);
    await prisma.expense.delete({ where: { id: params.id } });
    return { ok: true };
  });
}
