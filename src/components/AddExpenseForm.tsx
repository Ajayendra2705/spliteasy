"use client";

import { useMemo, useState } from "react";
import { api, money } from "@/lib/client";

type Member = { id: string; name: string };
type SplitType = "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "SHARE";

const SPLIT_LABELS: Record<SplitType, string> = {
  EQUAL: "Equally",
  UNEQUAL: "Unequally",
  PERCENTAGE: "By percentage",
  SHARE: "By shares",
};

export type ExpenseInitial = {
  description: string;
  amount: number;
  paidById: string;
  splitType: SplitType;
  participants: { userId: string; value?: number }[];
};

export default function AddExpenseForm({
  groupId,
  members,
  currentUserId,
  onCreated,
  expenseId,
  initial,
}: {
  groupId: string;
  members: Member[];
  currentUserId: string;
  onCreated: () => void;
  expenseId?: string; // when set, the form edits this expense instead of creating
  initial?: ExpenseInitial;
}) {
  const isEdit = Boolean(expenseId);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [paidById, setPaidById] = useState(initial?.paidById ?? currentUserId);
  const [splitType, setSplitType] = useState<SplitType>(initial?.splitType ?? "EQUAL");
  const [selected, setSelected] = useState<Record<string, boolean>>(
    initial
      ? Object.fromEntries(members.map((m) => [m.id, initial.participants.some((p) => p.userId === m.id)]))
      : Object.fromEntries(members.map((m) => [m.id, true]))
  );
  const [values, setValues] = useState<Record<string, string>>(
    initial
      ? Object.fromEntries(
          initial.participants
            .filter((p) => p.value !== undefined)
            .map((p) => [p.userId, String(p.value)])
        )
      : {}
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const amountNum = parseFloat(amount) || 0;
  const participants = members.filter((m) => selected[m.id]);

  // Live preview of how much each participant owes, mirrors server logic.
  const preview = useMemo(() => {
    const out: Record<string, number> = {};
    if (amountNum <= 0 || participants.length === 0) return out;
    if (splitType === "EQUAL") {
      const each = amountNum / participants.length;
      participants.forEach((p) => (out[p.id] = each));
    } else if (splitType === "UNEQUAL") {
      participants.forEach((p) => (out[p.id] = parseFloat(values[p.id]) || 0));
    } else if (splitType === "PERCENTAGE") {
      participants.forEach(
        (p) => (out[p.id] = (amountNum * (parseFloat(values[p.id]) || 0)) / 100)
      );
    } else {
      const total = participants.reduce((s, p) => s + (parseFloat(values[p.id]) || 0), 0);
      participants.forEach(
        (p) => (out[p.id] = total > 0 ? (amountNum * (parseFloat(values[p.id]) || 0)) / total : 0)
      );
    }
    return out;
  }, [amountNum, participants, splitType, values]);

  const previewSum = Object.values(preview).reduce((a, b) => a + b, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (participants.length === 0) return setError("Select at least one participant");
    setSaving(true);
    try {
      const payload = {
        description,
        amount: amountNum,
        paidById,
        splitType,
        participants: participants.map((p) => ({
          userId: p.id,
          value: splitType === "EQUAL" ? undefined : parseFloat(values[p.id]) || 0,
        })),
      };
      if (isEdit) {
        await api(`/expenses/${expenseId}`, { method: "PATCH", body: payload });
      } else {
        await api(`/groups/${groupId}/expenses`, { method: "POST", body: payload });
        setDescription("");
        setAmount("");
        setValues({});
      }
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const valueLabel =
    splitType === "UNEQUAL" ? "Amount" : splitType === "PERCENTAGE" ? "%" : "Shares";

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Description</label>
          <input
            className="input"
            placeholder="Dinner, cab, hotel…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Amount</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Paid by</label>
          <select className="input" value={paidById} onChange={(e) => setPaidById(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Split</label>
          <select
            className="input"
            value={splitType}
            onChange={(e) => setSplitType(e.target.value as SplitType)}
          >
            {(Object.keys(SPLIT_LABELS) as SplitType[]).map((t) => (
              <option key={t} value={t}>
                {SPLIT_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Participants</label>
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={!!selected[m.id]}
                onChange={(e) => setSelected({ ...selected, [m.id]: e.target.checked })}
              />
              <span className="flex-1 text-sm">{m.name}</span>
              {selected[m.id] && splitType !== "EQUAL" && (
                <input
                  className="input w-28"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={valueLabel}
                  value={values[m.id] ?? ""}
                  onChange={(e) => setValues({ ...values, [m.id]: e.target.value })}
                />
              )}
              {selected[m.id] && preview[m.id] !== undefined && (
                <span className="w-24 text-right text-sm text-slate-500">
                  {money(preview[m.id] || 0)}
                </span>
              )}
            </div>
          ))}
        </div>
        {amountNum > 0 && (
          <p
            className={`mt-2 text-xs ${
              Math.abs(previewSum - amountNum) < 0.01 ? "text-slate-500" : "text-red-600"
            }`}
          >
            Split total: {money(previewSum)} of {money(amountNum)}
          </p>
        )}
      </div>

      <button className="btn-primary w-full" disabled={saving}>
        {saving ? "Saving…" : isEdit ? "Save changes" : "Add expense"}
      </button>
    </form>
  );
}
