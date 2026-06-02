"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, money } from "@/lib/client";
import AddExpenseForm from "./AddExpenseForm";

type SplitType = "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "SHARE";
type Member = { id: string; name: string };

type Split = { userId: string; amount: string; weight: string | null; user: { id: string; name: string } };
type Expense = {
  id: string;
  description: string;
  amount: string;
  splitType: string;
  createdAt: string;
  paidBy: { id: string; name: string };
  createdBy: { id: string; name: string };
  group: { id: string; name: string };
  splits: Split[];
};
type Message = {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string };
};

export default function ExpenseDetailClient({
  expenseId,
  currentUserId,
}: {
  expenseId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  // Append a message only if we haven't already shown it (the stream and the
  // optimistic send can both deliver the same row).
  const addMessage = (m: Message) =>
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));

  const loadExpense = useCallback(
    () =>
      api<{ expense: Expense }>(`/expenses/${expenseId}`)
        .then((d) => setExpense(d.expense))
        .catch((e) => setError(e.message)),
    [expenseId]
  );

  // Initial load of the expense.
  useEffect(() => {
    loadExpense();
  }, [loadExpense]);

  // Enter edit mode: fetch the group's members so participants can be changed.
  async function startEdit() {
    if (!expense) return;
    try {
      const { members } = await api<{ members: { user: Member }[] }>(
        `/groups/${expense.group.id}/members`
      );
      setMembers(members.map((m) => m.user));
      setEditing(true);
    } catch (err: any) {
      setError(err.message);
    }
  }

  // Real-time chat via Server-Sent Events. The browser auto-reconnects (resuming
  // from Last-Event-ID) if the serverless function recycles the connection.
  useEffect(() => {
    const es = new EventSource(`/api/expenses/${expenseId}/messages/stream`);
    es.addEventListener("message", (e) => {
      try {
        addMessage(JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore malformed frame */
      }
    });
    return () => es.close();
  }, [expenseId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const body = text;
    setText("");
    try {
      // Show it instantly; the SSE stream will also deliver it (deduped by id).
      const { message } = await api<{ message: Message }>(
        `/expenses/${expenseId}/messages`,
        { method: "POST", body: { body } }
      );
      addMessage(message);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function remove() {
    if (!expense) return;
    if (!confirm("Delete this expense? This cannot be undone.")) return;
    try {
      await api(`/expenses/${expenseId}`, { method: "DELETE" });
      router.push(`/groups/${expense.group.id}`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (!expense) return <p className="text-slate-500">{error || "Loading…"}</p>;

  return (
    <div className="space-y-6">
      <Link href={`/groups/${expense.group.id}`} className="text-sm text-brand hover:underline">
        ← {expense.group.name}
      </Link>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="card">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{expense.description}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {money(expense.amount)} · paid by {expense.paidBy.name} · split{" "}
              {expense.splitType.toLowerCase()}
            </p>
          </div>
          {!editing && (
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={startEdit}>
                Edit
              </button>
              <button className="btn-danger" onClick={remove}>
                Delete
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-4">
            <AddExpenseForm
              groupId={expense.group.id}
              currentUserId={currentUserId}
              members={members}
              expenseId={expense.id}
              initial={{
                description: expense.description,
                amount: Number(expense.amount),
                paidById: expense.paidBy.id,
                splitType: expense.splitType as SplitType,
                participants: expense.splits.map((s) => ({
                  userId: s.userId,
                  value:
                    expense.splitType === "UNEQUAL"
                      ? Number(s.amount)
                      : expense.splitType === "PERCENTAGE" || expense.splitType === "SHARE"
                      ? Number(s.weight)
                      : undefined,
                })),
              }}
              onCreated={() => {
                setEditing(false);
                loadExpense();
              }}
            />
            <button
              className="btn-ghost mt-2 w-full"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-600">Breakdown</h3>
            <ul className="space-y-1 text-sm">
              {expense.splits.map((s) => (
                <li key={s.userId} className="flex justify-between">
                  <span>
                    {s.user.name}
                    {s.user.id === expense.paidBy.id && (
                      <span className="ml-2 text-xs text-emerald-600">(paid)</span>
                    )}
                  </span>
                  <span className="text-slate-600">owes {money(s.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Chat */}
      <div className="card flex h-[28rem] flex-col">
        <h2 className="mb-3 text-lg font-semibold">Discussion</h2>
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-400">No messages yet. Start the conversation.</p>
          ) : (
            messages.map((m) => {
              const mine = m.user.id === currentUserId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      mine ? "bg-brand text-white" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {!mine && <p className="mb-0.5 text-xs font-semibold opacity-70">{m.user.name}</p>}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input
            className="input"
            placeholder="Type a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn-primary">Send</button>
        </form>
      </div>
    </div>
  );
}
