"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type Group = {
  id: string;
  name: string;
  _count: { members: number; expenses: number };
};

export default function GroupsClient() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const { groups } = await api<{ groups: Group[] }>("/groups");
      setGroups(groups);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/groups", { method: "POST", body: { name } });
      setName("");
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your groups</h1>
      </div>

      <form onSubmit={createGroup} className="card flex gap-3">
        <input
          className="input"
          placeholder="New group name (e.g. Goa Trip)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button className="btn-primary whitespace-nowrap">Create group</button>
      </form>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="card text-center text-slate-500">
          No groups yet. Create one above to start splitting expenses.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/groups/${g.id}`} className="card block transition hover:shadow-md">
                <h3 className="text-lg font-semibold">{g.name}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {g._count.members} member{g._count.members !== 1 ? "s" : ""} ·{" "}
                  {g._count.expenses} expense{g._count.expenses !== 1 ? "s" : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
