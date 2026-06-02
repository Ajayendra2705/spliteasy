import { prisma } from "@/lib/prisma";
import { ApiError, requireUser } from "@/lib/auth";
import { requireMembership } from "@/lib/groups";
import { handle } from "@/lib/http";

type Params = { params: { id: string; invId: string } };

// DELETE /api/groups/:id/invitations/:invId - cancel a pending invitation.
export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    await requireMembership(params.id, user.id);

    const invitation = await prisma.invitation.findUnique({ where: { id: params.invId } });
    if (!invitation || invitation.groupId !== params.id) {
      throw new ApiError(404, "Invitation not found");
    }
    await prisma.invitation.delete({ where: { id: params.invId } });
    return { ok: true };
  });
}
