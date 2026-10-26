import { ContentCard } from "@/components/content-card";
import { requireStudent } from "@/lib/auth";
import { listStudentContent } from "@/lib/content";
import { CONTENT_KIND_LABELS } from "@/lib/embed";

export default async function StudentContentPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { student } = await requireStudent();
  const { kind } = await searchParams;
  const items = await listStudentContent(student.workspaceId, student.id);

  const filtered =
    kind && ["video", "text", "psychology"].includes(kind)
      ? items.filter((item) => item.kind === kind)
      : items;

  return (
    <div className="stack">
      <div>
        <h1>محتوا</h1>
        <small>فیلم‌ها داخل همین صفحه پخش می‌شوند؛ متن‌ها هم همین‌جا هستند.</small>
      </div>

      <div className="content-kind-tabs">
        <a className={`btn btn-sm ${!kind ? "" : "btn-secondary"}`} href="/student/content">
          همه
        </a>
        {Object.entries(CONTENT_KIND_LABELS).map(([value, label]) => (
          <a
            key={value}
            className={`btn btn-sm ${kind === value ? "" : "btn-secondary"}`}
            href={`/student/content?kind=${value}`}
          >
            {label}
          </a>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card empty">هنوز محتوایی برای تو اضافه نشده است.</div>
      ) : (
        <div className="stack">
          {filtered.map((item) => (
            <ContentCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
