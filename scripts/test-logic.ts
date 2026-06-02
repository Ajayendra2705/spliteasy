// Lightweight assertions for the money math - runnable without a database:
//   npx tsx scripts/test-logic.ts
import { computeSplits } from "../src/lib/splits";
import { computeBalances } from "../src/lib/balances";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log("  ok  -", name);
  } else {
    failed++;
    console.error("FAIL  -", name);
  }
}
const sum = (a: { amount: number }[]) =>
  Math.round(a.reduce((s, x) => s + x.amount, 0) * 100) / 100;

// EQUAL with non-divisible amount: 100 / 3 must still sum to 100.
const eq = computeSplits(100, "EQUAL", [{ userId: "a" }, { userId: "b" }, { userId: "c" }]);
check("equal split sums to total", sum(eq) === 100);
check("equal split distributes remainder cents", eq.map((s) => s.amount).join(",") === "33.34,33.33,33.33");

// UNEQUAL must match the total exactly.
const uneq = computeSplits(100, "UNEQUAL", [
  { userId: "a", value: 70 },
  { userId: "b", value: 30 },
]);
check("unequal split sums to total", sum(uneq) === 100);
let threw = false;
try {
  computeSplits(100, "UNEQUAL", [{ userId: "a", value: 70 }, { userId: "b", value: 25 }]);
} catch {
  threw = true;
}
check("unequal split rejects mismatched total", threw);

// A participant listed twice must be rejected (would break the per-user split rows).
let dupThrew = false;
try {
  computeSplits(100, "EQUAL", [{ userId: "a" }, { userId: "a" }]);
} catch {
  dupThrew = true;
}
check("split rejects duplicate participant", dupThrew);

// PERCENTAGE must total 100%.
const pct = computeSplits(200, "PERCENTAGE", [
  { userId: "a", value: 50 },
  { userId: "b", value: 25 },
  { userId: "c", value: 25 },
]);
check("percentage split sums to total", sum(pct) === 200);

// SHARE: 40 across shares 2:1:1 => 20,10,10.
const sh = computeSplits(40, "SHARE", [
  { userId: "a", value: 2 },
  { userId: "b", value: 1 },
  { userId: "c", value: 1 },
]);
check("share split sums to total", sum(sh) === 40);
check("share split proportional", sh[0].amount === 20 && sh[1].amount === 10);

// Balances: Alice pays 90 split equally; net should be +60 / -30 / -30.
const { balances, debts } = computeBalances(
  [
    { id: "a", name: "Alice" },
    { id: "b", name: "Bob" },
    { id: "c", name: "Carol" },
  ],
  [
    {
      paidById: "a",
      amount: 90,
      splits: [
        { userId: "a", amount: 30 },
        { userId: "b", amount: 30 },
        { userId: "c", amount: 30 },
      ],
    },
  ],
  []
);
const alice = balances.find((b) => b.userId === "a")!;
check("payer is owed the rest", alice.net === 60);
check("two debtors owe the payer", debts.length === 2 && debts.every((d) => d.toUserId === "a"));
check("net balances sum to zero", Math.round(balances.reduce((s, b) => s + b.net, 0) * 100) === 0);

// After a settlement of 30 from Bob to Alice, Alice net should drop to 30.
const after = computeBalances(
  [
    { id: "a", name: "Alice" },
    { id: "b", name: "Bob" },
    { id: "c", name: "Carol" },
  ],
  [
    {
      paidById: "a",
      amount: 90,
      splits: [
        { userId: "a", amount: 30 },
        { userId: "b", amount: 30 },
        { userId: "c", amount: 30 },
      ],
    },
  ],
  [{ fromUserId: "b", toUserId: "a", amount: 30 }]
);
check("settlement reduces creditor net", after.balances.find((b) => b.userId === "a")!.net === 30);
check("settlement clears debtor", after.balances.find((b) => b.userId === "b")!.net === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
