"use client";

export function SelectAllCheckbox({
  formId,
  label = "انتخاب همه",
}: {
  formId: string;
  label?: string;
}) {
  return (
    <label className="row" style={{ margin: 0, gap: "0.35rem" }}>
      <input
        type="checkbox"
        style={{ width: "18px", minHeight: "auto" }}
        onChange={(event) => {
          const checked = event.target.checked;
          document
            .querySelectorAll<HTMLInputElement>(
              `input[name="questionIds"][form="${formId}"]`,
            )
            .forEach((box) => {
              if (!box.disabled) box.checked = checked;
            });
        }}
      />
      <span className="muted" style={{ fontSize: "0.8rem" }}>
        {label}
      </span>
    </label>
  );
}
