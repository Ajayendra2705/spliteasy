import { clearSessionCookie } from "@/lib/auth";
import { handle } from "@/lib/http";

export async function POST() {
  return handle(async () => {
    clearSessionCookie();
    return { ok: true };
  });
}
