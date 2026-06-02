import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireMembership } from "@/lib/groups";
import { handle } from "@/lib/http";

type Params = { params: { id: string } };

// GET /api/groups/:id/invitations - pending invitations for this group.
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const invitations = await prisma.invitation.findMany({
      where: { groupId: params.id, status: "pending" },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, createdAt: true },
    });
    return { invitations };
  });
}
