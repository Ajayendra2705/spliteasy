import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import GroupDetailClient from "@/components/GroupDetailClient";

export default async function GroupPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <NavBar userName={user.name} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <GroupDetailClient groupId={params.id} currentUserId={user.id} />
      </main>
    </>
  );
}
