import Link from "next/link";
import type { CSSProperties } from "react";
import {
  createGroupAction,
  deleteGroupAction,
  saveGroupMockExamsAction,
  updateGroupAction,
} from "@/app/actions/groups";
import { SubmitButton } from "@/components/submit-button";
import { requireCounselor } from "@/lib/auth";
import { listStudentGroups } from "@/lib/student-groups";
import { listGroupMockExamIds, listMockExamPrograms } from "@/lib/mock-exams";
import { formatJalaliNumeric, todayISO } from "@/lib/dates";
import { FIELDS, FIELD_LABELS } from "@/lib/subjects";

const SUCCESS: Record<string, string> = {
  created: "گروه ساخته شد.",
  updated: "گروه ویرایش شد.",
  deleted: "گروه حذف شد و اعضایش به گروه اصلی منتقل شدند.",
};

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string; moved?: string }>;
}) {
  const counselor = await requireCounselor();
  const { success, error, moved } = await searchParams;
  const groups = await listStudentGroups(counselor.workspaceId);
  const totalMembers = groups.reduce((sum, group) => sum + group.memberCount, 0);
  const groupExams = await Promise.all(
    groups.map(async (group) => ({
      groupId: group.id,
      selected: new Set(await listGroupMockExamIds(group.id)),
      programs: await listMockExamPrograms(counselor.workspaceId, { field: group.field }),
    })),
  );
  const examPlanByGroup = new Map(groupExams.map((row) => [row.groupId, row]));

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <Link href="/counselor" className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت به دانش‌آموزان
          </Link>
          <h1>گروه‌های آموزشی</h1>
          <small>
            هر دانش‌آموز دقیقاً عضو یک گروه است؛ مقایسه‌ها و قهرمان‌ها نسبت به همین گروه محاسبه
            می‌شوند.
          </small>
        </div>
        <span className="badge badge-green">
          {groups.length.toLocaleString("fa-IR")} گروه · {totalMembers.toLocaleString("fa-IR")} دانش‌آموز
        </span>
      </div>

      {success && SUCCESS[success] ? (
        <div className="alert alert-success">
          {SUCCESS[success]}
          {success === "deleted" && moved ? ` (${Number(moved).toLocaleString("fa-IR")} نفر منتقل شدند)` : ""}
        </div>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <div className="section-head">
          <h2>ساخت گروه جدید</h2>
          <small>مثلاً «مدرسه علامه حلی» یا «مؤسسه دکتر سعیدی»</small>
        </div>
        <form action={createGroupAction} className="form-grid">
          <div className="field">
            <label htmlFor="name">نام گروه</label>
            <input id="name" name="name" placeholder="مدرسه علامه حلی" required />
          </div>
          <div className="field">
            <label htmlFor="field">رشته گروه</label>
            <select id="field" name="field" defaultValue="تجربی">
              {FIELDS.map((item) => (
                <option key={item} value={item}>
                  {FIELD_LABELS[item] ?? item}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="emoji">شکلک (اختیاری)</label>
            <input id="emoji" name="emoji" placeholder="🏫" maxLength={8} />
          </div>
          <div className="field">
            <label htmlFor="color">رنگ</label>
            <input id="color" name="color" type="color" defaultValue="#2563eb" />
          </div>
          <div className="field">
            <SubmitButton pendingLabel="در حال ساخت…">ساخت گروه</SubmitButton>
          </div>
        </form>
      </div>

      {groups.length === 0 ? (
        <div className="card">
          <div className="empty">هنوز گروهی وجود ندارد.</div>
        </div>
      ) : (
        <div className="group-admin-grid">
          {groups.map((group) => (
            <div
              key={group.id}
              className="group-card"
              style={{ "--group-color": group.color } as CSSProperties}
            >
              <div className="group-card-head">
                <span className="group-card-emoji">{group.emoji}</span>
                <div>
                  <strong>{group.name}</strong>
                  <div className="muted" style={{ fontSize: "0.78rem" }}>
                    {FIELD_LABELS[group.field] ?? group.field} ·{" "}
                    {group.memberCount.toLocaleString("fa-IR")} دانش‌آموز فعال
                  </div>
                </div>
                <Link
                  className="btn btn-secondary btn-sm"
                  href={`/counselor/leaderboard?group=${group.id}`}
                >
                  رده‌بندی
                </Link>
              </div>

              <details className="group-edit">
                <summary>ویرایش گروه</summary>
                <form action={updateGroupAction} className="form-grid" style={{ marginTop: "0.6rem" }}>
                  <input type="hidden" name="groupId" value={group.id} />
                  <div className="field">
                    <label>نام</label>
                    <input name="name" defaultValue={group.name} required />
                  </div>
                  <div className="field">
                    <label>شکلک</label>
                    <input name="emoji" defaultValue={group.emoji} maxLength={8} />
                  </div>
                  <div className="field">
                    <label>رنگ</label>
                    <input name="color" type="color" defaultValue={group.color} />
                  </div>
                  <div className="field">
                    <label>رشته (ثابت)</label>
                    <input value={FIELD_LABELS[group.field] ?? group.field} readOnly />
                  </div>
                  <div className="field">
                    <SubmitButton className="btn-secondary btn-sm">ذخیره</SubmitButton>
                  </div>
                </form>
                <form action={saveGroupMockExamsAction} className="stack" style={{ marginTop: "0.6rem", gap: "0.4rem" }}>
                  <input type="hidden" name="groupId" value={group.id} />
                  <label style={{ fontSize: "0.8rem" }}>تقویم آزمون مشترک گروه</label>
                  <select
                    name="mockExamId"
                    multiple
                    size={6}
                    style={{ minHeight: "8rem" }}
                    defaultValue={[...(examPlanByGroup.get(group.id)?.selected ?? [])]}
                  >
                    {(examPlanByGroup.get(group.id)?.programs ?? []).map((program) => (
                      <option key={program.id} value={program.id}>
                        {formatJalaliNumeric(program.examDate)} — {program.provider} — {program.title}
                      </option>
                    ))}
                  </select>
                  <small className="muted">
                    می‌توانید ترکیبی از آزمون‌های چند موسسه را انتخاب کنید؛ برای اعضای فعال گروه
                    هم ثبت می‌شود.
                  </small>
                  <SubmitButton className="btn-secondary btn-sm">ذخیره تقویم آزمون گروه</SubmitButton>
                </form>
              </details>

              {groups.length > 1 ? (
                <form action={deleteGroupAction} className="group-delete">
                  <input type="hidden" name="groupId" value={group.id} />
                  <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                    حذف گروه
                  </SubmitButton>
                  <small className="muted">
                    اعضای این گروه به گروه دیگری منتقل می‌شوند.
                  </small>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
