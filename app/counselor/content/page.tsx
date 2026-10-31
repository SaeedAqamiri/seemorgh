import { eq } from "drizzle-orm";
import { addContentAction, deleteContentAction } from "@/app/actions/content";
import { ContentCard } from "@/components/content-card";
import { SubmitButton } from "@/components/submit-button";
import { getDb } from "@/db/client";
import { subjects } from "@/db/schema";
import { requireCounselor } from "@/lib/auth";
import { listResourceOptions, listWorkspaceContent } from "@/lib/content";
import { CONTENT_KIND_LABELS } from "@/lib/embed";

export default async function CounselorContentPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string; kind?: string }>;
}) {
  const counselor = await requireCounselor();
  const { success, error, kind } = await searchParams;

  const db = await getDb();
  const [subjectRows, resourceOptions, items] = await Promise.all([
    db.select().from(subjects).where(eq(subjects.workspaceId, counselor.workspaceId)),
    listResourceOptions(counselor.workspaceId),
    listWorkspaceContent(counselor.workspaceId),
  ]);

  const filtered = kind && ["video", "text", "psychology"].includes(kind)
    ? items.filter((item) => item.kind === kind)
    : items;

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div>
        <h1>محتوا</h1>
        <small>
          فیلم، متن و تست روان‌شناسی را با لینک اضافه کنید؛ فیلم‌های آپارات داخل سایت پخش
          می‌شوند.
        </small>
      </div>

      {success === "created" ? <div className="alert alert-success">محتوا اضافه شد.</div> : null}
      {success === "deleted" ? <div className="alert alert-success">محتوا بایگانی شد.</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <div className="section-head">
          <h2>افزودن محتوا</h2>
          <small>بدون آپلود فایل؛ فقط لینک</small>
        </div>
        <form action={addContentAction} className="stack">
          <div className="form-grid">
            <div className="field">
              <label>عنوان</label>
              <input name="title" placeholder="مثلاً ویدیو فصل ۳ زیست" required />
            </div>
            <div className="field">
              <label>نوع</label>
              <select name="kind" defaultValue="video">
                <option value="video">فیلم</option>
                <option value="text">متن</option>
                <option value="psychology">تست روان‌شناسی</option>
              </select>
            </div>
            <div className="field">
              <label>درس (اختیاری)</label>
              <select name="subjectId">
                <option value="">—</option>
                {subjectRows.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>منبع/دانش‌آموز (اختیاری)</label>
              <select name="resourceId">
                <option value="">محتوای عمومی همه دانش‌آموزان</option>
                {resourceOptions.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.studentName} — {resource.subjectTitle} / {resource.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>لینک (آپارات یا مقاله)</label>
            <input
              name="url"
              dir="ltr"
              placeholder="https://www.aparat.com/v/..."
              inputMode="url"
            />
          </div>
          <div className="field">
            <label>متن یا توضیح (برای محتوای متنی یا توضیح فیلم)</label>
            <textarea name="body" rows={3} />
          </div>
          <SubmitButton>افزودن محتوا</SubmitButton>
        </form>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>کتابخانه محتوا</h2>
          <div className="content-kind-tabs">
            <a className={`btn btn-sm ${!kind ? "" : "btn-secondary"}`} href="/counselor/content">
              همه
            </a>
            {Object.entries(CONTENT_KIND_LABELS).map(([value, label]) => (
              <a
                key={value}
                className={`btn btn-sm ${kind === value ? "" : "btn-secondary"}`}
                href={`/counselor/content?kind=${value}`}
              >
                {label}
              </a>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty">محتوایی ثبت نشده است.</div>
        ) : (
          <div className="stack">
            {filtered.map((item) => (
              <div key={item.id}>
                <ContentCard item={item} compact />
                <form action={deleteContentAction} style={{ marginTop: "0.35rem" }}>
                  <input type="hidden" name="contentId" value={item.id} />
                  <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                    بایگانی محتوا
                  </SubmitButton>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
