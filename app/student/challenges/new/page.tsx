import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { StudentSummaryCard } from "@/components/student-summary-card";
import { requireStudent } from "@/lib/auth";
import { getChallengeStudentProfile, listChallengeStudents } from "@/lib/challenges";
import { FIELDS, GRADES } from "@/lib/subjects";
import { listStudentGroups } from "@/lib/student-groups";

const toFa = (value: number) => value.toLocaleString("fa-IR");

export default async function NewChallengePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    group?: string;
    grade?: string;
    field?: string;
    student?: string;
    error?: string;
  }>;
}) {
  const { user, student } = await requireStudent();
  const params = await searchParams;
  const filters = {
    q: params.q?.trim() || undefined,
    groupId: params.group || undefined,
    grade: params.grade || undefined,
    field: params.field || undefined,
  };

  const [students, groups, profile] = await Promise.all([
    listChallengeStudents(user.workspaceId, filters, student.id),
    listStudentGroups(user.workspaceId),
    params.student
      ? getChallengeStudentProfile(user.workspaceId, params.student)
      : Promise.resolve(null),
  ]);

  const filterQuery = [
    filters.q ? `q=${encodeURIComponent(filters.q)}` : "",
    filters.groupId ? `group=${filters.groupId}` : "",
    filters.grade ? `grade=${encodeURIComponent(filters.grade)}` : "",
    filters.field ? `field=${encodeURIComponent(filters.field)}` : "",
  ]
    .filter(Boolean)
    .join("&");

  return (
    <div className="stack">
      <div>
        <Link href="/student/challenges" className="muted" style={{ fontSize: "0.82rem" }}>
          ← بازگشت به چالش‌ها
        </Link>
        <h1>چالش جدید</h1>
        <small>
          دانش‌آموزها را انتخاب کن، بعد آزمون و ساعت چالش را مشخص می‌کنی. روی «خلاصه پروفایل» هم
          می‌توانی بزنی تا وضعیت هر نفر را ببینی.
        </small>
      </div>

      {params.error ? <div className="alert alert-error">{params.error}</div> : null}

      {profile ? (
        <div className="stack">
          <div className="row between">
            <h2 style={{ margin: 0 }}>
              خلاصه پروفایل: {profile.student.name}
            </h2>
            <Link
              className="btn btn-ghost btn-sm"
              href={`/student/challenges/new${filterQuery ? `?${filterQuery}` : ""}`}
            >
              بستن پروفایل
            </Link>
          </div>
          <div className="card">
            <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
              <span className="badge">کد {profile.student.code}</span>
              <span className="badge">{profile.student.grade}</span>
              <span className="badge">{profile.student.field}</span>
              {profile.student.groupName ? (
                <span className="badge">
                  {profile.student.groupEmoji ?? ""} {profile.student.groupName}
                </span>
              ) : null}
            </div>
          </div>
          <StudentSummaryCard summary={profile.summary} title="خلاصه وضعیت" />
          <Link className="btn" href={`/student/challenges/new/invite?inviteeIds=${profile.student.id}`}>
            دعوت این نفر به چالش
          </Link>
        </div>
      ) : null}

      <div className="card">
        <form action="/student/challenges/new" className="form-grid">
          <div className="field">
            <label htmlFor="q">جستجوی نام</label>
            <input id="q" name="q" type="text" defaultValue={filters.q ?? ""} placeholder="نام دانش‌آموز" />
          </div>
          <div className="field">
            <label htmlFor="group">گروه</label>
            <select id="group" name="group" defaultValue={filters.groupId ?? ""}>
              <option value="">همهٔ گروه‌ها</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.emoji} {group.name} ({toFa(group.memberCount)} نفر)
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="grade">پایه</label>
            <select id="grade" name="grade" defaultValue={filters.grade ?? ""}>
              <option value="">همهٔ پایه‌ها</option>
              {GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="field">رشته</label>
            <select id="field" name="field" defaultValue={filters.field ?? ""}>
              <option value="">همهٔ رشته‌ها</option>
              {FIELDS.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <button type="submit" className="btn btn-secondary">
              اعمال فیلتر
            </button>
          </div>
        </form>
      </div>

      {students.length === 0 ? (
        <div className="card empty">دانش‌آموزی با این فیلترها پیدا نشد.</div>
      ) : (
        <form action="/student/challenges/new/invite" className="stack">
          <div className="stack">
            {students.map((row) => (
              <div key={row.id} className="card">
                <div className="row between">
                  <label
                    htmlFor={`invitee-${row.id}`}
                    className="row"
                    style={{ gap: "0.6rem", cursor: "pointer" }}
                  >
                    <input
                      id={`invitee-${row.id}`}
                      type="checkbox"
                      name="inviteeIds"
                      value={row.id}
                    />
                    <span>
                      <strong>{row.name}</strong>
                      <br />
                      <small className="muted">
                        {row.grade} · {row.field}
                        {row.groupName ? ` · ${row.groupEmoji ?? ""} ${row.groupName}` : ""}
                        {" · "}
                        کد {row.code}
                      </small>
                    </span>
                  </label>
                  <Link
                    className="btn btn-ghost btn-sm"
                    href={`/student/challenges/new?student=${row.id}${filterQuery ? `&${filterQuery}` : ""}`}
                  >
                    خلاصه پروفایل
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="row">
            <SubmitButton pendingLabel="در حال انتقال…">
              ادامه به فرم دعوت
            </SubmitButton>
            <span className="muted">حداقل یک نفر را تیک بزن.</span>
          </div>
        </form>
      )}
    </div>
  );
}
