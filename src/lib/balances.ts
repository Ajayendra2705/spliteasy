// Balance calculation for a group.
//
// Net balance per user = (total they PAID for expenses)
//                      - (total they OWE across all expense splits)
//                      + (settlements they PAID to others)
//                      - (settlements others PAID to them)
//
// A positive net means the group owes that user money; negative means they owe.
// We then simplify net balances into a minimal list of "who pays whom".

export type RawExpense = {
  paidById: string;
  amount: number; // total expense amount
  splits: { userId: string; amount: number }[];
};

export type RawSettlement = {
  fromUserId: string;
  toUserId: string;
  amount: number;
};

export type Member = { id: string; name: string };

export type UserBalance = {
  userId: string;
  name: string;
  paid: number;
  owed: number;
  net: number; // positive => is owed money; negative => owes money
};

export type Debt = { fromUserId: string; toUserId: string; amount: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeBalances(
  members: Member[],
  expenses: RawExpense[],
  settlements: RawSettlement[]
): { balances: UserBalance[]; debts: Debt[] } {
  const paid: Record<string, number> = {};
  const owed: Record<string, number> = {};
  for (const m of members) {
    paid[m.id] = 0;
    owed[m.id] = 0;
  }

  for (const e of expenses) {
    if (paid[e.paidById] !== undefined) paid[e.paidById] += e.amount;
    for (const s of e.splits) {
      if (owed[s.userId] !== undefined) owed[s.userId] += s.amount;
    }
  }

  // Settlements: payer reduces what they owe (acts like paying down debt).
  for (const st of settlements) {
    if (paid[st.fromUserId] !== undefined) paid[st.fromUserId] += st.amount;
    if (owed[st.toUserId] !== undefined) owed[st.toUserId] += st.amount;
  }

  const balances: UserBalance[] = members.map((m) => {
    const net = round2(paid[m.id] - owed[m.id]);
    return { userId: m.id, name: m.name, paid: round2(paid[m.id]), owed: round2(owed[m.id]), net };
  });

  return { balances, debts: simplifyDebts(balances) };
}

// Greedy debt simplification: match biggest debtor to biggest creditor.
function simplifyDebts(balances: UserBalance[]): Debt[] {
  const creditors = balances
    .filter((b) => b.net > 0.005)
    .map((b) => ({ userId: b.userId, amount: b.net }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = balances
    .filter((b) => b.net < -0.005)
    .map((b) => ({ userId: b.userId, amount: -b.net }))
    .sort((a, b) => b.amount - a.amount);

  const debts: Debt[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    if (pay > 0.005) {
      debts.push({
        fromUserId: debtors[i].userId,
        toUserId: creditors[j].userId,
        amount: round2(pay),
      });
    }
    debtors[i].amount = round2(debtors[i].amount - pay);
    creditors[j].amount = round2(creditors[j].amount - pay);
    if (debtors[i].amount <= 0.005) i++;
    if (creditors[j].amount <= 0.005) j++;
  }
  return debts;
}
