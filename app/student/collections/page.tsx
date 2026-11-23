import { CollectionsPage } from "@/components/collections-page";
import { requireStudent } from "@/lib/auth";

export default async function StudentCollectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { user } = await requireStudent();
  const params = await searchParams;
  return <CollectionsPage user={user} searchParams={params} />;
}
