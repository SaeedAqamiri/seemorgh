"use client";

import { useMemo, useState } from "react";

export type MockExamOption = {
  id: string;
  dateLabel: string;
  provider: string;
  title: string;
  budgetText: string;
};

export function MockExamPicker({
  exams,
  selectedIds,
  goalExamId,
}: {
  exams: MockExamOption[];
  selectedIds: string[];
  goalExamId: string | null;
}) {
  const providers = useMemo(
    () => [...new Set(exams.map((exam) => exam.provider))],
    [exams],
  );
  const initialProvider = useMemo(() => {
    const goal = exams.find((exam) => exam.id === goalExamId);
    if (goal) return goal.provider;
    const selected = exams.find((exam) => selectedIds.includes(exam.id));
    return selected?.provider ?? providers[0] ?? "";
  }, [exams, goalExamId, providers, selectedIds]);
  const [provider, setProvider] = useState(initialProvider);

  const examsByProvider = useMemo(() => {
    const map = new Map<string, MockExamOption[]>();
    for (const exam of exams) {
      const list = map.get(exam.provider) ?? [];
      list.push(exam);
      map.set(exam.provider, list);
    }
    return map;
  }, [exams]);

  if (exams.length === 0) {
    return (
      <div className="empty" style={{ padding: "0.8rem" }}>
        هنوز آزمون آزمایشی‌ای در تقویم ثبت نشده است.
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: "0.8rem" }}>
      <div className="form-grid">
        <div className="field">
          <label>موسسه آزمون</label>
          <select value={provider} onChange={(event) => setProvider(event.target.value)}>
            {providers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <small className="muted">
            اول موسسه را انتخاب کنید؛ فقط آزمون‌های همان موسسه نمایش داده می‌شوند.
          </small>
        </div>
        <div className="field">
          <label>آزمون هدف (پیش‌فرض: آخرین آزمون انتخاب‌شده)</label>
          <select name="goalMockExamId" defaultValue={goalExamId ?? ""}>
            <option value="">خودکار — آخرین آزمون انتخاب‌شده</option>
            {providers.map((name) => (
              <optgroup key={name} label={name}>
                {(examsByProvider.get(name) ?? []).map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.dateLabel} — {exam.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div className="row between">
        <strong style={{ fontSize: "0.9rem" }}>
          آزمون‌های {provider} ({(examsByProvider.get(provider) ?? []).length.toLocaleString("fa-IR")})
        </strong>
        <small className="muted">هر تعداد از آزمون‌های این موسسه را می‌توانید انتخاب کنید.</small>
      </div>

      <div className="stack" style={{ gap: "0.5rem" }}>
        {providers.map((name) => (
          <div
            key={name}
            className="stack"
            style={{ gap: "0.5rem", display: name === provider ? undefined : "none" }}
          >
            {(examsByProvider.get(name) ?? []).map((exam) => (
              <label
                key={exam.id}
                className="card"
                style={{
                  boxShadow: "none",
                  display: "flex",
                  gap: "0.6rem",
                  alignItems: "flex-start",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  name="mockExamId"
                  value={exam.id}
                  defaultChecked={selectedIds.includes(exam.id)}
                  style={{ marginTop: "0.25rem" }}
                />
                <span className="stack" style={{ gap: "0.15rem" }}>
                  <span>
                    <strong>{exam.title}</strong>
                    <span className="muted" style={{ fontSize: "0.78rem" }}>
                      {" "}· {exam.dateLabel} · {exam.provider}
                    </span>
                  </span>
                  {exam.budgetText ? (
                    <span className="muted" style={{ fontSize: "0.76rem" }}>
                      بودجه‌بندی: {exam.budgetText}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
