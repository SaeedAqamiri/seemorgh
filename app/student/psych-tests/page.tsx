import Link from "next/link";
import { startPsychAttemptAction } from "@/app/actions/psych";
import { SubmitButton } from "@/components/submit-button";
import { requireStudent } from "@/lib/auth";
import { formatTehranDateTime } from "@/lib/dates";
import { listPsychTests, listUserPsychAttempts } from "@/lib/psych-server";

export default async function StudentPsychTestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { user } = await requireStudent();
  const { error } = await searchParams;

  const [allTests, attempts] = await Promise.all([
    listPsychTests(user.workspaceId),
    listUserPsychAttempts(user.id),
  ]);
  const tests = allTests.filter((test) => test.status === "published");

  const attemptsByTest = new Map<string, typeof attempts>();
  for (const row of attempts) {
    const list = attemptsByTest.get(row.attempt.testId) ?? [];
    list.push(row);
    attemptsByTest.set(row.attempt.testId, list);
  }

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div>
        <h1>آزمون‌های روان‌شناسی</h1>
        <small>
          آزمون‌های ثابت مشاور را اینجا شرکت کن و نتیجهٔ خودت را بر اساس امتیاز بُعدها ببین.
        </small>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="stack">
        {tests.length === 0 ? (
          <div className="card empty">هنوز آزمون روان‌شناسی منتشرشده‌ای وجود ندارد.</div>
        ) : (
          tests.map((test) => {
            const testAttempts = attemptsByTest.get(test.id) ?? [];
            const latest = testAttempts[0];
            const latestSubmitted = testAttempts.find(
              (row) => row.attempt.status === "submitted",
            );
            const inProgress = testAttempts.find(
              (row) => row.attempt.status === "in_progress",
            );
            return (
              <div key={test.id} className="card">
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <h2>{test.title}</h2>
                    <small>
                      {test.dimensionCount.toLocaleString("fa-IR")} بُعد —{" "}
                      {test.questionCount.toLocaleString("fa-IR")} سوال
                    </small>
                    {test.description ? (
                      <p className="muted" style={{ margin: "0.4rem 0 0" }}>
                        {test.description}
                      </p>
                    ) : null}
                  </div>
                  <form action={startPsychAttemptAction}>
                    <input type="hidden" name="testId" value={test.id} />
                    <SubmitButton pendingLabel="…">
                      {inProgress ? "ادامه آزمون" : latestSubmitted ? "شرکت مجدد" : "شروع آزمون"}
                    </SubmitButton>
                  </form>
                </div>

                {latestSubmitted ? (
                  <div
                    style={{
                      marginTop: "0.7rem",
                      borderTop: "1px solid var(--border)",
                      paddingTop: "0.6rem",
                    }}
                  >
                    <div className="row between" style={{ flexWrap: "wrap" }}>
                      <div>
                        <span className="muted" style={{ fontSize: "0.8rem" }}>
                          آخرین نتیجه:
                        </span>{" "}
                        <strong dir="ltr">{latestSubmitted.attempt.resultCode}</strong>{" "}
                        <span>{latestSubmitted.attempt.resultTitle}</span>
                        {latestSubmitted.attempt.submittedAt ? (
                          <small className="muted">
                            {" "}
                            — {formatTehranDateTime(latestSubmitted.attempt.submittedAt)}
                          </small>
                        ) : null}
                      </div>
                      <Link
                        className="btn btn-secondary btn-sm"
                        href={`/student/psych-tests/${test.id}/result/${latestSubmitted.attempt.id}`}
                      >
                        دیدن نتیجه
                      </Link>
                    </div>
                  </div>
                ) : latest && latest.attempt.status === "in_progress" ? (
                  <small className="muted" style={{ display: "block", marginTop: "0.6rem" }}>
                    یک آزمون نیمه‌تمام داری؛ با «ادامه آزمون» همان را تکمیل می‌کنی.
                  </small>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {attempts.length > 0 ? (
        <div className="card">
          <div className="section-head">
            <h2>تاریخچهٔ نتایج من</h2>
            <small>{attempts.length.toLocaleString("fa-IR")} تلاش</small>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>آزمون</th>
                  <th>کد</th>
                  <th>عنوان</th>
                  <th>زمان</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {attempts.map((row) => (
                  <tr key={row.attempt.id}>
                    <td>{row.testTitle}</td>
                    <td>
                      <strong dir="ltr">{row.attempt.resultCode || "—"}</strong>
                    </td>
                    <td>{row.attempt.resultTitle || (row.attempt.status === "in_progress" ? "در حال انجام" : "—")}</td>
                    <td style={{ fontSize: "0.82rem" }}>
                      {row.attempt.submittedAt
                        ? formatTehranDateTime(row.attempt.submittedAt)
                        : formatTehranDateTime(row.attempt.startedAt)}
                    </td>
                    <td>
                      {row.attempt.status === "submitted" ? (
                        <Link
                          className="btn btn-secondary btn-sm"
                          href={`/student/psych-tests/${row.attempt.testId}/result/${row.attempt.id}`}
                        >
                          نتیجه
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
