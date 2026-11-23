import Link from "next/link";
import {
  createCollectionAction,
  deleteCollectionAction,
} from "@/app/actions/collections";
import { SubmitButton } from "@/components/submit-button";
import type { SessionUser } from "@/lib/auth";
import { listCollections } from "@/lib/collections";

const SUCCESS: Record<string, string> = {
  created: "مجموعه ساخته شد.",
  deleted: "مجموعه حذف شد.",
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function CollectionsPage({
  user,
  searchParams,
}: {
  user: SessionUser;
  searchParams: SearchParams;
}) {
  const base = user.role === "counselor" ? "/counselor/collections" : "/student/collections";
  const bankPath = user.role === "counselor" ? "/counselor/questions" : "/student/questions";
  const success = one(searchParams.success);
  const error = one(searchParams.error);
  const collections = await listCollections(user.workspaceId, user.id);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="row between">
        <div>
          <h1>مجموعه‌های سوال</h1>
          <small>
            دسته‌های شخصی شما؛ از بانک سوال سوال انتخاب کنید و در مجموعه‌ها ذخیره کنید تا همیشه
            برای ساخت آزمون یا خروجی PDF در دسترس باشند.
          </small>
        </div>
        <span className="badge">{collections.length.toLocaleString("fa-IR")} مجموعه</span>
      </div>

      {success && SUCCESS[success] ? (
        <div className="alert alert-success">{SUCCESS[success]}</div>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="grid grid-2">
        <div className="card">
          <div className="section-head">
            <h2>مجموعه‌های من</h2>
            <small>{collections.length} مجموعه</small>
          </div>
          {collections.length === 0 ? (
            <div className="empty">
              هنوز مجموعه‌ای نساخته‌اید. مثلاً «سوالات حسابان سخت» یا «هندسه تالس» بسازید.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>مجموعه</th>
                    <th>سوال فعال</th>
                    <th>کل</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {collections.map((collection) => (
                    <tr key={collection.id}>
                      <td>
                        <Link href={`${base}/${collection.id}`}>
                          <strong>{collection.title}</strong>
                        </Link>
                        {collection.description ? (
                          <div className="muted" style={{ fontSize: "0.78rem" }}>
                            {collection.description}
                          </div>
                        ) : null}
                      </td>
                      <td>{collection.active.toLocaleString("fa-IR")}</td>
                      <td>{collection.total.toLocaleString("fa-IR")}</td>
                      <td>
                        <form action={deleteCollectionAction}>
                          <input type="hidden" name="collectionId" value={collection.id} />
                          <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                            حذف
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <hr className="divider" />
          <form action={createCollectionAction} className="form-grid">
            <div className="field">
              <label>نام مجموعه</label>
              <input name="title" placeholder="مثلاً حسابان — سطح سخت" required />
            </div>
            <div className="field">
              <label>توضیح (اختیاری)</label>
              <input name="description" placeholder="مثلاً برای آزمون‌های هفتگی" />
            </div>
            <div className="field">
              <SubmitButton className="btn-secondary">ساخت مجموعه</SubmitButton>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="section-head">
            <h2>چطور کار می‌کند؟</h2>
          </div>
          <div className="stack" style={{ gap: "0.5rem", fontSize: "0.85rem" }}>
            <p style={{ margin: 0 }}>
              ۱. در <Link href={bankPath}>بانک سوال</Link> سوال‌های موردنظر را تیک بزنید و
              «ذخیره در مجموعه» را بزنید.
            </p>
            <p style={{ margin: 0 }}>
              ۲. در صفحه هر مجموعه می‌توانید سوال اضافه یا کم کنید، همه را یک‌جا انتخاب کنید.
            </p>
            <p style={{ margin: 0 }}>
              ۳. از هر مجموعه — کلاً یا بخشی از آن — آزمون بسازید یا خروجی PDF با پاسخنامه
              بگیرید.
            </p>
            <p style={{ margin: 0 }} className="muted">
              سوال‌ها در بانک خودشان می‌مانند و مجموعه فقط به آن‌ها اشاره می‌کند؛ یک سوال می‌تواند
              هم‌زمان در چند مجموعه باشد.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
