import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { acceptInviteAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { getDb } from "@/db/client";
import { students } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect(user.role === "counselor" ? "/counselor" : "/student");

  const { code } = await params;
  const { error } = await searchParams;

  const db = await getDb();
  const [student] = await db
    .select()
    .from(students)
    .where(eq(students.inviteCode, decodeURIComponent(code)))
    .limit(1);

  if (!student) {
    return (
      <main className="page">
        <div className="narrow card">
          <h1>دعوت پیدا نشد</h1>
          <p>لینک دعوت نامعتبر یا منقضی شده است. از مشاور خود لینک جدید بگیرید.</p>
        </div>
      </main>
    );
  }

  if (student.userId) {
    return (
      <main className="page">
        <div className="narrow card">
          <h1>این دعوت قبلاً فعال شده</h1>
          <p>با شماره {student.phone} وارد شوید.</p>
          <a className="btn" href="/login">
            رفتن به صفحه ورود
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="narrow">
        <div className="landing-hero" style={{ padding: "2rem 0 1.5rem" }}>
          <span className="brand-mark" style={{ margin: "0 auto 0.75rem" }}>
            س
          </span>
          <h1>سلام {student.name}!</h1>
          <p>برای دیدن برنامه امروز، یک رمز عبور بساز.</p>
        </div>
        <form action={acceptInviteAction} className="card stack">
          {error ? <div className="alert alert-error">{error}</div> : null}
          <input type="hidden" name="code" value={student.inviteCode} />
          <div>
            <label>شماره موبایل</label>
            <input value={student.phone} disabled />
          </div>
          <div>
            <label htmlFor="name">نام نمایشی</label>
            <input id="name" name="name" defaultValue={student.name} required />
          </div>
          <div>
            <label htmlFor="password">رمز عبور (حداقل ۸ کاراکتر)</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <SubmitButton pendingLabel="در حال فعال‌سازی…">فعال‌سازی حساب</SubmitButton>
        </form>
      </div>
    </main>
  );
}
