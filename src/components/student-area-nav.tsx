"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StudentAreaNav({ studentId }: { studentId: string }) {
  const pathname = usePathname();
  const base = `/counselor/students/${studentId}`;

  const links = [
    { href: base, label: "نمای کلی" },
    { href: `${base}/resources`, label: "منابع" },
    { href: `${base}/progress`, label: "وضعیت منابع" },
    { href: `${base}/panel`, label: "برنامه‌ریزی" },
    { href: `${base}/performance`, label: "عملکرد" },
    { href: `${base}/exam-analysis`, label: "تحلیل آزمون" },
    { href: `${base}/report`, label: "گزارش" },
  ];

  return (
    <nav className="row" style={{ flexWrap: "wrap", gap: "0.4rem" }} aria-label="بخش‌های پرونده">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`btn btn-sm ${active ? "" : "btn-secondary"}`}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
