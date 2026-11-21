"use client";

import { useState } from "react";
import {
  approveWizardAdviceAction,
  generateWizardAiActionAction,
  generateWizardAdviceAction,
  generateWizardGoalsAction,
  saveWizardStep1Action,
  saveWizardStep2Action,
  saveWizardStep3Action,
} from "@/app/actions/exam-analysis-wizard";
import { SubmitButton } from "@/components/submit-button";
import type { ExamAnalysisGoalRow } from "@/db/schema";

export type WizardCauseRow = {
  subjectTitle: string;
  percent: number;
  wrong: number;
  blank: number;
  total: number;
  questionNote: string;
  cause: string;
  action: string;
  actionSource: string;
};

export type WizardPrepRow = {
  subjectTitle: string;
  topicTests: number;
  timedTests: number;
  avgPercent: number | null;
  approxPercent: number | null;
};

export type WizardSkipStat = {
  subjectTitle: string;
  consecutive: number;
  nonConsecutive: number;
};

const HIGH_CAUSE_CHIPS = ["بی‌دقتی", "کهنگی مبحث", "کمبود وقت", "اشتباه محاسباتی", "استرس"];
const LOW_CAUSE_CHIPS = [
  "مطالعه نشد",
  "حذف کردم",
  "مباحث پیش‌نیاز ضعیف",
  "زمان کم آوردم",
  "بی‌انگیزگی",
];

const STEP_LABELS = ["۱ — اطلاعات آزمون", "۲ — مراحل آماده‌سازی", "۳ — هدف‌گذاری آزمون بعدی"];

function initialStepFor(success?: string): 1 | 2 | 3 {
  if (success === "step2" || success === "ai-advice" || success === "advice-approved") return 2;
  if (success === "step3" || success === "ai-goals") return 3;
  return 1;
}

const fa = (value: number) => value.toLocaleString("fa-IR");

function CauseField({
  name,
  defaultValue,
  chips,
  placeholder,
}: {
  name: string;
  defaultValue: string;
  chips: string[];
  placeholder: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="stack" style={{ gap: "0.3rem" }}>
      <input
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
      />
      <div className="row" style={{ gap: "0.3rem", flexWrap: "wrap" }}>
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ padding: "0.1rem 0.5rem", fontSize: "0.72rem" }}
            onClick={() => setValue(chip)}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}

function AiBadge({ text }: { text: string }) {
  return (
    <span
      className="alert alert-info"
      style={{ padding: "0.2rem 0.5rem", fontSize: "0.72rem", display: "inline-block" }}
    >
      {text}
    </span>
  );
}

