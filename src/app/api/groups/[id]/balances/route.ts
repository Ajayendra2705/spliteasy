import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireMembership } from "@/lib/groups";
import { handle } from "@/lib/http";
import { computeBalances } from "@/lib/balances";

type Params = { params: { id: string } };

// GET /api/groups/:id/balances - net balance per member + simplified debts.
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    await requireMembership(params.id, user.id);

    const [members, expenses, settlements] = await Promise.all([
      prisma.groupMember.findMany({
        where: { groupId: params.id },
        include: { user: { select: { id: true, name: true } } },
      }),
      prisma.expense.findMany({
        where: { groupId: params.id },
        select: { paidById: true, amount: true, splits: { select: { userId: true, amount: true } } },
      }),
      prisma.settlement.findMany({
        where: { groupId: params.id },
        select: { fromUserId: true, toUserId: true, amount: true },
      }),
    ]);

    const result = computeBalances(
      members.map((m) => ({ id: m.user.id, name: m.user.name })),
      expenses.map((e) => ({
        paidById: e.paidById,
        amount: Number(e.amount),
        splits: e.splits.map((s) => ({ userId: s.userId, amount: Number(s.amount) })),
      })),
      settlements.map((s) => ({
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
        amount: Number(s.amount),
      }))
    );
    return result;
  });
}
