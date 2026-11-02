"use client";

export function PrintButton({ label = "چاپ گزارش" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
      {label}
    </button>
  );
}
