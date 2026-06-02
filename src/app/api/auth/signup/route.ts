import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, hashPassword, setSessionCookie, signToken } from "@/lib/auth";
import { handle } from "@/lib/http";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Valid email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function POST(req: Request) {
  return handle(async () => {
    const { name, email, password } = schema.parse(await req.json());

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ApiError(409, "An account with this email already exists");

    const user = await prisma.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
      select: { id: true, name: true, email: true },
    });

    // Auto-accept any pending group invitations addressed to this email.
    const pending = await prisma.invitation.findMany({
      where: { email, status: "pending" },
    });
    if (pending.length) {
      await prisma.$transaction([
        ...pending.map((inv) =>
          prisma.groupMember.upsert({
            where: { groupId_userId: { groupId: inv.groupId, userId: user.id } },
            update: {},
            create: { groupId: inv.groupId, userId: user.id, role: "member" },
          })
        ),
        prisma.invitation.updateMany({
          where: { email, status: "pending" },
          data: { status: "accepted" },
        }),
      ]);
    }

    setSessionCookie(signToken(user.id));
    return { user };
  });
}
