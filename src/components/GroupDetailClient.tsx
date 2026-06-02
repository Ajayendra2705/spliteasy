"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, money } from "@/lib/client";
import AddExpenseForm from "./AddExpenseForm";

type Member = { user: { id: string; name: string; email: string }; role: string };
type Group = { id: string; name: string; createdById: string; members: Member[] };
type Balance = { userId: string; name: string; paid: number; owed: number; net: number };
type Debt = { fromUserId: string; toUserId: string; amount: number };
type Expense = {
  id: string;
  description: string;
  amount: string;
  splitType: string;
  createdAt: string;
  paidBy: { id: string; name: string };
  _count: { messages: number };
};
type Settlement = {
  id: string;
  amount: string;
  note: string | null;
  createdAt: string;
  fromUser: { id: string; name: string };
  toUser: { id: string; name: string };
};

const nameOf = (members: Member[], id: string) =>
  members.find((m) => m.user.id === id)?.user.name ?? "Someone";

export default function GroupDetailClient({
  groupId,
  currentUserId,
}: {
  groupId: string;
  currentUserId: string;
}) {
  const [group, setGroup] = useState<Group | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [invitations, setInvitations] = useState<{ id: string; email: string }[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    try {
      const [g, b, e, s, inv] = await Promise.all([
        api<{ group: Group }>(`/groups/${groupId}`),
        api<{ balances: Balance[]; debts: Debt[] }>(`/groups/${groupId}/balances`),
        api<{ expenses: Expense[] }>(`/groups/${groupId}/expenses`),
        api<{ settlements: Settlement[] }>(`/groups/${groupId}/settlements`),
        api<{ invitations: { id: string; email: string }[] }>(`/groups/${groupId}/invitations`),
      ]);
      setGroup(g.group);
      setBalances(b.balances);
      setDebts(b.debts);
      setExpenses(e.expenses);
      setSettlements(s.settlements);
      setInvitations(inv.invitations);
    } catch (err: any) {
      setError(err.message);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const res = await api<{ status: string }>(`/groups/${groupId}/members`, {
        method: "POST",
        body: { email: inviteEmail },
      });
      setNotice(
        res.status === "invited"
          ? `Invitation sent to ${inviteEmail}. They'll join automatically when they sign up.`
          : `Added ${inviteEmail} to the group.`
      );
      setInviteEmail("");
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function cancelInvite(invId: string) {
    setError("");
    try {
      await api(`/groups/${groupId}/invitations/${invId}`, { method: "DELETE" });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(`/groups/${groupId}`, { method: "PATCH", body: { name: newName } });
      setRenaming(false);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member from the group?")) return;
    setError("");
    try {
      await api(`/groups/${groupId}/members/${userId}`, { method: "DELETE" });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function settleDebt(debt: Debt) {
    if (!confirm(`Record payment of ${money(debt.amount)}?`)) return;
    setError("");
    try {
      await api(`/groups/${groupId}/settlements`, {
        method: "POST",
        body: { fromUserId: debt.fromUserId, toUserId: debt.toUserId, amount: debt.amount },
      });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (!group) {
    return <p className="text-slate-500">{error || "Loading…"}</p>;
  }

  const members = group.members;
  const isAdmin = members.find((m) => m.user.id === currentUserId)?.role === "admin";
  const myBalance = balances.find((b) => b.userId === currentUserId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-brand hover:underline">
            ← All groups
          </Link>
          {renaming ? (
            <form onSubmit={rename} className="mt-1 flex gap-2">
              <input
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                required
              />
              <button className="btn-primary whitespace-nowrap">Save</button>
              <button type="button" className="btn-ghost" onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{group.name}</h1>
              <button
                className="text-xs text-brand hover:underline"
                onClick={() => {
                  setNewName(group.name);
                  setRenaming(true);
                }}
              >
                Rename
              </button>
            </div>
          )}
        </div>
        <button className="btn-primary" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Close" : "+ Add expense"}
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {myBalance && (
        <div
          className={`card ${
            myBalance.net >= 0 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
          }`}
        >
          <p className="text-sm text-slate-600">Your overall balance in this group</p>
          <p
            className={`text-2xl font-bold ${
              myBalance.net >= 0 ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            {myBalance.net >= 0
              ? `You are owed ${money(myBalance.net)}`
              : `You owe ${money(-myBalance.net)}`}
          </p>
        </div>
      )}

      {showAdd && (
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Add an expense</h2>
          <AddExpenseForm
            groupId={groupId}
            currentUserId={currentUserId}
            members={members.map((m) => ({ id: m.user.id, name: m.user.name }))}
            onCreated={() => {
              setShowAdd(false);
              load();
            }}
          />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Balances */}
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">Balances</h2>
          <ul className="space-y-1 text-sm">
            {balances.map((b) => (
              <li key={b.userId} className="flex justify-between">
                <span>{b.name}</span>
                <span
                  className={
                    b.net > 0 ? "text-emerald-600" : b.net < 0 ? "text-amber-600" : "text-slate-400"
                  }
                >
                  {b.net > 0
                    ? `is owed ${money(b.net)}`
                    : b.net < 0
                    ? `owes ${money(-b.net)}`
                    : "settled up"}
                </span>
              </li>
            ))}
          </ul>

          <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-600">Suggested settle-up</h3>
          {debts.length === 0 ? (
            <p className="text-sm text-slate-400">Everyone is settled up 🎉</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {debts.map((d, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span>
                    <b>{nameOf(members, d.fromUserId)}</b> → <b>{nameOf(members, d.toUserId)}</b>{" "}
                    {money(d.amount)}
                  </span>
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => settleDebt(d)}>
                    Record payment
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Members */}
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">Members</h2>
          <ul className="space-y-2 text-sm">
            {members.map((m) => (
              <li key={m.user.id} className="flex items-center justify-between">
                <span>
                  {m.user.name}
                  {m.role === "admin" && (
                    <span className="ml-2 rounded bg-brand-light px-1.5 py-0.5 text-xs text-brand-dark">
                      admin
                    </span>
                  )}
                  <span className="ml-2 text-xs text-slate-400">{m.user.email}</span>
                </span>
                {(isAdmin || m.user.id === currentUserId) && members.length > 1 && (
                  <button
                    className="text-xs text-red-500 hover:underline"
                    onClick={() => removeMember(m.user.id)}
                  >
                    {m.user.id === currentUserId ? "Leave" : "Remove"}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {invitations.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-600">Pending invites</h3>
              <ul className="space-y-2 text-sm">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between">
                    <span className="text-slate-500">
                      {inv.email}
                      <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                        invited
                      </span>
                    </span>
                    <button
                      className="text-xs text-red-500 hover:underline"
                      onClick={() => cancelInvite(inv.id)}
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <form onSubmit={addMember} className="mt-4 flex gap-2">
            <input
              className="input"
              type="email"
              placeholder="Add or invite by email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
            <button className="btn-ghost whitespace-nowrap">Add</button>
          </form>
          {notice && <p className="mt-2 text-xs text-emerald-600">{notice}</p>}
          <p className="mt-1 text-xs text-slate-400">
            No account yet? They'll be invited and join automatically on sign-up.
          </p>
        </section>
      </div>

      {/* Expenses */}
      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Expenses</h2>
        {expenses.length === 0 ? (
          <p className="text-sm text-slate-400">No expenses yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {expenses.map((ex) => (
              <li key={ex.id}>
                <Link
                  href={`/expenses/${ex.id}`}
                  className="flex items-center justify-between py-3 transition hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium">{ex.description}</p>
                    <p className="text-xs text-slate-500">
                      {ex.paidBy.name} paid · split {ex.splitType.toLowerCase()}
                      {ex._count.messages > 0 && ` · 💬 ${ex._count.messages}`}
                    </p>
                  </div>
                  <span className="font-semibold">{money(ex.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Settlement history */}
      {settlements.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">Payment history</h2>
          <ul className="space-y-2 text-sm">
            {settlements.map((s) => (
              <li key={s.id} className="flex justify-between text-slate-600">
                <span>
                  <b>{s.fromUser.name}</b> paid <b>{s.toUser.name}</b>
                  {s.note ? `: ${s.note}` : ""}
                </span>
                <span>{money(s.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
