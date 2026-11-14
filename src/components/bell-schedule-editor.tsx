"use client";

import { useState } from "react";
import { SubmitButton } from "./submit-button";

export type BellSlotState = { startMin: number; endMin: number };

function timeOptions(): { value: number; label: string }[] {
  const options: { value: number; label: string }[] = [];
  for (let minutes = 0; minutes <= 24 * 60; minutes += 15) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    options.push({ value: minutes, label: `${hh}:${mm}` });
  }
  return options;
}

function clone(slots: BellSlotState[]): BellSlotState[] {
  return slots.map((slot) => ({ ...slot }));
}

function faClock(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function BellScheduleEditor({
  studentId,
  weekStart,
  initialSlots,
  action,
}: {
  studentId: string;
  weekStart: string;
  initialSlots: BellSlotState[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [slots, setSlots] = useState<BellSlotState[]>(() => clone(initialSlots));
  const options = timeOptions();

  const update = (index: number, patch: Partial<BellSlotState>) => {
    setSlots((current) =>
      current.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    );
  };

  return (
    <form action={action} className="stack" style={{ gap: "0.6rem" }}>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="weekStart" value={weekStart} />
      <input type="hidden" name="slotsJson" value={JSON.stringify(slots)} />
      <div className="row between">
        <small className="muted">
          هر روز ۱۰ زنگ دارد؛ پیش‌فرض ۸:۰۰ تا ۲۳:۰۰ و هر زنگ ۹۰ دقیقه. ساعت شروع و پایان هر زنگ
          را می‌توانید تغییر دهید.
        </small>
        <div className="row">
          {!editing ? (
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
              تنظیم زنگ‌ها
            </button>
          ) : (
            <>
              <SubmitButton className="btn-sm" pendingLabel="در حال ذخیره…">
                ذخیره زنگ‌ها
              </SubmitButton>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSlots(clone(initialSlots));
                  setEditing(false);
                }}
              >
                انصراف
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="grid grid-2">
          {slots.map((slot, index) => (
            <div key={index} className="field">
              <label>زنگ {index + 1}</label>
              <div className="row" style={{ gap: "0.35rem" }}>
                <select
                  aria-label={`شروع زنگ ${index + 1}`}
                  value={slot.startMin}
                  onChange={(event) => update(index, { startMin: Number(event.target.value) })}
                >
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      شروع {option.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`پایان زنگ ${index + 1}`}
                  value={slot.endMin}
                  onChange={(event) => update(index, { endMin: Number(event.target.value) })}
                >
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      پایان {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="row" style={{ flexWrap: "wrap", gap: "0.3rem" }}>
          {slots.map((slot, index) => (
            <span key={index} className="perf-tag">
              زنگ {index + 1}: {faClock(slot.startMin)}–{faClock(slot.endMin)}
            </span>
          ))}
        </div>
      )}
    </form>
  );
}
