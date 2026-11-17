import Link from "next/link";
import { GroupLeaderboardView } from "@/components/group-leaderboard";
import { requireCounselor } from "@/lib/auth";
import {
  addDays,
  formatJalaliNumeric,
  isISODate,
  startOfWeekSaturday,
  todayISO,
} from "@/lib/dates";
import { getGroupLeaderboards } from "@/lib/group-performance";
import { getGroupMockExamComparison } from "@/lib/mock-exams";
import { listStudentGroups } from "@/lib/student-groups";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; from?: string; to?: string }>;
}) {
  const counselor = await requireCounselor();
  const { group: groupParam, from: fromParam, to: toParam } = await searchParams;

  const groups = await listStudentGroups(counselor.workspaceId);
  const selected =
    groups.find((group) => group.id === groupParam) ??
    groups.find((group) => group.memberCount > 0) ??
    groups[0];

  const today = todayISO();
  const defaultFrom = addDays(startOfWeekSaturday(today), -21);
  const from = fromParam && isISODate(fromParam) ? fromParam : defaultFrom;
  const to = toParam && isISODate(toParam) ? toParam : today;
  const validRange = from <= to;
  const rangeFrom = validRange ? from : defaultFrom;
  const rangeTo = validRange ? to : today;

  const [bundle, examComparison] = selected
    ? await Promise.all([
        getGroupLeaderboards({
        workspaceId: counselor.workspaceId,
        groupId: selected.id,
          from: rangeFrom,
          to: rangeTo,
        }),
        getGroupMockExamComparison(selected.id),
      ])
    : [null, []];

  const rangeLabel = `${formatJalaliNumeric(rangeFrom)} تا ${formatJalaliNumeric(rangeTo)}`;

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <Link href="/counselor" className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت به دانش‌آموزان
          </Link>
          <h1>رده‌بندی گروهی</h1>
          <small>قهرمان هر درس و قهرمان قهرمانان، نسبت به اعضای همان گروه سنجیده می‌شود.</small>
        </div>
        <Link className="btn btn-secondary btn-sm" href="/counselor/groups">
          مدیریت گروه‌ها
        </Link>
      </div>

      {!validRange ? (
        <div className="alert alert-error">تاریخ پایان باید بعد از تاریخ شروع باشد.</div>
      ) : null}

      <div className="card">
        <form action="/counselor/leaderboard" className="form-grid">
          <div className="field">
            <label htmlFor="group">گروه</label>
            <select id="group" name="group" defaultValue={selected?.id ?? ""}>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.emoji} {group.name} ({group.memberCount} نفر)
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="from">از تاریخ</label>
            <input id="from" name="from" type="date" defaultValue={rangeFrom} dir="ltr" />
          </div>
          <div className="field">
            <label htmlFor="to">تا تاریخ</label>
            <input id="to" name="to" type="date" defaultValue={rangeTo} dir="ltr" />
          </div>
          <div className="field">
            <button type="submit" className="btn-secondary">
              نمایش رده‌بندی
            </button>
          </div>
        </form>
      </div>

      {examComparison.length > 0 ? (
        <div className="card">
          <div className="section-head">
            <h2>مقایسه آزمون‌های آزمایشی گروه</h2>
            <small>فقط آزمون‌های مشترک همین گروه نمایش داده می‌شوند.</small>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>آزمون</th>
                  <th>تاریخ</th>
                  {(examComparison[0]?.members ?? []).map((member) => (
                    <th key={member.studentId}>{member.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {examComparison.map((exam) => (
                  <tr key={exam.examId}>
                    <td>{exam.title}</td>
                    <td>{formatJalaliNumeric(exam.examDate)}</td>
                    {(examComparison[0]?.members ?? []).map((member) => {
                      const row = exam.members.find((item) => item.studentId === member.studentId);
                      return (
                        <td key={member.studentId}>
                          {row && row.overallPercent > 0
                            ? `${row.overallPercent.toLocaleString("fa-IR")}٪`
                            : "ثبت نشده"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {bundle ? (
        <div className="card">
          <GroupLeaderboardView bundle={bundle} rangeLabel={rangeLabel} />
        </div>
      ) : (
        <div className="card">
          <div className="empty">هنوز گروهی ساخته نشده است. از «مدیریت گروه‌ها» اولین گروه را بسازید.</div>
        </div>
      )}
    </div>
  );
}
