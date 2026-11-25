"use client";

import { useMemo, useState } from "react";

export type ResourceCoverSize = "xs" | "sm" | "md" | "lg";

const FALLBACK_COLORS = [
  ["#1f6f4a", "#2f9e6f"],
  ["#1d4ed8", "#3b82f6"],
  ["#b45309", "#f59e0b"],
  ["#9f1239", "#f43f5e"],
  ["#6d28d9", "#a78bfa"],
  ["#0f766e", "#14b8a6"],
  ["#374151", "#6b7280"],
];

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function initials(title: string): string {
  const words = title
    .replace(/[—–\-|]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2);
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`;
}

export function ResourceCover({
  coverUrl,
  title,
  subjectTitle,
  size = "sm",
  className = "",
}: {
  coverUrl?: string | null;
  title: string;
  subjectTitle?: string | null;
  size?: ResourceCoverSize;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const palette = useMemo(
    () => FALLBACK_COLORS[hash(`${subjectTitle ?? ""}|${title}`) % FALLBACK_COLORS.length],
    [subjectTitle, title],
  );
  const showImage = Boolean(coverUrl) && !broken;

  return (
    <span
      className={`resource-cover resource-cover-${size} ${className}`.trim()}
      style={
        showImage
          ? undefined
          : {
              background: `linear-gradient(145deg, ${palette[0]}, ${palette[1]})`,
            }
      }
      title={subjectTitle ? `${subjectTitle} — ${title}` : title}
      aria-hidden={showImage}
    >
      {showImage ? (
        // Covers are local, already optimised assets; next/image is unnecessary here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl ?? ""}
          alt={`جلد ${title}`}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="resource-cover-fallback" aria-label={`جلد ${title}`}>
          <span>{initials(title)}</span>
        </span>
      )}
    </span>
  );
}
