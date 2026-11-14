import { submitDailyChallengeAction } from "@/app/actions/student";
import { SubmitButton } from "@/components/submit-button";

export function DailyChallengeCard({ question }: { question: string }) {
  return (
    <div className="card" style={{ borderColor: "var(--brand)", background: "var(--brand-soft)" }}>
      <div className="section-head">
        <div>
          <h2>چالش شروع امروز</h2>
          <small>
            فقط اولین ورود امروز؛ بعد از حل این معادله، وارد برنامه روزانه شو.
          </small>
        </div>
      </div>
      <form action={submitDailyChallengeAction} className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "1.15rem", fontVariantNumeric: "tabular-nums" }}>
          {question}
        </strong>
        <input
          name="answer"
          type="text"
          inputMode="numeric"
          required
          aria-label="پاسخ چالش"
          placeholder="پاسخ"
          style={{ width: "110px" }}
        />
        <SubmitButton className="btn-sm" pendingLabel="در حال بررسی…">
          ثبت پاسخ
        </SubmitButton>
      </form>
    </div>
  );
}
