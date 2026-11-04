import {
  addResourceAction,
  deleteResourceAction,
  updateResourceAction,
} from "@/app/actions/counselor";
import { SubmitButton } from "@/components/submit-button";
import type { ResourceWithSubject } from "@/lib/counselor";
import { formatChapters } from "@/lib/resources";
import { UNIT_TYPE_LABELS } from "@/lib/subjects";

export function ResourceManager({
  studentId,
  resources,
  subjects,
}: {
  studentId: string;
  resources: ResourceWithSubject[];
  subjects: { id: string; title: string }[];
}) {
  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="card">
        <div className="section-head">
          <div>
            <h2>فهرست منابع</h2>
            <small>پیشرفت هر منبع از روی گزارش عملکرد دانش‌آموز به‌روز می‌شود.</small>
          </div>
          <small>{resources.length} منبع</small>
        </div>

        {resources.length === 0 ? (
          <div className="empty">هنوز منبعی ثبت نشده است.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>منبع</th>
                  <th>نوع</th>
                  <th>پیشرفت</th>
                  <th>اولویت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {resources.map((resource) => {
                  const pct =
                    resource.totalUnits === 0
                      ? 0
                      : Math.round((resource.completedUnits / resource.totalUnits) * 100);
                  return (
                    <tr key={resource.id}>
                      <td>
                        <strong>{resource.subjectTitle}</strong>
                        <div className="muted" style={{ fontSize: "0.78rem" }}>
                          {resource.title}
                        </div>
                        <div className="progress" style={{ marginTop: "0.3rem" }}>
                          <span style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        {resource.chaptersJson?.length ? (
                          <details style={{ marginTop: "0.25rem" }}>
                            <summary className="muted" style={{ fontSize: "0.76rem", cursor: "pointer" }}>
                              {resource.chaptersJson.length} فصل
                            </summary>
                            <ul style={{ margin: "0.25rem 0 0", paddingInlineStart: "1rem", fontSize: "0.76rem" }}>
                              {resource.chaptersJson.map((chapter) => (
                                <li key={`${chapter.title}-${chapter.startPage}`}>
                                  {chapter.title} — صفحه {chapter.startPage} تا {chapter.endPage}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </td>
                      <td>{UNIT_TYPE_LABELS[resource.unitType]}</td>
                      <td>
                        <form action={updateResourceAction} className="stack" style={{ gap: "0.25rem" }}>
                          <input type="hidden" name="studentId" value={studentId} />
                          <input type="hidden" name="resourceId" value={resource.id} />
                          <div className="row" style={{ gap: "0.25rem" }}>
                            <input
                              name="completedUnits"
                              type="number"
                              min={0}
                              defaultValue={resource.completedUnits}
                              style={{ width: "72px" }}
                              aria-label="انجام‌شده"
                            />
                            <span className="muted">/</span>
                            <input
                              name="totalUnits"
                              type="number"
                              min={0}
                              defaultValue={resource.totalUnits}
                              style={{ width: "72px" }}
                              aria-label="کل"
                            />
                          </div>
                          <div className="field">
                            <label style={{ fontSize: "0.72rem" }}>فصل‌بندی (هر خط: عنوان | تعداد صفحه)</label>
                            <textarea
                              name="chapters"
                              rows={2}
                              defaultValue={formatChapters(resource.chaptersJson)}
                              style={{ minHeight: "54px", fontSize: "0.78rem" }}
                            />
                          </div>
                          <div className="row" style={{ gap: "0.25rem" }}>
                            <select
                              name="priority"
                              defaultValue={String(resource.priority)}
                              style={{ width: "80px" }}
                              aria-label="اولویت"
                            >
                              {[1, 2, 3, 4, 5].map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                            <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                              ذخیره
                            </SubmitButton>
                          </div>
                        </form>
                      </td>
                      <td>{resource.priority}</td>
                      <td>
                        <form action={deleteResourceAction}>
                          <input type="hidden" name="studentId" value={studentId} />
                          <input type="hidden" name="resourceId" value={resource.id} />
                          <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                            حذف
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-head">
          <h2>افزودن منبع</h2>
          <small>برای هر پایه و هر درس می‌توانید منبع جداگانه ثبت کنید.</small>
        </div>
        <form action={addResourceAction} className="form-grid">
          <input type="hidden" name="studentId" value={studentId} />
          <div className="field">
            <label>درس</label>
            <select name="subjectId" required>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>عنوان منبع</label>
            <input name="title" placeholder="مثلاً شیمی دوازدهم — تست گاج" required />
          </div>
          <div className="field">
            <label>نوع واحد</label>
            <select name="unitType" defaultValue="test">
              {Object.entries(UNIT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>تعداد کل (تست/صفحه)</label>
            <input name="totalUnits" type="number" min={0} defaultValue={0} />
          </div>
          <div className="field">
            <label>انجام‌شده تا امروز</label>
            <input name="completedUnits" type="number" min={0} defaultValue={0} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>فصل‌بندی — هر خط: عنوان فصل | تعداد صفحه (اختیاری)</label>
            <textarea
              name="chapters"
              rows={3}
              placeholder={"فصل ۱ | 24\nفصل ۲ | 30\nفصل ۳ | 18"}
            />
          </div>
          <div className="field">
            <label>اولویت</label>
            <select name="priority" defaultValue="3">
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <SubmitButton className="btn-secondary">افزودن منبع</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
