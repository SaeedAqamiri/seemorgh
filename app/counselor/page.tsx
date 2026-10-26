import Link from "next/link";
import { createStudentAction } from "@/app/actions/counselor";
import { uploadExcelAction } from "@/app/actions/import";
import { SubmitButton } from "@/components/submit-button";
import { requireCounselor } from "@/lib/auth";
import { listStudents } from "@/lib/counselor";
import { formatJalali, todayISO } from "@/lib/dates";
import { FIELDS, GRADES, TRACK_LABELS } from "@/lib/subjects";

const SUCCESS: Record<string, string> = {
  created: "دانش‌آموز اضافه شد. لینک دعوت را برایش بفرستید.",
  archived: "دانش‌آموز بایگانی شد.",
};

export default async function CounselorPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string;
    error?: string;
    applied?: string;
    skipped?: string;
    total?: string;
  }>;
}) {
  const counselor = await requireCounselor();
  const { success, error, applied, skipped, total } = await searchParams;
  const students = await listStudents(counselor.workspaceId, counselor.id);

  const withPlan = students.filter((student) => student.planStatus === "approved" || student.planStatus === "active");
  const todayTasks = students.reduce((sum, student) => sum + student.todayTasks, 0);
  const todayDone = students.reduce((sum, student) => sum + student.todayDone, 0);
  const completion = todayTasks === 0 ? 0 : Math.round((todayDone / todayTasks) * 100);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <h1>دانش‌آموزان</h1>
          <small>{formatJalali(todayISO())}</small>
        </div>
        <span className="badge badge-green">{students.length} دانش‌آموز فعال</span>
      </div>

      {success && SUCCESS[success] ? <div className="alert alert-success">{SUCCESS[success]}</div> : null}
      {success === "imported" ? (
        <div className="alert alert-success">
          ایمپورت انجام شد: {Number(applied ?? 0).toLocaleString("fa-IR")} ردیف اعمال شد و{" "}
          {Number(skipped ?? 0).toLocaleString("fa-IR")} ردیف رد شد (از {Number(total ?? 0).toLocaleString("fa-IR")} ردیف).
        </div>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="grid grid-3">
        <div className="stat">
          <div className="stat-value">{withPlan.length}</div>
          <div className="stat-label">برنامه تأییدشده این هفته</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {todayDone} / {todayTasks}
          </div>
          <div className="stat-label">تسک انجام‌شده امروز</div>
        </div>
        <div className="stat">
          <div className="stat-value">{completion}٪</div>
          <div className="stat-label">پایبندی امروز</div>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>افزودن دانش‌آموز</h2>
          <small>پس از ساخت، لینک دعوت را کپی و ارسال کنید.</small>
        </div>
        <form action={createStudentAction} className="form-grid">
          <div className="field">
            <label htmlFor="name">نام</label>
            <input id="name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="phone">موبایل</label>
            <input id="phone" name="phone" inputMode="tel" placeholder="09123456789" required />
          </div>
          <div className="field">
            <label htmlFor="grade">پایه</label>
            <select id="grade" name="grade" defaultValue="دوازدهم">
              {GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="field">رشته</label>
            <select id="field" name="field" defaultValue="تجربی">
              {FIELDS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="track">هدف</label>
            <select id="track" name="track" defaultValue="both">
              {Object.entries(TRACK_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="guardianPhone">موبایل والد (اختیاری)</label>
            <input id="guardianPhone" name="guardianPhone" inputMode="tel" />
          </div>
          <div className="field">
            <SubmitButton pendingLabel="در حال ثبت…">افزودن</SubmitButton>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>اکسل</h2>
          <a className="btn btn-secondary btn-sm" href="/counselor/export?type=template">
            دانلود قالب
          </a>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          دانش‌آموزان، منابع، زمان‌های آزاد، محدودیت‌ها و سوالات را با یک فایل وارد کنید.
          قبل از اعمال، پیش‌نمایش و خطای سطر‌به‌سطر را می‌بینید.
        </p>
        <form action={uploadExcelAction} className="row">
          <input
            type="file"
            name="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            style={{ maxWidth: "360px" }}
          />
          <SubmitButton className="btn-secondary" pendingLabel="در حال بررسی…">
            آپلود و پیش‌نمایش
          </SubmitButton>
        </form>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>فهرست دانش‌آموزان</h2>
        </div>

        {students.length === 0 ? (
          <div className="empty">هنوز دانش‌آموزی اضافه نشده است.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>دانش‌آموز</th>
                  <th>پایه / رشته</th>
                  <th>برنامه هفته</th>
                  <th>امروز</th>
                  <th>واحد باقی‌مانده</th>
                  <th>دعوت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <Link href={`/counselor/students/${student.id}`}>
                        <strong>{student.name}</strong>
                      </Link>
                      <div className="muted" style={{ fontSize: "0.78rem" }} dir="ltr">
                        {student.phone}
                      </div>
                    </td>
                    <td>
                      {student.grade} / {student.field}
                      <div className="muted" style={{ fontSize: "0.78rem" }}>
                        {TRACK_LABELS[student.track as keyof typeof TRACK_LABELS] ?? student.track}
                      </div>
                    </td>
                    <td>
                      {student.planStatus === "approved" || student.planStatus === "active" ? (
                        <span className="badge badge-green">تأییدشده</span>
                      ) : student.planStatus === "draft" ? (
                        <span className="badge badge-warn">پیش‌نویس</span>
                      ) : (
                        <span className="badge">بدون برنامه</span>
                      )}
                      {student.totalTasks > 0 ? (
                        <div className="muted" style={{ fontSize: "0.78rem" }}>
                          {student.doneTasks} از {student.totalTasks} انجام‌شده
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {student.todayTasks === 0
                        ? "—"
                        : `${student.todayDone} از ${student.todayTasks}`}
                    </td>
                    <td>{student.remainingUnits.toLocaleString("fa-IR")}</td>
                    <td>
                      {student.hasAccount ? (
                        <span className="badge badge-green">فعال</span>
                      ) : (
                        <span className="badge badge-warn">در انتظار</span>
                      )}
                    </td>
                    <td>
                      <Link className="btn btn-secondary btn-sm" href={`/counselor/students/${student.id}`}>
                        مدیریت
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
