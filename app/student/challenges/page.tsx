import Link from "next/link";
import {
  cancelChallengeAction,
  respondChallengeAction,
} from "@/app/actions/challenges";
import { SubmitButton } from "@/components/submit-button";
import { requireStudent } from "@/lib/auth";
import {
  listChallengesForStudent,
  sweepChallenges,
  type ChallengeListRow,
} from "@/lib/challenges";
import { formatTehranDateTime } from "@/lib/dates";

const toFa = (value: number) => value.toLocaleString("fa-IR");

const STATUS_LABELS: Record<ChallengeListRow["status"], string> = {
  pending: "در انتظار شروع",
  cancelled: "لغو شده",
  completed: "تمام شده",
};

const INVITE_STATUS_LABELS: Record<string, string> = {
  pending: "در انتظار پاسخ",
  accepted: "تایید شده",
  declined: "رد شده",
  expired: "منقضی",
  inviter: "دعوت‌کننده",
};

export default async function StudentChallengesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { student } = await requireStudent();
  const { error, sent } = await searchParams;
  await sweepChallenges();
  const rows = await listChallengesForStudent(student.id);

  const receivedInvites = rows.filter(
    (row) => row.myRole === "invitee" && row.myInviteStatus === "pending" && row.status === "pending",
  );
  const otherRows = rows.filter(
    (row) => !(row.myRole === "invitee" && row.myInviteStatus === "pending" && row.status === "pending"),
  );

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1>چالش‌ها</h1>
          <small>با آزمون‌هایی که خودت ساخته‌ای بقیه را به رقابت دعوت کن.</small>
        </div>
        <Link className="btn" href="/student/challenges/new">
          چالش جدید
        </Link>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {sent ? (
        <div className="alert alert-success">دعوت چالش ارسال شد. منتظر پاسخ بمان.</div>
      ) : null}

      <h2 style={{ margin: 0 }}>دعوت‌های دریافتی</h2>
      {receivedInvites.length === 0 ? (
        <div className="card empty">دعوت بازی برای چالش نداری.</div>
      ) : (
        <div className="stack">
          {receivedInvites.map((row) => (
            <div key={row.id} className="card">
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ margin: 0 }}>{row.title}</h2>
                  <small>
                    از {row.inviterName} · {row.examTitle} ({toFa(row.questionCount)} سوال،{" "}
                    {toFa(row.durationMinutes)} دقیقه)
                  </small>
                  <div style={{ marginTop: "0.4rem" }}>
                    <span className="badge badge-warn">
                      {formatTehranDateTime(row.scheduledAt)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="row" style={{ marginTop: "0.6rem", gap: "0.5rem" }}>
                <form action={respondChallengeAction}>
                  <input type="hidden" name="challengeId" value={row.id} />
                  <input type="hidden" name="decision" value="accept" />
                  <SubmitButton pendingLabel="در حال ثبت…">تایید چالش</SubmitButton>
                </form>
                <form action={respondChallengeAction}>
                  <input type="hidden" name="challengeId" value={row.id} />
                  <input type="hidden" name="decision" value="decline" />
                  <SubmitButton className="btn btn-secondary" pendingLabel="در حال ثبت…">
                    رد کردن
                  </SubmitButton>
                </form>
                <Link className="btn btn-ghost" href={`/student/challenges/${row.id}`}>
                  جزئیات
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ margin: 0 }}>چالش‌های من</h2>
      {otherRows.length === 0 ? (
        <div className="card empty">
          هنوز چالشی نساخته‌ای.
          <div style={{ marginTop: "0.6rem" }}>
            <Link className="btn btn-secondary btn-sm" href="/student/challenges/new">
              ساخت اولین چالش
            </Link>
          </div>
        </div>
      ) : (
        <div className="stack">
          {otherRows.map((row) => {
            const canCancel =
              row.myRole === "inviter" && row.status === "pending";
            return (
              <div key={row.id} className="card">
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ margin: 0 }}>{row.title}</h2>
                    <small>
                      {row.myRole === "inviter"
                        ? `ساختهٔ تو برای ${toFa(row.acceptedCount + row.pendingCount)} نفر`
                        : `از ${row.inviterName}`}{" "}
                      · {row.examTitle} ({toFa(row.questionCount)} سوال)
                    </small>
                    <div style={{ marginTop: "0.4rem" }}>
                      <span className="badge">{formatTehranDateTime(row.scheduledAt)}</span>
                      <span
                        className={`badge ${
                          row.status === "completed"
                            ? "badge-green"
                            : row.status === "cancelled"
                              ? "badge-warn"
                              : ""
                        }`}
                        style={{ marginInlineStart: "0.35rem" }}
                      >
                        {row.status === "pending" &&
                        Date.now() >= row.scheduledAt.getTime() &&
                        (!row.endAt || Date.now() < row.endAt.getTime())
                          ? "در حال اجرا"
                          : STATUS_LABELS[row.status]}
                      </span>
                      {row.status === "pending" ? (
                        <span className="badge" style={{ marginInlineStart: "0.35rem" }}>
                          {toFa(row.acceptedCount)} تایید کرده
                          {row.pendingCount > 0 ? ` · ${toFa(row.pendingCount)} در انتظار` : ""}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="stack" style={{ gap: "0.35rem" }}>
                    {row.myPercent !== null ? (
                      <span className="badge badge-green">درصد تو: {toFa(row.myPercent)}٪</span>
                    ) : null}
                    <Link className="btn btn-secondary btn-sm" href={`/student/challenges/${row.id}`}>
                      جزئیات و نتایج
                    </Link>
                    {row.myInviteStatus === "accepted" && row.status !== "cancelled" ? (
                      <Link className="btn btn-sm" href="/student/exams">
                        آزمون چالش
                      </Link>
                    ) : null}
                  </div>
                </div>
                {row.status === "pending" && row.myRole === "invitee" ? (
                  <small className="muted">وضعیت دعوت تو: {INVITE_STATUS_LABELS[row.myInviteStatus]}</small>
                ) : null}
                {canCancel ? (
                  <form action={cancelChallengeAction} style={{ marginTop: "0.6rem" }}>
                    <input type="hidden" name="challengeId" value={row.id} />
                    <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="در حال لغو…">
                      لغو چالش
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
