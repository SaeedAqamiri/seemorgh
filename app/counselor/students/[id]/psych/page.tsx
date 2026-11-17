import Link from "next/link";
import { notFound } from "next/navigation";
import {
  generatePsychAnalysisAction,
  generatePsychProfileSummaryAction,
} from "@/app/actions/psych";
import { SubmitButton } from "@/components/submit-button";
import {
  PsychAiAnalysisView,
  PsychProfileSummaryView,
} from "@/components/psych-analysis";
import { requireCounselor } from "@/lib/auth";
import { getStudentDetail } from "@/lib/counselor";
import { formatTehranDateTime } from "@/lib/dates";
import { getPsychProfileSummary } from "@/lib/psych-ai";
import { listStudentPsychAttemptViews } from "@/lib/psych-server";
import { PSYCH_CATEGORY_LABELS } from "@/lib/psych-catalog";

const LEVEL_BADGE: Record<string, string> = {
  low: "badge-warn",
  mid: "badge",
  high: "badge-green",
};

const LEVEL_LABEL: Record<string, string> = {
  low: "کم",
  mid: "متوسط",
  high: "بالا",
};

export default async function StudentPsychProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ summary?: string; error?: string }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const { summary, error } = await searchParams;

  const detail = await getStudentDetail(counselor.workspaceId, id);
  if (!detail) notFound();

  const [attempts, profileSummary] = await Promise.all([
    listStudentPsychAttemptViews(counselor.workspaceId, id),
    getPsychProfileSummary(id),
  ]);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <Link href={`/counselor/students/${id}`} className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت به {detail.student.name}
          </Link>
          <h1>پروفایل روان‌شناختی — {detail.student.name}</h1>
          <small>
            {attempts.length.toLocaleString("fa-IR")} آزمون تکمیل‌شده — نتایج و تحلیل شخصیتی بر
            پایه جدیدترین نتیجه هر آزمون
          </small>
        </div>
        <form action={generatePsychProfileSummaryAction}>
          <input type="hidden" name="studentId" value={id} />
          <input
            type="hidden"
            name="redirectTo"
            value={`/counselor/students/${id}/psych`}
          />
          <SubmitButton pendingLabel="در حال تحلیل پروفایل…">
            {profileSummary.data ? "تحلیل مجدد پروفایل با AI" : "تحلیل هوشمند پروفایل با AI"}
          </SubmitButton>
        </form>
      </div>

      {summary === "ai" ? (
        <div className="alert alert-success">پروفایل هوشمند با AI به‌روزرسانی شد.</div>
      ) : null}
      {summary === "fallback" ? (
        <div className="alert alert-warn">
          تحلیل هوشمند در دسترس نبود؛ جمع‌بندی پایه بر پایه نتایج آزمون ذخیره شد.
        </div>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      {attempts.length === 0 ? (
        <div className="card">
          <div className="section-head">
            <div>
              <h2>هنوز آزمونی تکمیل نشده است</h2>
              <small>
                با انتشار آزمون‌های روان‌شناسی و تکمیل آن‌ها توسط دانش‌آموز، پروفایل اینجا ساخته
                می‌شود.
              </small>
            </div>
            <Link className="btn btn-secondary btn-sm" href="/counselor/psych-tests">
              فهرست آزمون‌ها
            </Link>
          </div>
        </div>
      ) : null}

      {profileSummary.data ? (
        <div className="card">
          <div className="section-head">
            <div>
              <h2>جمع‌بندی پروفایل</h2>
              <small>
                منبع: {profileSummary.source === "ai" ? "تحلیل هوشمند (AI)" : "جمع‌بندی پایه"}
                {profileSummary.updatedAt ? ` — ${formatTehranDateTime(profileSummary.updatedAt)}` : ""}
              </small>
            </div>
            <span className="badge badge-green">پروفایل</span>
          </div>
          <PsychProfileSummaryView data={profileSummary.data} />
        </div>
      ) : attempts.length > 0 ? (
        <div className="alert alert-warn">
          برای دیدن جمع‌بندی کامل ویژگی‌های شخصیتی و تحصیلی، دکمه «تحلیل هوشمند پروفایل با AI» را
          بزنید.
        </div>
      ) : null}

      {attempts.map((row) => (
        <div className="card" key={row.attempt.id}>
          <div className="section-head">
            <div>
              <h2 style={{ fontSize: "1.05rem" }}>{row.testTitle}</h2>
              <small>
                {PSYCH_CATEGORY_LABELS[row.testCategory as keyof typeof PSYCH_CATEGORY_LABELS] ??
                  row.testCategory}
                {row.attempt.submittedAt ? ` — ${formatTehranDateTime(row.attempt.submittedAt)}` : ""}
              </small>
            </div>
            <div className="row" style={{ gap: "0.4rem" }}>
              {row.attempt.resultCode ? (
                <span className="badge badge-green" dir="ltr">
                  {row.attempt.resultCode}
                </span>
              ) : null}
              <Link
                className="btn btn-secondary btn-sm"
                href={`/counselor/psych-tests/${row.attempt.testId}/result/${row.attempt.id}`}
              >
                نتیجه کامل
              </Link>
            </div>
          </div>

          {row.attempt.resultTitle ? (
            <p style={{ margin: "0 0 0.4rem", fontWeight: 700, fontSize: "0.9rem" }}>
              نتیجه: {row.attempt.resultTitle}
            </p>
          ) : null}
          {row.attempt.resultBody ? (
            <p
              className="muted"
              style={{ margin: "0 0 0.6rem", fontSize: "0.82rem", lineHeight: 1.9, whiteSpace: "pre-line" }}
            >
              {row.attempt.resultBody}
            </p>
          ) : null}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>بُعد</th>
                  <th>امتیاز</th>
                  <th>بازه</th>
                  <th>سطح</th>
                </tr>
              </thead>
              <tbody>
                {row.dimensions.map((dimension) => (
                  <tr key={dimension.title}>
                    <td>{dimension.title}</td>
                    <td>{dimension.score.toLocaleString("fa-IR")}</td>
                    <td>{dimension.bandLabel || "—"}</td>
                    <td>
                      <span className={`badge ${LEVEL_BADGE[dimension.level] ?? "badge"}`}>
                        {LEVEL_LABEL[dimension.level] ?? dimension.level}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <hr className="divider" />

          {row.attempt.analysisJson ? (
            <div>
              <div className="row between" style={{ marginBottom: "0.4rem" }}>
                <strong style={{ fontSize: "0.85rem" }}>تحلیل شخصیت (AI)</strong>
                <div className="row" style={{ gap: "0.4rem" }}>
                  <span
                    className={`badge ${row.attempt.analysisSource === "ai" ? "badge-green" : ""}`}
                  >
                    {row.attempt.analysisSource === "ai" ? "تحلیل هوشمند" : "تحلیل پایه"}
                  </span>
                  <form action={generatePsychAnalysisAction}>
                    <input type="hidden" name="attemptId" value={row.attempt.id} />
                    <input
                      type="hidden"
                      name="redirectTo"
                      value={`/counselor/students/${id}/psych`}
                    />
                    <SubmitButton className="btn-secondary" pendingLabel="در حال تحلیل…">
                      تحلیل مجدد
                    </SubmitButton>
                  </form>
                </div>
              </div>
              <PsychAiAnalysisView analysis={row.attempt.analysisJson} />
            </div>
          ) : (
            <div className="row between">
              <small className="muted">برای این آزمون هنوز تحلیل هوشمند شخصیت تولید نشده است.</small>
              <form action={generatePsychAnalysisAction}>
                <input type="hidden" name="attemptId" value={row.attempt.id} />
                <input
                  type="hidden"
                  name="redirectTo"
                  value={`/counselor/students/${id}/psych`}
                />
                <SubmitButton pendingLabel="در حال تحلیل…">تحلیل با AI</SubmitButton>
              </form>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
