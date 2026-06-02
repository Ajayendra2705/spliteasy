import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, requireUser } from "@/lib/auth";
import { requireMembership } from "@/lib/groups";
import { handle } from "@/lib/http";

type Params = { params: { id: string } };

// GET /api/groups/:id/members - list members.
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const members = await prisma.groupMember.findMany({
      where: { groupId: params.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { joinedAt: "asc" },
    });
    return { members };
  });
}

const addSchema = z.object({
  email: z.string().trim().toLowerCase().email("Valid email is required"),
});

// POST /api/groups/:id/members - add or invite a member by email.
// If the email already has an account, they are added immediately. If not, a
// pending invitation is created; they join automatically when they sign up.
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const { email } = addSchema.parse(await req.json());

    const invitee = await prisma.user.findUnique({ where: { email } });

    // Existing user → add directly.
    if (invitee) {
      const exists = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: params.id, userId: invitee.id } },
      });
      if (exists) throw new ApiError(409, "That user is already in this group");

      const member = await prisma.groupMember.create({
        data: { groupId: params.id, userId: invitee.id, role: "member" },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      return { status: "added", member };
    }

    // No account yet → create / refresh a pending invitation.
    const existing = await prisma.invitation.findUnique({
      where: { groupId_email: { groupId: params.id, email } },
    });
    if (existing?.status === "pending") {
      throw new ApiError(409, "That email has already been invited");
    }
    const invitation = await prisma.invitation.upsert({
      where: { groupId_email: { groupId: params.id, email } },
      update: { status: "pending", invitedById: user.id, createdAt: new Date() },
      create: { groupId: params.id, email, invitedById: user.id },
    });
    return { status: "invited", invitation };
  });
}
