import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { getSessionUser } from "@/lib/auth";

export default async function LoginPage({
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
          <h1>ورود به سیمرغ</h1>
          <p>دستیار هوشمند مشاور تحصیلی</p>
        </div>

        <form action={loginAction} className="card stack">
          {error ? <div className="alert alert-error">{error}</div> : null}
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
            <label htmlFor="password">رمز عبور</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <SubmitButton pendingLabel="در حال ورود…">ورود</SubmitButton>
          <p className="muted" style={{ margin: 0, textAlign: "center", fontSize: "0.85rem" }}>
            مشاور جدید هستید؟ <Link href="/signup">ساخت دفتر مشاوره</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
