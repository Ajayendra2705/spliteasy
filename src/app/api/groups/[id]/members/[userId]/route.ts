import { prisma } from "@/lib/prisma";
import { ApiError, requireUser } from "@/lib/auth";
import { requireMembership } from "@/lib/groups";
import { handle } from "@/lib/http";

type Params = { params: { id: string; userId: string } };

// DELETE /api/groups/:id/members/:userId - remove a member.
// Admins can remove anyone; members can remove themselves (leave).
// A member who has expenses/splits cannot be removed (would break balances).
export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const membership = await requireMembership(params.id, user.id);

    const isSelf = params.userId === user.id;
    if (!isSelf && membership.role !== "admin") {
      throw new ApiError(403, "Only an admin can remove other members");
    }

    const target = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: params.id, userId: params.userId } },
    });
    if (!target) throw new ApiError(404, "That user is not a member of this group");

    const [paidCount, splitCount, settleCount] = await Promise.all([
      prisma.expense.count({ where: { groupId: params.id, paidById: params.userId } }),
      prisma.expenseSplit.count({
        where: { userId: params.userId, expense: { groupId: params.id } },
      }),
      prisma.settlement.count({
        where: {
          groupId: params.id,
          OR: [{ fromUserId: params.userId }, { toUserId: params.userId }],
        },
      }),
    ]);
    if (paidCount + splitCount + settleCount > 0) {
      throw new ApiError(
        409,
        "Cannot remove a member once they have expenses or payments in this group. The group's balances are calculated from that history, so members can only be removed before they take part in any shared costs."
      );
    }

    await prisma.groupMember.delete({
      where: { groupId_userId: { groupId: params.id, userId: params.userId } },
    });
    return { ok: true };
  });
}
