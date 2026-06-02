import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import ExpenseDetailClient from "@/components/ExpenseDetailClient";

export default async function ExpensePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <NavBar userName={user.name} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <ExpenseDetailClient expenseId={params.id} currentUserId={user.id} />
      </main>
    </>
  );
}
