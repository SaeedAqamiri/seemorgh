import Link from "next/link";
import { notFound } from "next/navigation";
import { respondChallengeAction } from "@/app/actions/challenges";
import { SubmitButton } from "@/components/submit-button";
import { requireStudent } from "@/lib/auth";
import { getChallengeDetail, sweepChallenges, type ChallengeResultRow } from "@/lib/challenges";
import { formatTehranDateTime } from "@/lib/dates";

const toFa = (value: number) => value.toLocaleString("fa-IR");

function inviteStatusLabel(row: ChallengeResultRow, finished: boolean): string {
  if (row.inviteStatus === "declined") return "رد کرده";
  if (row.inviteStatus === "expired") return "منقضی";
  if (row.inviteStatus === "pending") return "در انتظار پاسخ";
  if (row.attemptStatus === "none") return finished ? "غایب" : "—";
  if (row.attemptStatus === "in_progress") return "در حال اجرا";
  return `${toFa(row.percent ?? 0)}٪`;
}

function inviteStatusClass(row: ChallengeResultRow): string {
  if (row.attemptStatus === "submitted" || row.attemptStatus === "graded") return "badge-green";
  if (row.inviteStatus === "declined" || row.inviteStatus === "expired") return "badge-warn";
  return "";
}

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, student } = await requireStudent();
  const { id } = await params;
  await sweepChallenges();
  const detail = await getChallengeDetail(user.workspaceId, id, student.id);
  if (!detail) notFound();

  const now = Date.now();
  const beforeStart = now < detail.scheduledAt.getTime();
  const afterEnd = now >= detail.endAt.getTime();
  const hasAttempt = detail.results.some(
    (row) => row.studentId === student.id && row.attemptStatus !== "none",
  );
  const anyAttempt = detail.results.some((row) => row.attemptStatus !== "none");
  const canStartExam =
    detail.viewerInviteStatus === "accepted" && !beforeStart && !afterEnd && !hasAttempt;
  const canRespond =
    detail.viewerInviteStatus === "pending" && detail.status === "pending" && !beforeStart;
  const winner = detail.results.find(
    (row) => row.attemptStatus === "submitted" || row.attemptStatus === "graded",
  );

  return (
    <div className="stack">
      <div>
        <Link href="/student/challenges" className="muted" style={{ fontSize: "0.82rem" }}>
          ← بازگشت به چالش‌ها
        </Link>
        <h1>{detail.title}</h1>
        <small>
          دعوت‌کننده: {detail.inviterName} · {formatTehranDateTime(detail.scheduledAt)}
        </small>
      </div>

      <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
        <span
          className={`badge ${
            detail.status === "completed"
              ? "badge-green"
              : detail.status === "cancelled"
                ? "badge-warn"
                : ""
          }`}
        >
          {detail.status === "pending"
            ? beforeStart
              ? "در انتظار شروع"
              : "در حال اجرا"
            : detail.status === "completed"
              ? "تمام شده"
              : "لغو شده"}
        </span>
        <span className="badge">
          {toFa(detail.questionCount)} سوال · {toFa(detail.durationMinutes)} دقیقه
        </span>
        <span className="badge">
          پایان فرصت: {formatTehranDateTime(detail.endAt)}
        </span>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>مشخصات آزمون: {detail.examTitle}</h3>
        <ul style={{ margin: 0, paddingRight: "1.2rem" }}>
          {detail.topics.map((topic) => (
            <li key={topic} className="muted" style={{ fontSize: "0.85rem" }}>
              {topic}
            </li>
          ))}
        </ul>
      </div>

      {canRespond ? (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            این چالش را برای ساعت {formatTehranDateTime(detail.scheduledAt)} قبول می‌کنی؟
          </p>
          <div className="row" style={{ gap: "0.5rem" }}>
            <form action={respondChallengeAction}>
              <input type="hidden" name="challengeId" value={detail.id} />
              <input type="hidden" name="decision" value="accept" />
              <SubmitButton pendingLabel="در حال ثبت…">تایید چالش</SubmitButton>
            </form>
            <form action={respondChallengeAction}>
              <input type="hidden" name="challengeId" value={detail.id} />
              <input type="hidden" name="decision" value="decline" />
              <SubmitButton className="btn btn-secondary" pendingLabel="در حال ثبت…">
                رد کردن
              </SubmitButton>
            </form>
          </div>
        </div>
      ) : null}

      {canStartExam ? (
        <div className="alert alert-success">
          <div className="row between">
            <span>آزمون چالش برای تو باز است. وقتش رسیده!</span>
            <Link className="btn btn-sm" href="/student/exams">
              رفتن به آزمون
            </Link>
          </div>
        </div>
      ) : null}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>شرکت‌کننده‌ها ({toFa(detail.participants.length + 1)})</h3>
        <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
          <span className="badge">
            {detail.inviterName} (دعوت‌کننده)
          </span>
          {detail.participants.map((participant) => (
            <span
              key={participant.studentId}
              className={`badge ${
                participant.status === "accepted"
                  ? "badge-green"
                  : participant.status === "declined" || participant.status === "expired"
                    ? "badge-warn"
                    : ""
              }`}
            >
              {participant.studentName}
              {participant.status === "accepted"
                ? " — تایید کرد"
                : participant.status === "declined"
                  ? " — رد کرد"
                  : participant.status === "expired"
                    ? " — منقضی"
                    : " — در انتظار پاسخ"}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>نتایج</h3>
        {!anyAttempt ? (
          <p className="muted">بعد از شروع چالش، نتایج اینجا نمایش داده می‌شود.</p>
        ) : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>رتبه</th>
                <th>دانش‌آموز</th>
                <th>وضعیت</th>
                <th>درست</th>
                <th>غلط</th>
                <th>نزده</th>
                <th>زمان</th>
              </tr>
            </thead>
            <tbody>
              {detail.results.map((row, index) => (
                <tr key={row.studentId}>
                  <td>
                    {row.attemptStatus === "submitted" || row.attemptStatus === "graded"
                      ? toFa(index + 1)
                      : "—"}
                    {winner && row.studentId === winner.studentId ? (
                      <span className="badge badge-green" style={{ marginInlineStart: "0.3rem" }}>
                        برنده
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {row.studentName}
                    {row.studentId === student.id ? " (تو)" : ""}
                    {row.role === "inviter" ? " — دعوت‌کننده" : ""}
                  </td>
                  <td>
                    <span className={`badge ${inviteStatusClass(row)}`}>
                      {inviteStatusLabel(row, detail.status === "completed")}
                    </span>
                  </td>
                  <td>{toFa(row.correct)}</td>
                  <td>{toFa(row.wrong)}</td>
                  <td>{toFa(row.blank)}</td>
                  <td>
                    {row.timeSpentSec > 0
                      ? `${toFa(Math.round(row.timeSpentSec / 60))} دقیقه`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
