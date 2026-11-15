import Link from "next/link";
import { requireCounselor } from "@/lib/auth";
import { formatTehranDateTime } from "@/lib/dates";
import { listPsychTests } from "@/lib/psych-server";
import { PSYCH_STATUS_CLASSES, PSYCH_STATUS_LABELS } from "@/lib/psych";

export default async function PsychTestsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const counselor = await requireCounselor();
  const { success, error } = await searchParams;
  const tests = await listPsychTests(counselor.workspaceId);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <h1>آزمون‌های روان‌شناسی</h1>
          <small>
            آزمون ثابت بسازید: سوال، گزینه، امتیاز هر گزینه و تحلیل نتیجه. بدون هوش مصنوعی.
          </small>
        </div>
        <Link className="btn" href="/counselor/psych-tests/new">
          ساخت آزمون روان‌شناسی
        </Link>
      </div>

      {success === "created" ? <div className="alert alert-success">آزمون ساخته شد.</div> : null}
      {success === "deleted" ? <div className="alert alert-success">آزمون حذف شد.</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        {tests.length === 0 ? (
          <div className="empty">هنوز آزمون روان‌شناسی نساخته‌اید.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>آزمون</th>
                  <th>بُعد</th>
                  <th>سوال</th>
                  <th>شرکت‌کننده</th>
                  <th>انتشار</th>
                  <th>وضعیت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tests.map((test) => (
                  <tr key={test.id}>
                    <td>
                      <Link href={`/counselor/psych-tests/${test.id}`}>
                        <strong>{test.title}</strong>
                      </Link>
                      {test.description ? (
                        <div className="muted" style={{ fontSize: "0.78rem" }}>
                          {test.description}
                        </div>
                      ) : null}
                    </td>
                    <td>{test.dimensionCount.toLocaleString("fa-IR")}</td>
                    <td>{test.questionCount.toLocaleString("fa-IR")}</td>
                    <td>{test.attemptCount.toLocaleString("fa-IR")}</td>
                    <td style={{ fontSize: "0.82rem" }}>
                      {test.publishedAt ? formatTehranDateTime(test.publishedAt) : "—"}
                    </td>
                    <td>
                      <span className={`badge ${PSYCH_STATUS_CLASSES[test.status] ?? "badge"}`}>
                        {PSYCH_STATUS_LABELS[test.status] ?? test.status}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="btn btn-secondary btn-sm"
                        href={`/counselor/psych-tests/${test.id}`}
                      >
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
