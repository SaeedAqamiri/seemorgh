import { CollectionDetailPage } from "@/components/collection-detail-page";
import { requireCounselor } from "@/lib/auth";

export default async function CounselorCollectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const query = await searchParams;
  return <CollectionDetailPage user={counselor} collectionId={id} searchParams={query} />;
}
