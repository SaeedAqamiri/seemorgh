import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { unreadNotificationCount } from "@/lib/notifications";

export async function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { id: string; name: string; role: "counselor" | "student"; workspaceName: string };
}) {
  const unread = await unreadNotificationCount(user.id);
  const notificationsHref =
    user.role === "counselor" ? "/counselor/notifications" : "/student/notifications";

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link href={user.role === "counselor" ? "/counselor" : "/student"} className="brand">
            <span className="brand-mark">س</span>
            <span>
              سیمرغ
              <small style={{ display: "block", fontWeight: 400, fontSize: "0.72rem" }}>
                {user.workspaceName}
              </small>
            </span>
          </Link>
          <nav className="nav">
            {user.role === "counselor" ? (
              <>
                <Link href="/counselor">دانش‌آموزان</Link>
                <Link href="/counselor/performance">تحلیل عملکرد</Link>
                <Link href="/counselor/exams">آزمون‌ها</Link>
                <Link href="/counselor/questions">بانک سوال</Link>
                <Link href="/counselor/content">محتوا</Link>
                <Link href="/counselor/audit">تاریخچه</Link>
              </>
            ) : (
              <>
                <Link href="/student">امروز</Link>
                <Link href="/student/week">هفته</Link>
                <Link href="/student/panel">برنامه‌ریزی</Link>
                <Link href="/student/performance">عملکرد</Link>
                <Link href="/student/exams">آزمون‌ها</Link>
                <Link href="/student/content">محتوا</Link>
              </>
            )}
            <Link href={notificationsHref}>
              اعلان‌ها
              {unread > 0 ? (
                <span className="badge badge-green" style={{ marginInlineStart: "0.25rem" }}>
                  {unread.toLocaleString("fa-IR")}
                </span>
              ) : null}
            </Link>
            <form action={logoutAction}>
              <button className="btn btn-ghost btn-sm" type="submit">
                خروج
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="page">
        <div className="container">{children}</div>
      </main>
    </>
  );
}
