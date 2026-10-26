import { AppShell } from "@/components/app-shell";
import { requireCounselor } from "@/lib/auth";

export default async function CounselorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCounselor();
  return <AppShell user={user}>{children}</AppShell>;
}