export function ExamAnalysisWizard({
  role,
  studentId,
  studentName,
  examSource,
  examRefId,
  examTitle,
  weightedPercent,
  step1Rows,
  counselorNoteHigh,
  counselorNoteLow,
  step2Rows,
  advice,
  adviceApproved,
  step3Rows,
  finalGoal,
  goalsSource,
  skipStats,
  aiReady,
  success,
}: {
  role: "student" | "counselor";
  studentId: string;
  studentName: string;
  examSource: string;
  examRefId: string;
  examTitle: string;
  weightedPercent: number;
  step1Rows: WizardCauseRow[];
  counselorNoteHigh: string;
  counselorNoteLow: string;
  step2Rows: WizardPrepRow[];
  advice: string;
  adviceApproved: boolean;
  step3Rows: ExamAnalysisGoalRow[];
  finalGoal: string;
  goalsSource: string;
  skipStats: WizardSkipStat[];
  aiReady: boolean;
  success?: string;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(initialStepFor(success));
  const isCounselor = role === "counselor";

  const highRows = step1Rows
    .map((row, index) => ({ row, index }))
    .filter((entry) => entry.row.percent >= 30);
  const lowRows = step1Rows
    .map((row, index) => ({ row, index }))
    .filter((entry) => entry.row.percent < 30);
  const skipByTitle = new Map(skipStats.map((stat) => [stat.subjectTitle, stat]));

  const causesComplete = highRows.every((entry) => entry.row.cause.trim() !== "");
  const weightedTarget =
    step3Rows.filter((row) => row.targetPercent !== null).length > 0
      ? Math.round(
          step3Rows
            .filter((row) => row.targetPercent !== null)
            .reduce((sum, row) => sum + (row.targetPercent as number), 0) /
            step3Rows.filter((row) => row.targetPercent !== null).length,
        )
      : null;

  const successMessages: Record<string, string> = {
    step1: "گام ۱ ذخیره شد.",
    step2: "گام ۲ ذخیره شد.",
    step3: "هدف‌گذاری ذخیره شد.",
    "ai-actions": "پیشنهادهای هوش مصنوعی در ستون «اقدام و راهبرد» ثبت شد؛ بازبینی کن و ذخیره کن.",
    "ai-advice": "پیش‌نویس توصیه مشاور با هوش مصنوعی ساخته شد؛ پس از بازبینی، تایید کن.",
    "ai-goals": "هدف‌گذاری پیشنهادی ساخته شد؛ مقادیر را بازبینی و ذخیره کن.",
    "advice-approved": "توصیه مشاور تایید شد.",
  };

  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h2>تحلیل گام‌به‌گام آزمون — {examTitle}</h2>
          <small>
            {studentName} · درصد وزنی این آزمون: {fa(weightedPercent)}٪
            {aiReady ? " · دستیار تحلیل فعال است" : " · دستیار تحلیل در دسترس نیست (پیشنهاد داده‌محور)"}
          </small>
        </div>
      </div>

      <div className="row" style={{ gap: "0.4rem", marginBlock: "0.6rem" }}>
        {STEP_LABELS.map((label, index) => (
          <button
            key={label}
            type="button"
            className={step === index + 1 ? "btn btn-sm" : "btn btn-secondary btn-sm"}
            onClick={() => setStep((index + 1) as 1 | 2 | 3)}
          >
            گام {label}
          </button>
        ))}
      </div>

      {success && successMessages[success] ? (
        <div className="alert alert-success">{successMessages[success]}</div>
      ) : null}

      {step === 1 ? (
        <div className="stack" style={{ gap: "1rem" }}>
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            نمرات، تعداد غلط و نزده از کارنامه به‌صورت خودکار پر شده‌اند. «علت» را خودت بنویس؛ بعد
            از پر شدن علت‌ها می‌توانی «اقدام و راهبرد» را خودت بنویسی یا از دستیار پیشنهاد بگیری.
          </p>

          <form action={saveWizardStep1Action} className="stack" style={{ gap: "0.8rem" }}>
            <input type="hidden" name="examSource" value={examSource} />
            <input type="hidden" name="examRefId" value={examRefId} />
            <input type="hidden" name="studentId" value={studentId} />

            <h3 style={{ margin: 0, color: "var(--primary, #3f4c9b)" }}>
              دروس با درصد ۳۰ و بالاتر
            </h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>نام درس</th>
                    <th>شماره سوال</th>
                    <th>وضعیت تست</th>
                    <th>علت</th>
                    <th>اقدام و راهبرد</th>
                  </tr>
                </thead>
                <tbody>
                  {highRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        درسی با درصد بالای ۳۰ در این آزمون ثبت نشده است.
                      </td>
                    </tr>
                  ) : null}
                  {highRows.map(({ row, index }) => (
                    <tr key={row.subjectTitle}>
                      <td>
                        <strong>{row.subjectTitle}</strong>
                        <br />
                        <small className="muted">{fa(row.percent)}٪</small>
                      </td>
                      <td>
                        <input
                          name={`question_${index}`}
                          defaultValue={row.questionNote}
                          placeholder="مثلاً ۳، ۷، ۱۲"
                          style={{ minWidth: "8rem" }}
                        />
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        غلط: {fa(row.wrong)} · نزده: {fa(row.blank)}
                      </td>
                      <td style={{ minWidth: "12rem" }}>
                        <CauseField
                          name={`cause_${index}`}
                          defaultValue={row.cause}
                          chips={HIGH_CAUSE_CHIPS}
                          placeholder="چرا این تست‌ها غلط/نزده شد؟"
                        />
                      </td>
                      <td style={{ minWidth: "16rem" }}>
                        {row.actionSource === "ai" ? (
                          <AiBadge text="پیشنهاد دستیار — بازبینی و ذخیره کن" />
                        ) : null}
                        <textarea
                          name={`action_${index}`}
                          defaultValue={row.action}
                          rows={2}
                          placeholder="خودت بنویس یا با دکمهٔ پایین پیشنهاد بگیر"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="stack" style={{ gap: "0.3rem" }}>
              <strong>نظر مشاور (دروس بالای ۳۰٪)</strong>
              {isCounselor ? (
                <textarea name="counselorNoteHigh" defaultValue={counselorNoteHigh} rows={2} />
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  {counselorNoteHigh || "هنوز نظری ثبت نشده است."}
                </p>
              )}
            </label>

            <h3 style={{ margin: 0, color: "var(--primary, #3f4c9b)" }}>
              دروس با درصد زیر ۳۰
            </h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>نام درس</th>
                    <th>درصد این آزمون</th>
                    <th>علت درصد زیر ۳۰</th>
                    <th>حذف متوالی</th>
                    <th>حذف غیرمتوالی</th>
                  </tr>
                </thead>
                <tbody>
                  {lowRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        درسی با درصد زیر ۳۰ در این آزمون وجود ندارد. 🎉
                      </td>
                    </tr>
                  ) : null}
                  {lowRows.map(({ row, index }) => {
                    const skip = skipByTitle.get(row.subjectTitle);
                    return (
                      <tr key={row.subjectTitle}>
                        <td>
                          <strong>{row.subjectTitle}</strong>
                        </td>
                        <td>{fa(row.percent)}٪</td>
                        <td style={{ minWidth: "12rem" }}>
                          <CauseField
                            name={`cause_${index}`}
                            defaultValue={row.cause}
                            chips={LOW_CAUSE_CHIPS}
                            placeholder="چرا درصد این درس زیر ۳۰ شد؟"
                          />
                        </td>
                        <td>
                          {skip ? fa(skip.consecutive) : "—"}
                          <br />
                          <small className="muted">آزمون متوالی</small>
                        </td>
                        <td>
                          {skip ? fa(skip.nonConsecutive) : "—"}
                          <br />
                          <small className="muted">در آزمون‌های پیشین</small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <label className="stack" style={{ gap: "0.3rem" }}>
              <strong>یادداشت مشاور (دروس زیر ۳۰٪)</strong>
              {isCounselor ? (
                <textarea name="counselorNoteLow" defaultValue={counselorNoteLow} rows={2} />
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  {counselorNoteLow || "هنوز یادداشتی ثبت نشده است."}
                </p>
              )}
            </label>

            <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
              <SubmitButton className="btn" pendingLabel="در حال ذخیره…">
                ذخیره گام ۱
              </SubmitButton>
              {highRows.length > 0 ? (
                <SubmitButton
                  className="btn btn-secondary"
                  pendingLabel="در حال تولید…"
                  formAction={generateWizardAiActionAction}
                >
                  ✨ پیشنهاد «اقدام و راهبرد» با دستیار
                </SubmitButton>
              ) : null}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(2)}>
                گام بعدی: مراحل آماده‌سازی ←
              </button>
            </div>
            {!causesComplete ? (
              <small className="muted">
                برای دریافت پیشنهاد دستیار، ابتدا علت همهٔ دروس بالای ۳۰٪ را بنویس.
              </small>
            ) : null}
          </form>
        </div>
      ) : null}

      {step === 2 ? (
        <form action={saveWizardStep2Action} className="stack" style={{ gap: "0.8rem" }}>
          <input type="hidden" name="examSource" value={examSource} />
          <input type="hidden" name="examRefId" value={examRefId} />
          <input type="hidden" name="studentId" value={studentId} />

          {isCounselor ? (
            <div className="stack" style={{ gap: "0.4rem" }}>
              <div className="row between">
                <strong>توصیه‌های مشاور برای این آزمون</strong>
                {advice ? (
                  adviceApproved ? (
                    <AiBadge text="✅ تایید شده" />
                  ) : (
                    <AiBadge text="در انتظار تایید مشاور" />
                  )
                ) : null}
              </div>
              <textarea
                name="counselorAdvice"
                defaultValue={advice}
                rows={4}
                placeholder="با دکمهٔ «پیشنهاد دستیار» پیش‌نویس بساز، ویرایش کن و تایید کن."
              />
              <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                <SubmitButton
                  className="btn btn-secondary btn-sm"
                  pendingLabel="در حال تولید…"
                  formAction={generateWizardAdviceAction}
                >
                  ✨ پیشنهاد دستیار
                </SubmitButton>
                {advice && !adviceApproved ? (
                  <SubmitButton
                    className="btn btn-sm"
                    pendingLabel="…"
                    formAction={approveWizardAdviceAction}
                  >
                    تایید و انتشار توصیه
                  </SubmitButton>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="stack" style={{ gap: "0.3rem" }}>
              <strong>توصیه‌های مشاور برای این آزمون</strong>
              {advice && adviceApproved ? (
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{advice}</p>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  توصیهٔ مشاور پس از تایید او اینجا نمایش داده می‌شود.
                </p>
              )}
            </div>
          )}

          <h3 style={{ margin: 0, color: "var(--primary, #3f4c9b)" }}>
            مراحل آماده‌سازی برای این آزمون
          </h3>
          <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
            مقادیر از داده‌های مطالعه و آزمون‌های قبلی به‌صورت خودکار پر شده‌اند؛ می‌توانی اصلاح کنی.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>نام درس</th>
                  <th>تعداد تست مبحثی</th>
                  <th>میانگین قبلی</th>
                  <th>تعداد تست آزمونی و زمان‌دار</th>
                  <th>حدود درصدها</th>
                </tr>
              </thead>
              <tbody>
                {step2Rows.map((row, index) => (
                  <tr key={row.subjectTitle}>
                    <td>
                      <strong>{row.subjectTitle}</strong>
                    </td>
                    <td>
                      <input
                        name={`topic_${index}`}
                        type="number"
                        min={0}
                        defaultValue={row.topicTests}
                        style={{ width: "5rem" }}
                      />
                    </td>
                    <td>
                      <input
                        name={`avg_${index}`}
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={row.avgPercent ?? ""}
                        placeholder="—"
                        style={{ width: "5rem" }}
                      />
                    </td>
                    <td>
                      <input
                        name={`timed_${index}`}
                        type="number"
                        min={0}
                        defaultValue={row.timedTests}
                        style={{ width: "5rem" }}
                      />
                    </td>
                    <td>
                      <input
                        name={`approx_${index}`}
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={row.approxPercent ?? ""}
                        style={{ width: "5rem" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <SubmitButton className="btn" pendingLabel="در حال ذخیره…">
              ذخیره گام ۲
            </SubmitButton>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(3)}>
              گام بعدی: هدف‌گذاری ←
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>
              → گام قبل
            </button>
          </div>
        </form>
      ) : null}

      {step === 3 ? (
        <form action={saveWizardStep3Action} className="stack" style={{ gap: "0.8rem" }}>
          <input type="hidden" name="examSource" value={examSource} />
          <input type="hidden" name="examRefId" value={examRefId} />
          <input type="hidden" name="studentId" value={studentId} />

          <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
            برای هدف‌گذاری می‌توانی از دستیار پیشنهاد بگیری و بعد مقادیر را اصلاح/تایید کنی؛ یا خودت
            هدف هر درس را بنویسی.
          </p>
          {goalsSource === "ai" ? (
            <div>
              <AiBadge text="پیشنهاد دستیار — پس از بازبینی، ذخیره کن" />
            </div>
          ) : null}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>نام درس</th>
                  <th>درصد این آزمون</th>
                  <th>هدف آزمون بعدی</th>
                  <th>راهبرد رسیدن به هدف</th>
                </tr>
              </thead>
              <tbody>
                {step3Rows.map((row, index) => (
                  <tr key={row.subjectTitle}>
                    <td>
                      <strong>{row.subjectTitle}</strong>
                    </td>
                    <td>{fa(row.currentPercent)}٪</td>
                    <td>
                      <input
                        name={`target_${index}`}
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={row.targetPercent ?? ""}
                        placeholder="مثلاً ۵۵"
                        style={{ width: "6rem" }}
                      />
                    </td>
                    <td style={{ minWidth: "16rem" }}>
                      <textarea name={`goalNote_${index}`} defaultValue={row.note} rows={2} />
                    </td>
                  </tr>
                ))}
                {weightedTarget !== null ? (
                  <tr>
                    <td colSpan={2}>
                      <strong>هدف وزنی کل</strong>
                    </td>
                    <td colSpan={2}>
                      <strong>{fa(weightedTarget)}٪</strong>{" "}
                      <small className="muted">(میانگین سادهٔ اهداف دروس — پس از ذخیره با وزن کنکور محاسبه می‌شود)</small>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <label className="stack" style={{ gap: "0.3rem" }}>
            <strong>هدف نهایی</strong>
            {role === "student" ? (
              <textarea
                name="finalGoal"
                defaultValue={finalGoal}
                rows={2}
                placeholder="مثلاً: رتبه زیر ۵۰۰ تجربی / قبولی پزشکی تهران"
              />
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                {finalGoal || "دانش‌آموز هنوز هدف نهایی‌اش را ثبت نکرده است."}
              </p>
            )}
          </label>

          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <SubmitButton className="btn" pendingLabel="در حال ذخیره…">
              ذخیره هدف‌گذاری
            </SubmitButton>
            <SubmitButton
              className="btn btn-secondary"
              pendingLabel="در حال تولید…"
              formAction={generateWizardGoalsAction}
            >
              ✨ هدف‌گذاری پیشنهادی با دستیار
            </SubmitButton>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(2)}>
              → گام قبل
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
