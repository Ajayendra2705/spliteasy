import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, requireUser } from "@/lib/auth";
import { requireMembership } from "@/lib/groups";
import { handle } from "@/lib/http";

type Params = { params: { id: string } };

// GET /api/groups/:id/settlements - list recorded payments.
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const settlements = await prisma.settlement.findMany({
      where: { groupId: params.id },
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      },
    });
    return { settlements };
  });
}

const createSchema = z.object({
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1),
  amount: z.number().positive("Amount must be greater than zero"),
  note: z.string().trim().max(140).optional(),
});

// POST /api/groups/:id/settlements - record a payment between two members.
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const body = createSchema.parse(await req.json());

    if (body.fromUserId === body.toUserId) {
      throw new ApiError(400, "Payer and receiver must be different members");
    }
    await Promise.all([
      requireMembership(params.id, body.fromUserId),
      requireMembership(params.id, body.toUserId),
    ]);

    const settlement = await prisma.settlement.create({
      data: {
        groupId: params.id,
        fromUserId: body.fromUserId,
        toUserId: body.toUserId,
        amount: body.amount,
        note: body.note,
      },
    });
    return { settlement };
  });
}
