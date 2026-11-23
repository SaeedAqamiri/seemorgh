import { CollectionPrintPage } from "@/components/collection-print";
import { requireCounselor } from "@/lib/auth";

export default async function CounselorCollectionPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  return <CollectionPrintPage user={counselor} collectionId={id} />;
}
