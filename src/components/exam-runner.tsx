"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveAnswerAction, submitExamAction } from "@/app/actions/exams";
import type { SnapshotClientItem } from "@/lib/exam";

type AnswerValue = string | number | undefined;

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function ExamRunner({
  examId,
  title,
  items,
  initialAnswers,
  serverNow,
  deadlineAt,
}: {
  examId: string;
  title: string;
  items: SnapshotClientItem[];
  initialAnswers: Record<string, AnswerValue>;
  serverNow: string;
  deadlineAt: string;
}) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(initialAnswers);
  const [remaining, setRemaining] = useState(() => {
    const offset = new Date(serverNow).getTime() - Date.now();
    return Math.max(0, (new Date(deadlineAt).getTime() - (Date.now() + offset)) / 1000);
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [submitting, startTransition] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const submitted = useRef(false);

  const answeredCount = useMemo(
    () => items.filter((item) => answers[item.id] !== undefined && answers[item.id] !== "").length,
    [answers, items],
  );

  const doSubmit = () => {
    if (submitted.current) return;
    submitted.current = true;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("examId", examId);
      await submitExamAction(formData);
    });
  };

  useEffect(() => {
    const offset = new Date(serverNow).getTime() - Date.now();
    const interval = setInterval(() => {
      const left = (new Date(deadlineAt).getTime() - (Date.now() + offset)) / 1000;
      setRemaining(Math.max(0, left));
      if (left <= 0 && !submitted.current) {
        doSubmit();
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineAt, serverNow]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!submitted.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  function updateAnswer(item: SnapshotClientItem, value: AnswerValue) {
    setAnswers((previous) => ({ ...previous, [item.id]: value }));
    setSaveState("saving");

    if (timers.current[item.id]) clearTimeout(timers.current[item.id]);
    timers.current[item.id] = setTimeout(async () => {
      const result = await saveAnswerAction(examId, item.id, value ?? null);
      if (result.expired) {
        setMessage("زمان آزمون تمام شد؛ پاسخ‌ها به‌صورت خودکار تحویل شد.");
        doSubmit();
        return;
      }
      if (!result.ok) {
        setSaveState("error");
        setMessage(result.error ?? "ذخیره پاسخ انجام نشد.");
        return;
      }
      setSaveState("saved");
    }, 500);
  }

  const danger = remaining < 5 * 60;

  return (
    <div className="stack" style={{ gap: "0.9rem" }}>
      <div
        className="stat"
        style={{
          position: "sticky",
          top: "58px",
          zIndex: 10,
          borderColor: danger ? "var(--danger)" : "var(--border)",
          background: danger ? "var(--danger-soft)" : "var(--surface)",
        }}
      >
        <div className="row between">
          <div>
            <div className="stat-label">{title}</div>
            <strong style={{ fontSize: "1.25rem", fontVariantNumeric: "tabular-nums" }}>
              {formatClock(remaining)}
            </strong>
          </div>
          <div className="stack" style={{ gap: "0.2rem", alignItems: "flex-end" }}>
            <small>
              {answeredCount} از {items.length} پاسخ‌داده
            </small>
            <small>
              {saveState === "saving"
                ? "در حال ذخیره…"
                : saveState === "saved"
                  ? "ذخیره شد"
                  : saveState === "error"
                    ? "خطای ذخیره"
                    : "ذخیره خودکار فعال"}
            </small>
          </div>
        </div>
        <div className="progress" style={{ marginTop: "0.45rem" }}>
          <span style={{ width: `${items.length === 0 ? 0 : (answeredCount / items.length) * 100}%` }} />
        </div>
      </div>

      {message ? <div className="alert alert-warn">{message}</div> : null}

      <div className="stack" style={{ gap: "0.8rem" }}>
        {items.map((item, index) => (
          <div key={item.id} className="card">
            <div className="row between" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
              <strong style={{ lineHeight: 1.7 }}>
                {index + 1}. {item.body}
              </strong>
              <span className="badge">
                {item.topic || "بدون مبحث"} · {item.score} نمره
              </span>
            </div>

            {item.type === "mcq" ? (
              <div className="stack" style={{ gap: "0.35rem", marginTop: "0.6rem" }}>
                {(item.options ?? []).map((option, optionIndex) => {
                  const value = optionIndex + 1;
                  return (
                    <label
                      key={optionIndex}
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "flex-start",
                        border: "1px solid var(--border)",
                        borderRadius: "10px",
                        padding: "0.5rem 0.65rem",
                        margin: 0,
                        fontWeight: 400,
                        cursor: "pointer",
                        background: answers[item.id] === value ? "var(--brand-soft)" : "#fff",
                        borderColor: answers[item.id] === value ? "var(--brand)" : "var(--border)",
                      }}
                    >
                      <input
                        type="radio"
                        name={`q-${item.id}`}
                        checked={answers[item.id] === value}
                        onChange={() => updateAnswer(item, value)}
                        style={{ width: "18px", minHeight: "auto", marginTop: "0.25rem" }}
                      />
                      <span>
                        {value}) {option}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="field" style={{ marginTop: "0.6rem" }}>
                <label>پاسخ کوتاه</label>
                <textarea
                  value={typeof answers[item.id] === "string" ? String(answers[item.id]) : ""}
                  onChange={(event) => updateAnswer(item, event.target.value)}
                  placeholder="پاسخ خود را بنویسید…"
                  rows={3}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="row between">
          <small>
            با زدن تحویل، پاسخ‌ها ارسال می‌شوند و امکان بازگشت نیست. تا پایان مهلت، پاسخ‌ها
            خودکار ذخیره می‌شوند.
          </small>
          <button type="button" onClick={doSubmit} disabled={submitting}>
            {submitting ? "در حال تحویل…" : "تحویل نهایی آزمون"}
          </button>
        </div>
      </div>
    </div>
  );
}
