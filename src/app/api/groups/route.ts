import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";

// GET /api/groups - list groups the current user belongs to.
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const groups = await prisma.group.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { members: true, expenses: true } },
      },
    });
    return { groups };
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Group name is required").max(80),
});

// POST /api/groups - create a group; creator becomes admin member.
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { name } = createSchema.parse(await req.json());

    const group = await prisma.group.create({
      data: {
        name,
        createdById: user.id,
        members: { create: { userId: user.id, role: "admin" } },
      },
    });
    return { group };
  });
}
