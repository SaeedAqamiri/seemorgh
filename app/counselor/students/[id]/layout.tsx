import { StudentAreaNav } from "@/components/student-area-nav";

export default async function StudentAreaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <StudentAreaNav studentId={id} />
      {children}
    </div>
  );
}
