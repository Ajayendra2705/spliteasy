import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, requireUser } from "@/lib/auth";
import { requireMembership } from "@/lib/groups";
import { handle } from "@/lib/http";

type Params = { params: { id: string } };

const renameSchema = z.object({
  name: z.string().trim().min(1, "Group name is required").max(80),
});

// PATCH /api/groups/:id - rename the group (any member).
export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const { name } = renameSchema.parse(await req.json());
    const group = await prisma.group.update({ where: { id: params.id }, data: { name } });
    return { group };
  });
}

// GET /api/groups/:id - group detail with members.
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    await requireMembership(params.id, user.id);

    const group = await prisma.group.findUnique({
      where: { id: params.id },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { joinedAt: "asc" },
        },
      },
    });
    if (!group) throw new ApiError(404, "Group not found");
    return { group };
  });
}

// DELETE /api/groups/:id - only the creator/admin can delete.
export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const membership = await requireMembership(params.id, user.id);
    if (membership.role !== "admin") throw new ApiError(403, "Only an admin can delete the group");

    await prisma.group.delete({ where: { id: params.id } });
    return { ok: true };
  });
}
