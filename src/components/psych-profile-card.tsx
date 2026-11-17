import Link from "next/link";
import { formatTehranDateTime } from "@/lib/dates";
import { PSYCH_CATEGORY_LABELS } from "@/lib/psych-catalog";
import type { StudentPsychProfile } from "@/lib/psych-profile";

export function PsychProfileCard({
  profile,
  studentId,
  compact = false,
}: {
  profile: StudentPsychProfile;
  studentId: string;
  compact?: boolean;
}) {
  const { attempts, recommendations, careerInterests, strengths } = profile;

  if (attempts.length === 0) {
    return (
      <div className="card">
        <div className="section-head">
          <div>
            <h2>پروفایل روان‌شناختی</h2>
            <small>هنوز نتیجه‌ای برای این دانش‌آموز ثبت نشده است.</small>
          </div>
          <Link className="btn btn-secondary btn-sm" href="/counselor/psych-tests">
            مشاهده آزمون‌ها
          </Link>
        </div>
        <p className="muted" style={{ margin: 0, lineHeight: 1.9 }}>
          با شرکت دانش‌آموز در آزمون‌های تحصیلی، شغلی و شخصیتی، پروفایل او کامل می‌شود و
          توصیه‌های برنامه‌ریزی به‌صورت خودکار در تنظیمات برنامه لحاظ می‌شود.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h2>پروفایل روان‌شناختی و توصیه‌های برنامه‌ریزی</h2>
          <small>
            {attempts.length.toLocaleString("fa-IR")} آزمون ثبت‌شده — بر پایه جدیدترین نتیجه هر آزمون
          </small>
        </div>
        <Link className="btn btn-secondary btn-sm" href="/counselor/psych-tests">
          آزمون‌ها
        </Link>
      </div>

      {(strengths.length > 0 || careerInterests.length > 0) && (
        <div className="grid grid-2" style={{ marginBottom: "0.8rem" }}>
          {strengths.length > 0 ? (
            <div>
              <strong style={{ fontSize: "0.88rem" }}>نقاط قوت</strong>
              <div className="row" style={{ flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
                {strengths.map((strength) => (
                  <span key={strength} className="badge badge-green">
                    {strength}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {careerInterests.length > 0 ? (
            <div>
              <strong style={{ fontSize: "0.88rem" }}>علایق شغلی برجسته</strong>
              <div className="row" style={{ flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
                {careerInterests.map((interest) => (
                  <span key={interest.title} className="badge">
                    {interest.title} — {interest.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {recommendations.length > 0 ? (
        <div className="stack" style={{ gap: "0.45rem" }}>
          <strong style={{ fontSize: "0.88rem" }}>توصیه‌های اثرگذار بر برنامه</strong>
          {recommendations.map((recommendation) => (
            <div
              key={recommendation.title}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "0.55rem 0.7rem",
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.86rem" }}>{recommendation.title}</div>
              <div className="muted" style={{ fontSize: "0.8rem", lineHeight: 1.8 }}>
                {recommendation.body}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <small className="muted" style={{ display: "block" }}>
          نتیجه‌ها الگوی نگران‌کننده‌ای برای برنامه‌ریزی نشان نمی‌دهند؛ تنظیمات پیش‌فرض مناسب است.
        </small>
      )}

      {!compact ? (
        <>
          <hr className="divider" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>آزمون</th>
                  <th>دسته</th>
                  <th>نتیجه</th>
                  <th>تاریخ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {attempts.map((attempt) => (
                  <tr key={attempt.attemptId}>
                    <td>{attempt.testTitle}</td>
                    <td style={{ fontSize: "0.8rem" }}>
                      {PSYCH_CATEGORY_LABELS[attempt.category as keyof typeof PSYCH_CATEGORY_LABELS] ?? attempt.category}
                    </td>
                    <td>
                      {attempt.resultCode ? (
                        <strong dir="ltr" style={{ marginInlineEnd: "0.4rem" }}>
                          {attempt.resultCode}
                        </strong>
                      ) : null}
                      {attempt.resultTitle || "—"}
                    </td>
                    <td style={{ fontSize: "0.8rem" }}>
                      {formatTehranDateTime(attempt.submittedAt)}
                    </td>
                    <td>
                      <Link
                        className="btn btn-secondary btn-sm"
                        href={`/counselor/psych-tests/${attempt.testId}/result/${attempt.attemptId}`}
                      >
                        نتیجه
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <small className="muted" style={{ display: "block", marginTop: "0.5rem" }}>
          جزئیات کامل نتیجه‌ها در{" "}
          <Link href={`/counselor/students/${studentId}`} style={{ textDecoration: "underline" }}>
            پروفایل دانش‌آموز
          </Link>{" "}
          و صفحه هر آزمون قابل مشاهده است.
        </small>
      )}
    </div>
  );
}
