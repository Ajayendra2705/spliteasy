import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./auth";

// Wrap an API handler so thrown ApiError / ZodError become clean JSON responses.
export function handle<T>(fn: () => Promise<T>) {
  return fn()
    .then((data) => NextResponse.json(data ?? { ok: true }))
    .catch((err: unknown) => {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: err.errors.map((e) => e.message).join(", ") },
          { status: 400 }
        );
      }
      console.error(err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    });
}
