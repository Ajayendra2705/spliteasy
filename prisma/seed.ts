import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Seeds three demo users and a group with a couple of expenses so the app has
// something to show on first run. Safe to re-run: it upserts users by email.
async function main() {
  const pass = await bcrypt.hash("password123", 10);
  const people = [
    { name: "Alice", email: "alice@demo.com" },
    { name: "Bob", email: "bob@demo.com" },
    { name: "Carol", email: "carol@demo.com" },
  ];

  const users = [];
  for (const p of people) {
    users.push(
      await prisma.user.upsert({
        where: { email: p.email },
        update: {},
        create: { ...p, passwordHash: pass },
      })
    );
  }
  const [alice, bob, carol] = users;

  const group = await prisma.group.create({
    data: {
      name: "Goa Trip",
      createdById: alice.id,
      members: {
        create: [
          { userId: alice.id, role: "admin" },
          { userId: bob.id, role: "member" },
          { userId: carol.id, role: "member" },
        ],
      },
    },
  });

  // Dinner: $90 split equally among all three.
  await prisma.expense.create({
    data: {
      groupId: group.id,
      description: "Dinner",
      amount: 90,
      splitType: "EQUAL",
      paidById: alice.id,
      createdById: alice.id,
      splits: {
        create: [
          { userId: alice.id, amount: 30 },
          { userId: bob.id, amount: 30 },
          { userId: carol.id, amount: 30 },
        ],
      },
    },
  });

  // Cab: $40 paid by Bob, split by shares (Alice 2, Bob 1, Carol 1).
  await prisma.expense.create({
    data: {
      groupId: group.id,
      description: "Cab",
      amount: 40,
      splitType: "SHARE",
      paidById: bob.id,
      createdById: bob.id,
      splits: {
        create: [
          { userId: alice.id, amount: 20, weight: 2 },
          { userId: bob.id, amount: 10, weight: 1 },
          { userId: carol.id, amount: 10, weight: 1 },
        ],
      },
    },
  });

  console.log("Seeded. Log in with alice@demo.com / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
