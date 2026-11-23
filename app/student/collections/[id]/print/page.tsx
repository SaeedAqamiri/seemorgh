import { CollectionPrintPage } from "@/components/collection-print";
import { requireStudent } from "@/lib/auth";

export default async function StudentCollectionPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireStudent();
  const { id } = await params;
  return <CollectionPrintPage user={user} collectionId={id} />;
}
