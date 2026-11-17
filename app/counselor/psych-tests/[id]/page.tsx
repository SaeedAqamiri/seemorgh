import Link from "next/link";
import { notFound } from "next/navigation";
import {
  archivePsychTestAction,
  deletePsychTestAction,
  publishPsychTestAction,
  startPsychAttemptAction,
} from "@/app/actions/psych";
import { SubmitButton } from "@/components/submit-button";
import { requireCounselor } from "@/lib/auth";
import { formatTehranDateTime } from "@/lib/dates";
import { getPsychTestContent, listPsychAttempts } from "@/lib/psych-server";
import { PSYCH_STATUS_CLASSES, PSYCH_STATUS_LABELS } from "@/lib/psych";

export default async function PsychTestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const counselor = await requireCounselor();
  const { id } = await params;
  const { success, error } = await searchParams;

  const content = await getPsychTestContent(counselor.workspaceId, id);
  if (!content) notFound();
  const attempts = await listPsychAttempts(counselor.workspaceId, id);

  const submittedCount = attempts.filter((row) => row.attempt.status === "submitted").length;
  const dimensionsById = new Map(content.dimensions.map((dimension) => [dimension.id, dimension]));
  const { test } = content;

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div>
          <Link href="/counselor/psych-tests" className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت به آزمون‌های روان‌شناسی
          </Link>
          <h1>{test.title}</h1>
          <small>{test.description || "بدون توضیح"}</small>
          {test.sourceUrl ? (
            <div style={{ marginTop: "0.35rem" }}>
              <a
                className="muted"
                href={test.sourceUrl}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: "0.78rem", textDecoration: "underline" }}
              >
                منبع الگو: {test.sourceUrl}
              </a>
            </div>
          ) : null}
        </div>
        <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span className={`badge ${PSYCH_STATUS_CLASSES[test.status] ?? "badge"}`}>
            {PSYCH_STATUS_LABELS[test.status] ?? test.status}
          </span>
          {test.status === "draft" ? (
            <>
              <Link className="btn btn-secondary" href={`/counselor/psych-tests/${id}/edit`}>
                ویرایش
              </Link>
              <form action={publishPsychTestAction}>
                <input type="hidden" name="testId" value={id} />
                <SubmitButton pendingLabel="در حال انتشار…">انتشار آزمون</SubmitButton>
              </form>
              <form action={deletePsychTestAction}>
                <input type="hidden" name="testId" value={id} />
                <SubmitButton className="btn-danger" pendingLabel="…">
                  حذف پیش‌نویس
                </SubmitButton>
              </form>
            </>
          ) : null}
          {test.status === "published" ? (
            <>
              <form action={startPsychAttemptAction}>
                <input type="hidden" name="testId" value={id} />
                <SubmitButton>شرکت در آزمون</SubmitButton>
              </form>
              <form action={archivePsychTestAction}>
                <input type="hidden" name="testId" value={id} />
                <SubmitButton className="btn-secondary" pendingLabel="…">
                  آرشیو آزمون
                </SubmitButton>
              </form>
            </>
          ) : null}
          {test.status === "archived" ? (
            <form action={publishPsychTestAction}>
              <input type="hidden" name="testId" value={id} />
              <SubmitButton pendingLabel="در حال انتشار…">انتشار مجدد</SubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      {success === "created" ? <div className="alert alert-success">آزمون ساخته شد.</div> : null}
      {success === "updated" ? <div className="alert alert-success">تغییرات ذخیره شد.</div> : null}
      {success === "published" ? (
        <div className="alert alert-success">آزمون منتشر شد و برای دانش‌آموزان قابل شرکت است.</div>
      ) : null}
      {success === "archived" ? <div className="alert alert-success">آزمون آرشیو شد.</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="grid grid-3">
        <div className="stat">
          <div className="stat-value">{content.dimensions.length.toLocaleString("fa-IR")}</div>
          <div className="stat-label">بُعد امتیازدهی</div>
        </div>
        <div className="stat">
          <div className="stat-value">{content.questions.length.toLocaleString("fa-IR")}</div>
          <div className="stat-label">سوال</div>
        </div>
        <div className="stat">
          <div className="stat-value">{submittedCount.toLocaleString("fa-IR")}</div>
          <div className="stat-label">نتیجه ثبت‌شده</div>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>بُعدها، بازه‌ها و تحلیل</h2>
          <small>امتیاز هر بُعد در یکی از بازه‌ها قرار می‌گیرد و تحلیل همان بازه نمایش داده می‌شود.</small>
        </div>
        {content.dimensions.length === 0 ? (
          <div className="empty">بُعدی تعریف نشده است.</div>
        ) : (
          <div className="stack">
            {content.dimensions.map((dimension) => (
              <div key={dimension.id} className="card">
                <strong>{dimension.title}</strong>
                {dimension.description ? (
                  <div className="muted" style={{ fontSize: "0.82rem" }}>
                    {dimension.description}
                  </div>
                ) : null}
                <div className="table-wrap" style={{ marginTop: "0.4rem" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>بازه امتیاز</th>
                        <th>برچسب</th>
                        <th>کد</th>
                        <th>تحلیل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dimension.bandsJson ?? []).map((band) => (
                        <tr key={`${dimension.id}-${band.min}-${band.max ?? "open"}`}>
                          <td dir="ltr">
                            {band.min} – {band.max === null ? "∞" : band.max}
                          </td>
                          <td>{band.label}</td>
                          <td>
                            <strong dir="ltr">{band.code || "—"}</strong>
                          </td>
                          <td className="muted" style={{ fontSize: "0.8rem" }}>
                            {band.analysis || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-head">
          <h2>سوال‌ها</h2>
          <small>{content.questions.length} سوال ثبت شده است.</small>
        </div>
        {content.questions.length === 0 ? (
          <div className="empty">سوالی ثبت نشده است.</div>
        ) : (
          <div className="stack">
            {content.questions.map((question, index) => (
              <div key={question.id} className="card">
                <strong>
                  {index + 1}. {question.body}
                </strong>
                <div className="stack" style={{ gap: "0.3rem", marginTop: "0.5rem" }}>
                  {question.options.map((option, optionIndex) => {
                    const scoreParts = Object.entries(option.scoresJson ?? {})
                      .map(([dimensionId, score]) => {
                        const dimension = dimensionsById.get(dimensionId);
                        if (!dimension || !score) return null;
                        return `${dimension.title} +${score}`;
                      })
                      .filter(Boolean)
                      .join(" | ");
                    return (
                      <div key={option.id} className="row between" style={{ gap: "0.5rem" }}>
                        <span>
                          {optionIndex + 1}) {option.body}
                        </span>
                        <small className="muted">
                          {scoreParts || "بدون امتیاز"}
                        </small>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {content.rules.length > 0 ? (
        <div className="card">
          <div className="section-head">
            <h2>تحلیل‌های ترکیبی</h2>
            <small>{content.rules.length} تحلیل برای کدهای نتیجه</small>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>کد</th>
                  <th>عنوان</th>
                  <th>متن تحلیل</th>
                </tr>
              </thead>
              <tbody>
                {content.rules.map((rule) => (
                  <tr key={rule.code}>
                    <td>
                      <strong dir="ltr">{rule.code}</strong>
                    </td>
                    <td>{rule.title}</td>
                    <td className="muted" style={{ fontSize: "0.82rem" }}>
                      {rule.body}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="section-head">
          <h2>نتایج شرکت‌کننده‌ها</h2>
          <small>{attempts.length.toLocaleString("fa-IR")} تلاش ثبت شده است.</small>
        </div>
        {attempts.length === 0 ? (
          <div className="empty">هنوز کسی در این آزمون شرکت نکرده است.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>شرکت‌کننده</th>
                  <th>نقش</th>
                  <th>کد نتیجه</th>
                  <th>عنوان</th>
                  <th>زمان ثبت</th>
                  <th>وضعیت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {attempts.map((row) => (
                  <tr key={row.attempt.id}>
                    <td>{row.participantName}</td>
                    <td>{row.participantRole === "counselor" ? "مشاور" : "دانش‌آموز"}</td>
                    <td>
                      <strong dir="ltr">{row.attempt.resultCode || "—"}</strong>
                    </td>
                    <td>{row.attempt.resultTitle || "—"}</td>
                    <td style={{ fontSize: "0.82rem" }}>
                      {row.attempt.submittedAt
                        ? formatTehranDateTime(row.attempt.submittedAt)
                        : formatTehranDateTime(row.attempt.startedAt)}
                    </td>
                    <td>
                      <span
                        className={`badge ${row.attempt.status === "submitted" ? "badge-green" : "badge-warn"}`}
                      >
                        {row.attempt.status === "submitted" ? "ثبت‌شده" : "در حال انجام"}
                      </span>
                    </td>
                    <td>
                      {row.attempt.status === "submitted" ? (
                        <Link
                          className="btn btn-secondary btn-sm"
                          href={`/counselor/psych-tests/${id}/result/${row.attempt.id}`}
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
        )}
      </div>
    </div>
  );
}
