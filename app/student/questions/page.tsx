import { QuestionBankPage } from "@/components/question-bank-page";
import { requireStudent } from "@/lib/auth";

export default async function StudentQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { user } = await requireStudent();
  const params = await searchParams;
  return <QuestionBankPage user={user} searchParams={params} />;
}
