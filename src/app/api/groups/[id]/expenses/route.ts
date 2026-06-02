import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, requireUser } from "@/lib/auth";
import { requireMembership } from "@/lib/groups";
import { handle } from "@/lib/http";
import { computeSplits } from "@/lib/splits";

type Params = { params: { id: string } };

// GET /api/groups/:id/expenses - list expenses with splits + chat counts.
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    await requireMembership(params.id, user.id);

    const expenses = await prisma.expense.findMany({
      where: { groupId: params.id },
      orderBy: { createdAt: "desc" },
      include: {
        paidBy: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } },
        _count: { select: { messages: true } },
      },
    });
    return { expenses };
  });
}

const createSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(120),
  amount: z.number().positive("Amount must be greater than zero"),
  paidById: z.string().min(1, "Payer is required"),
  splitType: z.enum(["EQUAL", "UNEQUAL", "PERCENTAGE", "SHARE"]),
  participants: z
    .array(z.object({ userId: z.string().min(1), value: z.number().optional() }))
    .min(1, "Select at least one participant"),
});

// POST /api/groups/:id/expenses - create an expense and its computed splits.
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const body = createSchema.parse(await req.json());

    // Validate every referenced user is a member of this group.
    const members = await prisma.groupMember.findMany({
      where: { groupId: params.id },
      select: { userId: true },
    });
    const memberIds = new Set(members.map((m) => m.userId));
    if (!memberIds.has(body.paidById)) throw new ApiError(400, "Payer must be a group member");
    for (const p of body.participants) {
      if (!memberIds.has(p.userId)) throw new ApiError(400, "All participants must be group members");
    }

    // Split math validates inputs (e.g. amounts must sum to the total); surface
    // those as 400s rather than letting them bubble up as 500s.
    let computed: ReturnType<typeof computeSplits>;
    try {
      computed = computeSplits(body.amount, body.splitType, body.participants);
    } catch (e) {
      throw new ApiError(400, e instanceof Error ? e.message : "Invalid split");
    }

    const expense = await prisma.expense.create({
      data: {
        groupId: params.id,
        description: body.description,
        amount: body.amount,
        splitType: body.splitType,
        paidById: body.paidById,
        createdById: user.id,
        splits: {
          create: computed.map((c) => ({
            userId: c.userId,
            amount: c.amount,
            weight: c.weight,
          })),
        },
      },
      include: { splits: true },
    });
    return { expense };
  });
}
