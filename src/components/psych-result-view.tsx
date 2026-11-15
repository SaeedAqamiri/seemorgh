import Link from "next/link";
import { formatTehranDateTime } from "@/lib/dates";
import type { PsychAttemptView } from "@/lib/psych-server";

export function PsychResultView({
  view,
  backHref,
  showParticipant = false,
}: {
  view: PsychAttemptView;
  backHref: string;
  showParticipant?: boolean;
}) {
  const { attempt, test, result } = view;

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div>
          <Link href={backHref} className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت
          </Link>
          <h1>{test.title}</h1>
          <small>
            {showParticipant
              ? `${view.participantName} — ${attempt.participantRole === "counselor" ? "مشاور" : "دانش‌آموز"}`
              : "نتیجهٔ آزمون روان‌شناسی"}
            {attempt.submittedAt ? ` — ${formatTehranDateTime(attempt.submittedAt)}` : ""}
          </small>
        </div>
        <span className="badge badge-green">ثبت‌شده</span>
      </div>

      <div
        className="card"
        style={{
          background: "linear-gradient(135deg, var(--brand-soft, #eef2ff), #fff)",
          borderColor: "var(--brand)",
        }}
      >
        <div className="stat-label">نتیجهٔ نهایی</div>
        <div className="row" style={{ alignItems: "baseline", gap: "0.6rem", flexWrap: "wrap" }}>
          {result.code ? (
            <strong style={{ fontSize: "2.1rem", letterSpacing: "0.12rem" }} dir="ltr">
              {result.code}
            </strong>
          ) : null}
          <strong style={{ fontSize: "1.2rem" }}>{result.title}</strong>
        </div>
        {attempt.resultBody || result.body ? (
          <p style={{ marginTop: "0.65rem", lineHeight: 1.9, whiteSpace: "pre-line" }}>
            {attempt.resultBody || result.body}
          </p>
        ) : null}
        {!result.matchedRule ? (
          <small className="muted">
            {result.code
              ? "برای این کد تحلیل ترکیبی تعریف نشده است؛ متن بالا از تحلیل بازه‌های انتخاب‌شده ساخته شده است."
              : "تحلیل بالا از روی بازه‌ای که امتیاز هر بُعد در آن قرار گرفته ساخته شده است."}
          </small>
        ) : null}
      </div>

      <div className="card">
        <div className="section-head">
          <h2>امتیاز و بازهٔ بُعدها</h2>
          <small>مجموع امتیاز هر بُعد و بازهٔ متناظر آن</small>
        </div>
        <div className="stack" style={{ gap: "1rem" }}>
          {result.dimensions.map((dimension) => (
            <div key={dimension.dimensionId} className="stack" style={{ gap: "0.35rem" }}>
              <div className="row between">
                <strong>{dimension.title}</strong>
                <span className="badge">
                  امتیاز: {dimension.score.toLocaleString("fa-IR")}
                </span>
              </div>
              {dimension.description ? (
                <small className="muted">{dimension.description}</small>
              ) : null}
              <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
                {dimension.bands.map((band) => {
                  const active =
                    dimension.band !== null &&
                    band.min === dimension.band.min &&
                    band.max === dimension.band.max;
                  return (
                    <div
                      key={`${dimension.dimensionId}-${band.min}-${band.max ?? "open"}`}
                      style={{
                        border: "1px solid",
                        borderColor: active ? "var(--brand)" : "var(--border)",
                        background: active ? "var(--brand-soft, #eef2ff)" : "#fff",
                        borderRadius: "10px",
                        padding: "0.35rem 0.55rem",
                        minWidth: "74px",
                      }}
                    >
                      <div className="muted" style={{ fontSize: "0.72rem" }} dir="ltr">
                        {band.min} – {band.max === null ? "∞" : band.max}
                      </div>
                      <div style={{ fontSize: "0.82rem", fontWeight: active ? 700 : 400 }}>
                        {band.label}
                        {band.code ? (
                          <span className="muted" dir="ltr">
                            {" "}
                            ({band.code})
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              {dimension.bandAnalysis ? (
                <p style={{ fontSize: "0.85rem", margin: 0, lineHeight: 1.8 }}>
                  {dimension.bandAnalysis}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
