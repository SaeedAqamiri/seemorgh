import { AppShell } from "@/components/app-shell";
import { requireStudent } from "@/lib/auth";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireStudent();
  return <AppShell user={user}>{children}</AppShell>;
}
