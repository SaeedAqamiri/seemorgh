"use client";

import { useState } from "react";
import { SubmitButton } from "./submit-button";
import type { PsychBand } from "@/db/schema";
import type {
  PsychEditorDimension,
  PsychEditorOption,
  PsychEditorPayload,
  PsychEditorQuestion,
} from "@/lib/psych";

function newId(prefix: string): string {
  const value =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

function blankBand(min: number, max: number | null): PsychBand {
  return { min, max, label: "", code: "", analysis: "" };
}

function blankDimension(): PsychEditorDimension {
  return {
    clientId: newId("dimension"),
    title: "",
    description: "",
    bands: [blankBand(0, 4), blankBand(5, null)],
  };
}

function blankScores(
  dimensions: PsychEditorDimension[],
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const dimension of dimensions) scores[dimension.clientId] = 0;
  return scores;
}

function blankOption(dimensions: PsychEditorDimension[]): PsychEditorOption {
  return { clientId: newId("option"), body: "", scores: blankScores(dimensions) };
}

function blankQuestion(dimensions: PsychEditorDimension[]): PsychEditorQuestion {
  return {
    clientId: newId("question"),
    body: "",
    options: [blankOption(dimensions), blankOption(dimensions)],
  };
}

export function PsychTestEditor({
  testId,
  initial,
  action,
  submitLabel,
}: {
  testId?: string;
  initial: PsychEditorPayload;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const [payload, setPayload] = useState<PsychEditorPayload>(initial);

  const patch = (next: Partial<PsychEditorPayload>) =>
    setPayload((current) => ({ ...current, ...next }));

  const updateDimension = (clientId: string, values: Partial<PsychEditorDimension>) =>
    patch({
      dimensions: payload.dimensions.map((dimension) =>
        dimension.clientId === clientId ? { ...dimension, ...values } : dimension,
      ),
    });

  const addDimension = () => patch({ dimensions: [...payload.dimensions, blankDimension()] });

  const removeDimension = (clientId: string) =>
    patch({
      dimensions: payload.dimensions.filter((dimension) => dimension.clientId !== clientId),
      questions: payload.questions.map((question) => ({
        ...question,
        options: question.options.map((option) => {
          const next = { ...option.scores };
          delete next[clientId];
          return { ...option, scores: next };
        }),
      })),
    });

  const updateBand = (
    dimensionId: string,
    bandIndex: number,
    values: Partial<PsychBand>,
  ) =>
    patch({
      dimensions: payload.dimensions.map((dimension) =>
        dimension.clientId === dimensionId
          ? {
              ...dimension,
              bands: dimension.bands.map((band, index) =>
                index === bandIndex ? { ...band, ...values } : band,
              ),
            }
          : dimension,
      ),
    });

  const addBand = (dimensionId: string) =>
    patch({
      dimensions: payload.dimensions.map((dimension) => {
        if (dimension.clientId !== dimensionId) return dimension;
        const bands = [...dimension.bands].sort((first, second) => first.min - second.min);
        const last = bands[bands.length - 1] ?? blankBand(0, 4);
        if (last.max === null) {
          const closedMax = last.min + 4;
          return {
            ...dimension,
            bands: [
              ...bands.slice(0, -1),
              { ...last, max: closedMax },
              blankBand(closedMax + 1, null),
            ],
          };
        }
        return { ...dimension, bands: [...bands, blankBand(last.max + 1, null)] };
      }),
    });

  const removeBand = (dimensionId: string, bandIndex: number) =>
    patch({
      dimensions: payload.dimensions.map((dimension) => {
        if (dimension.clientId !== dimensionId) return dimension;
        const bands = dimension.bands.filter((_, index) => index !== bandIndex);
        if (bands.length > 0 && bands[bands.length - 1].max !== null) {
          bands[bands.length - 1] = { ...bands[bands.length - 1], max: null };
        }
        return { ...dimension, bands };
      }),
    });

  const updateQuestion = (clientId: string, values: Partial<PsychEditorQuestion>) =>
    patch({
      questions: payload.questions.map((question) =>
        question.clientId === clientId ? { ...question, ...values } : question,
      ),
    });

  const addQuestion = () =>
    patch({ questions: [...payload.questions, blankQuestion(payload.dimensions)] });

  const removeQuestion = (clientId: string) =>
    patch({ questions: payload.questions.filter((question) => question.clientId !== clientId) });

  const updateOption = (
    questionId: string,
    optionId: string,
    values: Partial<PsychEditorOption>,
  ) =>
    patch({
      questions: payload.questions.map((question) =>
        question.clientId === questionId
          ? {
              ...question,
              options: question.options.map((option) =>
                option.clientId === optionId ? { ...option, ...values } : option,
              ),
            }
          : question,
      ),
    });

  const addOption = (questionId: string) =>
    patch({
      questions: payload.questions.map((question) =>
        question.clientId === questionId
          ? { ...question, options: [...question.options, blankOption(payload.dimensions)] }
          : question,
      ),
    });

  const removeOption = (questionId: string, optionId: string) =>
    patch({
      questions: payload.questions.map((question) =>
        question.clientId === questionId
          ? {
              ...question,
              options: question.options.filter((option) => option.clientId !== optionId),
            }
          : question,
      ),
    });

  const setScore = (
    questionId: string,
    optionId: string,
    dimensionId: string,
    raw: string,
  ) => {
    const value = Math.max(0, Math.floor(Number(raw) || 0));
    const question = payload.questions.find((entry) => entry.clientId === questionId);
    const option = question?.options.find((entry) => entry.clientId === optionId);
    if (!option) return;
    updateOption(questionId, optionId, {
      scores: { ...option.scores, [dimensionId]: value },
    });
  };

  const updateRule = (index: number, values: Partial<PsychEditorPayload["rules"][number]>) =>
    patch({
      rules: payload.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...values } : rule,
      ),
    });

  const addRule = () =>
    patch({ rules: [...payload.rules, { code: "", title: "", body: "" }] });

  const removeRule = (index: number) =>
    patch({ rules: payload.rules.filter((_, ruleIndex) => ruleIndex !== index) });

  return (
    <form action={action} className="stack" style={{ gap: "1rem" }}>
      <input type="hidden" name="testId" value={testId ?? ""} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      <div className="card">
        <div className="section-head">
          <h2>مشخصات آزمون</h2>
          <small>این آزمون کاملاً ثابت است و تحلیل آن از روی مجموع امتیاز هر بُعد انجام می‌شود.</small>
        </div>
        <div className="stack">
          <div className="field">
            <label>عنوان آزمون</label>
            <input
              value={payload.title}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="مثلاً آزمون ۱۶ تیپ شخصیتی (MBTI)"
              required
            />
          </div>
          <div className="field">
            <label>توضیح (اختیاری)</label>
            <textarea
              value={payload.description}
              onChange={(event) => patch({ description: event.target.value })}
              rows={2}
              placeholder="راهنمای کوتاه برای شرکت‌کننده"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h2>بُعدها، بازه‌ها و تحلیل</h2>
            <small>
              هر بُعد یک طیف امتیاز است. بازه‌ها را از صفر و پشت‌سرهم تعریف کنید؛ آخرین بازه
              بدون سقف است. کد هر بازه اختیاری است و برای ساخت کد نتیجهٔ ترکیبی (مثل INTJ)
              استفاده می‌شود.
            </small>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addDimension}>
            افزودن بُعد
          </button>
        </div>

        {payload.dimensions.length === 0 ? (
          <div className="empty">هنوز بُعدی اضافه نشده است.</div>
        ) : (
          <div className="stack">
            {payload.dimensions.map((dimension, dimensionIndex) => (
              <div
                key={dimension.clientId}
                className="card"
                style={{ background: "var(--surface-2, #f8fafc)" }}
              >
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <strong>بُعد {dimensionIndex + 1}</strong>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => removeDimension(dimension.clientId)}
                  >
                    حذف بُعد
                  </button>
                </div>

                <div className="form-grid" style={{ marginTop: "0.5rem" }}>
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label>عنوان بُعد</label>
                    <input
                      value={dimension.title}
                      onChange={(event) =>
                        updateDimension(dimension.clientId, { title: event.target.value })
                      }
                      placeholder="مثلاً درون‌گرایی یا وسواس"
                    />
                  </div>
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label>توضیح بُعد (اختیاری)</label>
                    <textarea
                      value={dimension.description}
                      onChange={(event) =>
                        updateDimension(dimension.clientId, { description: event.target.value })
                      }
                      rows={2}
                      placeholder="این بُعد چه چیزی را می‌سنجد؟"
                    />
                  </div>
                </div>

                <div className="stack" style={{ gap: "0.5rem", marginTop: "0.6rem" }}>
                  <div className="row between">
                    <strong style={{ fontSize: "0.9rem" }}>بازه‌های امتیاز</strong>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => addBand(dimension.clientId)}
                    >
                      افزودن بازه
                    </button>
                  </div>
                  {dimension.bands.map((band, bandIndex) => (
                    <div
                      key={`${dimension.clientId}-band-${bandIndex}`}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "10px",
                        padding: "0.6rem",
                        background: "#fff",
                      }}
                    >
                      <div className="row between">
                        <small className="muted">بازه {bandIndex + 1}</small>
                        {dimension.bands.length > 1 ? (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => removeBand(dimension.clientId, bandIndex)}
                          >
                            حذف بازه
                          </button>
                        ) : null}
                      </div>
                      <div className="form-grid" style={{ marginTop: "0.4rem" }}>
                        <div className="field">
                          <label>از امتیاز</label>
                          <input
                            type="number"
                            min={0}
                            value={band.min}
                            onChange={(event) =>
                              updateBand(dimension.clientId, bandIndex, {
                                min: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <label>تا امتیاز (خالی = بدون سقف)</label>
                          <input
                            type="number"
                            min={0}
                            value={band.max ?? ""}
                            onChange={(event) =>
                              updateBand(dimension.clientId, bandIndex, {
                                max:
                                  event.target.value === ""
                                    ? null
                                    : Math.max(0, Math.floor(Number(event.target.value) || 0)),
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <label>برچسب بازه</label>
                          <input
                            value={band.label}
                            onChange={(event) =>
                              updateBand(dimension.clientId, bandIndex, {
                                label: event.target.value,
                              })
                            }
                            placeholder="مثلاً درون‌گرا یا خیلی وسواسی"
                          />
                        </div>
                        <div className="field">
                          <label>کد (اختیاری)</label>
                          <input
                            value={band.code}
                            onChange={(event) =>
                              updateBand(dimension.clientId, bandIndex, {
                                code: event.target.value,
                              })
                            }
                            placeholder="I"
                            dir="ltr"
                          />
                        </div>
                        <div className="field" style={{ gridColumn: "1 / -1" }}>
                          <label>تحلیل این بازه</label>
                          <textarea
                            value={band.analysis}
                            onChange={(event) =>
                              updateBand(dimension.clientId, bandIndex, {
                                analysis: event.target.value,
                              })
                            }
                            rows={2}
                            placeholder="وقتی امتیاز فرد در این بازه قرار گرفت، این متن نمایش داده می‌شود."
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h2>سوال‌ها و گزینه‌ها</h2>
            <small>
              برای هر گزینه مشخص کنید به هر بُعد چه امتیازی می‌دهد (عدد صفر یا بیشتر).
            </small>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addQuestion}>
            افزودن سوال
          </button>
        </div>

        {payload.questions.length === 0 ? (
          <div className="empty">هنوز سوالی اضافه نشده است.</div>
        ) : (
          <div className="stack">
            {payload.questions.map((question, questionIndex) => (
              <div key={question.clientId} className="card">
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <strong>سوال {questionIndex + 1}</strong>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => removeQuestion(question.clientId)}
                  >
                    حذف سوال
                  </button>
                </div>
                <div className="field" style={{ marginTop: "0.5rem" }}>
                  <label>متن سوال</label>
                  <textarea
                    value={question.body}
                    onChange={(event) =>
                      updateQuestion(question.clientId, { body: event.target.value })
                    }
                    rows={2}
                    placeholder="مثلاً در یک مهمانی ترجیح می‌دهی…"
                  />
                </div>

                <div className="stack" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
                  {question.options.map((option, optionIndex) => (
                    <div
                      key={option.clientId}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "10px",
                        padding: "0.6rem",
                      }}
                    >
                      <div
                        className="row between"
                        style={{ alignItems: "flex-start", gap: "0.5rem" }}
                      >
                        <div className="field" style={{ flex: 1, margin: 0 }}>
                          <label>گزینه {optionIndex + 1}</label>
                          <input
                            value={option.body}
                            onChange={(event) =>
                              updateOption(question.clientId, option.clientId, {
                                body: event.target.value,
                              })
                            }
                            placeholder="متن گزینه"
                          />
                        </div>
                        {question.options.length > 2 ? (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => removeOption(question.clientId, option.clientId)}
                            style={{ marginTop: "1.2rem" }}
                          >
                            حذف
                          </button>
                        ) : null}
                      </div>

                      {payload.dimensions.length > 0 ? (
                        <details style={{ marginTop: "0.4rem" }}>
                          <summary
                            className="muted"
                            style={{ cursor: "pointer", fontSize: "0.8rem" }}
                          >
                            امتیاز این گزینه برای بُعدها
                          </summary>
                          <div className="table-wrap" style={{ marginTop: "0.35rem" }}>
                            <table>
                              <thead>
                                <tr>
                                  <th>بُعد</th>
                                  {payload.dimensions.map((dimension) => (
                                    <th key={dimension.clientId}>
                                      {dimension.title || "بدون عنوان"}
                                      <div
                                        className="muted"
                                        style={{ fontSize: "0.72rem", fontWeight: 400 }}
                                      >
                                        {dimension.bands
                                          .map((band) =>
                                            band.max === null
                                              ? `${band.min}+`
                                              : `${band.min}–${band.max}`,
                                          )
                                          .join(" ، ")}
                                      </div>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td>امتیاز</td>
                                  {payload.dimensions.map((dimension) => (
                                    <td key={dimension.clientId}>
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={option.scores[dimension.clientId] ?? 0}
                                        onChange={(event) =>
                                          setScore(
                                            question.clientId,
                                            option.clientId,
                                            dimension.clientId,
                                            event.target.value,
                                          )
                                        }
                                        style={{ width: "64px" }}
                                      />
                                    </td>
                                  ))}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </details>
                      ) : null}
                    </div>
                  ))}
                  <div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => addOption(question.clientId)}
                    >
                      افزودن گزینه
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h2>تحلیل ترکیبی بر اساس کد (اختیاری)</h2>
            <small>
              کد نتیجه از کنار هم گذاشتن کد بازه‌های انتخاب‌شده ساخته می‌شود؛ مثلاً INTJ. اگر
              کدی اینجا تعریف شود، متن همان ردیف نمایش داده می‌شود؛ وگرنه تحلیل بازهٔ هر بُعد
              به‌صورت خودکار کنار هم می‌آید.
            </small>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addRule}>
            افزودن تحلیل
          </button>
        </div>

        {payload.rules.length === 0 ? (
          <div className="empty">هنوز تحلیل ترکیبی تعریف نشده است.</div>
        ) : (
          <div className="stack">
            {payload.rules.map((rule, index) => (
              <div
                key={`rule-${index}`}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  padding: "0.6rem",
                }}
              >
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <strong>تحلیل {index + 1}</strong>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => removeRule(index)}
                  >
                    حذف
                  </button>
                </div>
                <div className="form-grid" style={{ marginTop: "0.4rem" }}>
                  <div className="field">
                    <label>کد نتیجه</label>
                    <input
                      value={rule.code}
                      onChange={(event) => updateRule(index, { code: event.target.value })}
                      placeholder="INTJ"
                      dir="ltr"
                    />
                  </div>
                  <div className="field">
                    <label>عنوان نتیجه</label>
                    <input
                      value={rule.title}
                      onChange={(event) => updateRule(index, { title: event.target.value })}
                      placeholder="معمار"
                    />
                  </div>
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label>متن تحلیل</label>
                    <textarea
                      value={rule.body}
                      onChange={(event) => updateRule(index, { body: event.target.value })}
                      rows={3}
                      placeholder="تحلیل ثابت این تیپ…"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="row between">
        <small className="muted">
          بعد از انتشار، آزمون قفل می‌شود و قابل ویرایش نیست؛ برای تغییر، یک آزمون جدید بسازید.
        </small>
        <SubmitButton pendingLabel="در حال ذخیره…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
