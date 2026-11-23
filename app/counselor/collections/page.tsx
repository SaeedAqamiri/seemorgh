import { CollectionsPage } from "@/components/collections-page";
import { requireCounselor } from "@/lib/auth";

export default async function CounselorCollectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const counselor = await requireCounselor();
  const params = await searchParams;
  return <CollectionsPage user={counselor} searchParams={params} />;
}
