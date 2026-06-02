import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import GroupsClient from "@/components/GroupsClient";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <NavBar userName={user.name} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <GroupsClient />
      </main>
    </>
  );
}
