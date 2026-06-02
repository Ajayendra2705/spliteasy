import { prisma } from "./prisma";
import { ApiError } from "./auth";

// Ensure the user is a member of the group; returns the membership row.
export async function requireMembership(groupId: string, userId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) throw new ApiError(403, "You are not a member of this group");
  return membership;
}
