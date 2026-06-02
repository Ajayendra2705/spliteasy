import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, setSessionCookie, signToken, verifyPassword } from "@/lib/auth";
import { handle } from "@/lib/http";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: Request) {
  return handle(async () => {
    const { email, password } = schema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new ApiError(401, "Invalid email or password");
    }

    setSessionCookie(signToken(user.id));
    return { user: { id: user.id, name: user.name, email: user.email } };
  });
}
