import Link from "next/link";
import { redirect } from "next/navigation";
import { signupAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { getSessionUser } from "@/lib/auth";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect(user.role === "counselor" ? "/counselor" : "/student");

  const { error } = await searchParams;

  return (
    <main className="page">
      <div className="narrow">
        <div className="landing-hero" style={{ padding: "2rem 0 1.5rem" }}>
          <span className="brand-mark" style={{ margin: "0 auto 0.75rem" }}>
            س
          </span>
          <h1>ساخت دفتر مشاوره</h1>
          <p>چند دانش‌آموز، یک برنامه، یک گزارش.</p>
        </div>

        <form action={signupAction} className="card stack">
          {error ? <div className="alert alert-error">{error}</div> : null}
          <div>
            <label htmlFor="name">نام و نام خانوادگی</label>
            <input id="name" name="name" autoComplete="name" required />
          </div>
          <div>
            <label htmlFor="workspaceName">نام دفتر مشاوره (اختیاری)</label>
            <input id="workspaceName" name="workspaceName" placeholder="مثلاً دفتر مشاوره امید" />
          </div>
          <div>
            <label htmlFor="phone">شماره موبایل</label>
            <input
              id="phone"
              name="phone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="۰۹۱۲۳۴۵۶۷۸۹"
              required
            />
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
          <SubmitButton pendingLabel="در حال ساخت…">ساخت دفتر و ورود</SubmitButton>
          <p className="muted" style={{ margin: 0, textAlign: "center", fontSize: "0.85rem" }}>
            قبلاً ثبت‌نام کرده‌اید؟ <Link href="/login">ورود</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
