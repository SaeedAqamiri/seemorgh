import { CollectionDetailPage } from "@/components/collection-detail-page";
import { requireStudent } from "@/lib/auth";

export default async function StudentCollectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { user } = await requireStudent();
  const { id } = await params;
  const query = await searchParams;
  return <CollectionDetailPage user={user} collectionId={id} searchParams={query} />;
}
