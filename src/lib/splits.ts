// Pure functions that turn an expense + split inputs into per-user owed amounts.
// All money math is done in integer cents to avoid floating-point drift, then
// any rounding remainder is distributed deterministically so the parts always
// sum back to the exact total.

export type SplitType = "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "SHARE";

export type SplitInput = {
  userId: string;
  // For UNEQUAL: exact amount owed. For PERCENTAGE: percent (0-100).
  // For SHARE: number of shares. Ignored for EQUAL.
  value?: number;
};

export type ComputedSplit = {
  userId: string;
  amount: number; // owed amount in major units (e.g. dollars), 2 decimals
  weight: number | null; // raw input kept for auditing (percent or share count)
};

const toCents = (n: number) => Math.round(n * 100);
const toMajor = (cents: number) => Math.round(cents) / 100;

// Spread `totalCents` across `weights` proportionally; remainder cents go to the
// largest-weighted participants first so the sum is always exact.
function distribute(totalCents: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) throw new Error("Total weight must be greater than zero");

  const raw = weights.map((w) => (totalCents * w) / totalWeight);
  const floored = raw.map((r) => Math.floor(r));
  let remainder = totalCents - floored.reduce((a, b) => a + b, 0);

  // Order indices by largest fractional part, then by weight, to assign leftover cents.
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: weights[i] }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w)
    .map((o) => o.i);

  const result = [...floored];
  for (let k = 0; k < order.length && remainder > 0; k++) {
    result[order[k]] += 1;
    remainder -= 1;
  }
  return result;
}

export function computeSplits(
  amount: number,
  splitType: SplitType,
  inputs: SplitInput[]
): ComputedSplit[] {
  if (!inputs.length) throw new Error("At least one participant is required");
  if (amount <= 0) throw new Error("Amount must be greater than zero");

  const ids = inputs.map((p) => p.userId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Each participant can only appear once");
  }

  const totalCents = toCents(amount);

  switch (splitType) {
    case "EQUAL": {
      const parts = distribute(
        totalCents,
        inputs.map(() => 1)
      );
      return inputs.map((p, i) => ({
        userId: p.userId,
        amount: toMajor(parts[i]),
        weight: null,
      }));
    }

    case "UNEQUAL": {
      const sumCents = inputs.reduce((s, p) => s + toCents(p.value ?? 0), 0);
      if (sumCents !== totalCents) {
        throw new Error(
          `Unequal amounts must add up to the total (${amount}). Got ${toMajor(sumCents)}.`
        );
      }
      return inputs.map((p) => ({
        userId: p.userId,
        amount: toMajor(toCents(p.value ?? 0)),
        weight: null,
      }));
    }

    case "PERCENTAGE": {
      const pctSum = inputs.reduce((s, p) => s + (p.value ?? 0), 0);
      if (Math.abs(pctSum - 100) > 0.01) {
        throw new Error(`Percentages must add up to 100. Got ${pctSum}.`);
      }
      const parts = distribute(
        totalCents,
        inputs.map((p) => p.value ?? 0)
      );
      return inputs.map((p, i) => ({
        userId: p.userId,
        amount: toMajor(parts[i]),
        weight: p.value ?? 0,
      }));
    }

    case "SHARE": {
      const shares = inputs.map((p) => p.value ?? 0);
      if (shares.some((s) => s < 0)) throw new Error("Shares cannot be negative");
      const parts = distribute(totalCents, shares);
      return inputs.map((p, i) => ({
        userId: p.userId,
        amount: toMajor(parts[i]),
        weight: p.value ?? 0,
      }));
    }

    default:
      throw new Error(`Unknown split type: ${splitType}`);
  }
}
