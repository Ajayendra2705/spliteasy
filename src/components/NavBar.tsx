"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export default function NavBar({ userName }: { userName?: string }) {
  const router = useRouter();

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-bold text-brand">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-white">S</span>
          SplitEasy
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {userName && <span className="text-slate-500">Hi, {userName}</span>}
          <button onClick={logout} className="btn-ghost">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
