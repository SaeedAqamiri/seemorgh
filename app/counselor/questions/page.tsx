import { QuestionBankPage } from "@/components/question-bank-page";
import { requireCounselor } from "@/lib/auth";

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const counselor = await requireCounselor();
  const params = await searchParams;
  return <QuestionBankPage user={counselor} searchParams={params} />;
}
