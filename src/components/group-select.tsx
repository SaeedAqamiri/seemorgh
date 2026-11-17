"use client";

import { useEffect, useMemo, useState } from "react";

export type GroupOption = {
  id: string;
  name: string;
  emoji: string;
  field: string;
};

/**
 * Group picker that stays in sync with the student's field select on the page:
 * only groups of the same field are offered, so the "one field per group" rule
 * is visible before submit (the server enforces it too).
 */
export function GroupSelect({
  groups,
  initialField,
  defaultValue,
  fieldSelectId = "field",
}: {
  groups: GroupOption[];
  initialField: string;
  defaultValue?: string | null;
  fieldSelectId?: string;
}) {
  const [field, setField] = useState(initialField);

  useEffect(() => {
    const el = document.getElementById(fieldSelectId) as HTMLSelectElement | null;
    if (!el) return;
    const sync = () => setField(el.value);
    sync();
    el.addEventListener("change", sync);
    return () => el.removeEventListener("change", sync);
  }, [fieldSelectId]);

  const options = useMemo(
    () => groups.filter((group) => group.field === field),
    [groups, field],
  );
  const selected = options.find((group) => group.id === defaultValue)?.id ?? options[0]?.id ?? "";

  return (
    <select id="groupId" key={`${field}:${selected}`} name="groupId" defaultValue={selected}>
      {options.length === 0 ? (
        <option value="">گروه خودکار برای رشته {field}</option>
      ) : null}
      {options.map((group) => (
        <option key={group.id} value={group.id}>
          {group.emoji} {group.name}
        </option>
      ))}
    </select>
  );
}
