"use client";

import { useState } from "react";
import { ResourcePicker } from "@/components/resource-picker";

export type ContentResourceOption = {
  id: string;
  title: string;
  unitType: string;
  studentName: string;
  subjectTitle: string;
  coverUrl?: string | null;
};

export function ContentResourcePicker({
  options,
}: {
  options: ContentResourceOption[];
}) {
  const [value, setValue] = useState("");
  return (
    <ResourcePicker
      name="resourceId"
      value={value}
      onChange={setValue}
      emptyOption="محتوای عمومی همه دانش‌آموزان"
      placeholder="محتوای عمومی همه دانش‌آموزان"
      ariaLabel="انتخاب منبع برای محتوا"
      resources={options.map((option) => ({
        id: option.id,
        title: option.title,
        subjectId: option.id,
        subjectTitle: `${option.studentName} — ${option.subjectTitle}`,
        coverUrl: option.coverUrl,
      }))}
    />
  );
}
